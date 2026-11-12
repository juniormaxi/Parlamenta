/**
 * E-mails transacionais via Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Fluxo: queueEmail() grava em email_outbox dentro da transação do evento (ex.: mudança de status);
 * startEmailWorker() envia os pendentes e reenvia falhas com backoff (até MAX_ATTEMPTS).
 * Sem RESEND_API_KEY os e-mails ficam na fila (status pending) e são enviados quando a chave for configurada.
 *
 * Variáveis: RESEND_API_KEY, RESEND_FROM_EMAIL (remetente em domínio verificado no Resend), APP_URL.
 */
import crypto from 'node:crypto';
import { db, audit } from './db';

const API_URL = 'https://api.resend.com/emails';
const MAX_ATTEMPTS = 6;
const BATCH = 20;

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
export const appUrl = () => (process.env.APP_URL && !process.env.APP_URL.startsWith('MY_') ? process.env.APP_URL : 'http://localhost:3000').replace(/\/+$/, '');

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function queueEmail(e: { tenantId: string | null; to: string; subject: string; html: string; text: string; kind: string; ref?: string }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.to)) return;
  db.prepare(
    `INSERT INTO email_outbox (id, tenant_id, to_email, subject, html, text, kind, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), e.tenantId, e.to.trim().toLowerCase(), e.subject.slice(0, 200), e.html, e.text, e.kind, e.ref ?? null);
}

/** Display name for the From header: the cabinet's name, stripped of characters that break the header. */
function fromHeader(tenantId: string | null) {
  const addr = process.env.RESEND_FROM_EMAIL!;
  if (addr.includes('<')) return addr; // already "Nome <email>"
  const t = tenantId ? (db.prepare(`SELECT name, parliamentarian FROM tenants WHERE id = ?`).get(tenantId) as any) : null;
  const name = String(t?.parliamentarian || t?.name || 'Parlamenta').replace(/["<>\r\n]/g, '').slice(0, 80);
  return `${name} <${addr}>`;
}

async function sendOne(row: any) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // Resend deduplicates retries with the same key for 24h.
      'Idempotency-Key': row.id,
    },
    body: JSON.stringify({ from: fromHeader(row.tenant_id), to: [row.to_email], subject: row.subject, html: row.html, text: row.text }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Resend ${res.status}: ${body?.message ?? body?.name ?? 'erro'}`);
    // 4xx other than 429 will not succeed on retry (invalid address, unverified domain...).
    (err as any).permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw err;
  }
  return String(body?.id ?? '');
}

let running = false;
async function tick() {
  if (running || !mailConfigured()) return;
  running = true;
  try {
    const rows = db
      .prepare(`SELECT * FROM email_outbox WHERE status = 'pending' AND next_try_at <= datetime('now') ORDER BY created_at LIMIT ?`)
      .all(BATCH) as any[];
    for (const row of rows) {
      try {
        const id = await sendOne(row);
        db.prepare(`UPDATE email_outbox SET status = 'sent', provider_id = ?, sent_at = datetime('now'), attempts = attempts + 1, last_error = NULL WHERE id = ?`).run(id, row.id);
      } catch (e) {
        const attempts = row.attempts + 1;
        const failed = (e as any).permanent || attempts >= MAX_ATTEMPTS;
        const delayMin = Math.min(60, 2 ** attempts); // 2, 4, 8, 16, 32, 60 min
        db.prepare(
          `UPDATE email_outbox SET attempts = ?, last_error = ?, status = ?, next_try_at = datetime('now', ?) WHERE id = ?`
        ).run(attempts, String((e as Error).message).slice(0, 500), failed ? 'failed' : 'pending', `+${delayMin} minutes`, row.id);
        if (failed) audit({ tenantId: row.tenant_id, action: 'email.failed', target: row.kind, details: { ref: row.ref, error: String((e as Error).message).slice(0, 200) } });
      }
    }
  } finally {
    running = false;
  }
}

export function startEmailWorker() {
  if (!mailConfigured()) {
    console.log(' E-mail (Resend) desativado: defina RESEND_API_KEY e RESEND_FROM_EMAIL. Alertas ficam na fila até lá.');
  }
  setTimeout(tick, 2_000).unref();
  setInterval(tick, 20_000).unref();
}

/** Lets callers trigger an immediate send right after committing (still safe if it fails). */
export const kickEmailWorker = () => void setTimeout(tick, 50);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export function layout(opts: { cabinet: string; title: string; intro: string; body?: string; cta?: { label: string; url: string }; footer: string }) {
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F4F7F9;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<tr><td style="background:#102C45;padding:18px 24px;color:#ffffff">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#36B7A5;font-weight:bold">Atendimento ao Cidadão</div>
<div style="font-size:17px;font-weight:bold;margin-top:2px">${esc(opts.cabinet)}</div></td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:18px;margin:0 0 10px;color:#102C45">${esc(opts.title)}</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${opts.intro}</p>
${opts.body ?? ''}
${opts.cta ? `<p style="margin:22px 0 6px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#102C45;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:8px">${esc(opts.cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.5">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
