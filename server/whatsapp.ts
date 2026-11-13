/**
 * WhatsApp via wacli (https://wacli.sh) — um número conectado por gabinete, como "aparelho conectado".
 *
 * Como funciona:
 * - Cada gabinete tem um store próprio em DATA_DIR/whatsapp/<tenantId> (sessão + mensagens em SQLite do wacli).
 *   No Railway, DATA_DIR precisa estar num Volume, senão a sessão se perde a cada deploy.
 * - Conectar: `wacli --events auth` emite o QR (ou código de pareamento) em NDJSON no stderr; a tela mostra o QR.
 *   Ao parear, o auth faz a sincronização inicial e sai; então sobe o `wacli sync --follow`.
 * - `sync --follow` fica rodando por gabinete (supervisionado aqui, com reinício e backoff) e mantém a conexão.
 *   Envios (`send text|file`, `chats mark-read`) são delegados a esse processo pelo socket do store.
 * - Leituras (chats, mensagens) usam `--read-only` direto no banco local do wacli, sem disputar a trava.
 * - Alertas de protocolo vão para whatsapp_outbox e um worker envia com espaçamento; envio que cai no meio
 *   vira "uncertain" e não é reenviado automaticamente (o WhatsApp pode ter entregue).
 *
 * Variáveis: WACLI_BIN (opcional; padrão ./bin/wacli, instalado por `npm run wacli:install`, ou `wacli` no PATH).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import express, { type Request, type Response, type NextFunction } from 'express';
import QRCode from 'qrcode';
import { db, audit, DATA_DIR } from './db';
import { isBlocked, assertNotBlocked } from './blocklist';
import { HttpError, bad } from './http';
import { streamToFile, fileNameHeader } from './banco';

const LOCAL_BIN = path.resolve(process.cwd(), 'bin', 'wacli');
const BIN = process.env.WACLI_BIN || (fs.existsSync(LOCAL_BIN) ? LOCAL_BIN : 'wacli');
const WA_DIR = path.resolve(DATA_DIR, 'whatsapp');
const TMP_DIR = path.join(WA_DIR, '.uploads');
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const PAIRING_TIMEOUT_MS = 4 * 60_000;
const OUTBOX_MAX_ATTEMPTS = 4;
const OUTBOX_EXPIRE_HOURS = 24;

/** Quem pode conectar/desconectar o número e mudar as configurações. */
export const WA_MANAGER_ROLES = ['deputado', 'chefe_gabinete', 'coordenador_atendimento'];

