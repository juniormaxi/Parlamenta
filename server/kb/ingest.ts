/**
 * Camada central de ingestão da Base de Conhecimento.
 *
 * Os módulos de origem não escrevem em knowledge_items: eles registram um "adaptador" (registerSource) que sabe
 * carregar o registro original e transformá-lo num documento, e pedem a sincronização por REFERÊNCIA
 * (tenant + origem + id). A ingestão:
 *   - carrega o registro na origem (fonte da verdade) — se ele não existir mais (ou não deva ser publicado),
 *     o documento é retirado da base;
 *   - identifica o documento por (tenant, origem, id de origem) — nunca pelo nome do arquivo;
 *   - calcula o hash SHA-256 do conteúdo normalizado: mesmo conteúdo → nada a reprocessar; conteúdo novo →
 *     nova versão + reindexação; só metadados → atualiza o catálogo;
 *   - grava versões, permissões, contadores e auditoria na MESMA transação;
 *   - agenda o processamento pesado (fragmentação, Mapa Neural) na fila persistente.
 *
 * syncNow() roda dentro da transação de quem chama (ex.: salvar um ofício): se a publicação falhar, a
 * gravação de origem também é desfeita. requestSync() só enfileira (para lotes, ex.: Clipping).
 */
import crypto from 'node:crypto';
import { db, audit } from '../db';
import { enqueue } from '../jobs';
import { withKb, systemCtx } from './context';
import { themesOf } from '../knowledgeGraph';

export type Visibility = 'tenant' | 'roles' | 'users' | 'confidential';
export const VISIBILITIES: Visibility[] = ['tenant', 'roles', 'users', 'confidential'];

export interface DocInput {
  title: string;
  summary?: string;
  content: string;
  /** Offsets (in the normalized content) where each page starts; page numbers are 1-based positions. */
  pages?: number[];
  tags?: string[];
  meta?: Record<string, unknown>;
  docType?: string;
  docNumber?: string;
  docDate?: string;
  /** Reference to the original file in its own storage (no copy is made). */
  fileRef?: string;
  /** Author of the record at the source (stored as created_by on first publication). */
  authorId?: string | null;
  visibility?: Visibility;
  acl?: { roles?: string[]; users?: string[] };
}

export interface SourceAdapter {
  /** Label shown in the UI. */
  label: string;
  /** Loads the source record as a document, or null when it no longer exists / must not be published. */
  load(tenantId: string, sourceId: string): Promise<DocInput | null>;
  /** Pages through the ids of the existing records (initial load). */
  listIds(tenantId: string, afterId: string, limit: number): Promise<string[]>;
}
const sources = new Map<string, SourceAdapter>();
export function registerSource(source: string, adapter: SourceAdapter) {
  sources.set(source, adapter);
}
export const sourceAdapters = () => sources;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export const normalizeContent = (s: string) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
export const sha256 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const GRAPH_DEBOUNCE_MS = Number(process.env.KB_GRAPH_DEBOUNCE_MS || 60_000);
const PURGE_DELAY_MS = Number(process.env.KB_PURGE_DELAY_MS || 10 * 60_000);

async function bumpStats(tenantId: string, source: string, dDocs: number, dBytes: number) {
  if (!dDocs && !dBytes) return;
  await db
    .prepare(
      `INSERT INTO knowledge_stats (tenant_id, source, docs, bytes) VALUES (?, ?, GREATEST(?, 0), GREATEST(?, 0))
       ON CONFLICT (tenant_id, source) DO UPDATE SET docs = GREATEST(knowledge_stats.docs + ?, 0),
         bytes = GREATEST(knowledge_stats.bytes + ?, 0), updated_at = now()`
    )
    .run(tenantId, source, dDocs, dBytes, dDocs, dBytes);
}

/** Marks the tenant's Mapa Neural as stale and schedules a (debounced) rebuild. */
export async function markGraphDirty(tenantId: string) {
  await db
    .prepare(
      `INSERT INTO knowledge_graph_state (tenant_id, dirty, gen) VALUES (?, true, 1)
       ON CONFLICT (tenant_id) DO UPDATE SET dirty = true, gen = knowledge_graph_state.gen + 1`
    )
    .run(tenantId);
  await enqueue({ tenantId, kind: 'kb.graph', ref: tenantId, dedupeKey: `kb.graph:${tenantId}`, delayMs: GRAPH_DEBOUNCE_MS, priority: 200 });
}

