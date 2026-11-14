/**
 * Desempenho: publicações concorrentes no MESMO gabinete (KB_PERF=1 npm run test:perf:contention).
 *
 * Simula o salvamento de documentos de origem: cada transação publica um documento e ainda faz ~20 ms de outro
 * trabalho antes do COMMIT (o resto do salvamento). Antes da migração 0003, a publicação travava linhas únicas do
 * gabinete até o COMMIT, então essas transações andavam em fila; agora devem andar em paralelo.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnv, type TestEnv } from './helpers/env';

const RUN = process.env.KB_PERF === '1';
const N = Number(process.env.KB_CONTENTION_DOCS || 400);
const CONC = Number(process.env.KB_CONTENTION_CONCURRENCY || 16);
const WORK_MS = Number(process.env.KB_CONTENTION_WORK_MS || 20);

let env: TestEnv;
let h: typeof import('./helpers/app');
let close: () => Promise<void>;

before(async () => {
  if (!RUN) return;
  env = await startTestEnv();
  h = await import('./helpers/app');
  const s = await h.setupApp();
  close = s.close;
});
after(async () => {
  if (!RUN) return;
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

test(`${N} publicações concorrentes (${CONC} por vez) no mesmo gabinete`, { skip: !RUN }, async () => {
  const { tx } = await import('../server/db');
  const ingest = await import('../server/kb/ingest');
  const T = await h.createTenant(env.su, 'gab-contencao');
  const U = await h.createUser(env.su, T, 'deputado');
  const lat: number[] = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (next < N) {
        const i = next++;
        const s = performance.now();
        await tx(async () => {
          await ingest.publishDocument(T, 'oficio', `c-${i}`, { title: `Ofício ${i}`, content: `Solicitação ${i}: pavimentação, saúde e educação no bairro ${i % 37}.` }, U.id);
          await new Promise((r) => setTimeout(r, WORK_MS));
        });
        lat.push(performance.now() - s);
      }
    })
  );
  const wall = performance.now() - t0;
  lat.sort((a, b) => a - b);
  const r = {
    docs: N,
    concurrency: CONC,
    wall_s: +(wall / 1000).toFixed(2),
    per_s: Math.round(N / (wall / 1000)),
    p50_ms: Math.round(pct(lat, 50)),
    p95_ms: Math.round(pct(lat, 95)),
    max_ms: Math.round(lat.at(-1)!),
  };
  console.log('CONTENTION', JSON.stringify(r));
  const n = (await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_items WHERE tenant_id = $1 AND deleted_at IS NULL`, [T])).rows[0].n;
  assert.equal(n, N);
});
