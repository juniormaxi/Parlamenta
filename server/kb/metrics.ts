/**
 * Métricas operacionais, agregadas por minuto e gravadas em ops_metrics (somam entre réplicas).
 * Nada de conteúdo nem dados pessoais: só nome da métrica, gabinete, contagem, erros e tempos.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { db } from '../db';

export const HIST_BOUNDS_MS = [25, 50, 100, 250, 500, 1000, 2500]; // + bucket final (> 2500 ms)
type Acc = { count: number; errors: number; sum: number; max: number; hist: number[] };
const pending = new Map<string, Acc>();
const bucketOf = (d = new Date()) => d.toISOString().slice(0, 16).replace('T', ' ');

export function record(name: string, ms: number, tenantId = '', error = false) {
  const key = `${bucketOf()}\u0000${name}\u0000${tenantId}`;
  const a = pending.get(key) ?? { count: 0, errors: 0, sum: 0, max: 0, hist: new Array(HIST_BOUNDS_MS.length + 1).fill(0) };
  a.count++;
  if (error) a.errors++;
  a.sum += ms;
  a.max = Math.max(a.max, ms);
  let i = HIST_BOUNDS_MS.findIndex((b) => ms <= b);
  if (i === -1) i = HIST_BOUNDS_MS.length;
  a.hist[i]!++;
  pending.set(key, a);
}

/** Times an async operation and records it (also on error). */
export async function timed<T>(name: string, tenantId: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    const r = await fn();
    record(name, performance.now() - t0, tenantId);
    return r;
  } catch (e) {
    record(name, performance.now() - t0, tenantId, true);
    throw e;
  }
}

export async function flushMetrics() {
  if (!pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, a] of batch) {
    const [bucket, name, tenantId] = key.split('\u0000');
    try {
      await db
        .prepare(
          `INSERT INTO ops_metrics (bucket, name, tenant_id, count, errors, sum_ms, max_ms, hist) VALUES (?, ?, ?, ?, ?, ?, ?, ?::int[])
           ON CONFLICT (bucket, name, tenant_id) DO UPDATE SET
             count = ops_metrics.count + EXCLUDED.count, errors = ops_metrics.errors + EXCLUDED.errors,
             sum_ms = ops_metrics.sum_ms + EXCLUDED.sum_ms, max_ms = GREATEST(ops_metrics.max_ms, EXCLUDED.max_ms),
             hist = (SELECT array_agg(x + y ORDER BY i) FROM unnest(ops_metrics.hist, EXCLUDED.hist) WITH ORDINALITY AS t(x, y, i))`
        )
        .run(bucket, name, tenantId, a.count, a.errors, a.sum, a.max, `{${a.hist.join(',')}}`);
    } catch (e) {
      console.error('[metrics] falha ao gravar:', (e as Error).message);
    }
  }
}

/** Percentile estimate from the fixed histogram (upper bound of the bucket). */
export function histPercentile(hist: number[], p: number) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i]!;
    if (acc / total >= p) return i < HIST_BOUNDS_MS.length ? HIST_BOUNDS_MS[i]! : Infinity;
  }
  return Infinity;
}

/** Summary per metric for the last `hours` (optionally for one tenant). */
export async function metricsSummary(hours = 24, tenantId?: string) {
  const since = bucketOf(new Date(Date.now() - hours * 3600_000));
  const rows = (await db
    .prepare(
      `SELECT name, SUM(count)::int AS count, SUM(errors)::int AS errors, SUM(sum_ms) AS sum_ms, MAX(max_ms) AS max_ms,
              (SELECT array_agg(s ORDER BY i) FROM (SELECT i, SUM(h)::int AS s FROM ops_metrics o2, unnest(o2.hist) WITH ORDINALITY AS u(h, i)
                 WHERE o2.name = o.name AND o2.bucket >= ? ${tenantId ? 'AND o2.tenant_id = ?' : ''} GROUP BY i) z) AS hist
         FROM ops_metrics o WHERE bucket >= ? ${tenantId ? 'AND tenant_id = ?' : ''} GROUP BY name ORDER BY name`
    )
    .all(...(tenantId ? [since, tenantId, since, tenantId] : [since, since]))) as any[];
  return rows.map((r) => {
    const hist = (r.hist ?? []).map(Number);
    const p95 = histPercentile(hist, 0.95);
    return {
      name: r.name,
      count: r.count,
      errors: r.errors,
      avgMs: r.count ? Math.round(Number(r.sum_ms) / r.count) : null,
      p95Ms: p95 === Infinity ? `>${HIST_BOUNDS_MS.at(-1)}` : p95,
      maxMs: Math.round(Number(r.max_ms)),
    };
  });
}

let timer: NodeJS.Timeout | null = null;
export function startMetrics() {
  if (timer) return;
  // Event loop delay (detects blocking work): p99 per minute, in ms.
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  timer = setInterval(() => {
    record('node.event_loop_p99', h.percentile(99) / 1e6);
    h.reset();
    void flushMetrics();
  }, 30_000);
  timer.unref();
}
export function stopMetrics() {
  if (timer) clearInterval(timer);
  timer = null;
}
