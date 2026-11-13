/**
 * Worker thread: extracts the text layer of a PDF, page by page (pdfjs-dist, pure JavaScript, no AI).
 * workerData: { path: string }. Replies { ok, result: { pages: string[], numPages } } or { ok: false, error, permanent }.
 */
import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

async function main() {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(workerData.path));
  let doc: any;
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    doc = await task.promise;
  } catch (e: any) {
    const name = String(e?.name ?? '');
    const permanent = /InvalidPDF|Password|FormatError/i.test(name) || /Invalid PDF|password/i.test(String(e?.message ?? ''));
    parentPort!.postMessage({ ok: false, permanent, error: permanent ? (/Password/i.test(name) ? 'PDF protegido por senha.' : 'Arquivo PDF inválido ou corrompido.') : String(e?.message ?? e) });
    return;
  }
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let s = '';
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string') continue;
      s += it.str;
      if (it.hasEOL) s += '\n';
      else if (it.str && !/\s$/.test(it.str)) s += ' ';
    }
    pages.push(s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
    page.cleanup?.();
  }
  await task.destroy?.().catch?.(() => undefined);
  parentPort!.postMessage({ ok: true, result: { pages, numPages: pages.length } });
}

main().catch((e) => parentPort!.postMessage({ ok: false, error: String(e?.message ?? e) }));