// ---------------------------------------------------------------------------
// Binário e execução de comandos curtos (--json)
// ---------------------------------------------------------------------------
let binVersion: string | null = null;
function detectBinary() {
  try {
    binVersion = execFileSync(BIN, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    binVersion = null;
  }
  return binVersion;
}
const installed = () => binVersion !== null;

function storeDir(tenantId: string) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(tenantId)) throw new Error('tenant inválido');
  const dir = path.join(WA_DIR, tenantId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

class WaError extends Error {
  constructor(message: string, public timedOut = false) {
    super(message);
  }
}

/** Runs a one-shot wacli command with --json and returns `data` from the {success,data,error} envelope. */
function run<T = any>(tenantId: string, args: string[], { timeoutMs = 60_000, readOnly = false } = {}): Promise<T> {
  if (!installed()) return Promise.reject(new HttpError(503, 'wacli não está instalado no servidor. Rode `npm run wacli:install`.'));
  const full = ['--store', storeDir(tenantId), '--json', '--timeout', `${Math.ceil(timeoutMs / 1000)}s`, ...(readOnly ? ['--read-only'] : []), ...args];
  return new Promise((resolve, reject) => {
    execFile(BIN, full, { timeout: timeoutMs + 10_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, WACLI_READONLY: '' } }, (err, stdout, stderr) => {
      const envelope = [...String(stdout).split('\n'), ...String(stderr).split('\n')]
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{"success"'))
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .find(Boolean);
      if (envelope?.success) return resolve(envelope.data as T);
      const killed = Boolean(err && ((err as any).killed || (err as any).signal));
      const msg = envelope?.error || String(stderr).trim().split('\n').pop() || (err as Error | null)?.message || 'falha no wacli';
      reject(new WaError(String(msg).slice(0, 500), killed || /context deadline exceeded|timeout/i.test(String(msg))));
    });
  });
}

// ---------------------------------------------------------------------------
// Processos longos: auth (pareamento) e sync --follow, um por gabinete
// ---------------------------------------------------------------------------
type Runner = { kind: 'auth' | 'sync'; proc: ChildProcess; stopping: boolean; exited: Promise<void> };
type Live = {
  runner?: Runner;
  qr?: string;
  pairCode?: string;
  paired?: boolean; // auth pareado, terminando a sincronização inicial
  online?: boolean; // sync conectado ao WhatsApp
  lastError?: string;
  restartTimer?: NodeJS.Timeout;
  pairingTimer?: NodeJS.Timeout;
  backoff: number;
};
const live = new Map<string, Live>();
const L = (tenantId: string) => {
  let l = live.get(tenantId);
  if (!l) live.set(tenantId, (l = { backoff: 0 }));
  return l;
};

function spawnWacli(tenantId: string, kind: Runner['kind'], args: string[], onEvent: (ev: string, data: any) => void, onExit: (code: number | null) => void): Runner {
  const proc = spawn(BIN, ['--store', storeDir(tenantId), '--events', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WACLI_READONLY: '' },
  });
  proc.stdout!.resume(); // QR em texto também sai no stdout; os eventos no stderr bastam.
  readline.createInterface({ input: proc.stderr! }).on('line', (line) => {
    if (!line.startsWith('{')) return;
    try {
      const ev = JSON.parse(line);
      if (typeof ev.event === 'string') onEvent(ev.event, ev.data ?? {});
    } catch {
      /* linha que não é evento */
    }
  });
  const exited = new Promise<void>((resolve) => {
    proc.on('exit', (code) => {
      resolve();
      onExit(code);
    });
    proc.on('error', (e) => {
      L(tenantId).lastError = e.message;
      resolve();
      onExit(-1);
    });
  });
  return { kind, proc, stopping: false, exited };
}

async function stopRunner(tenantId: string) {
  const l = L(tenantId);
  clearTimeout(l.restartTimer);
  clearTimeout(l.pairingTimer);
  const r = l.runner;
  if (!r) return;
  r.stopping = true;
  r.proc.kill('SIGTERM');
  const timer = setTimeout(() => r.proc.kill('SIGKILL'), 10_000);
  await r.exited;
  clearTimeout(timer);
  if (l.runner === r) l.runner = undefined;
  l.online = false;
}

async function setAccount(tenantId: string, fields: { status?: string; jid?: string; connected_at?: string | null; last_error?: string | null }) {
  await db.prepare(`INSERT INTO whatsapp_accounts (tenant_id) VALUES (?) ON CONFLICT (tenant_id) DO NOTHING`).run(tenantId);
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return;
  await db
    .prepare(`UPDATE whatsapp_accounts SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE tenant_id = ?`)
    .run(...keys.map((k) => fields[k] ?? null), tenantId);
}

async function startPairing(tenantId: string, phone: string | null) {
  await stopRunner(tenantId);
  const l = L(tenantId);
  Object.assign(l, { qr: undefined, pairCode: undefined, paired: false, lastError: undefined });
  await setAccount(tenantId, { status: 'pairing', last_error: null });

  const args = ['auth', '--idle-exit', '15s', '--history-days', '30', '--history-max-per-chat', '300'];
  if (phone) args.push(`--phone=${phone}`);
  const runner = spawnWacli(
    tenantId,
    'auth',
    args,
    (ev, data) => {
      if (ev === 'qr_code') l.qr = String(data.code ?? '');
      else if (ev === 'pair_code') l.pairCode = String(data.code ?? '');
      else if (ev === 'connected') {
        l.paired = true;
        l.qr = undefined;
        l.pairCode = undefined;
        clearTimeout(l.pairingTimer);
      } else if (ev === 'error') l.lastError = String(data.message ?? '');
    },
    () => void onAuthExit(tenantId, runner)
  );
  l.runner = runner;
  // O próprio WhatsApp expira os QR depois de alguns minutos; este é só um limite de segurança.
  l.pairingTimer = setTimeout(() => {
    if (!l.paired && l.runner === runner) {
      l.lastError = 'Tempo de pareamento esgotado. Gere um novo QR code.';
      runner.proc.kill('SIGTERM');
    }
  }, PAIRING_TIMEOUT_MS);
}

