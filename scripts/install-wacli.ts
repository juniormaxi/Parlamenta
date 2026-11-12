/**
 * Baixa o wacli (https://wacli.sh) para ./bin/wacli — usado pela integração de WhatsApp (server/whatsapp.ts).
 *
 * Versão fixada e conferida por SHA-256: atualizar = trocar VERSION e os hashes de checksums.txt da release.
 * Roda no build (`npm run build`) e pode ser chamado à mão: `npm run wacli:install`.
 * Se WACLI_BIN apontar para um binário já instalado (ex.: brew), o download é pulado.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VERSION = '0.26.0';
const SHA256: Record<string, string> = {
  linux_amd64: '2c28f65e2f9aaf32585288229db1f916c6c5fb5db9513715017d528513604b44',
  linux_arm64: '777a5dccece12421b7ee4af001b074e5ebc1c7a63f732cf642c3e7b3c4d7c7b9',
  darwin_amd64: 'fd87aa18873886376b0a8b4fa43c4ac1c47e047177a559fa4b6add594371733a',
  darwin_arm64: '51ea21ebecc47ccd5df6bd90940fe827fc0eb1e191098bf56dd03363d69d34a5',
};

const BIN_DIR = path.resolve(process.cwd(), 'bin');
const DEST = path.join(BIN_DIR, 'wacli');

function installedVersion(bin: string): string | null {
  try {
    return execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

async function main() {
  if (process.env.WACLI_BIN) {
    console.log(`[wacli] WACLI_BIN definido (${process.env.WACLI_BIN}); download ignorado.`);
    return;
  }
  if (installedVersion(DEST)?.endsWith(VERSION)) {
    console.log(`[wacli] ${VERSION} já instalado em bin/wacli.`);
    return;
  }
  const osName = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : null;
  const key = osName && arch ? `${osName}_${arch}` : '';
  if (!SHA256[key]) {
    console.warn(`[wacli] Plataforma ${process.platform}/${process.arch} sem binário automático. Instale manualmente e defina WACLI_BIN.`);
    return;
  }

  const url = `https://github.com/openclaw/wacli/releases/download/v${VERSION}/wacli_${VERSION}_${key}.tar.gz`;
  console.log(`[wacli] Baixando ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download falhou: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sum = crypto.createHash('sha256').update(buf).digest('hex');
  if (sum !== SHA256[key]) throw new Error(`checksum inválido (${sum}); download descartado.`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wacli-'));
  try {
    const tgz = path.join(tmp, 'wacli.tar.gz');
    fs.writeFileSync(tgz, buf);
    execFileSync('tar', ['-xzf', tgz, '-C', tmp, './wacli']);
    fs.mkdirSync(BIN_DIR, { recursive: true });
    fs.copyFileSync(path.join(tmp, 'wacli'), DEST);
    fs.chmodSync(DEST, 0o755);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`[wacli] Instalado: ${installedVersion(DEST)}`);
}

main().catch((e) => {
  // Não derruba o build: o app sobe e a tela de WhatsApp mostra que o binário está ausente.
  console.error(`[wacli] Não foi possível instalar: ${(e as Error).message}`);
});
