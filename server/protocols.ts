/**
 * Protocolos & Demandas.
 *
 * - tenantProtocolsRouter (/api/tenant/protocols): equipe do gabinete lista, cria e atualiza protocolos.
 * - publicRouter (/api/public): site do parlamentar — o cidadão abre uma demanda (tag "Demanda Web")
 *   e consulta a linha do tempo pelo número do protocolo + 4 últimos dígitos do telefone.
 *
 * O cidadão só vê eventos marcados como públicos (abertura, mudanças de status, resposta do gabinete);
 * notas internas, nomes da equipe e redistribuições nunca saem do gabinete.
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import { db, tx, audit } from './db';
import { HttpError, bad } from './http';
import { ensureDemandThemes } from './taxonomy';
import { queueEmail, kickEmailWorker, layout, esc, appUrl } from './mailer';
import { queueWhatsApp, kickWhatsAppWorker } from './whatsapp';

export const WEB_TAG = 'Demanda Web';
export const WEB_CHANNEL_LABEL = 'Site do Parlamentar';

const STATUSES = ['novo', 'em_analise', 'em_execucao', 'aguardando_orgao', 'revisao_coordenador', 'resolvido', 'cancelado'] as const;
const PRIORITIES = ['baixa', 'media', 'alta', 'urgente'] as const;
export const STATUS_LABEL: Record<string, string> = {
  novo: 'Recebido',
  em_analise: 'Em análise',
  em_execucao: 'Em execução',
  aguardando_orgao: 'Aguardando órgão responsável',
  revisao_coordenador: 'Em revisão final',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
};
const SLA_DAYS: Record<string, number> = { urgente: 1, alta: 2, media: 5, baixa: 10 };
const MAX_DATA_BYTES = 64 * 1024;

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

type Visibility = 'internal' | 'public' | 'both';
async function addEvent(
  p: { id: string; tenantId: string },
  e: { action: string; description?: string; author?: string; role?: string; badge?: string | null; visibility: Visibility; clientId?: string; at?: string }
) {
  await db.prepare(
    `INSERT INTO protocol_events (id, protocol_id, tenant_id, client_id, at, author, role, action, description, badge, visibility)
     VALUES (?, ?, ?, ?, COALESCE(?, utc_iso_now()), ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
  ).run(
    crypto.randomUUID(), p.id, p.tenantId, e.clientId ?? null, e.at ?? null,
    text(e.author, 120), text(e.role, 120), text(e.action, 200), text(e.description, 4000), e.badge ? text(e.badge, 60) : null, e.visibility
  );
}

/** Creates a protocol row with the next sequential number for the tenant/year. Caller wraps in a transaction. */
async function insertProtocol(tenantId: string, source: 'interno' | 'web', data: Record<string, any>) {
  const year = new Date().getFullYear();
  const row = await db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM protocols WHERE tenant_id = ? AND year = ?`).get(tenantId, year) as any;
  const seq = Number(row.n);
  const number = `PRT-${year}-${String(seq).padStart(5, '0')}`;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const priority = (PRIORITIES as readonly string[]).includes(data.priority) ? data.priority : 'media';
  const deadline = new Date(Date.now() + SLA_DAYS[priority] * 86_400_000).toISOString();
  const full: Record<string, any> = { ...data, priority, number, createdAt, deadline, status: 'novo' };
  delete full.timeline;
  delete full.id;
  await db.prepare(
    `INSERT INTO protocols (id, tenant_id, number, year, seq, source, status, theme, city, phone_last4, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?, ?, ?)`
  ).run(id, tenantId, number, year, seq, source, text(full.theme, 60), text(full.citizenCity, 120), digits(full.citizenPhone).slice(-4), JSON.stringify(full), createdAt);
  return { id, number };
}

// ---------------------------------------------------------------------------
// Alertas ao cidadão por e-mail (Resend) e WhatsApp (wacli) — enfileirados na mesma transação do evento.
// ---------------------------------------------------------------------------
type Notice = { kind: 'opened' } | { kind: 'status'; status: string } | { kind: 'response'; status: string; text: string };

async function notifyCitizen(tenantId: string, protocol: { number: string; data: Record<string, any> }, n: Notice) {
  const to = text(protocol.data.citizenEmail, 200);
  const phone = text(protocol.data.citizenPhone, 30);
  if (!to && !phone) return;
  const t = await db.prepare(`SELECT slug, name, parliamentarian FROM tenants WHERE id = ?`).get(tenantId) as any;
  if (!t) return;
  const cabinet = t.parliamentarian || t.name;
  const url = `${appUrl()}/site/${t.slug}?protocolo=${encodeURIComponent(protocol.number)}`;
  if (phone) await queueWhatsApp({ tenantId, phone, body: whatsappText(cabinet, url, protocol, n), kind: `protocol.${n.kind}`, ref: protocol.number });
  if (!to) return;
  const first = esc(String(protocol.data.citizenName ?? '').split(' ')[0] || 'cidadão(ã)');
  const num = `<strong style="font-family:monospace">${esc(protocol.number)}</strong>`;
  const summary = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
<tr><td style="padding:10px 14px;color:#64748b;width:110px">Protocolo</td><td style="padding:10px 14px;font-family:monospace;font-weight:bold;color:#102C45">${esc(protocol.number)}</td></tr>
<tr><td style="padding:0 14px 10px;color:#64748b">Assunto</td><td style="padding:0 14px 10px">${esc(protocol.data.subject)}</td></tr>
<tr><td style="padding:0 14px 10px;color:#64748b">Situação</td><td style="padding:0 14px 10px;font-weight:bold">${esc(STATUS_LABEL[n.kind === 'opened' ? 'novo' : n.status])}</td></tr></table>`;
  const footer = `Você recebe este e-mail porque informou este endereço ao abrir o protocolo ${esc(protocol.number)}. Para consultar, use o número do protocolo e os 4 últimos dígitos do telefone cadastrado. Dados tratados conforme a LGPD (Lei nº 13.709/2018). Não responda a este e-mail.`;

  let subject: string, title: string, intro: string, body = summary, plain: string;
  if (n.kind === 'opened') {
    subject = `Protocolo ${protocol.number} registrado`;
    title = 'Sua demanda foi registrada';
    intro = `Olá, ${first}. Recebemos sua solicitação com o número ${num}. A equipe do gabinete fará a triagem e você será avisado(a) por e-mail a cada atualização.`;
    plain = `Olá, ${protocol.data.citizenName}. Sua demanda foi registrada com o protocolo ${protocol.number}. Acompanhe em ${url}`;
  } else if (n.kind === 'status') {
    subject = `Protocolo ${protocol.number}: ${STATUS_LABEL[n.status]}`;
    title = 'Sua demanda foi atualizada';
    intro = `Olá, ${first}. O protocolo ${num} mudou para <strong>${esc(STATUS_LABEL[n.status])}</strong>.`;
    plain = `Olá, ${protocol.data.citizenName}. O protocolo ${protocol.number} mudou para: ${STATUS_LABEL[n.status]}. Acompanhe em ${url}`;
  } else {
    subject = `Protocolo ${protocol.number}: resposta do gabinete`;
    title = 'O gabinete respondeu sua demanda';
    intro = `Olá, ${first}. Há uma resposta para o protocolo ${num}:`;
    body = `<div style="font-size:14px;line-height:1.6;white-space:pre-line;border-left:3px solid #36B7A5;padding:4px 0 4px 12px;margin:0 0 16px">${esc(n.text)}</div>${summary}`;
    plain = `Olá, ${protocol.data.citizenName}. Resposta do gabinete para o protocolo ${protocol.number}:\n\n${n.text}\n\nAcompanhe em ${url}`;
  }
  await queueEmail({
    tenantId,
    to,
    subject,
    html: layout({ cabinet, title, intro, body, cta: { label: 'Acompanhar protocolo', url }, footer }),
    text: plain,
    kind: `protocol.${n.kind}`,
    ref: protocol.number,
  });
}