async function onAuthExit(tenantId: string, runner: Runner) {
  const l = L(tenantId);
  if (l.runner === runner) l.runner = undefined;
  clearTimeout(l.pairingTimer);
  if (runner.stopping) return;
  l.qr = undefined;
  l.pairCode = undefined;
  try {
    const st = await run<{ authenticated: boolean; linked_jid?: string }>(tenantId, ['auth', 'status'], { readOnly: true, timeoutMs: 20_000 });
    if (st.authenticated) {
      l.paired = false;
      await setAccount(tenantId, { status: 'connected', jid: st.linked_jid ?? '', connected_at: new Date().toISOString(), last_error: null });
      await audit({ tenantId, action: 'whatsapp.connected', target: jidUser(st.linked_jid ?? '') });
      startSync(tenantId);
      return;
    }
  } catch (e) {
    l.lastError ||= (e as Error).message;
  }
  l.paired = false;
  const err = l.lastError && !/context canceled/i.test(l.lastError) ? l.lastError : 'Pareamento não concluído (o QR code expirou). Gere um novo.';
  await setAccount(tenantId, { status: 'disconnected', last_error: err });
}

function startSync(tenantId: string) {
  const l = L(tenantId);
  if (l.runner || !installed()) return;
  clearTimeout(l.restartTimer);
  let loggedOut = false;
  const runner = spawnWacli(
    tenantId,
    'sync',
    ['sync', '--follow', '--max-reconnect', '0', '--send-spacing', '1s-3s', '--refresh-contacts'],
    (ev, data) => {
      if (ev === 'connected') {
        l.online = true;
        l.backoff = 0;
        l.lastError = undefined;
        kickWhatsAppWorker();
      } else if (ev === 'disconnected' || ev === 'stale') l.online = false;
      else if (ev === 'logged_out') {
        loggedOut = true;
        l.online = false;
      } else if (ev === 'error') l.lastError = String(data.message ?? '');
    },
    () => void onSyncExit(tenantId, runner, () => loggedOut)
  );
  l.runner = runner;
}

async function onSyncExit(tenantId: string, runner: Runner, wasLoggedOut: () => boolean) {
  const l = L(tenantId);
  if (l.runner === runner) l.runner = undefined;
  l.online = false;
  if (runner.stopping) return;
  const notAuthed = /not authenticated|run `wacli auth`|logged out/i.test(l.lastError ?? '');
  if (wasLoggedOut() || notAuthed) {
    await setAccount(tenantId, { status: 'disconnected', last_error: 'A sessão foi encerrada no celular (aparelho desconectado). Conecte novamente.' });
    await audit({ tenantId, action: 'whatsapp.logged_out_remotely' });
    return;
  }
  const acc = (await db.prepare(`SELECT status FROM whatsapp_accounts WHERE tenant_id = ?`).get(tenantId)) as any;
  if (acc?.status !== 'connected') return;
  l.backoff = Math.min(l.backoff + 1, 7);
  const delay = Math.min(300_000, 5_000 * 2 ** (l.backoff - 1));
  console.warn(`[whatsapp] sync do gabinete ${tenantId} saiu (${l.lastError ?? 'sem erro'}); reiniciando em ${delay / 1000}s`);
  l.restartTimer = setTimeout(() => startSync(tenantId), delay);
  l.restartTimer.unref();
}

async function disconnect(tenantId: string) {
  await stopRunner(tenantId);
  try {
    await run(tenantId, ['auth', 'logout'], { timeoutMs: 45_000 });
  } catch {
    /* sem rede ou sessão já revogada: apagar o store basta para esquecer o aparelho deste lado */
  }
  fs.rmSync(path.join(WA_DIR, tenantId), { recursive: true, force: true });
  live.delete(tenantId);
  await setAccount(tenantId, { status: 'disconnected', jid: '', connected_at: null, last_error: null });
}

/** Chamado quando um gabinete é excluído: derruba o processo e apaga a sessão. */
export async function forgetWhatsAppTenant(tenantId: string) {
  await stopRunner(tenantId);
  live.delete(tenantId);
  fs.rmSync(path.join(WA_DIR, tenantId), { recursive: true, force: true });
}

