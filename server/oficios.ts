/**
 * Legislativo › Ofícios. Todo ofício salvo é publicado na Base de Conhecimento com a etiqueta "Ofícios"
 * (e removido de lá quando o ofício é excluído).
 * Montado em /api/tenant/oficios — sempre filtrado por req.auth.tenantId.
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import { db, tx, audit } from './db';
import { HttpError, bad } from './http';
import { upsertKnowledge, removeKnowledge } from './knowledge';

export const oficiosRouter = express.Router();

export const OFICIO_TAG = 'Ofícios';
const STATUSES = ['minuta', 'revisao_juridica', 'assinado_deputado', 'protocolado_orgao', 'respondido'];
const STATUS_LABEL: Record<string, string> = {
  minuta: 'Minuta',
  revisao_juridica: 'Em revisão jurídica',
  assinado_deputado: 'Assinado',
  protocolado_orgao: 'Protocolado no órgão',
  respondido: 'Respondido',
};

const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Valida e normaliza o ofício recebido do cliente. */
function parseLetter(b: any, current?: any) {
  const pick = (k: string, max: number) => (b?.[k] !== undefined ? txt(b[k], max) : (current?.[k] ?? ''));
  const letter = {
    code: pick('code', 60),
    subject: pick('subject', 500),
    recipientName: pick('recipientName', 200),
    recipientRole: pick('recipientRole', 200),
    recipientOrg: pick('recipientOrg', 200),
    cityTarget: pick('cityTarget', 120),
    date: pick('date', 10),
    status: pick('status', 30) || 'minuta',
    body: b?.body !== undefined ? String(b.body ?? '').slice(0, 50_000) : (current?.body ?? ''),
    deadlineResponseDays: b?.deadlineResponseDays !== undefined ? Math.max(0, Math.min(365, Number(b.deadlineResponseDays) || 0)) : current?.deadlineResponseDays,
    linkedProtocolId: pick('linkedProtocolId', 60),
    aiVerification: b?.aiVerification !== undefined ? b.aiVerification : current?.aiVerification,
  };
  if (!letter.code) throw bad('Informe o número do ofício.');
  if (!letter.subject) throw bad('Informe o assunto.');
  if (!letter.body.trim()) throw bad('O texto do ofício está vazio.');
  if (!STATUSES.includes(letter.status)) throw bad('Situação inválida.');
  if (letter.date && !/^\d{4}-\d{2}-\d{2}$/.test(letter.date)) throw bad('Data inválida.');
  if (letter.aiVerification !== undefined && (typeof letter.aiVerification !== 'object' || JSON.stringify(letter.aiVerification).length > 10_000)) {
    letter.aiVerification = undefined;
  }
  return letter;
}

async function publish(tenantId: string, id: string, l: ReturnType<typeof parseLetter>, userId: string) {
  await upsertKnowledge({
    tenantId,
    source: 'oficio',
    sourceId: id,
    title: `${l.code} · ${l.subject}`,
    summary: [l.recipientName, l.recipientRole, l.recipientOrg].filter(Boolean).join(' · '),
    content: l.body,
    tags: [OFICIO_TAG],
    meta: {
      code: l.code,
      date: l.date,
      status: l.status,
      statusLabel: STATUS_LABEL[l.status] ?? l.status,
      recipientName: l.recipientName,
      recipientRole: l.recipientRole,
      recipientOrg: l.recipientOrg,
      cityTarget: l.cityTarget,
      linkedProtocolId: l.linkedProtocolId,
    },
    userId,
  });
}

const mapRow = (r: any) => ({ id: r.id, ...JSON.parse(r.data), createdAt: r.created_at, updatedAt: r.updated_at });

oficiosRouter.get('/', async (req, res) => {
  const rows = (await db.prepare(`SELECT * FROM official_letters WHERE tenant_id = ? ORDER BY created_at DESC`).all(tid(req))) as any[];
  res.json(rows.map(mapRow));
});

oficiosRouter.post('/', async (req, res) => {
  const l = parseLetter(req.body);
  const id = crypto.randomUUID();
  await tx(async () => {
    await db
      .prepare(`INSERT INTO official_letters (id, tenant_id, code, subject, data, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, tid(req), l.code, l.subject, JSON.stringify(l), req.auth!.userId);
    await publish(tid(req), id, l, req.auth!.userId);
  });
  await audit({ ...actor(req), action: 'oficio.created', target: l.code });
  res.status(201).json(mapRow(await db.prepare(`SELECT * FROM official_letters WHERE id = ?`).get(id)));
});

oficiosRouter.patch('/:id', async (req, res) => {
  const row = (await db.prepare(`SELECT * FROM official_letters WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req))) as any;
  if (!row) throw new HttpError(404, 'Ofício não encontrado.');
  const l = parseLetter(req.body, JSON.parse(row.data));
  await tx(async () => {
    await db
      .prepare(`UPDATE official_letters SET code = ?, subject = ?, data = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(l.code, l.subject, JSON.stringify(l), row.id);
    await publish(tid(req), row.id, l, req.auth!.userId);
  });
  await audit({ ...actor(req), action: 'oficio.updated', target: l.code });
  res.json(mapRow(await db.prepare(`SELECT * FROM official_letters WHERE id = ?`).get(row.id)));
});

oficiosRouter.delete('/:id', async (req, res) => {
  const row = (await db.prepare(`SELECT * FROM official_letters WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req))) as any;
  if (!row) throw new HttpError(404, 'Ofício não encontrado.');
  await tx(async () => {
    await db.prepare(`DELETE FROM official_letters WHERE id = ?`).run(row.id);
    await removeKnowledge(tid(req), 'oficio', row.id);
  });
  await audit({ ...actor(req), action: 'oficio.deleted', target: row.code });
  res.json({ ok: true });
});
