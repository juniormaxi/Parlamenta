/**
 * Jobs da Base de Conhecimento (executados pela fila persistente server/jobs.ts):
 *   kb.index     — fragmenta a versão vigente do documento (substitui os fragmentos anteriores)
 *   kb.purge     — limpeza física de um documento excluído (fragmentos, ligações, permissões, versões)
 *   kb.sync      — sincroniza um registro de origem por referência (publica ou retira)
 *   kb.graph     — recalcula as ligações do Mapa Neural do gabinete (em worker thread)
 *   kb.backfill  — carga inicial dos registros já existentes de uma origem, em lotes
 *   kb.reconcile — recalcula os contadores do gabinete
 */
import { db, tx } from '../db';
import { registerJob, enqueue, isLastAttempt, PermanentJobError, type Job } from '../jobs';
import { withKb, systemCtx } from './context';
import { chunkText } from './chunk';
import { syncNow, reconcileStats, compactStats, sourceAdapters } from './ingest';
import { runInThread } from './thread';
import { record } from './metrics';
import type { SimilarLink } from '../knowledgeGraph';
import './sources';

export const CHUNK_TARGET_TOKENS = Number(process.env.KB_CHUNK_TOKENS || 800);
export const CHUNK_OVERLAP_TOKENS = Number(process.env.KB_CHUNK_OVERLAP_TOKENS || 80);
/** Documentos considerados no cálculo do Mapa Neural por gabinete (os mais recentes). */
export const GRAPH_MAX_DOCS = Number(process.env.KB_GRAPH_MAX_DOCS || 3000);
const BACKFILL_BATCH = 200;
const GRAPH_DEBOUNCE_MS = Number(process.env.KB_GRAPH_DEBOUNCE_MS || 60_000);

const tenantOf = (job: Job) => {
  if (!job.tenant_id) throw new PermanentJobError('Job sem gabinete.');
  return job.tenant_id;
};

export async function indexItem(tenantId: string, itemId: string) {
  return withKb(systemCtx(tenantId), async () => {
    const it = (await db
      .prepare(`SELECT id, version, content, pages, deleted_at FROM knowledge_items WHERE id = ? AND tenant_id = ? FOR UPDATE`)
      .get(itemId, tenantId)) as any;
    if (!it || it.deleted_at) return { chunks: 0, skipped: true };
    let pages: number[] = [];
    try {
      pages = it.pages ? JSON.parse(it.pages) : [];
    } catch {
      pages = [];
    }
    const chunks = chunkText(it.content ?? '', { targetTokens: CHUNK_TARGET_TOKENS, overlapTokens: CHUNK_OVERLAP_TOKENS, pages });
    await db.prepare(`DELETE FROM knowledge_chunks WHERE item_id = ?`).run(it.id);
    for (let i = 0; i < chunks.length; i += 200) {
      const batch = chunks.slice(i, i + 200).map((c) => ({
        id: `${it.id}:${it.version}:${c.ord}`,
        ord: c.ord,
        text: c.text,
        h: c.hash,
        cs: c.charStart,
        ce: c.charEnd,
        pf: c.pageFrom,
        pt: c.pageTo,
        sec: c.section,
        tk: c.tokenEstimate,
      }));
      await db
        .prepare(
          `INSERT INTO knowledge_chunks (id, tenant_id, item_id, version, ord, text, chunk_hash, char_start, char_end, page_from, page_to, section, token_estimate)
           SELECT v.id, ?, ?, ?, v.ord, v.text, v.h, v.cs, v.ce, v.pf, v.pt, v.sec, v.tk
             FROM jsonb_to_recordset(?::jsonb) AS v(id text, ord int, text text, h text, cs int, ce int, pf int, pt int, sec text, tk int)`
        )
        .run(tenantId, it.id, it.version, JSON.stringify(batch));
    }
    await db
      .prepare(`UPDATE knowledge_items SET index_status = ?, indexed_version = ?, index_error = '' WHERE id = ?`)
      .run(chunks.length ? 'indexed' : 'skipped', it.version, it.id);
    return { chunks: chunks.length, skipped: false };
  });
}

registerJob(
  'kb.index',
  async (job) => {
    const t = tenantOf(job);
    const t0 = performance.now();
    try {
      await indexItem(t, job.ref);
      record('kb.index', performance.now() - t0, t);
    } catch (e) {
      record('kb.index', performance.now() - t0, t, true);
      if (isLastAttempt(job) || e instanceof PermanentJobError) {
        await withKb(systemCtx(t), () =>
          db.prepare(`UPDATE knowledge_items SET index_status = 'error', index_error = ? WHERE id = ?`).run(String((e as Error).message).slice(0, 300), job.ref)
        );
      }
      throw e;
    }
  },
  { timeoutMs: 5 * 60_000 }
);