export async function startWhatsApp() {
  fs.mkdirSync(WA_DIR, { recursive: true, mode: 0o700 });
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  if (!detectBinary()) {
    console.log(` WhatsApp (wacli) desativado: binário "${BIN}" não encontrado. Rode \`npm run wacli:install\` ou defina WACLI_BIN.`);
  }
  // Pareamentos interrompidos por um restart não continuam.
  await db.prepare(`UPDATE whatsapp_accounts SET status = 'disconnected', last_error = ? WHERE status = 'pairing'`).run('Pareamento interrompido. Gere um novo QR code.');
  if (installed()) {
    const rows = (await db.prepare(`SELECT tenant_id FROM whatsapp_accounts WHERE status = 'connected'`).all()) as any[];
    for (const r of rows) startSync(r.tenant_id);
    if (rows.length) console.log(` WhatsApp: ${rows.length} conta(s) conectada(s) — sincronização iniciada.`);
  }
  const killAll = () => {
    for (const l of live.values()) l.runner?.proc.kill('SIGTERM');
  };
  process.once('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      killAll();
      process.exit(0);
    });
  }
  setTimeout(tick, 5_000).unref();
  setInterval(tick, 15_000).unref();
}

// ---------------------------------------------------------------------------
// Telefones / JIDs
// ---------------------------------------------------------------------------
const jidUser = (jid: string) => String(jid).split('@')[0].split(':')[0];

/** Telefone brasileiro (com ou sem 55) ou internacional com "+" → "+55DDDNUMERO". null se inválido. */
export function toWaPhone(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  if (s.startsWith('+')) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? `+${d}` : null;
}

