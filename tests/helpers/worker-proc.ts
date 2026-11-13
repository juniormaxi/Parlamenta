/**
 * Processo de worker separado (simula uma réplica). Usa a fila real (server/jobs.ts) e registra handlers de teste
 * que gravam em test_runs quando começam/terminam — para detectar processamento duplicado ou em paralelo.
 */
import { registerJob, startJobWorker } from '../../server/jobs';
import { db } from '../../server/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const record = async (jobId: string, key: string | null, phase: string) =>
  db.prepare(`INSERT INTO test_runs (job_id, key, pid, phase, at) VALUES (?, ?, ?, ?, clock_timestamp())`).run(jobId, key, process.pid, phase);

registerJob('test.work', async (job) => {
  await record(job.id, job.dedupe_key, 'start');
  await sleep(5 + Math.random() * 20);
  await record(job.id, job.dedupe_key, 'end');
});
registerJob('test.slow', async (job) => {
  await record(job.id, job.dedupe_key, 'start');
  await sleep(Number(job.payload.ms ?? 60_000));
  await record(job.id, job.dedupe_key, 'end');
});

const w = startJobWorker({ concurrency: Number(process.env.WORKER_CONCURRENCY || 3), pollMs: 20 });
process.send?.({ ready: w.id });
process.on('message', async (m: any) => {
  if (m === 'stop') {
    await w.stop();
    process.exit(0);
  }
});
