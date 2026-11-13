/**
 * Banco de Dados › Base de Conhecimento: acervo dos documentos produzidos pelo gabinete.
 * Os módulos de origem publicam aqui pela camada central de ingestão (server/kb/ingest.ts).
 * Montado em /api/tenant/knowledge.
 *
 * Toda consulta roda em withKb(userCtx(req)): o RLS do PostgreSQL limita ao gabinete da sessão e às
 * permissões do documento (quando o papel do banco está sujeito ao RLS) e as consultas ainda filtram
 * tenant_id e deleted_at explicitamente — duas barreiras independentes.
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import { db, audit } from './db';
import { HttpError, bad } from './http';
import { TENANT_ROLES } from './auth';
import { withKb, userCtx, systemCtx, KB_ADMIN_ROLES } from './kb/context';
import { publishDocument, unpublishDocument, setAccess, VISIBILITIES, type Visibility, markGraphDirty } from './kb/ingest';
import { enqueue, queueStats } from './jobs';
import { timed, record, metricsSummary } from './kb/metrics';
import { assembleGraph } from './knowledgeGraph';

export const knowledgeRouter = express.Router();

// ---------------------------------------------------------------------------
// compatibilidade: API antiga usada pelos módulos (agora delega à camada central)
// ---------------------------------------------------------------------------
/** @deprecated use syncNow()/publishDocument() de server/kb/ingest.ts */
export async function upsertKnowledge(e: {
  tenantId: string;
  source: string;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  meta: Record<string, unknown>;
  userId: string | null;
}) {
  await publishDocument(e.tenantId, e.source, e.sourceId, { title: e.title, summary: e.summary, content: e.content, tags: e.tags, meta: e.meta }, e.userId);
}
/** @deprecated use syncNow()/unpublishDocument() de server/kb/ingest.ts */
export async function removeKnowledge(tenantId: string, source: string, sourceId: string) {
  await unpublishDocument(tenantId, source, sourceId, null);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const parse = <T>(s: string | null | undefined, fb: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fb;
  } catch {
    return fb;
  }
};
const canManage = (req: Request, createdBy: string | null) => KB_ADMIN_ROLES.includes(req.auth!.role) || (!!createdBy && createdBy === req.auth!.userId);