/** Aceita JID do WhatsApp ou telefone; devolve o valor para --to. */
function recipient(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (/^[0-9A-Za-z.:_-]+@(s\.whatsapp\.net|g\.us|lid)$/.test(s)) return s;
  const p = toWaPhone(s);
  if (!p) throw bad('Destinatário inválido: informe um telefone com DDD.');
  return p;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
async function requireOnline(tenantId: string) {
  const acc = (await db.prepare(`SELECT status FROM whatsapp_accounts WHERE tenant_id = ?`).get(tenantId)) as any;
  if (acc?.status !== 'connected') throw new HttpError(409, 'Nenhum WhatsApp conectado a este gabinete.');
  if (!L(tenantId).online) throw new HttpError(409, 'O WhatsApp está reconectando. Tente novamente em alguns segundos.');
}

async function sendText(tenantId: string, to: string, text: string) {
  return run<{ sent: boolean; id: string; to: string; store_warning?: string }>(tenantId, ['send', 'text', `--to=${to}`, `--message=${text}`], {
    timeoutMs: 90_000,
  });
}

// ---------------------------------------------------------------------------
// Fila de alertas (protocolos)
// ---------------------------------------------------------------------------
/** Enfileira um alerta se o gabinete tem WhatsApp conectado e alertas ativos. Chame dentro da transação do evento. */
export async function queueWhatsApp(e: { tenantId: string; phone: unknown; body: string; kind: string; ref?: string }) {
  const to = toWaPhone(e.phone);
  if (!to) return;
  if (await isBlocked(e.tenantId, to)) return; // LGPD: pediu para não receber mensagens
  const acc = (await db.prepare(`SELECT status, alerts_enabled FROM whatsapp_accounts WHERE tenant_id = ?`).get(e.tenantId)) as any;
  if (acc?.status !== 'connected' || !acc.alerts_enabled) return;
  await db
    .prepare(`INSERT INTO whatsapp_outbox (id, tenant_id, to_phone, body, kind, ref) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), e.tenantId, to, e.body.slice(0, 4000), e.kind, e.ref ?? null);
}

let running = false;
async function tick() {
  if (running || !installed()) return;
  running = true;
  try {
    const rows = (await db
      .prepare(`SELECT * FROM whatsapp_outbox WHERE status = 'pending' AND next_try_at <= datetime('now') ORDER BY created_at LIMIT 20`)
      .all()) as any[];
    for (const row of rows) {
      const ageH = (Date.now() - Date.parse(String(row.created_at).replace(' ', 'T') + 'Z')) / 3_600_000;
      if (!L(row.tenant_id).online) {
        if (ageH > OUTBOX_EXPIRE_HOURS) {
          await db.prepare(`UPDATE whatsapp_outbox SET status = 'failed', last_error = ? WHERE id = ?`).run('WhatsApp desconectado por mais de 24h.', row.id);
        } else {
          await db.prepare(`UPDATE whatsapp_outbox SET next_try_at = datetime('now', '+2 minutes') WHERE id = ?`).run(row.id);
        }
        continue;
      }
      if (await isBlocked(row.tenant_id, row.to_phone)) {
        await db.prepare(`UPDATE whatsapp_outbox SET status = 'failed', last_error = ? WHERE id = ?`).run('Número bloqueado (LGPD).', row.id);
        continue;
      }
      try {
        const r = await sendText(row.tenant_id, row.to_phone, row.body);
        await db
          .prepare(`UPDATE whatsapp_outbox SET status = 'sent', message_id = ?, sent_at = datetime('now'), attempts = attempts + 1, last_error = ? WHERE id = ?`)
          .run(String(r?.id ?? ''), r?.store_warning ?? null, row.id);
      } catch (e) {
        const err = e as WaError;
        const attempts = row.attempts + 1;
        // Timeout / conexão caída no meio do envio: pode ter sido entregue — não reenviar sozinho.
        const status = err.timedOut ? 'uncertain' : attempts >= OUTBOX_MAX_ATTEMPTS ? 'failed' : 'pending';
        await db
          .prepare(`UPDATE whatsapp_outbox SET attempts = ?, last_error = ?, status = ?, next_try_at = datetime('now', ?) WHERE id = ?`)
          .run(attempts, String(err.message).slice(0, 500), status, `+${Math.min(60, 2 ** attempts)} minutes`, row.id);
        if (status !== 'pending') {
          await audit({ tenantId: row.tenant_id, action: 'whatsapp.alert_failed', target: row.kind, details: { ref: row.ref, status, error: String(err.message).slice(0, 200) } });
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp] worker:', (e as Error).message);
  } finally {
    running = false;
  }
}
export const kickWhatsAppWorker = () => void setTimeout(tick, 50);

// ---------------------------------------------------------------------------
// Rotas — /api/tenant/whatsapp
// ---------------------------------------------------------------------------
export const whatsappRouter = express.Router();
const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
const canManage = (req: Request) => WA_MANAGER_ROLES.includes(req.auth!.role);
function requireManager(req: Request, _res: Response, next: NextFunction) {
  if (!canManage(req)) throw new HttpError(403, 'Apenas deputado, chefe de gabinete ou coordenação de atendimento podem alterar a conexão do WhatsApp.');
  next();
}

const qrCache = new Map<string, string>();
async function qrSvg(code: string) {
  let svg = qrCache.get(code);
  if (!svg) {
    svg = await QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    if (qrCache.size > 200) qrCache.clear();
    qrCache.set(code, svg);
  }
  return svg;
}

whatsappRouter.get('/', async (req, res) => {
  const t = tid(req);
  const acc = ((await db.prepare(`SELECT * FROM whatsapp_accounts WHERE tenant_id = ?`).get(t)) as any) ?? { status: 'disconnected', alerts_enabled: 1 };
  const l = L(t);
  const outbox = (await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status IN ('failed','uncertain')) AS failed,
         COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= datetime('now', '-1 day')) AS sent24h
       FROM whatsapp_outbox WHERE tenant_id = ?`
    )
    .get(t)) as any;
  let unread = 0;
  if (acc.status === 'connected' && installed()) {
    try {
      const chats = (await run<any[]>(t, ['chats', 'list', '--unread', '--limit', '500'], { readOnly: true, timeoutMs: 15_000 })) ?? [];
      unread = chats.filter((c) => !isHiddenChat(c.jid)).reduce((n, c) => n + (Number(c.unread_count) || 1), 0);
    } catch {
      /* contagem é opcional */
    }
  }
  res.json({
    installed: installed(),
    version: binVersion,
    canManage: canManage(req),
    status: acc.status,
    phase: acc.status === 'pairing' ? (l.paired ? 'syncing' : l.pairCode ? 'code' : l.qr ? 'qr' : 'starting') : null,
    online: Boolean(l.online),
    phone: acc.jid ? `+${jidUser(acc.jid)}` : '',
    connectedAt: acc.connected_at ?? null,
    lastError: acc.status === 'connected' && !l.online ? (l.lastError ?? null) : (acc.last_error ?? null),
    alertsEnabled: Boolean(acc.alerts_enabled),
    qrSvg: acc.status === 'pairing' && l.qr ? await qrSvg(l.qr) : null,
    pairCode: acc.status === 'pairing' ? (l.pairCode ?? null) : null,
    unread,
    outbox: { pending: outbox.pending, failed: outbox.failed, sent24h: outbox.sent24h },
  });
});