/** Texto do alerta no WhatsApp (*negrito* do WhatsApp; sem HTML). */
function whatsappText(cabinet: string, url: string, protocol: { number: string; data: Record<string, any> }, n: Notice) {
  const first = String(protocol.data.citizenName ?? '').trim().split(' ')[0] || 'cidadão(ã)';
  const head = `*${cabinet}* — Atendimento ao Cidadão`;
  const foot = `Acompanhe: ${url}\n(use o nº do protocolo e os 4 últimos dígitos do seu telefone)`;
  if (n.kind === 'opened') {
    return `${head}\n\nOlá, ${first}! Sua demanda foi registrada com o protocolo *${protocol.number}*.\nAssunto: ${text(protocol.data.subject, 200)}\n\nAvisaremos por aqui a cada atualização.\n\n${foot}`;
  }
  if (n.kind === 'status') {
    return `${head}\n\nOlá, ${first}! O protocolo *${protocol.number}* mudou para: *${STATUS_LABEL[n.status]}*.\n\n${foot}`;
  }
  return `${head}\n\nOlá, ${first}! Resposta do gabinete para o protocolo *${protocol.number}*:\n\n${n.text}\n\nSituação: *${STATUS_LABEL[n.status]}*\n\n${foot}`;
}

async function eventsFor(protocolId: string, who: 'team' | 'citizen') {
  const vis = who === 'team' ? `('internal','both')` : `('public','both')`;
  return await db
    .prepare(`SELECT * FROM protocol_events WHERE protocol_id = ? AND visibility IN ${vis} ORDER BY at, pos`)
    .all(protocolId) as any[];
}