const mapItem = (r: any, full = false) => ({
  id: r.id,
  source: r.source,
  sourceId: r.source_id,
  title: r.title,
  summary: r.summary,
  ...(full ? { content: r.content } : {}),
  tags: parse<string[]>(r.tags, []),
  meta: parse<Record<string, unknown>>(r.meta, {}),
  themes: parse<{ theme: string }[]>(r.themes, []).map((t) => t.theme),
  visibility: r.visibility as Visibility,
  version: r.version,
  indexStatus: r.index_status,
  docType: r.doc_type,
  docNumber: r.doc_number,
  docDate: r.doc_date,
  createdBy: r.created_by_name ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Prefix full-text query ("hospi saude" → hospi:* & saude:*), safe for to_tsquery. */
export function prefixQuery(q: string) {
  const words = (q.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 2).slice(0, 8);
  return words.map((w) => `${w}:*`).join(' & ');
}

// Searches are audited without the query text (it may contain personal data): hash + length + filters.
const searchAudited = new Map<string, number>();
async function auditSearch(req: Request, q: string, tag: string, results: number) {
  const key = `${req.auth!.userId}|${q}|${tag}`;
  const now = Date.now();
  if ((searchAudited.get(key) ?? 0) > now - 60_000) return;
  searchAudited.set(key, now);
  if (searchAudited.size > 20_000) for (const [k, t] of searchAudited) if (t < now - 60_000) searchAudited.delete(k);
  await audit({
    actorId: req.auth!.userId,
    actorEmail: req.auth!.email,
    tenantId: req.auth!.tenantId,
    action: 'kb.search',
    details: { qHash: q ? crypto.createHash('sha256').update(q).digest('hex').slice(0, 16) : null, qLength: q.length, tag: tag || null, results },
    ip: req.ip,
  });
}

/**
 * Contagem por etiqueta (respeita a visibilidade do usuário). Em vez de varrer o acervo a cada carregamento,
 * reaproveita o resultado enquanto o acervo do gabinete não mudar: knowledge_graph_state.gen é incrementado a
 * cada publicação, exclusão ou mudança de permissão (leitura de 1 linha pela chave). Cache por réplica e usuário.
 */
const facetCache = new Map<string, { gen: number; at: number; tags: { tag: string; count: number }[] }>();
async function tagFacets(tenantId: string, userId: string) {
  const g = (await db.prepare(`SELECT gen FROM knowledge_graph_state WHERE tenant_id = ?`).get(tenantId)) as any;
  const gen = Number(g?.gen ?? 0);
  const key = `${tenantId}|${userId}`;
  const hit = facetCache.get(key);
  if (hit && hit.gen === gen && Date.now() - hit.at < 10 * 60_000) return hit.tags;
  const rows = (await db
    .prepare(
      `SELECT x AS tag, COUNT(*)::int AS n FROM knowledge_items, jsonb_array_elements_text(tags::jsonb) AS x
        WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY x ORDER BY x`
    )
    .all(tenantId)) as any[];
  const tags = rows.map((r) => ({ tag: r.tag, count: r.n }));
  if (facetCache.size > 5000) facetCache.clear();
  facetCache.set(key, { gen, at: Date.now(), tags });
  return tags;
}

// ---------------------------------------------------------------------------
// acervo
// ---------------------------------------------------------------------------
knowledgeRouter.get('/', async (req, res) => {
  const t = req.auth!.tenantId!;
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  const tag = String(req.query.tag ?? '').trim().slice(0, 60);
  const source = String(req.query.source ?? '').trim().slice(0, 30);
  const out = await timed('kb.list', t, () =>
    withKb(userCtx(req), async () => {
      const where = ['k.tenant_id = ?', 'k.deleted_at IS NULL'];
      const params: unknown[] = [t];
      if (q) {
        const like = `%${q.replace(/[%_\\]/g, '')}%`;
        const tsq = prefixQuery(q);
        const ors = ['k.title ILIKE ?', 'k.summary ILIKE ?', `(k.index_status <> 'indexed' AND k.content ILIKE ?)`];
        params.push(like, like, like);
        if (tsq) {
          ors.push(`EXISTS (SELECT 1 FROM knowledge_chunks c WHERE c.item_id = k.id AND c.tenant_id = k.tenant_id AND c.tsv @@ to_tsquery('portuguese', ?))`);
          params.push(tsq);
        }
        where.push(`(${ors.join(' OR ')})`);
      }
      if (tag) {
        where.push(`jsonb_exists(k.tags::jsonb, ?)`); // o operador "?" do jsonb colidiria com os placeholders
        params.push(tag);
      }
      if (source) {
        where.push('k.source = ?');
        params.push(source);
      }
      const rows = (await db
        .prepare(
          `SELECT k.id, k.source, k.source_id, k.title, k.summary, k.tags, k.meta, k.themes, k.visibility, k.version, k.index_status,
                  k.doc_type, k.doc_number, k.doc_date, k.created_at, k.updated_at, u.name AS created_by_name
             FROM knowledge_items k LEFT JOIN users u ON u.id = k.created_by
            WHERE ${where.join(' AND ')} ORDER BY k.updated_at DESC LIMIT 500`
        )
        .all(...params)) as any[];
      return { items: rows.map((r) => mapItem(r)), tags: await tagFacets(t, req.auth!.userId) };
    })
  );
  if (q || tag) await auditSearch(req, q, tag, out.items.length);
  res.json(out);
});

// ---------------------------------------------------------------------------
// Mapa Neural — ligações pré-calculadas em segundo plano; aqui só se monta o recorte pedido
// ---------------------------------------------------------------------------
knowledgeRouter.get('/graph', async (req, res) => {
  const t = req.auth!.tenantId!;
  const limit = Math.max(20, Math.min(1000, Number(req.query.limit) || 600));
  const theme = String(req.query.theme ?? '').trim().slice(0, 60);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from ?? '')) ? String(req.query.from) : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to ?? '')) ? String(req.query.to) : '';
  const source = String(req.query.source ?? '').trim().slice(0, 30);
  const graph = await timed('kb.graph.read', t, () =>
    withKb(userCtx(req), async () => {
      const where = ['tenant_id = ?', 'deleted_at IS NULL', `visibility <> 'confidential'`];
      const params: unknown[] = [t];
      const day = `COALESCE(NULLIF(doc_date, ''), substr(created_at, 1, 10))`;
      if (from) {
        where.push(`${day} >= ?`);
        params.push(from);
      }
      if (to) {
        where.push(`${day} <= ?`);
        params.push(to);
      }
      if (source) {
        where.push('source = ?');
        params.push(source);
      }
      if (theme) {
        where.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(themes::jsonb) th WHERE th->>'theme' = ?)`);
        params.push(theme);
      }
      const rows = (await db
        .prepare(
          `SELECT id, source, source_id, title, summary, tags, meta, themes, created_at FROM knowledge_items
            WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`
        )
        .all(...params, limit)) as any[];
      const ids = rows.map((r) => r.id);
      const links = ids.length
        ? ((await db
            .prepare(`SELECT a, b, strength, shared FROM knowledge_links WHERE tenant_id = ? AND a = ANY(?::text[]) AND b = ANY(?::text[])`)
            .all(t, ids, ids)) as any[])
        : [];
      const state = (await db.prepare(`SELECT dirty, built_at, duration_ms, docs, links, error FROM knowledge_graph_state WHERE tenant_id = ?`).get(t)) as any;
      const g = assembleGraph(
        rows.map((r) => ({
          id: r.id,
          source: r.source,
          sourceId: r.source_id,
          title: r.title,
          summary: r.summary,
          tags: parse(r.tags, []),
          meta: parse(r.meta, {}),
          createdAt: r.created_at,
          themes: parse(r.themes, []),
        })),
        links.map((l) => ({ source: l.a, target: l.b, strength: Number(l.strength), shared: parse(l.shared, []) }))
      );
      return {
        ...g,
        state: {
          pending: !state || state.dirty,
          builtAt: state?.built_at ?? null,
          buildMs: state?.duration_ms ?? null,
          error: state?.error || null,
          limit,
          filters: { theme: theme || null, from: from || null, to: to || null, source: source || null },
        },
      };
    })
  );
  res.json(graph);
});

// ---------------------------------------------------------------------------
// métricas do gabinete (Parlamentar / Chefe de Gabinete)
// ---------------------------------------------------------------------------
knowledgeRouter.get('/metrics', async (req, res) => {
  if (!KB_ADMIN_ROLES.includes(req.auth!.role)) throw new HttpError(403, 'Apenas Parlamentar ou Chefe de Gabinete.');
  const t = req.auth!.tenantId!;
  const stats = (await db.prepare(`SELECT source, docs, bytes, updated_at FROM knowledge_stats WHERE tenant_id = ? ORDER BY source`).all(t)) as any[];
  const attention = await withKb(userCtx(req), async () =>
    (await db
      .prepare(
        `SELECT index_status, COUNT(*)::int AS n FROM knowledge_items
          WHERE tenant_id = ? AND index_status IN ('pending','error') AND deleted_at IS NULL GROUP BY index_status`
      )
      .all(t)) as any[]
  );
  const graph = await withKb(userCtx(req), () => db.prepare(`SELECT dirty, built_at, duration_ms, docs, links, error FROM knowledge_graph_state WHERE tenant_id = ?`).get(t));
  res.json({
    documents: stats.map((s) => ({ source: s.source, docs: s.docs, bytes: Number(s.bytes) })),
    totals: { docs: stats.reduce((a, s) => a + s.docs, 0), bytes: stats.reduce((a, s) => a + Number(s.bytes), 0) },
    indexing: Object.fromEntries(attention.map((r) => [r.index_status, r.n])),
    queue: await queueStats(t),
    graph,
    timings: await metricsSummary(24, t),
  });
});

/** Roles and users of the cabinet, for the permissions editor. */
knowledgeRouter.get('/access-options', async (req, res) => {
  const users = (await db
    .prepare(`SELECT id, name, role FROM users WHERE tenant_id = ? AND status = 'active' ORDER BY lower(name)`)
    .all(req.auth!.tenantId)) as any[];
  res.json({ roles: TENANT_ROLES, users });
});

// ---------------------------------------------------------------------------
// documento
// ---------------------------------------------------------------------------
knowledgeRouter.get('/:id', async (req, res) => {
  const t = req.auth!.tenantId!;
  const out = await timed('kb.get', t, () =>
    withKb(userCtx(req), async () => {
      const r = (await db
        .prepare(
          `SELECT k.*, u.name AS created_by_name FROM knowledge_items k LEFT JOIN users u ON u.id = k.created_by
            WHERE k.id = ? AND k.tenant_id = ? AND k.deleted_at IS NULL`
        )
        .get(req.params.id, t)) as any;
      if (!r) return null;
      const manage = canManage(req, r.created_by);
      const acl = manage ? ((await db.prepare(`SELECT principal_type, principal FROM knowledge_acl WHERE item_id = ?`).all(r.id)) as any[]) : [];
      const same = r.content_hash
        ? ((await db
            .prepare(
              `SELECT id, source, title FROM knowledge_items WHERE tenant_id = ? AND content_hash = ? AND id <> ? AND deleted_at IS NULL LIMIT 10`
            )
            .all(t, r.content_hash, r.id)) as any[])
        : [];
      return {
        row: r,
        body: {
          ...mapItem(r, true),
          indexError: r.index_error || null,
          canManage: manage,
          aclManaged: r.acl_managed,
          acl: manage
            ? {
                roles: acl.filter((a) => a.principal_type === 'role').map((a) => a.principal),
                users: acl.filter((a) => a.principal_type === 'user').map((a) => a.principal),
              }
            : undefined,
          sameContent: same.map((s) => ({ id: s.id, source: s.source, title: s.title })),
        },
      };
    })
  );
  if (!out) throw new HttpError(404, 'Item não encontrado.');
  if (out.row.visibility !== 'tenant') {
    await audit({
      actorId: req.auth!.userId,
      actorEmail: req.auth!.email,
      tenantId: t,
      action: 'kb.document.accessed',
      target: out.row.id,
      details: { source: out.row.source, visibility: out.row.visibility },
      ip: req.ip,
    });
  }
  res.json(out.body);
});

/** Altera as permissões de um documento (Parlamentar/Chefe de Gabinete ou autor). */
knowledgeRouter.put('/:id/access', async (req, res) => {
  const t = req.auth!.tenantId!;
  const b = req.body ?? {};
  const visibility = String(b.visibility ?? '') as Visibility;
  if (!VISIBILITIES.includes(visibility)) throw bad('Visibilidade inválida.');
  const roles = [...new Set((Array.isArray(b.roles) ? b.roles : []).map(String))] as string[];
  if (roles.some((r) => !(TENANT_ROLES as readonly string[]).includes(r))) throw bad('Papel inválido.');
  let users = [...new Set((Array.isArray(b.users) ? b.users : []).map(String))].slice(0, 200) as string[];
  if (users.length) {
    const ok = (await db.prepare(`SELECT id FROM users WHERE tenant_id = ? AND id = ANY(?::text[])`).all(t, users)) as any[];
    if (ok.length !== users.length) throw bad('Usuário inválido.');
  }
  if (visibility === 'roles' && !roles.length && !users.length) throw bad('Informe ao menos um papel ou usuário.');
  // Never lock yourself out of a restricted document you are configuring.
  if ((visibility === 'users' || visibility === 'confidential') && !users.includes(req.auth!.userId)) users = [...users, req.auth!.userId];

  const item = (await withKb(userCtx(req), () =>
    db.prepare(`SELECT id, created_by FROM knowledge_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`).get(req.params.id, t)
  )) as any;
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  if (!canManage(req, item.created_by)) throw new HttpError(403, 'Apenas Parlamentar, Chefe de Gabinete ou o autor podem alterar as permissões.');
  await setAccess(t, item.id, visibility, { roles: visibility === 'roles' ? roles : [], users: visibility === 'tenant' ? [] : users }, req.auth!.userId);
  res.json({ ok: true, visibility });
});

/** Reprocessa a indexação de um documento (ex.: após erro). */
knowledgeRouter.post('/:id/reprocess', async (req, res) => {
  if (!KB_ADMIN_ROLES.includes(req.auth!.role)) throw new HttpError(403, 'Apenas Parlamentar ou Chefe de Gabinete.');
  const t = req.auth!.tenantId!;
  const item = (await withKb(userCtx(req), () =>
    db.prepare(`SELECT id FROM knowledge_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`).get(req.params.id, t)
  )) as any;
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  await enqueue({ tenantId: t, kind: 'kb.index', ref: item.id, dedupeKey: `kb.index:${item.id}` });
  await withKb(systemCtx(t, req.auth!.userId), () => markGraphDirty(t));
  await audit({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: t, action: 'kb.document.reprocess', target: item.id, ip: req.ip });
  record('kb.reprocess', 0, t);
  res.json({ ok: true });
});