whatsappRouter.post('/connect', requireManager, async (req, res) => {
  if (!installed() && !detectBinary()) throw new HttpError(503, 'wacli não está instalado no servidor. Rode `npm run wacli:install`.');
  const t = tid(req);
  const acc = (await db.prepare(`SELECT status FROM whatsapp_accounts WHERE tenant_id = ?`).get(t)) as any;
  if (acc?.status === 'connected') throw new HttpError(409, 'Já existe um WhatsApp conectado. Desconecte antes de parear outro número.');
  let phone: string | null = null;
  if (req.body?.phone) {
    phone = toWaPhone(req.body.phone);
    if (!phone) throw bad('Telefone inválido. Use DDD + número, ex.: (65) 99999-0000.');
  }
  // Store limpo: um pareamento anterior incompleto não pode atrapalhar o novo.
  await stopRunner(t);
  fs.rmSync(path.join(WA_DIR, t), { recursive: true, force: true });
  await startPairing(t, phone);
  await audit({ ...actor(req), action: 'whatsapp.pairing_started', details: { method: phone ? 'phone' : 'qr' } });
  res.json({ ok: true });
});

whatsappRouter.post('/cancel', requireManager, async (req, res) => {
  const t = tid(req);
  const acc = (await db.prepare(`SELECT status FROM whatsapp_accounts WHERE tenant_id = ?`).get(t)) as any;
  if (acc?.status !== 'pairing') return res.json({ ok: true });
  await stopRunner(t);
  fs.rmSync(path.join(WA_DIR, t), { recursive: true, force: true });
  live.delete(t);
  await setAccount(t, { status: 'disconnected', last_error: null });
  res.json({ ok: true });
});

whatsappRouter.post('/disconnect', requireManager, async (req, res) => {
  const t = tid(req);
  await disconnect(t);
  await db.prepare(`UPDATE whatsapp_outbox SET status = 'failed', last_error = 'WhatsApp desconectado.' WHERE tenant_id = ? AND status = 'pending'`).run(t);
  await audit({ ...actor(req), action: 'whatsapp.disconnected' });
  res.json({ ok: true });
});

whatsappRouter.patch('/settings', requireManager, async (req, res) => {
  if (typeof req.body?.alertsEnabled !== 'boolean') throw bad('Informe alertsEnabled.');
  await setAccount(tid(req), {});
  await db.prepare(`UPDATE whatsapp_accounts SET alerts_enabled = ? WHERE tenant_id = ?`).run(req.body.alertsEnabled ? 1 : 0, tid(req));
  await audit({ ...actor(req), action: 'whatsapp.settings_updated', details: { alertsEnabled: req.body.alertsEnabled } });
  res.json({ ok: true });
});

// --- Conversas -------------------------------------------------------------
const isHiddenChat = (jid: string) => jid === 'status@broadcast' || String(jid).endsWith('@newsletter') || String(jid).endsWith('@broadcast');

async function requireConnected(tenantId: string) {
  const acc = (await db.prepare(`SELECT status FROM whatsapp_accounts WHERE tenant_id = ?`).get(tenantId)) as any;
  if (acc?.status !== 'connected') throw new HttpError(409, 'Nenhum WhatsApp conectado a este gabinete.');
}

function mapMessage(m: any) {
  return {
    id: m.MsgID,
    chatJid: m.ChatJID,
    chatName: m.ChatName ?? '',
    senderJid: m.SenderJID ?? '',
    senderName: m.SenderName ?? '',
    fromMe: Boolean(m.FromMe),
    at: m.Timestamp,
    text: m.DisplayText || m.Text || m.MediaCaption || '',
    mediaType: m.MediaType || '',
    filename: m.Filename || '',
    revoked: Boolean(m.Revoked || m.DeletedForMe),
    edited: Boolean(m.Edited),
    deliveredTo: Number(m.DeliveredTo) || 0,
    readBy: Number(m.ReadBy) || 0,
  };
}