registerJob('kb.purge', async (job) => {
  const t = tenantOf(job);
  await withKb(systemCtx(t), () => db.prepare(`DELETE FROM knowledge_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NOT NULL`).run(job.ref, t));
});

registerJob('kb.sync', async (job) => {
  const t = tenantOf(job);
  const { source, sourceId, actorId } = job.payload ?? {};
  if (!sourceAdapters().has(source)) throw new PermanentJobError(`Origem desconhecida: ${source}`);
  const t0 = performance.now();
  await tx(() => syncNow(t, source, String(sourceId), actorId ?? null));
  record('kb.sync', performance.now() - t0, t);
});

export async function rebuildGraph(tenantId: string) {
  const t0 = performance.now();
  // Alterações vistas no início: são as que este recálculo cobre. Só elas são consumidas no fim; as que
  // chegarem durante o cálculo (ou forem confirmadas depois, com número menor) continuam pendentes.
  const seen = (await db
    .prepare(`SELECT COALESCE(array_agg(seq), '{}') AS seqs, COALESCE(MAX(seq), 0)::bigint AS max FROM knowledge_changes WHERE tenant_id = ?`)
    .get(tenantId)) as { seqs: (string | number)[]; max: string | number };
  const seenSeqs = seen.seqs.map(Number);
  const startGen = Number(seen.max);
  const items = await withKb(systemCtx(tenantId), () =>
    db
      .prepare(
        `SELECT id, title, summary, left(content, 12000) AS content FROM knowledge_items
          WHERE tenant_id = ? AND deleted_at IS NULL AND visibility <> 'confidential'
          ORDER BY updated_at DESC LIMIT ?`
      )
      .all<{ id: string; title: string; summary: string; content: string }>(tenantId, GRAPH_MAX_DOCS)
  );
  const links = items.length > 1 ? await runInThread<SimilarLink[]>(new URL('./graphWorker.ts', import.meta.url), { items }, { timeoutMs: 10 * 60_000 }) : [];
  const ms = Math.round(performance.now() - t0);
  await withKb(systemCtx(tenantId), async () => {
    await db.prepare(`DELETE FROM knowledge_links WHERE tenant_id = ?`).run(tenantId);
    for (let i = 0; i < links.length; i += 200) {
      const batch = links.slice(i, i + 200);
      await db
        .prepare(
          `INSERT INTO knowledge_links (tenant_id, a, b, strength, shared)
           SELECT ?, v.a, v.b, v.s, v.sh FROM jsonb_to_recordset(?::jsonb) AS v(a text, b text, s real, sh text)
           WHERE EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = v.a) AND EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = v.b)
           ON CONFLICT DO NOTHING`
        )
        .run(tenantId, JSON.stringify(batch.map((l) => ({ a: l.source, b: l.target, s: l.strength, sh: JSON.stringify(l.shared) }))));
    }
    await db
      .prepare(
        `INSERT INTO knowledge_graph_state (tenant_id, dirty, gen, built_at, duration_ms, docs, links, error) VALUES (?, false, ?, now(), ?, ?, ?, '')
         ON CONFLICT (tenant_id) DO UPDATE SET dirty = false, gen = GREATEST(knowledge_graph_state.gen, EXCLUDED.gen), built_at = now(),
           duration_ms = EXCLUDED.duration_ms, docs = EXCLUDED.docs, links = EXCLUDED.links, error = ''`
      )
      .run(tenantId, startGen, ms, items.length, links.length);
    if (seenSeqs.length) await db.prepare(`DELETE FROM knowledge_changes WHERE tenant_id = ? AND seq = ANY(?::bigint[])`).run(tenantId, seenSeqs);
  });
  // Alterações que chegaram durante o cálculo: agenda o próximo (o job atual ainda está "running", então
  // a publicação que as gerou pode não ter conseguido enfileirar um novo).
  const left = await db.prepare(`SELECT 1 FROM knowledge_changes WHERE tenant_id = ? LIMIT 1`).get(tenantId);
  if (left) await enqueue({ tenantId, kind: 'kb.graph', ref: tenantId, dedupeKey: `kb.graph:${tenantId}`, delayMs: GRAPH_DEBOUNCE_MS, priority: 200, onConflict: 'keep' });
  record('kb.graph.build', ms, tenantId);
  return { docs: items.length, links: links.length, ms };
}

