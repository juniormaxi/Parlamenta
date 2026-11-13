/**
 * Runs CPU-heavy work (PDF parsing, Mapa Neural) in a worker thread so the Node.js event loop keeps serving
 * requests. One short-lived thread per task; the caller's job already limits concurrency.
 * The worker inherits process.execArgv, so it loads TypeScript through tsx just like the main process.
 */
import { Worker } from 'node:worker_threads';

export function runInThread<T>(file: URL, data: unknown, opts: { timeoutMs?: number; transferList?: ArrayBuffer[] } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = new Worker(file, { workerData: data, transferList: opts.transferList as any, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void w.terminate();
      reject(new Error(`Tempo limite do processamento em segundo plano (${Math.round((opts.timeoutMs ?? 0) / 1000)}s).`));
    }, opts.timeoutMs ?? 10 * 60_000);
    w.once('message', (m: { ok: boolean; result?: T; error?: string; permanent?: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void w.terminate();
      if (m.ok) resolve(m.result as T);
      else {
        const e = new Error(m.error ?? 'Falha no processamento em segundo plano.');
        (e as any).permanent = !!m.permanent;
        reject(e);
      }
    });
    w.once('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    w.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Processamento em segundo plano encerrado (código ${code}).`));
    });
  });
}