whatsappRouter.get('/chats', async (req, res) => {
  const t = tid(req);
  await requireConnected(t);
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  const [chats, recent] = await Promise.all([
    run<any[]>(t, ['chats', 'list', '--limit', '300', ...(q ? [`--query=${q}`] : [])], { readOnly: true, timeoutMs: 20_000 }),
    run<any>(t, ['messages', 'list', '--limit', '600'], { readOnly: true, timeoutMs: 20_000 }).catch(() => null),
  ]);
  const last = new Map<string, any>();
  for (const m of recent?.messages ?? []) if (!m.ReactionToID && !last.has(m.ChatJID)) last.set(m.ChatJID, m);
  res.json(
    (chats ?? [])
      .filter((c) => !isHiddenChat(c.jid))
      .map((c) => {
        const m = last.get(c.jid);
        return {
          jid: c.jid,
          name: c.name || (c.jid.endsWith('@s.whatsapp.net') ? `+${jidUser(c.jid)}` : jidUser(c.jid)),
          kind: c.kind || (c.jid.endsWith('@g.us') ? 'group' : 'dm'),
          phone: c.jid.endsWith('@s.whatsapp.net') ? `+${jidUser(c.jid)}` : '',
          lastMessageAt: c.last_message_ts && !String(c.last_message_ts).startsWith('0001') ? c.last_message_ts : null,
          unread: Boolean(c.unread),
          unreadCount: Number(c.unread_count) || 0,
          pinned: Boolean(c.pinned),
          archived: Boolean(c.archived),
          preview: m ? { text: m.DisplayText || m.Text || m.MediaCaption || (m.MediaType ? `[${m.MediaType}]` : ''), fromMe: Boolean(m.FromMe) } : null,
        };
      })
  );
});

whatsappRouter.get('/messages', async (req, res) => {
  const t = tid(req);
  await requireConnected(t);
  const chat = String(req.query.chat ?? '');
  if (!/^[0-9A-Za-z.:_-]+@[a-z.]+$/.test(chat)) throw bad('Conversa inválida.');
  const before = String(req.query.before ?? '');
  const args = ['messages', 'list', `--chat=${chat}`, '--limit', '80'];
  if (before) {
    if (Number.isNaN(Date.parse(before))) throw bad('Data inválida.');
    args.push(`--before=${new Date(before).toISOString()}`);
  }
  const data = await run<any>(t, args, { readOnly: true, timeoutMs: 20_000 });
  const msgs = (data?.messages ?? []).filter((m: any) => !m.ReactionToID).map(mapMessage).reverse();
  res.json({ messages: msgs, hasMore: Boolean(data?.page?.has_more) });
});

whatsappRouter.post('/read', async (req, res) => {
  const t = tid(req);
  await requireOnline(t);
  const chat = String(req.body?.chat ?? '');
  if (!/^[0-9A-Za-z.:_-]+@[a-z.]+$/.test(chat)) throw bad('Conversa inválida.');
  await run(t, ['chats', 'mark-read', `--chat=${chat}`], { timeoutMs: 30_000 }).catch(() => undefined);
  res.json({ ok: true });
});

/** Envia texto pelo número do gabinete (usado pelo CRM). Lança HttpError com mensagem amigável. */
export async function sendWhatsAppText(tenantId: string, rawTo: unknown, text: string) {
  const to = recipient(rawTo);
  await assertNotBlocked(tenantId, to);
  await requireOnline(tenantId);
  try {
    const r = await sendText(tenantId, to, text);
    return { id: r?.id ?? '', warning: r?.store_warning ?? null };
  } catch (e) {
    const err = e as WaError;
    if (err instanceof HttpError) throw err;
    throw new HttpError(
      502,
      err.timedOut
        ? 'O envio não foi confirmado (conexão instável). Confira a conversa antes de reenviar para não duplicar.'
        : `WhatsApp recusou o envio: ${err.message}`
    );
  }
}

