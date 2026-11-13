/**
 * Camada de extração de conteúdo (reaproveita o que o projeto já tinha).
 *
 *  - TXT  → leitura local (UTF-8, com fallback para Latin-1).
 *  - DOCX → mammoth (já era dependência do projeto).
 *  - PDF com texto → pdfjs-dist, página a página, em worker thread (sem IA, sem bloquear o servidor).
 *  - PDF digitalizado (sem camada de texto) → OCR pelo Gemini (já usado no projeto), só quando necessário.
 *  - Áudio / vídeo → transcrição pelo Gemini (mesma rotina de antes).
 *
 * Nada é truncado em silêncio: se a IA parar no limite de saída, o resultado volta com truncated = true
 * e um aviso. Arquivos inválidos geram PermanentJobError (não adianta tentar de novo).
 */
import fs from 'node:fs';
import mammoth from 'mammoth';
import { PermanentJobError } from '../jobs';
import { aiAvailable, extractTextWithAIDetailed } from '../ai';
import { runInThread } from './thread';

export type MediaKind = 'text' | 'docx' | 'pdf' | 'audio' | 'video';
export interface Extracted {
  text: string;
  /** Offsets where each page starts in `text` (PDF only). */
  pages: number[];
  method: 'utf8' | 'latin1' | 'docx' | 'pdf-text' | 'ocr-ia' | 'transcricao-ia';
  truncated: boolean;
  warnings: string[];
}

/** Thrown when the file needs the AI (OCR/transcription) and no key is configured. Not a failure: the item waits. */
export class NeedsAiError extends Error {}

/** Minimum average of characters per page for a PDF to count as "has a text layer". */
const MIN_CHARS_PER_PAGE = Number(process.env.KB_PDF_MIN_CHARS_PER_PAGE || 40);

export function joinPages(pages: string[]): { text: string; offsets: number[] } {
  const offsets: number[] = [];
  let text = '';
  pages.forEach((p, i) => {
    if (i > 0) text += '\n\n';
    offsets.push(text.length);
    text += p;
  });
  return { text, offsets };
}

export async function extractFile(path: string, mime: string, kind: MediaKind): Promise<Extracted> {
  if (!fs.existsSync(path)) throw new PermanentJobError('Arquivo original não encontrado no armazenamento.');
  const warnings: string[] = [];

  if (kind === 'text') {
    const buf = fs.readFileSync(path);
    if (buf.includes(0)) throw new PermanentJobError('O arquivo de texto parece ser binário (formato inválido).');
    let text = buf.toString('utf8');
    let method: Extracted['method'] = 'utf8';
    if (text.includes('�')) {
      text = buf.toString('latin1');
      method = 'latin1';
    }
    return { text: text.replace(/^﻿/, '').trim(), pages: [], method, truncated: false, warnings };
  }

  if (kind === 'docx') {
    let text: string;
    try {
      text = (await mammoth.extractRawText({ path })).value.trim();
    } catch {
      throw new PermanentJobError('Arquivo DOCX inválido ou corrompido.');
    }
    return { text, pages: [], method: 'docx', truncated: false, warnings };
  }

  if (kind === 'pdf') {
    let pages: string[] = [];
    try {
      const r = await runInThread<{ pages: string[] }>(new URL('./pdfWorker.ts', import.meta.url), { path }, { timeoutMs: 10 * 60_000 });
      pages = r.pages;
    } catch (e: any) {
      if (e?.permanent) throw new PermanentJobError(e.message);
      throw e;
    }
    const chars = pages.reduce((a, p) => a + p.replace(/\s/g, '').length, 0);
    const emptyPages = pages.filter((p) => p.replace(/\s/g, '').length < 10).length;
    const hasText = pages.length > 0 && chars / pages.length >= MIN_CHARS_PER_PAGE && emptyPages / pages.length < 0.5;
    if (hasText) {
      if (emptyPages) warnings.push(`${emptyPages} página(s) sem texto extraível (possivelmente imagens).`);
      const { text, offsets } = joinPages(pages);
      return { text, pages: offsets, method: 'pdf-text', truncated: false, warnings };
    }
    // Scanned PDF: OCR only now.
    if (!aiAvailable()) throw new NeedsAiError('PDF digitalizado: o OCR requer a chave da IA (GEMINI_API_KEY).');
    const r = await extractTextWithAIDetailed(path, mime || 'application/pdf', 'pdf');
    if (r.truncated) warnings.push('O OCR atingiu o limite de saída da IA: o texto pode estar incompleto.');
    return { text: r.text, pages: [], method: 'ocr-ia', truncated: r.truncated, warnings };
  }

  // audio / video
  if (!aiAvailable()) throw new NeedsAiError('A decupagem requer a chave da IA (GEMINI_API_KEY).');
  const r = await extractTextWithAIDetailed(path, mime, kind);
  if (r.truncated) warnings.push('A transcrição atingiu o limite de saída da IA: o texto pode estar incompleto.');
  return { text: r.text, pages: [], method: 'transcricao-ia', truncated: r.truncated, warnings };
}
