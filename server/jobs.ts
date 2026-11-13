/**
 * Fila persistente de processamento no PostgreSQL (tabela jobs).
 *
 * - Várias réplicas e vários workers por réplica: a reserva usa FOR UPDATE SKIP LOCKED numa única instrução.
 * - Um job por chave (dedupe_key): no máximo um pendente (índice único parcial) e nunca dois em execução
 *   ao mesmo tempo — a reserva pula chaves que já têm um job 'running'. Assim o mesmo documento não é
 *   processado em paralelo.
 * - Lease com heartbeat: o worker renova lease_until enquanto trabalha. Se a réplica cair, o lease expira e o
 *   "reaper" (qualquer réplica) devolve o job para a fila — recuperação após reinício/queda.
 * - Falhas: retentativa com backoff exponencial + jitter até max_attempts; PermanentJobError (ex.: arquivo
 *   inválido) vai direto para 'dead'. O erro é guardado resumido (sem conteúdo do documento).
 * - Timeout por tipo de job. Handlers devem ser idempotentes (podem rodar de novo após uma queda).
 * - Payload só leva referências (ids), nunca conteúdo documental: a tabela jobs não tem RLS.
 */
import crypto from 'node:crypto';
import os from 'node:os';
import { db } from './db';

export class PermanentJobError extends Error {}

export interface Job {
  id: string;
  tenant_id: string | null;
  kind: string;
  ref: string;
  dedupe_key: string | null;
  payload: any;
  attempts: number;
  max_attempts: number;
  signal: AbortSignal;
}
export const isLastAttempt = (j: Pick<Job, 'attempts' | 'max_attempts'>) => j.attempts >= j.max_attempts;

type Handler = (job: Job) => Promise<void>;
const handlers = new Map<string, { fn: Handler; timeoutMs: number }>();

export function registerJob(kind: string, fn: Handler, opts: { timeoutMs?: number } = {}) {
  handlers.set(kind, { fn, timeoutMs: opts.timeoutMs ?? 10 * 60_000 });
}

export interface EnqueueOpts {
  tenantId: string | null;
  kind: string;
  ref?: string;
  /** Same key = same work: re-enqueueing updates the pending job instead of creating another. */
  dedupeKey?: string | null;
  payload?: Record<string, unknown>;
  delayMs?: number;
  priority?: number;
  maxAttempts?: number;
}

/** Enqueues (or refreshes) a job. Safe inside a transaction: the job becomes visible on COMMIT. */
export async function enqueue(o: EnqueueOpts): Promise<void> {
  await db
    .prepare(
      `INSERT INTO jobs (id, tenant_id, kind, ref, dedupe_key, payload, priority, max_attempts, run_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, now() + (? * interval '1 millisecond'))
       ON CONFLICT (dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL DO UPDATE SET
         payload = EXCLUDED.payload,
         run_after = LEAST(jobs.run_after, EXCLUDED.run_after),
         priority = LEAST(jobs.priority, EXCLUDED.priority),
         attempts = 0,
         last_error = ''`
    )
    .run(
      crypto.randomUUID(),
      o.tenantId,
      o.kind,
      o.ref ?? '',
      o.dedupeKey ?? null,
      JSON.stringify(o.payload ?? {}),
      o.priority ?? 100,
      o.maxAttempts ?? 6,
      Math.max(0, o.delayMs ?? 0)
    );
  kick();
}