/** Envia um arquivo já salvo no servidor (ex.: imagem de campanha do CRM), com legenda opcional. */
export async function sendWhatsAppFile(tenantId: string, rawTo: unknown, file: string, fileName: string, caption: string) {
  const to = recipient(rawTo);
  await assertNotBlocked(tenantId, to);
  await requireOnline(tenantId);
  const args = ['send', 'file', `--to=${to}`, `--file=${file}`, `--filename=${fileName}`];
  if (caption) args.push(`--caption=${caption}`);
  try {
    const r = await run<any>(tenantId, args, { timeoutMs: 180_000 });
    return { id: r?.id ?? '' };
  } catch (e) {
    const err = e as WaError;
    if (err instanceof HttpError) throw err;
    throw new HttpError(
      502,
      err.timedOut ? 'O envio da imagem não foi confirmado. Confira a conversa antes de reenviar.' : `WhatsApp recusou o envio da imagem: ${err.message}`
    );
  }
}

whatsappRouter.post('/send', async (req, res) => {
  const t = tid(req);
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw bad('Digite a mensagem.');
  if (text.length > 4000) throw bad('Mensagem longa demais (máx. 4.000 caracteres).');
  const to = recipient(req.body?.to);
  await assertNotBlocked(t, to);
  await requireOnline(t);
  try {
    const r = await sendText(t, to, text);
    res.json({ ok: true, id: r?.id ?? '', warning: r?.store_warning ?? null });
  } catch (e) {
    const err = e as WaError;
    if (err instanceof HttpError) throw err;
    throw new HttpError(
      502,
      err.timedOut
        ? 'O envio não foi confirmado (conexão instável). Confira a conversa antes de reenviar para não duplicar.'
        : `WhatsApp recusou o envio: ${err.message}`
    );
  }
});

whatsappRouter.post('/send-file', async (req, res) => {
  const t = tid(req);
  const to = recipient(req.query.to);
  const caption = String(req.query.caption ?? '').slice(0, 1000);
  await assertNotBlocked(t, to);
  await requireOnline(t);
  const name = fileNameHeader(req) || 'arquivo';
  const dest = path.join(TMP_DIR, `${crypto.randomUUID()}${path.extname(name).slice(0, 10)}`);
  try {
    await streamToFile(req, dest, MAX_FILE_BYTES);
    const args = ['send', 'file', `--to=${to}`, `--file=${dest}`, `--filename=${name}`];
    if (caption) args.push(`--caption=${caption}`);
    const r = await run<any>(t, args, { timeoutMs: 180_000 });
    res.json({ ok: true, id: r?.id ?? '' });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const err = e as WaError;
    throw new HttpError(502, err.timedOut ? 'O envio do arquivo não foi confirmado. Confira a conversa antes de reenviar.' : `Falha ao enviar arquivo: ${err.message}`);
  } finally {
    fs.rm(dest, { force: true }, () => undefined);
  }
});

// --- Fila de alertas ---------------------------------------------------------
whatsappRouter.get('/outbox', async (req, res) => {
  const rows = (await db
    .prepare(`SELECT id, to_phone, body, kind, ref, status, attempts, last_error, created_at, sent_at FROM whatsapp_outbox WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100`)
    .all(tid(req))) as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      to: r.to_phone,
      body: r.body,
      kind: r.kind,
      ref: r.ref,
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error,
      createdAt: r.created_at,
      sentAt: r.sent_at,
    }))
  );
});

whatsappRouter.post('/outbox/:id/retry', requireManager, async (req, res) => {
  const r = await db
    .prepare(`UPDATE whatsapp_outbox SET status = 'pending', attempts = 0, next_try_at = datetime('now'), last_error = NULL WHERE id = ? AND tenant_id = ? AND status IN ('failed','uncertain')`)
    .run(req.params.id, tid(req));
  if (!r.changes) throw new HttpError(404, 'Mensagem não encontrada ou já enviada.');
  kickWhatsAppWorker();
  res.json({ ok: true });
});

// Falhas do wacli viram 502 com a mensagem dele (em vez de "Erro interno").
// eslint-disable-next-line @typescript-eslint/no-unused-vars
whatsappRouter.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  if (err instanceof WaError) return next(new HttpError(502, `WhatsApp: ${err.message}`));
  next(err);
});
