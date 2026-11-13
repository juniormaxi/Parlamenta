/** Folha timbrada do ofício (tela, tela cheia e impressão). */
import React from 'react';
import type { Cabinet, OfficialLetterModel } from '../../../types';

export const fmtLetterDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);

const letterhead = (cabinet: Cabinet) => ({
  house: cabinet.house || 'Assembleia Legislativa',
  office: cabinet.parliamentarian ? `Gabinete Parlamentar · ${cabinet.parliamentarian}` : cabinet.name,
  place: cabinet.state ? `${cabinet.state}` : '',
});

export function LetterSheet({ letter, cabinet, logoUrl, large = false }: { letter: OfficialLetterModel; cabinet: Cabinet; logoUrl?: string; large?: boolean }) {
  const h = letterhead(cabinet);
  return (
    <div
      className={`bg-white border border-slate-300 rounded-lg shadow-xs font-serif text-slate-900 mx-auto ${
        large ? 'max-w-[820px] px-8 sm:px-16 py-12 space-y-8' : 'p-6 space-y-4'
      }`}
    >
      <div className="text-center space-y-1 border-b border-slate-300 pb-4 font-sans">
        {logoUrl && <img src={logoUrl} alt="" className={`${large ? 'h-16' : 'h-12'} mx-auto mb-2 object-contain`} />}
        <div className={`${large ? 'text-sm' : 'text-xs'} font-bold uppercase tracking-wider text-slate-800`}>{h.house}</div>
        <div className={`${large ? 'text-sm' : 'text-xs'} font-semibold text-slate-600`}>{h.office}</div>
        <div className="text-[11px] font-mono text-slate-500">
          {letter.code} · {letter.cityTarget ? `${letter.cityTarget}, ` : ''}
          {fmtLetterDate(letter.date)}
        </div>
      </div>
      <div className={`whitespace-pre-line ${large ? 'text-[15px] leading-loose' : 'text-sm leading-relaxed'} text-slate-800`}>{letter.body}</div>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Imprime só o documento (sem a tela do sistema), num iframe oculto. */
export function printLetter(letter: OfficialLetterModel, cabinet: Cabinet, logoUrl?: string) {
  const h = letterhead(cabinet);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(letter.code)} — ${esc(letter.subject)}</title>
<style>
  @page { size: A4; margin: 25mm 22mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #111; }
  header { text-align: center; border-bottom: 1px solid #999; padding-bottom: 10px; margin-bottom: 28px; font-family: Arial, Helvetica, sans-serif; }
  header img { max-height: 64px; margin-bottom: 6px; }
  .house { font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: .06em; }
  .office { font-size: 10pt; color: #333; margin-top: 2px; }
  .ref { font-size: 9pt; color: #555; margin-top: 4px; font-family: 'Courier New', monospace; }
  main { white-space: pre-line; font-size: 12pt; line-height: 1.6; text-align: justify; }
</style></head><body>
<header>
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ''}
  <div class="house">${esc(h.house)}</div>
  <div class="office">${esc(h.office)}</div>
  <div class="ref">${esc(letter.code)} · ${letter.cityTarget ? `${esc(letter.cityTarget)}, ` : ''}${esc(fmtLetterDate(letter.date))}</div>
</header>
<main>${esc(letter.body)}</main>
</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  };
  // Espera a imagem do brasão carregar antes de imprimir.
  const img = doc.querySelector('img');
  if (img && !img.complete) {
    img.onload = img.onerror = () => go();
  } else {
    setTimeout(go, 50);
  }
}