async function toClient(row: any) {
  const data = JSON.parse(row.data);
  return {
    ...data,
    id: row.id,
    number: row.number,
    status: row.status,
    createdAt: data.createdAt ?? row.created_at,
    source: row.source,
    persisted: true,
    attachments: data.attachments ?? [],
    tags: data.tags ?? [],
    timeline: (await eventsFor(row.id, 'team')).map((e) => ({
      id: e.client_id ?? e.id,
      timestamp: new Date(e.at).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' }),
      author: e.author,
      role: e.role,
      action: e.action,
      description: e.description,
      badge: e.badge ?? undefined,
    })),
  };
}


// ---------------------------------------------------------------------------
// Equipe do gabinete — /api/tenant/protocols
// ---------------------------------------------------------------------------
export const tenantProtocolsRouter = express.Router();
const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });

function cleanBody(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Protocolo inválido.');
  const data = { ...body };
  delete data.timeline;
  delete data.persisted;
  delete data.source;
  if (JSON.stringify(data).length > MAX_DATA_BYTES) throw bad('Protocolo grande demais.');
  return data;
}

tenantProtocolsRouter.get('/', async (req, res) => {
  const rows = await db.prepare(`SELECT * FROM protocols WHERE tenant_id = ? ORDER BY created_at DESC`).all(tid(req));
  res.json(await Promise.all(rows.map(toClient)));
});

tenantProtocolsRouter.post('/', async (req, res) => {
  const data = cleanBody(req.body);
  if (!text(data.citizenName, 200) || !text(data.subject, 300)) throw bad('Informe o nome do cidadão e o assunto.');
  const created = await tx(async () => {
    const p = await insertProtocol(tid(req), 'interno', { ...data, tags: Array.isArray(data.tags) ? data.tags : [] });
    await addEvent(
      { id: p.id, tenantId: tid(req) },
      {
        action: 'Abertura de Protocolo Oficial',
        description: `Protocolo registrado pela equipe do gabinete via ${text(data.channelLabel || data.channel, 60)}.`,
        author: text(data.authorName, 120),
        role: text(data.authorRole, 120),
        visibility: 'both',
      }
    );
    await notifyCitizen(tid(req), { number: p.number, data }, { kind: 'opened' });
    return p;
  });
  kickEmailWorker();
  kickWhatsAppWorker();
  await audit({ ...actor(req), action: 'protocol.created', target: created.number });
  res.status(201).json(await toClient(await db.prepare(`SELECT * FROM protocols WHERE id = ?`).get(created.id)));
});

