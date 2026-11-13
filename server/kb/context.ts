/**
 * Contexto de segurança da Base de Conhecimento, aplicado POR TRANSAÇÃO.
 *
 * Toda consulta às tabelas knowledge_* deve rodar dentro de withKb(). O contexto é gravado com
 * set_config(..., is_local = true): vale só até o COMMIT/ROLLBACK da transação, então a conexão volta ao
 * pool limpa e nunca carrega o gabinete de outra requisição. Fora de withKb() (ou com outro tenant),
 * as políticas RLS não mostram nenhuma linha — falha fechada.
 *
 * Mesmo onde o RLS não é efetivo (conexão como superusuário/dono), todas as consultas continuam
 * filtrando tenant_id explicitamente: as duas barreiras são independentes.
 */
import type { Request } from 'express';
import { db, tx } from '../db';
import { HttpError } from '../http';

export type KbScope = 'user' | 'system';
export interface KbCtx {
  tenantId: string;
  userId: string | null;
  role: string | null;
  scope: KbScope;
}

/** Papéis que administram o acervo do gabinete (veem documentos 'roles'/'users' e alteram permissões). */
export const KB_ADMIN_ROLES = ['deputado', 'chefe_gabinete'];

export const userCtx = (req: Request): KbCtx => {
  const a = req.auth;
  if (!a?.tenantId) throw new HttpError(403, 'Rota exclusiva de usuários de gabinete.');
  return { tenantId: a.tenantId, userId: a.userId, role: a.role, scope: 'user' };
};
export const systemCtx = (tenantId: string, userId: string | null = null): KbCtx => ({ tenantId, userId, role: null, scope: 'system' });

const SET = `SELECT set_config('app.tenant_id', ?, true) AS t, set_config('app.user_id', ?, true) AS u,
                    set_config('app.role', ?, true) AS r, set_config('app.kb_scope', ?, true) AS s`;

/**
 * Runs `fn` in a transaction with the KB context set. Nested calls (inside an outer tx, e.g. the Ofícios save)
 * set the context for their duration and restore the previous one afterwards.
 */
export async function withKb<T>(ctx: KbCtx, fn: () => Promise<T>): Promise<T> {
  if (!ctx.tenantId) throw new Error('withKb: tenant obrigatório.');
  return tx(async () => {
    const prev = await db
      .prepare(
        `SELECT current_setting('app.tenant_id', true) AS t, current_setting('app.user_id', true) AS u,
                current_setting('app.role', true) AS r, current_setting('app.kb_scope', true) AS s`
      )
      .get<{ t: string | null; u: string | null; r: string | null; s: string | null }>();
    await db.prepare(SET).get(ctx.tenantId, ctx.userId ?? '', ctx.role ?? '', ctx.scope);
    try {
      return await fn();
    } finally {
      // Restore (only matters for nested use; at top level the settings die with the transaction anyway).
      await db.prepare(SET).get(prev?.t ?? '', prev?.u ?? '', prev?.r ?? '', prev?.s ?? '').catch(() => undefined);
    }
  });
}

/** Whether RLS is actually enforced for the application's connection (not superuser, no BYPASSRLS, not owner). */
export async function rlsStatus() {
  const r = await db
    .prepare(
      `SELECT current_user AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass,
              (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_items') AS owner,
              (SELECT relrowsecurity FROM pg_class WHERE relname = 'knowledge_items' AND relkind = 'r' LIMIT 1) AS enabled
         FROM pg_roles r WHERE r.rolname = current_user`
    )
    .get<{ role: string; superuser: boolean; bypass: boolean; owner: string; enabled: boolean }>();
  const effective = !!r && r.enabled && !r.superuser && !r.bypass && r.owner !== r.role;
  return {
    effective,
    role: r?.role ?? null,
    superuser: !!r?.superuser,
    bypassRls: !!r?.bypass,
    tableOwner: r?.owner ?? null,
    policiesEnabled: !!r?.enabled,
    note: effective
      ? 'RLS ativo para a conexão da aplicação.'
      : 'RLS INATIVO para esta conexão (superusuário, BYPASSRLS ou dono das tabelas). O isolamento depende só dos filtros da aplicação. Veja scripts/create-app-role.sql.',
  };
}