/** Exponential backoff with jitter: 5s, 10s, 20s ... capped at 30 min. */
export function backoffMs(attempts: number) {
  const base = Math.min(30 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

const summarize = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 500);

// ---------------------------------------------------------------------------
// worker
// ---------------------------------------------------------------------------
const LEASE_S = Number(process.env.JOBS_LEASE_SECONDS || 60);
let wake: (() => void) | null = null;
function kick() {
  const w = wake;
  if (w) setTimeout(w, 30); // after the enqueuing transaction has had a chance to commit
}

async function claim(workerId: string, kinds: string[]) {
  return await db
    .prepare(
      `UPDATE jobs j SET status = 'running', attempts = j.attempts + 1, locked_by = ?, started_at = now(),
              lease_until = now() + (? * interval '1 second')
        WHERE j.id = (
          SELECT q.id FROM jobs q
           WHERE q.status = 'queued' AND q.run_after <= now() AND q.kind = ANY(?::text[])
             AND (q.dedupe_key IS NULL OR NOT EXISTS (
                   SELECT 1 FROM jobs r WHERE r.status = 'running' AND r.dedupe_key = q.dedupe_key))
           ORDER BY q.priority, q.run_after
           FOR UPDATE SKIP LOCKED
           LIMIT 1)
        RETURNING j.*`
    )
    .get(workerId, LEASE_S, kinds);
}

/** Puts a job back in the queue; if a newer job with the same key is already pending, this one is superseded. */
async function requeue(id: string, workerId: string | null, delayMs: number, error: string) {
  try {
    await db
      .prepare(
        `UPDATE jobs SET status = 'queued', run_after = now() + (? * interval '1 millisecond'), locked_by = NULL,
                lease_until = NULL, last_error = ? WHERE id = ? AND status = 'running' ${workerId ? 'AND locked_by = ?' : 'AND lease_until < now()'}`
      )
      .run(delayMs, error, id, ...(workerId ? [workerId] : []));
  } catch (e: any) {
    if (e?.code !== '23505') throw e;
    await db
      .prepare(
        `UPDATE jobs SET status = 'done', finished_at = now(), locked_by = NULL, lease_until = NULL,
                last_error = ? WHERE id = ? AND status = 'running'`
      )
      .run(`Substituído por job mais recente. Último erro: ${error}`.slice(0, 500), id);
  }
}

async function runOne(row: any, workerId: string) {
  const h = handlers.get(row.kind);
  const started = Date.now();
  const ac = new AbortController();
  const job: Job = {
    id: row.id,
    tenant_id: row.tenant_id,
    kind: row.kind,
    ref: row.ref,
    dedupe_key: row.dedupe_key,
    payload: JSON.parse(row.payload || '{}'),
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    signal: ac.signal,
  };
  const beat = setInterval(() => {
    db.prepare(`UPDATE jobs SET lease_until = now() + (? * interval '1 second') WHERE id = ? AND locked_by = ? AND status = 'running'`)
      .run(LEASE_S, row.id, workerId)
      .catch(() => undefined);
  }, Math.max(1000, (LEASE_S * 1000) / 3));
  let timer: NodeJS.Timeout | undefined;
  try {
    if (!h) throw new PermanentJobError(`Tipo de job desconhecido: ${row.kind}`);
    await Promise.race([
      h.fn(job),
      new Promise((_, rej) => {
        timer = setTimeout(() => {
          ac.abort();
          rej(new Error(`Tempo limite de ${Math.round(h.timeoutMs / 1000)}s excedido.`));
        }, h.timeoutMs);
      }),
    ]);
    await db
      .prepare(
        `UPDATE jobs SET status = 'done', finished_at = now(), duration_ms = ?, locked_by = NULL, lease_until = NULL, last_error = ''
          WHERE id = ? AND locked_by = ? AND status = 'running'`
      )
      .run(Date.now() - started, row.id, workerId);
  } catch (e) {
    const msg = summarize(e);
    if (e instanceof PermanentJobError || row.attempts >= row.max_attempts) {
      await db
        .prepare(
          `UPDATE jobs SET status = 'dead', finished_at = now(), duration_ms = ?, locked_by = NULL, lease_until = NULL, last_error = ?
            WHERE id = ? AND locked_by = ? AND status = 'running'`
        )
        .run(Date.now() - started, msg, row.id, workerId);
      console.error(`[jobs] ${row.kind} ${row.ref} falhou definitivamente: ${msg}`);
    } else {
      await requeue(row.id, workerId, backoffMs(row.attempts), msg);
    }
  } finally {
    clearInterval(beat);
    if (timer) clearTimeout(timer);
  }
}

/** Returns expired-lease jobs (worker died/restarted) to the queue. Any replica may run it. */
export async function reapExpired(): Promise<number> {
  const rows = await db
    .prepare(`SELECT id, attempts, max_attempts FROM jobs WHERE status = 'running' AND lease_until < now() FOR UPDATE SKIP LOCKED`)
    .all<{ id: string; attempts: number; max_attempts: number }>();
  for (const r of rows) {
    if (r.attempts >= r.max_attempts) {
      await db
        .prepare(`UPDATE jobs SET status = 'dead', finished_at = now(), locked_by = NULL, lease_until = NULL, last_error = ? WHERE id = ? AND status = 'running' AND lease_until < now()`)
        .run('Interrompido (lease expirado) e sem tentativas restantes.', r.id);
    } else {
      await requeue(r.id, null, 0, 'Interrompido (lease expirado); reenfileirado.');
    }
  }
  return rows.length;
}

/** Removes old finished jobs (done: 7 days; dead: 30 days). */
export async function cleanupJobs() {
  await db.prepare(`DELETE FROM jobs WHERE status = 'done' AND finished_at < now() - interval '7 days'`).run();
  await db.prepare(`DELETE FROM jobs WHERE status = 'dead' AND finished_at < now() - interval '30 days'`).run();
}

export interface WorkerHandle {
  id: string;
  stop(): Promise<void>;
}

/**
 * Starts `concurrency` worker loops in this process. Every replica runs its own; they coordinate only
 * through the database.
 */
export function startJobWorker(opts: { concurrency?: number; pollMs?: number; kinds?: string[] } = {}): WorkerHandle {
  const concurrency = opts.concurrency ?? Number(process.env.JOBS_CONCURRENCY || 2);
  const pollMs = opts.pollMs ?? 1000;
  const workerId = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;
  let stopping = false;
  const sleepers = new Set<() => void>();
  wake = () => {
    for (const s of sleepers) s();
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        sleepers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      sleepers.add(done);
    });

  const loop = async () => {
    while (!stopping) {
      const kinds = opts.kinds ?? [...handlers.keys()];
      let row: any;
      try {
        row = kinds.length ? await claim(workerId, kinds) : undefined;
      } catch (e) {
        console.error('[jobs] falha ao reservar job:', summarize(e));
        await sleep(pollMs * 3);
        continue;
      }
      if (!row) {
        await sleep(pollMs);
        continue;
      }
      await runOne(row, workerId).catch((e) => console.error('[jobs] falha ao registrar resultado:', summarize(e)));
    }
  };

  const maint = setInterval(() => {
    reapExpired().catch((e) => console.error('[jobs] reaper:', summarize(e)));
  }, Math.max(2000, (LEASE_S * 1000) / 2));
  const clean = setInterval(() => cleanupJobs().catch(() => undefined), 6 * 3600_000);
  void reapExpired().catch(() => undefined);

  const loops = Array.from({ length: concurrency }, loop);
  return {
    id: workerId,
    async stop() {
      stopping = true;
      clearInterval(maint);
      clearInterval(clean);
      wake?.();
      await Promise.allSettled(loops);
      wake = null;
    },
  };
}