tenantProtocolsRouter.patch('/:id', async (req, res) => {
  const cur = await db.prepare(`SELECT * FROM protocols WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Protocolo não encontrado.');
  const incoming = cleanBody(req.body);
  const timeline: any[] = Array.isArray(req.body.timeline) ? req.body.timeline.slice(-500) : [];
  const prev = JSON.parse(cur.data);
  const status = (STATUSES as readonly string[]).includes(incoming.status) ? incoming.status : cur.status;
  // Immutable fields stay as the server created them.
  const next = { ...prev, ...incoming, id: undefined, number: cur.number, createdAt: prev.createdAt, status };

  await tx(async () => {
    await db.prepare(`UPDATE protocols SET status = ?, theme = ?, city = ?, phone_last4 = ?, data = ?, updated_at = datetime('now') WHERE id = ?`).run(
      status, text(next.theme, 60), text(next.citizenCity, 120), digits(next.citizenPhone).slice(-4), JSON.stringify(next), cur.id
    );
    const ref = { id: cur.id, tenantId: tid(req) };
    // Timeline is append-only: only events the server has not seen are stored.
    const known = new Set(
      (await db.prepare(`SELECT id, client_id FROM protocol_events WHERE protocol_id = ?`).all(cur.id) as any[]).flatMap((r) => [r.id, r.client_id])
    );
    for (const e of timeline) {
      const cid = text(e?.id, 100);
      if (!cid || known.has(cid) || !text(e?.action, 200)) continue;
      await addEvent(ref, { clientId: cid, action: e.action, description: e.description, author: e.author, role: e.role, badge: e.badge, visibility: 'internal' });
    }
    const responded = next.citizenFeedbackStatus === 'enviada_sucesso' && prev.citizenFeedbackStatus !== 'enviada_sucesso';
    if (status !== cur.status) {
      await addEvent(ref, { action: `Status: ${STATUS_LABEL[status]}`, description: '', visibility: 'public' });
    }
    if (responded) {
      await addEvent(ref, { action: 'Resposta do gabinete', description: text(next.citizenFeedbackText, 4000), visibility: 'public' });
    }
    // One e-mail per save: the response (which shows the current status) wins over a bare status change.
    const p = { number: cur.number, data: next };
    if (responded) await notifyCitizen(tid(req), p, { kind: 'response', status, text: text(next.citizenFeedbackText, 4000) });
    else if (status !== cur.status) await notifyCitizen(tid(req), p, { kind: 'status', status });
  });
  kickEmailWorker();
  kickWhatsAppWorker();
  if (status !== cur.status) await audit({ ...actor(req), action: 'protocol.status_changed', target: cur.number, details: { from: cur.status, to: status } });
  res.json(await toClient(await db.prepare(`SELECT * FROM protocols WHERE id = ?`).get(cur.id)));
});

// ---------------------------------------------------------------------------
// Site do parlamentar — /api/public (sem login)
// ---------------------------------------------------------------------------
export const publicRouter = express.Router();

const buckets = new Map<string, { n: number; reset: number }>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  if (++b.n > max) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}

async function siteTenant(slug: string) {
  const t = await db.prepare(`SELECT * FROM tenants WHERE slug = ? AND status = 'active'`).get(String(slug).toLowerCase()) as any;
  if (!t) throw new HttpError(404, 'Gabinete não encontrado.');
  return t;
}

publicRouter.get('/sites/:slug', async (req, res) => {
  const t = await siteTenant(req.params.slug);
  await ensureDemandThemes(t.id);
  const themes = (await db.prepare(`SELECT name FROM demand_themes WHERE tenant_id = ? ORDER BY lower(name)`).all(t.id) as any[]).map((r) => r.name);
  res.json({ name: t.name, parliamentarian: t.parliamentarian, house: t.house, state: t.state, themes });
});

publicRouter.post('/sites/:slug/protocols', async (req, res) => {
  const t = await siteTenant(req.params.slug);
  rateLimit(`web-open:${req.ip}`, 5, 60 * 60 * 1000);
  const b = req.body ?? {};
  // Honeypot: bots fill every field; people never see this one.
  if (text(b.website, 10)) return res.status(201).json({ number: 'PRT-0000-00000' });
  if (b.consent !== true) throw bad('É necessário autorizar o uso dos dados para o atendimento da demanda (LGPD).');
  const name = text(b.name, 200);
  const city = text(b.city, 120);
  const phone = text(b.phone, 30);
  const email = text(b.email, 200);
  const theme = text(b.theme, 60);
  const subject = text(b.subject, 300);
  const description = text(b.description, 8000);
  if (!name || !city || !subject || !description) throw bad('Preencha nome, município, assunto e detalhamento.');
  if (digits(phone).length < 10) throw bad('Informe um telefone com DDD.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('E-mail inválido.');
  await ensureDemandThemes(t.id);
  const canonTheme = (await db.prepare(`SELECT name FROM demand_themes WHERE tenant_id = ? AND name = ?`).get(t.id, theme) as any)?.name;
  if (!canonTheme) throw bad('Selecione um tema da lista.');

  const created = await tx(async () => {
    const p = await insertProtocol(t.id, 'web', {
      citizenName: name,
      citizenCity: city,
      citizenPhone: phone,
      citizenEmail: email,
      citizenCategory: 'Cidadão Geral',
      channel: 'web',
      channelLabel: WEB_CHANNEL_LABEL,
      theme: canonTheme,
      subject,
      description,
      priority: 'media',
      assigneeId: '',
      assigneeName: 'Pendente de atribuição',
      coordinatorId: '',
      coordinatorName: '',
      slaStatus: 'normal',
      hoursElapsedTotal: 0,
      hoursElapsedWithAssignee: 0,
      tags: [WEB_TAG, canonTheme, city],
      attachments: [],
      citizenFeedbackStatus: 'pendente',
      lgpdConsentAt: new Date().toISOString(),
    });
    await addEvent(
      { id: p.id, tenantId: t.id },
      {
        action: 'Demanda recebida pelo site',
        description: 'Protocolo aberto pelo cidadão no formulário do site do parlamentar. Aguardando triagem.',
        author: 'Portal do Cidadão',
        role: 'Site do Parlamentar',
        badge: WEB_TAG,
        visibility: 'both',
      }
    );
    await notifyCitizen(t.id, { number: p.number, data: { citizenName: name, citizenEmail: email, citizenPhone: phone, subject } }, { kind: 'opened' });
    return p;
  });
  kickEmailWorker();
  kickWhatsAppWorker();
  await audit({ tenantId: t.id, action: 'protocol.created_web', target: created.number, ip: req.ip });
  res.status(201).json({ number: created.number });
});

publicRouter.post('/sites/:slug/consulta', async (req, res) => {
  const t = await siteTenant(req.params.slug);
  const number = text(req.body?.number, 40).toUpperCase();
  const last4 = digits(req.body?.phoneLast4).slice(-4);
  rateLimit(`web-track-ip:${req.ip}`, 20, 15 * 60 * 1000);
  rateLimit(`web-track-num:${t.id}:${number}`, 10, 15 * 60 * 1000);
  const notFound = new HttpError(404, 'Protocolo não encontrado. Confira o número e os 4 últimos dígitos do telefone informado na abertura.');
  if (!number || last4.length !== 4) throw notFound;
  const row = await db.prepare(`SELECT * FROM protocols WHERE tenant_id = ? AND number = ?`).get(t.id, number) as any;
  if (!row || !row.phone_last4 || !crypto.timingSafeEqual(Buffer.from(row.phone_last4.padStart(4, '0')), Buffer.from(last4))) throw notFound;
  const data = JSON.parse(row.data);
  res.json({
    number: row.number,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] ?? row.status,
    theme: row.theme,
    city: row.city,
    subject: data.subject ?? '',
    createdAt: data.createdAt ?? row.created_at,
    events: (await eventsFor(row.id, 'citizen')).map((e) => ({ at: e.at, action: e.action, description: e.description })),
  });
});