registerJob(
  'kb.graph',
  async (job) => {
    const t = tenantOf(job);
    try {
      await rebuildGraph(t);
    } catch (e) {
      record('kb.graph.build', 0, t, true);
      await withKb(systemCtx(t), () =>
        db.prepare(`UPDATE knowledge_graph_state SET error = ? WHERE tenant_id = ?`).run(String((e as Error).message).slice(0, 300), t)
      ).catch(() => undefined);
      throw e;
    }
  },
  { timeoutMs: 15 * 60_000 }
);

registerJob(
  'kb.backfill',
  async (job) => {
    const t = tenantOf(job);
    const source = String(job.payload?.source ?? '');
    const adapter = sourceAdapters().get(source);
    if (!adapter) throw new PermanentJobError(`Origem desconhecida: ${source}`);
    const st = (await db.prepare(`SELECT cursor, done_at FROM knowledge_backfill WHERE tenant_id = ? AND source = ?`).get(t, source)) as any;
    if (st?.done_at) return;
    const ids = await adapter.listIds(t, st?.cursor ?? '', BACKFILL_BATCH);
    for (const id of ids) await tx(() => syncNow(t, source, id, null));
    const last = ids.at(-1) ?? st?.cursor ?? '';
    const done = ids.length < BACKFILL_BATCH;
    await db
      .prepare(
        `INSERT INTO knowledge_backfill (tenant_id, source, cursor, done_at) VALUES (?, ?, ?, CASE WHEN ? THEN now() END)
         ON CONFLICT (tenant_id, source) DO UPDATE SET cursor = EXCLUDED.cursor, done_at = EXCLUDED.done_at`
      )
      .run(t, source, last, done);
    if (!done) await enqueue({ tenantId: t, kind: 'kb.backfill', ref: source, dedupeKey: `kb.backfill:${t}:${source}`, payload: { source }, priority: 300 });
  },
  { timeoutMs: 15 * 60_000 }
);

registerJob('kb.reconcile', async (job) => {
  await reconcileStats(tenantOf(job));
});

/**
 * Manutenção periódica (qualquer réplica; idempotente):
 *   - consolida as variações dos contadores (knowledge_stats_delta → knowledge_stats);
 *   - rede de segurança do Mapa Neural: gabinete com alteração pendente há mais de 5 min e sem recálculo na
 *     fila ganha um (cobre publicações cuja transação terminou depois que o recálculo já tinha começado).
 */
export async function kbHousekeeping() {
  const deltas = (await db.prepare(`SELECT DISTINCT tenant_id FROM knowledge_stats_delta`).all()) as { tenant_id: string }[];
  for (const { tenant_id } of deltas) await compactStats(tenant_id);
  const stale = (await db
    .prepare(
      `SELECT DISTINCT c.tenant_id FROM knowledge_changes c
        WHERE c.created_at < now() - interval '5 minutes'
          AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.dedupe_key = 'kb.graph:' || c.tenant_id AND j.status IN ('queued','running'))`
    )
    .all()) as { tenant_id: string }[];
  for (const { tenant_id } of stale) {
    await enqueue({ tenantId: tenant_id, kind: 'kb.graph', ref: tenant_id, dedupeKey: `kb.graph:${tenant_id}`, priority: 200, onConflict: 'keep' });
  }
  return { compacted: deltas.length, graphRequeued: stale.length };
}

let housekeeping: NodeJS.Timeout | null = null;
export function startKbHousekeeping(everyMs = Number(process.env.KB_HOUSEKEEPING_MS || 60_000)) {
  if (housekeeping) return;
  housekeeping = setInterval(() => void kbHousekeeping().catch((e) => console.error('[kb] manutenção:', (e as Error).message)), everyMs);
  housekeeping.unref();
}
export function stopKbHousekeeping() {
  if (housekeeping) clearInterval(housekeeping);
  housekeeping = null;
}

/**
 * Boot/maintenance (any replica; dedupe keys make it idempotent): initial load of the existing records of every
 * source, counters reconciliation and Mapa Neural for tenants that never had one.
 */
export async function scheduleKbMaintenance() {
  const tenants = (await db.prepare(`SELECT id FROM tenants`).all()) as { id: string }[];
  for (const { id } of tenants) {
    for (const source of sourceAdapters().keys()) {
      const st = await db.prepare(`SELECT done_at FROM knowledge_backfill WHERE tenant_id = ? AND source = ?`).get(id, source);
      if ((st as any)?.done_at) continue;
      await enqueue({ tenantId: id, kind: 'kb.backfill', ref: source, dedupeKey: `kb.backfill:${id}:${source}`, payload: { source }, priority: 300 });
    }
    await enqueue({ tenantId: id, kind: 'kb.reconcile', ref: id, dedupeKey: `kb.reconcile:${id}`, priority: 400, delayMs: 60_000 });
  }
}
