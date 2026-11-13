/**
 * Fila persistente: retentativas com backoff, falha permanente, timeout, recuperação após queda de worker,
 * processamento concorrente por várias "réplicas" (processos) sem duplicação e sem paralelismo por chave.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let jobs: typeof import('../server/jobs');
let h: typeof import('./helpers/app');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  env = await startTestEnv({ JOBS_LEASE_SECONDS: '2' });
  h = await import('./helpers/app');
  jobs = await import('../server/jobs');
  const { migrate } = await import('../server/db');
  await migrate();
  await env.su.query(`CREATE TABLE test_runs (job_id text, key text, pid int, phase text, at timestamptz)`);
  await env.su.query(`GRANT SELECT, INSERT ON test_runs TO parlamentta_app`);
});
after(async () => {
  await h?.stopWorker();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

function spawnWorker(concurrency = 3): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const c = fork('tests/helpers/worker-proc.ts', [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, WORKER_CONCURRENCY: String(concurrency) },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    c.once('message', () => resolve(c));
    c.once('error', reject);
  });
}
const stopChild = (c: ChildProcess) => new Promise<void>((r) => (c.exitCode !== null ? r() : (c.once('exit', () => r()), c.send('stop'))));

test('retentativa com backoff exponencial até concluir', async () => {
  let calls = 0;
  jobs.registerJob('t.flaky', async () => {
    calls++;
    if (calls < 3) throw new Error(`falha temporária ${calls}`);
  });
  await jobs.enqueue({ tenantId: null, kind: 't.flaky', ref: 'x' });
  const w = jobs.startJobWorker({ concurrency: 1, pollMs: 20, kinds: ['t.flaky'] });
  try {
    // 1st failure → backoff ~5s; speed up the test by moving run_after.
    for (let i = 0; i < 100 && calls < 3; i++) {
      await env.su.query(`UPDATE jobs SET run_after = now() WHERE kind = 't.flaky' AND status = 'queued'`);
      await sleep(30);
    }
    await sleep(100);
    const r = (await env.su.query(`SELECT status, attempts, last_error FROM jobs WHERE kind = 't.flaky'`)).rows[0];
    assert.equal(r.status, 'done');
    assert.equal(r.attempts, 3);
    assert.equal(calls, 3);
  } finally {
    await w.stop();
  }
  // backoff grows and is capped
  const a = jobs.backoffMs(1), b = jobs.backoffMs(4), c = jobs.backoffMs(50);
  assert.ok(a >= 3750 && a <= 6250);
  assert.ok(b >= 30_000 && b <= 50_000);
  assert.ok(c <= 30 * 60_000 * 1.25);
});

test('falha permanente vai direto para dead; esgotar tentativas também', async () => {
  jobs.registerJob('t.invalid', async () => {
    throw new jobs.PermanentJobError('Arquivo inválido');
  });
  jobs.registerJob('t.always', async () => {
    throw new Error('sempre falha');
  });
  await jobs.enqueue({ tenantId: null, kind: 't.invalid', ref: 'a' });
  await jobs.enqueue({ tenantId: null, kind: 't.always', ref: 'b', maxAttempts: 2 });
  const w = jobs.startJobWorker({ concurrency: 2, pollMs: 20, kinds: ['t.invalid', 't.always'] });
  try {
    for (let i = 0; i < 100; i++) {
      await env.su.query(`UPDATE jobs SET run_after = now() WHERE kind = 't.always' AND status = 'queued'`);
      const n = (await env.su.query(`SELECT COUNT(*)::int AS n FROM jobs WHERE kind IN ('t.invalid','t.always') AND status = 'dead'`)).rows[0].n;
      if (n === 2) break;
      await sleep(30);
    }
  } finally {
    await w.stop();
  }
  const rows = (await env.su.query(`SELECT kind, status, attempts, last_error FROM jobs WHERE kind IN ('t.invalid','t.always') ORDER BY kind`)).rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.status, r.attempts]), [['t.always', 'dead', 2], ['t.invalid', 'dead', 1]]);
  assert.match(rows[1].last_error, /Arquivo inválido/);
  const stats = await jobs.queueStats();
  assert.ok(stats.recentErrors.length >= 2);
});

test('timeout de processamento conta como falha', async () => {
  jobs.registerJob('t.hang', async (job) => {
    await new Promise((r) => setTimeout(r, 10_000));
    if (job.signal.aborted) return;
  }, { timeoutMs: 200 });
  await jobs.enqueue({ tenantId: null, kind: 't.hang', ref: 'h', maxAttempts: 1 });
  const w = jobs.startJobWorker({ concurrency: 1, pollMs: 20, kinds: ['t.hang'] });
  try {
    for (let i = 0; i < 100; i++) {
      const r = (await env.su.query(`SELECT status FROM jobs WHERE kind = 't.hang'`)).rows[0];
      if (r.status === 'dead') break;
      await sleep(30);
    }
  } finally {
    await w.stop();
  }
  const r = (await env.su.query(`SELECT status, last_error FROM jobs WHERE kind = 't.hang'`)).rows[0];
  assert.equal(r.status, 'dead');
  assert.match(r.last_error, /Tempo limite/);
});

test('deduplicação: reenfileirar a mesma chave atualiza o job pendente', async () => {
  for (let i = 0; i < 5; i++) await jobs.enqueue({ tenantId: null, kind: 't.nohandler', ref: 'd', dedupeKey: 'dup:1', payload: { i } });
  const rows = (await env.su.query(`SELECT payload FROM jobs WHERE dedupe_key = 'dup:1'`)).rows;
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].payload).i, 4);
  await env.su.query(`DELETE FROM jobs WHERE dedupe_key = 'dup:1'`);
});

test('várias réplicas: 300 jobs processados exatamente uma vez; mesma chave nunca em paralelo', async () => {
  for (let i = 0; i < 240; i++) await jobs.enqueue({ tenantId: null, kind: 'test.work', ref: `w${i}` });
  // 60 jobs spread over 6 keys, enqueued while workers run (only one pending per key at a time)
  const workers = await Promise.all([spawnWorker(3), spawnWorker(3), spawnWorker(3), spawnWorker(3)]);
  try {
    let keyed = 0;
    while (keyed < 60) {
      await jobs.enqueue({ tenantId: null, kind: 'test.work', ref: `k${keyed}`, dedupeKey: `doc:${keyed % 6}` });
      keyed++;
      await sleep(3);
    }
    for (let i = 0; i < 400; i++) {
      const n = (await env.su.query(`SELECT COUNT(*)::int AS n FROM jobs WHERE kind = 'test.work' AND status IN ('queued','running')`)).rows[0].n;
      if (n === 0) break;
      await sleep(50);
    }
  } finally {
    await Promise.all(workers.map(stopChild));
  }
  const done = (await env.su.query(`SELECT COUNT(*)::int AS n FROM jobs WHERE kind = 'test.work' AND status = 'done'`)).rows[0].n;
  const starts = (await env.su.query(`SELECT job_id, COUNT(*)::int AS n FROM test_runs WHERE phase = 'start' GROUP BY job_id HAVING COUNT(*) > 1`)).rows;
  assert.equal(starts.length, 0, 'nenhum job executado duas vezes');
  const ran = (await env.su.query(`SELECT COUNT(DISTINCT job_id)::int AS n FROM test_runs WHERE phase = 'end'`)).rows[0].n;
  assert.equal(ran, done);
  const pids = (await env.su.query(`SELECT COUNT(DISTINCT pid)::int AS n FROM test_runs`)).rows[0].n;
  assert.ok(pids >= 3, `trabalho distribuído entre processos (${pids})`);
  // overlap check for keyed jobs: intervals with the same key must not intersect
  const iv = (await env.su.query(
    `SELECT s.key, s.at AS s, e.at AS e FROM test_runs s JOIN test_runs e ON e.job_id = s.job_id AND e.phase = 'end'
      WHERE s.phase = 'start' AND s.key IS NOT NULL ORDER BY s.key, s.at`
  )).rows;
  for (let i = 1; i < iv.length; i++) {
    if (iv[i].key !== iv[i - 1].key) continue;
    assert.ok(iv[i].s >= iv[i - 1].e, `chave ${iv[i].key} processada em paralelo`);
  }
  assert.ok(done >= 240 + 6, `concluídos: ${done}`);
});

test('queda de worker (SIGKILL) no meio do job: lease expira e outro worker conclui', async () => {
  await env.su.query(`DELETE FROM test_runs`);
  await jobs.enqueue({ tenantId: null, kind: 'test.slow', ref: 'crash', dedupeKey: 'crash:1', payload: { ms: 60_000 } });
  const victim = await spawnWorker(1);
  for (let i = 0; i < 100; i++) {
    const r = (await env.su.query(`SELECT status FROM jobs WHERE dedupe_key = 'crash:1'`)).rows[0];
    if (r.status === 'running') break;
    await sleep(30);
  }
  victim.kill('SIGKILL');
  await new Promise((r) => victim.once('exit', r));
  // make the retry fast
  await env.su.query(`UPDATE jobs SET payload = '{"ms":10}' WHERE dedupe_key = 'crash:1'`);
  const rescuer = await spawnWorker(1);
  try {
    for (let i = 0; i < 200; i++) {
      const r = (await env.su.query(`SELECT status FROM jobs WHERE dedupe_key = 'crash:1'`)).rows[0];
      if (r.status === 'done') break;
      await sleep(50);
    }
  } finally {
    await stopChild(rescuer);
  }
  const r = (await env.su.query(`SELECT status, attempts FROM jobs WHERE dedupe_key = 'crash:1'`)).rows[0];
  assert.equal(r.status, 'done');
  assert.equal(r.attempts, 2);
  const pids = (await env.su.query(`SELECT DISTINCT pid FROM test_runs WHERE phase = 'start'`)).rows;
  assert.equal(pids.length, 2, 'iniciado pelo worker que caiu e retomado por outro');
});