async function writeAcl(tenantId: string, itemId: string, acl: DocInput['acl'], grantedBy: string | null) {
  await db.prepare(`DELETE FROM knowledge_acl WHERE item_id = ?`).run(itemId);
  const rows = [
    ...[...new Set(acl?.roles ?? [])].map((p) => ['role', p] as const),
    ...[...new Set(acl?.users ?? [])].map((p) => ['user', p] as const),
  ];
  for (const [type, principal] of rows) {
    await db
      .prepare(`INSERT INTO knowledge_acl (tenant_id, item_id, principal_type, principal, granted_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .run(tenantId, itemId, type, principal, grantedBy);
  }
}
const aclKey = (vis: string, acl: DocInput['acl']) =>
  JSON.stringify([vis, [...new Set(acl?.roles ?? [])].sort(), [...new Set(acl?.users ?? [])].sort()]);

export type PublishResult = { id: string; version: number; change: 'created' | 'updated' | 'metadata' | 'unchanged' | 'restored' };

// ---------------------------------------------------------------------------
// publish / unpublish
// ---------------------------------------------------------------------------
export async function publishDocument(tenantId: string, source: string, sourceId: string, d: DocInput, actorId: string | null = null): Promise<PublishResult> {
  const content = normalizeContent(d.content);
  const hash = sha256(content);
  const bytes = Buffer.byteLength(content, 'utf8');
  const title = String(d.title ?? '').trim().slice(0, 500) || '(sem título)';
  const summary = String(d.summary ?? '').slice(0, 1000);
  const tags = JSON.stringify([...new Set(d.tags ?? [])]);
  const meta = JSON.stringify(d.meta ?? {});
  const themes = JSON.stringify(themesOf({ title, summary, content }));
  const vis: Visibility = d.visibility && VISIBILITIES.includes(d.visibility) ? d.visibility : 'tenant';
  const pages = d.pages?.length ? JSON.stringify(d.pages) : '';
  const fields = {
    docType: String(d.docType ?? source).slice(0, 60),
    docNumber: String(d.docNumber ?? '').slice(0, 120),
    docDate: /^\d{4}-\d{2}-\d{2}/.test(String(d.docDate ?? '')) ? String(d.docDate).slice(0, 10) : '',
    fileRef: String(d.fileRef ?? '').slice(0, 300),
  };

  return withKb(systemCtx(tenantId, actorId), async () => {
    const id = crypto.randomUUID();
    const inserted = await db
      .prepare(
        `INSERT INTO knowledge_items (id, tenant_id, source, source_id, title, summary, content, tags, meta, created_by,
                                      visibility, content_hash, content_bytes, version, index_status, doc_type, doc_number, doc_date, file_ref, pages, themes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, source, source_id) DO NOTHING RETURNING id`
      )
      .get(id, tenantId, source, sourceId, title, summary, content, tags, meta, d.authorId ?? actorId, vis, hash, bytes,
        fields.docType, fields.docNumber, fields.docDate, fields.fileRef, pages, themes);

    if (inserted) {
      await db.prepare(`INSERT INTO knowledge_versions (tenant_id, item_id, version, content_hash, bytes, created_by) VALUES (?, ?, 1, ?, ?, ?)`).run(tenantId, id, hash, bytes, actorId);
      if (vis !== 'tenant') await writeAcl(tenantId, id, d.acl, actorId);
      await bumpStats(tenantId, source, 1, bytes);
      await enqueue({ tenantId, kind: 'kb.index', ref: id, dedupeKey: `kb.index:${id}` });
      await markGraphDirty(tenantId);
      await audit({ actorId, tenantId, action: 'kb.document.created', target: id, details: { source, sourceId, version: 1, visibility: vis } });
      return { id, version: 1, change: 'created' };
    }

    // Existing document: lock it so concurrent publications of the same record are serialized.
    const cur = (await db
      .prepare(`SELECT * FROM knowledge_items WHERE tenant_id = ? AND source = ? AND source_id = ? FOR UPDATE`)
      .get(tenantId, source, sourceId)) as any;
    const restored = !!cur.deleted_at;
    const legacy = cur.content_hash === ''; // published before content hashing existed: adopt, no new version
    const contentChanged = !legacy && cur.content_hash !== hash;
    const textChanged = contentChanged || cur.title !== title || cur.summary !== summary;
    const metaChanged =
      cur.tags !== tags || cur.meta !== meta || cur.doc_type !== fields.docType || cur.doc_number !== fields.docNumber ||
      cur.doc_date !== fields.docDate || cur.file_ref !== fields.fileRef || cur.pages !== pages || cur.themes !== themes;

    // Permissions: the source only manages them while nobody changed them by hand.
    let aclChanged = false;
    if (cur.acl_managed === 'source') {
      const curAcl = (await db.prepare(`SELECT principal_type, principal FROM knowledge_acl WHERE item_id = ?`).all(cur.id)) as any[];
      const before = aclKey(cur.visibility, {
        roles: curAcl.filter((a) => a.principal_type === 'role').map((a) => a.principal),
        users: curAcl.filter((a) => a.principal_type === 'user').map((a) => a.principal),
      });
      const after = aclKey(vis, vis === 'tenant' ? {} : d.acl);
      if (before !== after) {
        aclChanged = true;
        await db.prepare(`UPDATE knowledge_items SET visibility = ? WHERE id = ?`).run(vis, cur.id);
        await writeAcl(tenantId, cur.id, vis === 'tenant' ? {} : d.acl, actorId);
      }
    }

    if (!restored && !legacy && !textChanged && !metaChanged && !aclChanged) return { id: cur.id, version: cur.version, change: 'unchanged' };

    const version = contentChanged ? cur.version + 1 : cur.version;
    const reindex = textChanged || legacy || restored || cur.index_status === 'pending' || (cur.index_status === 'error' && contentChanged);
    await db
      .prepare(
        `UPDATE knowledge_items SET title = ?, summary = ?, content = ?, tags = ?, meta = ?, content_hash = ?, content_bytes = ?, version = ?,
                doc_type = ?, doc_number = ?, doc_date = ?, file_ref = ?, pages = ?, themes = ?, deleted_at = NULL,
                index_status = CASE WHEN ? THEN 'pending' ELSE index_status END,
                updated_at = CASE WHEN ? THEN datetime('now') ELSE updated_at END
          WHERE id = ?`
      )
      .run(title, summary, content, tags, meta, hash, bytes, version, fields.docType, fields.docNumber, fields.docDate, fields.fileRef, pages, themes,
        reindex, textChanged || metaChanged || restored, cur.id);
    if (contentChanged) {
      await db.prepare(`INSERT INTO knowledge_versions (tenant_id, item_id, version, content_hash, bytes, created_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(tenantId, cur.id, version, hash, bytes, actorId);
    } else if (legacy) {
      await db.prepare(`INSERT INTO knowledge_versions (tenant_id, item_id, version, content_hash, bytes, created_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(tenantId, cur.id, cur.version, hash, bytes, cur.created_by);
    }
    if (restored) await bumpStats(tenantId, source, 1, bytes);
    else if (!legacy) await bumpStats(tenantId, source, 0, bytes - (cur.content_bytes ?? 0));
    if (reindex) await enqueue({ tenantId, kind: 'kb.index', ref: cur.id, dedupeKey: `kb.index:${cur.id}` });
    if (textChanged || restored || legacy || aclChanged || cur.themes !== themes) await markGraphDirty(tenantId);

    const change: PublishResult['change'] = restored ? 'restored' : contentChanged ? 'updated' : 'metadata';
    if (!legacy || restored) {
      await audit({
        actorId,
        tenantId,
        action: restored ? 'kb.document.restored' : 'kb.document.updated',
        target: cur.id,
        details: { source, sourceId, version, contentChanged, ...(aclChanged ? { visibility: vis } : {}) },
      });
    }
    if (aclChanged) await audit({ actorId, tenantId, action: 'kb.acl.changed', target: cur.id, details: { by: 'source', visibility: vis } });
    return { id: cur.id, version, change };
  });
}

/**
 * Removes a document from the base. It disappears from every query IMMEDIATELY (deleted_at, enforced by the
 * RLS policy and by the queries); fragments, links and the row itself are purged later by a job.
 */
export async function unpublishDocument(tenantId: string, source: string, sourceId: string, actorId: string | null = null) {
  return withKb(systemCtx(tenantId, actorId), async () => {
    const r = (await db
      .prepare(
        `UPDATE knowledge_items SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE tenant_id = ? AND source = ? AND source_id = ? AND deleted_at IS NULL RETURNING id, content_bytes`
      )
      .get(tenantId, source, sourceId)) as any;
    if (!r) return false;
    await bumpStats(tenantId, source, -1, -(r.content_bytes ?? 0));
    await enqueue({ tenantId, kind: 'kb.purge', ref: r.id, dedupeKey: `kb.purge:${r.id}`, delayMs: PURGE_DELAY_MS });
    await markGraphDirty(tenantId);
    await audit({ actorId, tenantId, action: 'kb.document.deleted', target: r.id, details: { source, sourceId } });
    return true;
  });
}

// ---------------------------------------------------------------------------
// sync by reference
// ---------------------------------------------------------------------------
/** Loads the source record and publishes/unpublishes it, inside the caller's transaction (if any). */
export async function syncNow(tenantId: string, source: string, sourceId: string, actorId: string | null = null) {
  const adapter = sources.get(source);
  if (!adapter) throw new Error(`Origem desconhecida na Base de Conhecimento: ${source}`);
  const doc = await adapter.load(tenantId, sourceId);
  if (!doc) {
    await unpublishDocument(tenantId, source, sourceId, actorId);
    return null;
  }
  return publishDocument(tenantId, source, sourceId, doc, actorId);
}

/** Schedules the synchronization (for batches and background producers). */
export async function requestSync(tenantId: string, source: string, sourceId: string, actorId: string | null = null, delayMs = 0) {
  await enqueue({
    tenantId,
    kind: 'kb.sync',
    ref: `${source}:${sourceId}`,
    dedupeKey: `kb.sync:${tenantId}:${source}:${sourceId}`,
    payload: { source, sourceId, actorId },
    delayMs,
  });
}

/** Recomputes the tenant's counters from the catalog (corrects any drift of the incremental counters). */
export async function reconcileStats(tenantId: string) {
  await withKb(systemCtx(tenantId), async () => {
    const rows = (await db
      .prepare(
        `SELECT source, COUNT(*)::int AS docs, COALESCE(SUM(content_bytes), 0)::bigint AS bytes
           FROM knowledge_items WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY source`
      )
      .all(tenantId)) as any[];
    await db.prepare(`DELETE FROM knowledge_stats WHERE tenant_id = ?`).run(tenantId);
    for (const r of rows) {
      await db.prepare(`INSERT INTO knowledge_stats (tenant_id, source, docs, bytes) VALUES (?, ?, ?, ?)`).run(tenantId, r.source, r.docs, r.bytes);
    }
  });
}

/** Changes a document's permissions by hand (authorization is checked by the caller). From now on the source no longer manages them. */
export async function setAccess(tenantId: string, itemId: string, visibility: Visibility, acl: { roles: string[]; users: string[] }, actorId: string) {
  return withKb(systemCtx(tenantId, actorId), async () => {
    const cur = (await db.prepare(`SELECT id, visibility FROM knowledge_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL FOR UPDATE`).get(itemId, tenantId)) as any;
    if (!cur) return null;
    await db.prepare(`UPDATE knowledge_items SET visibility = ?, acl_managed = 'manual' WHERE id = ?`).run(visibility, itemId);
    await writeAcl(tenantId, itemId, visibility === 'tenant' ? {} : acl, actorId);
    if ((cur.visibility === 'confidential') !== (visibility === 'confidential')) await markGraphDirty(tenantId);
    await audit({
      actorId,
      tenantId,
      action: 'kb.acl.changed',
      target: itemId,
      details: { by: 'user', from: cur.visibility, to: visibility, roles: acl.roles.length, users: acl.users.length },
    });
    return { from: cur.visibility, to: visibility };
  });
}
