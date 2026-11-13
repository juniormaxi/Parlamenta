/**
 * LGPD · Números bloqueados ("lista negra" do gabinete).
 * Quem pede para não receber mais mensagens entra aqui; nenhum envio de WhatsApp sai para esses
 * números (conversas, CRM, alertas de protocolo) e importações do CRM recusam o número.
 * Montado em /api/tenant/blocklist — sempre filtrado por req.auth.tenantId.
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import { db, audit } from './db';
import { HttpError, bad } from './http';

export const blocklistRouter = express.Router();

/** Quem pode desbloquear um número. Bloquear, qualquer usuário do gabinete pode. */
const UNBLOCK_ROLES = ['deputado', 'chefe_gabinete', 'coordenador_atendimento'];

/**
 * Chave canônica do telefone para comparação: só dígitos, sem o 55 do Brasil e com o 9 do
 * celular (WhatsApp às vezes usa o formato antigo de 8 dígitos). Aceita JID do WhatsApp.
 * Retorna null para o que não é telefone (grupos, IDs @lid).
 */
export function blockKey(raw: unknown): string | null {
  let s = String(raw ?? '').trim();
  if (s.includes('@')) {
    if (!/@s\.whatsapp\.net$/.test(s)) return null;
    s = s.split('@')[0]!.split(':')[0]!;
  }
  let d = s.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2]!)) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return d.length >= 8 ? d : null;
}

export async function isBlocked(tenantId: string, raw: unknown): Promise<boolean> {
  const k = blockKey(raw);
  if (!k) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM blocked_numbers WHERE tenant_id = ? AND phone_key = ?`).get(tenantId, k));
}

export async function assertNotBlocked(tenantId: string, raw: unknown) {
  if (await isBlocked(tenantId, raw)) {
    throw new HttpError(409, 'Este número está na lista de Números Bloqueados (LGPD) e não pode receber mensagens.');
  }
}

export async function blockedKeys(tenantId: string): Promise<Set<string>> {
  const rows = (await db.prepare(`SELECT phone_key FROM blocked_numbers WHERE tenant_id = ?`).all(tenantId)) as any[];
  return new Set(rows.map((r) => r.phone_key));
}

/** Inclui o número na lista (idempotente). Devolve a chave usada, ou null se não for telefone. */
export async function blockNumber(e: { tenantId: string; phone: unknown; name?: string; reason?: string; source: string; userId: string | null }) {
  const key = blockKey(e.phone);
  if (!key) return null;
  await db
    .prepare(
      `INSERT INTO blocked_numbers (id, tenant_id, phone_key, phone, name, reason, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant_id, phone_key) DO NOTHING`
    )
    .run(crypto.randomUUID(), e.tenantId, key, key, (e.name ?? '').slice(0, 200), (e.reason ?? '').slice(0, 500), e.source, e.userId);
  // Leads do CRM com o mesmo número também ficam bloqueados.
  await db
    .prepare(
      `UPDATE crm_leads SET status = 'bloqueado', status_at = datetime('now'), status_by = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND status <> 'bloqueado' AND phone <> '' AND phone_key(phone) = ?`
    )
    .run(e.userId, e.tenantId, key);
  return key;
}

const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
const canUnblock = (req: Request) => UNBLOCK_ROLES.includes(req.auth!.role);

blocklistRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  const params: unknown[] = [tid(req)];
  let where = 'b.tenant_id = ?';
  if (q) {
    const d = q.replace(/\D/g, '');
    where += ` AND (lower(b.name) LIKE ? OR lower(b.reason) LIKE ?${d.length >= 3 ? ' OR b.phone_key LIKE ?' : ''})`;
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, ...(d.length >= 3 ? [`%${d}%`] : []));
  }
  const rows = (await db
    .prepare(
      `SELECT b.*, u.name AS created_by_name FROM blocked_numbers b LEFT JOIN users u ON u.id = b.created_by
        WHERE ${where} ORDER BY b.created_at DESC LIMIT 1000`
    )
    .all(...params)) as any[];
  res.json({
    canUnblock: canUnblock(req),
    items: rows.map((r) => ({
      id: r.id,
      phone: r.phone_key,
      name: r.name,
      reason: r.reason,
      source: r.source,
      createdAt: r.created_at,
      createdBy: r.created_by_name ?? '',
    })),
  });
});

blocklistRouter.post('/', async (req, res) => {
  const key = blockKey(req.body?.phone);
  if (!key || key.length < 10) throw bad('Informe um telefone válido com DDD.');
  if (await isBlocked(tid(req), key)) throw new HttpError(409, 'Este número já está bloqueado.');
  await blockNumber({
    tenantId: tid(req),
    phone: key,
    name: String(req.body?.name ?? '').trim(),
    reason: String(req.body?.reason ?? '').trim() || 'Incluído manualmente',
    source: 'manual',
    userId: req.auth!.userId,
  });
  await audit({ ...actor(req), action: 'blocklist.added', target: key });
  res.status(201).json({ ok: true });
});

blocklistRouter.delete('/:id', async (req, res) => {
  if (!canUnblock(req)) throw new HttpError(403, 'Apenas Parlamentar, Chefe de Gabinete ou Coordenação podem desbloquear números.');
  const t = tid(req);
  const row = (await db.prepare(`SELECT * FROM blocked_numbers WHERE id = ? AND tenant_id = ?`).get(req.params.id, t)) as any;
  if (!row) throw new HttpError(404, 'Número não encontrado.');
  await db.prepare(`DELETE FROM blocked_numbers WHERE id = ?`).run(row.id);
  // Leads bloqueados por este número voltam para "Contatado" (ou "Novo", se nunca houve contato).
  await db
    .prepare(
      `UPDATE crm_leads SET status = CASE WHEN contact_count > 0 THEN 'contatado' ELSE 'novo' END,
              status_at = datetime('now'), status_by = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND status = 'bloqueado' AND phone_key(phone) = ?`
    )
    .run(req.auth!.userId, t, row.phone_key);
  await audit({ ...actor(req), action: 'blocklist.removed', target: row.phone_key });
  res.json({ ok: true });
});
