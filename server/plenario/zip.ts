/**
 * Leitura de arquivos ZIP (sem dependências): do buffer inteiro ou de um ZIP remoto por HTTP Range,
 * baixando só o diretório central e as entradas pedidas (os pacotes de fotos do TSE têm centenas de MB).
 * Suporta método 0 (stored) e 8 (deflate); ZIP64 não é necessário para os arquivos usados.
 */
import zlib from 'node:zlib';
import { fetchBuffer } from './net';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function findEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Arquivo ZIP inválido (fim do diretório não encontrado).');
}

function parseCentralDirectory(cd: Buffer, count: number): ZipEntry[] {
  const out: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('Diretório central do ZIP inválido.');
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    const compressedSize = cd.readUInt32LE(p + 20);
    const size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOffset = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    out.push({ name, method, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function inflate(entry: ZipEntry, local: Buffer): Buffer {
  if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`Entrada ${entry.name} inválida no ZIP.`);
  const start = 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const data = local.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`Compressão ${entry.method} não suportada (${entry.name}).`);
}

/** ZIP já baixado por inteiro. */
export function openZipBuffer(buf: Buffer) {
  const e = findEocd(buf);
  const count = buf.readUInt16LE(e + 10);
  const cdSize = buf.readUInt32LE(e + 12);
  const cdOffset = buf.readUInt32LE(e + 16);
  const entries = parseCentralDirectory(buf.subarray(cdOffset, cdOffset + cdSize), count);
  return {
    entries,
    read: (entry: ZipEntry) => inflate(entry, buf.subarray(entry.localOffset)),
  };
}

/** ZIP remoto: lê o diretório central e depois cada entrada pedida com requisições Range. */
export async function openRemoteZip(url: string) {
  const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  const total = Number(head.headers.get('content-length') ?? 0);
  if (!head.ok || !total) throw new Error(`ZIP indisponível (${head.status}): ${url}`);
  const tailStart = Math.max(0, total - 66_000);
  const tail = await fetchBuffer(url, { range: [tailStart, total - 1] });
  const e = findEocd(tail);
  const count = tail.readUInt16LE(e + 10);
  const cdSize = tail.readUInt32LE(e + 12);
  const cdOffset = tail.readUInt32LE(e + 16);
  const cd =
    cdOffset >= tailStart ? tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize) : await fetchBuffer(url, { range: [cdOffset, cdOffset + cdSize - 1] });
  const entries = parseCentralDirectory(cd, count);
  return {
    entries,
    async read(entry: ZipEntry): Promise<Buffer> {
      // Cabeçalho local (30 bytes + nome + extra, que pode diferir do diretório central) + dados.
      const end = Math.min(total - 1, entry.localOffset + 30 + 1024 + entry.compressedSize);
      return inflate(entry, await fetchBuffer(url, { range: [entry.localOffset, end] }));
    },
  };
}
