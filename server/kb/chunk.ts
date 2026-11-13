/**
 * Fragmentação (chunking) de documentos para pesquisa textual/vetorial e citações.
 *
 * - Janelas de ~TARGET tokens (estimativa: 1 token ≈ 4 caracteres em português) com sobreposição.
 * - Quebra preferencial em parágrafo, depois em fim de frase, depois em espaço — nunca no meio de palavra
 *   (a não ser que não haja espaço algum na janela).
 * - Cada fragmento guarda a posição exata no texto (char_start/char_end), a página (a partir dos offsets de
 *   página da extração) e a seção (último título reconhecido antes dele).
 * - Cobertura total: a união dos fragmentos cobre todo o texto — não há truncamento.
 */
import { sha256 } from './ingest';

export interface Chunk {
  ord: number;
  text: string;
  hash: string;
  charStart: number;
  charEnd: number;
  pageFrom: number | null;
  pageTo: number | null;
  section: string;
  tokenEstimate: number;
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const HEADING = /^(?:CAP[ÍI]TULO|SE[ÇC][ÃA]O|T[ÍI]TULO|ANEXO|Art\.?\s*\d+|ARTIGO\s+\d+|\d+(?:\.\d+)*\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{0,80}$|[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ,\-–]{6,80}$)/;

/** Page (1-based) that contains `offset`, given the sorted start offsets of each page. */
export function pageAt(pages: number[], offset: number): number | null {
  if (!pages.length) return null;
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function chunkText(text: string, opts: { targetTokens?: number; overlapTokens?: number; pages?: number[] } = {}): Chunk[] {
  const target = Math.max(50, opts.targetTokens ?? 800) * 4;
  const overlap = Math.max(0, Math.min(target / 2, (opts.overlapTokens ?? 80) * 4));
  const minBreak = Math.floor(target * 0.5);
  const pages = opts.pages ?? [];
  const n = text.length;

  // Headings (line starts) for section labels.
  const headings: { at: number; label: string }[] = [];
  for (let i = 0; i < n; ) {
    const j = text.indexOf('\n', i);
    const end = j === -1 ? n : j;
    const line = text.slice(i, end).trim();
    if (line && line.length <= 90 && HEADING.test(line)) headings.push({ at: i, label: line.slice(0, 90) });
    i = end + 1;
  }
  const sectionAt = (pos: number) => {
    let label = '';
    for (const h of headings) {
      if (h.at > pos) break;
      label = h.label;
    }
    return label;
  };

  const out: Chunk[] = [];
  let pos = 0;
  while (pos < n) {
    // skip leading whitespace
    while (pos < n && /\s/.test(text[pos]!)) pos++;
    if (pos >= n) break;
    let end = Math.min(n, pos + target);
    if (end < n) {
      const window = text.slice(pos, end);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'), window.lastIndexOf('? '), window.lastIndexOf('! '), window.lastIndexOf(';\n'));
      const space = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
      if (para >= minBreak) end = pos + para + 2;
      else if (sentence >= minBreak) end = pos + sentence + 1;
      else if (space > 0) end = pos + space + 1;
    }
    const raw = text.slice(pos, end);
    const body = raw.trimEnd();
    if (body.trim()) {
      const cEnd = pos + body.length;
      out.push({
        ord: out.length,
        text: body,
        hash: sha256(body),
        charStart: pos,
        charEnd: cEnd,
        pageFrom: pageAt(pages, pos),
        pageTo: pageAt(pages, Math.max(pos, cEnd - 1)),
        section: sectionAt(pos),
        tokenEstimate: estimateTokens(body),
      });
    }
    if (end >= n) break;
    // next window starts `overlap` characters back, at a word boundary, always moving forward
    let next = Math.max(pos + 1, end - overlap);
    if (next < end) {
      const sp = text.slice(next, end).search(/\s/);
      next = sp === -1 ? end : next + sp + 1;
    }
    pos = Math.min(next, end);
  }
  return out;
}