/** Queue counters for monitoring (indexed by status). */
export async function queueStats(tenantId?: string) {
  const where = tenantId ? 'WHERE tenant_id = ?' : '';
  const rows = await db
    .prepare(
      `SELECT kind, status, COUNT(*)::int AS n, MIN(CASE WHEN status = 'queued' THEN created_at END) AS oldest_queued
         FROM jobs ${where} GROUP BY kind, status`
    )
    .all<{ kind: string; status: string; n: number; oldest_queued: string | null }>(...(tenantId ? [tenantId] : []));
  const durations = await db
    .prepare(
      `SELECT kind, COUNT(*)::int AS n, AVG(duration_ms)::int AS avg_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95_ms
         FROM jobs WHERE status = 'done' AND finished_at > now() - interval '24 hours' AND duration_ms IS NOT NULL
         ${tenantId ? 'AND tenant_id = ?' : ''} GROUP BY kind`
    )
    .all<{ kind: string; n: number; avg_ms: number; p95_ms: number }>(...(tenantId ? [tenantId] : []));
  const recentErrors = await db
    .prepare(
      `SELECT kind, ref, attempts, last_error, finished_at FROM jobs
        WHERE status = 'dead' ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY finished_at DESC LIMIT 20`
    )
    .all(...(tenantId ? [tenantId] : []));
  return { byStatus: rows, last24h: durations, recentErrors };
}
