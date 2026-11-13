/** Worker thread: computes the Mapa Neural similarity links (CPU-bound) off the main event loop. */
import { parentPort, workerData } from 'node:worker_threads';
import { computeSimilarLinks } from '../knowledgeGraph';

try {
  const links = computeSimilarLinks(workerData.items);
  parentPort!.postMessage({ ok: true, result: links });
} catch (e: any) {
  parentPort!.postMessage({ ok: false, error: String(e?.message ?? e) });
}
