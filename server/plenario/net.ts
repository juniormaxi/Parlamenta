/**
 * HTTP para fontes públicas fixas (Câmara dos Deputados, TSE, ALMT): timeout, novas tentativas e
 * CSV lido em streaming (os arquivos anuais de votos da Câmara passam de 50 MB).
 * Endereços informados pelo usuário (SAPL) usam safeGet, que bloqueia redes internas.
 */
const UA = 'Parlamentta/1.0 (plenario; dados abertos)';

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof HttpStatusError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

export class HttpStatusError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} em ${url}`);
  }
}

export async function fetchBuffer(url: string, opts: { range?: [number, number]; timeoutMs?: number } = {}): Promise<Buffer> {
  return withRetry(async () => {
    const headers: Record<string, string> = { 'User-Agent': UA };
    if (opts.range) headers.Range = `bytes=${opts.range[0]}-${opts.range[1]}`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
    if (!r.ok) throw new HttpStatusError(r.status, url);
    if (opts.range && r.status !== 206) throw new Error(`O servidor não aceitou leitura parcial: ${url}`);
    return Buffer.from(await r.arrayBuffer());
  });
}

export async function fetchJson<T = any>(url: string, timeoutMs = 30_000): Promise<T> {
  return withRetry(async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new HttpStatusError(r.status, url);
    return (await r.json()) as T;
  });
}

export async function fetchText(url: string, timeoutMs = 30_000): Promise<string> {
  return withRetry(async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new HttpStatusError(r.status, url);
    return r.text();
  });
}

/** Parser de CSV incremental (separador configurável, aspas com "" escapado, quebras de linha dentro de aspas). */
export class CsvParser {
  private field = '';
  private row: string[] = [];
  private quoted = false;
  private afterQuote = false;
  private header: string[] | null = null;
  constructor(private sep: string, private onRow: (row: Record<string, string>) => void) {}

  push(text: string) {
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (this.quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            this.field += '"';
            i++;
          } else if (i + 1 === text.length) {
            // Aspas no fim do bloco: decide no próximo bloco.
            this.quoted = false;
            this.afterQuote = true;
          } else this.quoted = false;
        } else this.field += c;
        continue;
      }
      if (this.afterQuote) {
        this.afterQuote = false;
        if (c === '"') {
          this.field += '"';
          this.quoted = true;
          continue;
        }
      }
      if (c === '"') this.quoted = true;
      else if (c === this.sep) {
        this.row.push(this.field);
        this.field = '';
      } else if (c === '\n') this.endRow();
      else if (c !== '\r') this.field += c;
    }
  }

  end() {
    if (this.field || this.row.length) this.endRow();
  }

  private endRow() {
    this.row.push(this.field);
    this.field = '';
    const row = this.row;
    this.row = [];
    if (!this.header) {
      this.header = row.map((h) => h.replace(/^﻿/, '').trim());
      return;
    }
    const o: Record<string, string> = {};
    this.header.forEach((h, i) => (o[h] = row[i] ?? ''));
    this.onRow(o);
  }
}

/** Baixa um CSV em streaming e chama onRow para cada linha. */
export async function streamCsv(url: string, onRow: (row: Record<string, string>) => void, { sep = ';', encoding = 'utf-8' } = {}) {
  await withRetry(async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15 * 60_000) });
    if (!r.ok || !r.body) throw new HttpStatusError(r.status, url);
    const parser = new CsvParser(sep, onRow);
    const decoder = new TextDecoder(encoding);
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) parser.push(decoder.decode(chunk, { stream: true }));
    parser.push(decoder.decode());
    parser.end();
  }, 2);
}

/** Executa tarefas com concorrência limitada. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    })
  );
  return out;
}

/** "São José do Rio Claro" -> "sao jose do rio claro" (comparação de nomes de municípios). */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** "JOÃO DA SILVA" -> "João da Silva" */
export function titleCase(s: string) {
  const small = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
