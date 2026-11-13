/**
 * Comunicação › CRM: leads importados de planilha, distribuídos entre os usuários do gabinete,
 * contatados por WhatsApp e classificados pelo atendente.
 * Montado em /api/tenant/crm — toda consulta é filtrada por req.auth.tenantId (sessão no servidor).
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import ExcelJS from 'exceljs';
import { db, tx, audit } from './db';
import { HttpError, bad } from './http';
import { readBody, readSheet, fileNameHeader } from './banco';
import { sendWhatsAppText, toWaPhone } from './whatsapp';

export const crmRouter = express.Router();

/** Quem importa, distribui, reatribui e exclui leads (e vê os leads de todos). */
const CRM_MANAGER_ROLES = ['deputado', 'chefe_gabinete', 'coordenador_atendimento', 'comunicacao'];
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 20_000;
const PAGE = 100;

export const LEAD_STATUSES = ['novo', 'contatado', 'interessado', 'retornar', 'sem_resposta', 'sem_interesse', 'numero_invalido', 'convertido'] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];
/** Situações que encerram o atendimento (não contam como carga aberta na distribuição). */
const CLOSED: LeadStatus[] = ['sem_interesse', 'numero_invalido', 'convertido'];

const tid = (req: Request) => req.auth!.tenantId!;
const uid = (req: Request) => req.auth!.userId;
const actor = (req: Request) => ({ actorId: uid(req), actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
const canManage = (req: Request) => CRM_MANAGER_ROLES.includes(req.auth!.role);
function requireManager(req: Request) {
  if (!canManage(req)) throw new HttpError(403, 'Apenas Parlamentar, Chefe de Gabinete, Coordenação ou Comunicação podem executar esta ação.');
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
/** Telefone salvo só com dígitos; remove o 55 do Brasil para comparar duplicados. */
const normPhone = (raw: unknown) => {
  let d = digits(raw);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 15);
};

/** Mesmo evento para muitos leads de uma vez (atribuições em massa). */
async function logEvents(tenantId: string, leadIds: string[], userId: string | null, kind: string, detail = '') {
  if (!leadIds.length) return;
  await db
    .prepare(
      `INSERT INTO crm_lead_events (id, tenant_id, lead_id, user_id, kind, detail)
       SELECT gen_random_uuid()::text, ?, x, ?, ?, ? FROM unnest(?::text[]) AS x`
    )
    .run(tenantId, userId, kind, detail, leadIds);
}

async function logEvent(tenantId: string, leadId: string, userId: string | null, kind: string, detail = '') {
  await db
    .prepare(`INSERT INTO crm_lead_events (id, tenant_id, lead_id, user_id, kind, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), tenantId, leadId, userId, kind, detail.slice(0, 1000));
}

/** Lead do gabinete que o usuário pode operar (o próprio, ou qualquer um se for gestor). */
async function loadLead(req: Request, id: string) {
  const lead = (await db.prepare(`SELECT * FROM crm_leads WHERE id = ? AND tenant_id = ?`).get(id, tid(req))) as any;
  if (!lead) throw new HttpError(404, 'Lead não encontrado.');
  if (!canManage(req) && lead.assigned_to !== uid(req)) throw new HttpError(403, 'Este lead está direcionado a outro usuário.');
  return lead;
}

async function activeUserIds(tenantId: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const want = [...new Set(ids.map(String))].slice(0, 200);
  if (!want.length) return [];
  const rows = (await db
    .prepare(`SELECT id FROM users WHERE tenant_id = ? AND status = 'active' AND id = ANY(?::text[])`)
    .all(tenantId, want)) as any[];
  const ok = new Set(rows.map((r) => r.id));
  const missing = want.filter((i) => !ok.has(i));
  if (missing.length) throw bad('Algum usuário selecionado não existe ou está desativado.');
  return want;
}

/**
 * Distribui os leads informados entre os usuários de forma equilibrada:
 * cada lead vai para quem tem menos leads em aberto naquele momento.
 */
async function distribute(tenantId: string, leadIds: string[], userIds: string[], byUserId: string) {
  if (!leadIds.length || !userIds.length) return new Map<string, number>();
  const loads = (await db
    .prepare(
      `SELECT assigned_to AS id, COUNT(*)::int AS n FROM crm_leads
        WHERE tenant_id = ? AND assigned_to = ANY(?::text[]) AND status <> ALL(?::text[]) AND id <> ALL(?::text[])
        GROUP BY assigned_to`
    )
    .all(tenantId, userIds, CLOSED, leadIds)) as any[];
  const load = new Map(userIds.map((u) => [u, 0]));
  for (const r of loads) load.set(r.id, r.n);
  const order = new Map(userIds.map((u, i) => [u, i]));
  const plan = new Map<string, string[]>();
  for (const leadId of leadIds) {
    let best = userIds[0]!;
    for (const u of userIds) {
      const d = load.get(u)! - load.get(best)!;
      if (d < 0 || (d === 0 && order.get(u)! < order.get(best)!)) best = u;
    }
    load.set(best, load.get(best)! + 1);
    plan.set(best, [...(plan.get(best) ?? []), leadId]);
  }
  const summary = new Map<string, number>();
  for (const [userId, ids] of plan) {
    await db
      .prepare(`UPDATE crm_leads SET assigned_to = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE tenant_id = ? AND id = ANY(?::text[])`)
      .run(userId, tenantId, ids);
    await logEvents(tenantId, ids, byUserId, 'atribuido', userId);
    summary.set(userId, ids.length);
  }
  return summary;
}

function mapLead(r: any) {
  return {
    id: r.id,
    importId: r.import_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    waPhone: toWaPhone(r.phone),
    city: r.city,
    notes: r.notes,
    agentNotes: r.agent_notes,
    status: r.status as LeadStatus,
    statusAt: r.status_at,
    assignedTo: r.assigned_to,
    assignedName: r.assigned_name ?? null,
    assignedAt: r.assigned_at,
    lastContactAt: r.last_contact_at,
    contactCount: r.contact_count,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Visão geral: permissões, usuários com carga, importações
// ---------------------------------------------------------------------------
crmRouter.get('/meta', async (req, res) => {
  const t = tid(req);
  const users = (await db
    .prepare(
      `SELECT u.id, u.name, u.role,
              COUNT(l.id)::int AS total,
              COUNT(l.id) FILTER (WHERE l.status <> ALL(?::text[]))::int AS open
         FROM users u LEFT JOIN crm_leads l ON l.assigned_to = u.id AND l.tenant_id = u.tenant_id
        WHERE u.tenant_id = ? AND u.status = 'active'
        GROUP BY u.id ORDER BY u.name`
    )
    .all(CLOSED, t)) as any[];
  const imports = canManage(req)
    ? ((await db
        .prepare(
          `SELECT i.id, i.name, i.file_name, i.total, i.created_at, u.name AS created_by_name,
                  (SELECT COUNT(*)::int FROM crm_leads l WHERE l.import_id = i.id) AS remaining
             FROM crm_imports i LEFT JOIN users u ON u.id = i.created_by
            WHERE i.tenant_id = ? ORDER BY i.created_at DESC LIMIT 100`
        )
        .all(t)) as any[])
    : [];
  const unassigned = (await db.prepare(`SELECT COUNT(*)::int AS n FROM crm_leads WHERE tenant_id = ? AND assigned_to IS NULL`).get(t)) as any;
  res.json({
    canManage: canManage(req),
    me: uid(req),
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role, total: u.total, open: u.open })),
    unassigned: unassigned.n,
    imports: imports.map((i) => ({
      id: i.id,
      name: i.name,
      fileName: i.file_name,
      total: i.total,
      remaining: i.remaining,
      createdAt: i.created_at,
      createdBy: i.created_by_name ?? '',
    })),
  });
});

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------
crmRouter.get('/leads', async (req, res) => {
  const t = tid(req);
  const scope = req.query.scope === 'all' && canManage(req) ? 'all' : 'mine';
  const where: string[] = ['l.tenant_id = ?'];
  const params: unknown[] = [t];
  if (scope === 'mine') {
    where.push('l.assigned_to = ?');
    params.push(uid(req));
  } else if (req.query.assignee === 'none') {
    where.push('l.assigned_to IS NULL');
  } else if (req.query.assignee) {
    where.push('l.assigned_to = ?');
    params.push(String(req.query.assignee));
  }
  if (req.query.importId) {
    where.push('l.import_id = ?');
    params.push(String(req.query.importId));
  }
  const q = clean(req.query.q, 100);
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    const qd = digits(q);
    where.push(`(lower(l.name) LIKE ? OR lower(l.email) LIKE ? OR lower(l.city) LIKE ?${qd.length >= 3 ? ' OR l.phone LIKE ?' : ''})`);
    params.push(like, like, like, ...(qd.length >= 3 ? [`%${qd}%`] : []));
  }
  // Contagem por situação respeita os demais filtros (para os chips de filtro).
  const counts = (await db
    .prepare(`SELECT l.status, COUNT(*)::int AS n FROM crm_leads l WHERE ${where.join(' AND ')} GROUP BY l.status`)
    .all(...params)) as any[];
  const status = String(req.query.status ?? '');
  if (status === 'abertos') {
    where.push('l.status <> ALL(?::text[])');
    params.push(CLOSED);
  } else if ((LEAD_STATUSES as readonly string[]).includes(status)) {
    where.push('l.status = ?');
    params.push(status);
  }
  const page = Math.max(0, Number(req.query.page) || 0);
  const total = (await db.prepare(`SELECT COUNT(*)::int AS n FROM crm_leads l WHERE ${where.join(' AND ')}`).get(...params)) as any;
  const rows = (await db
    .prepare(
      `SELECT l.*, u.name AS assigned_name FROM crm_leads l LEFT JOIN users u ON u.id = l.assigned_to
        WHERE ${where.join(' AND ')}
        ORDER BY CASE l.status WHEN 'novo' THEN 0 WHEN 'retornar' THEN 1 WHEN 'interessado' THEN 2 WHEN 'contatado' THEN 3 WHEN 'sem_resposta' THEN 4 ELSE 5 END,
                 l.created_at DESC, l.name
        LIMIT ${PAGE} OFFSET ${page * PAGE}`
    )
    .all(...params)) as any[];
  res.json({
    scope,
    total: total.n,
    page,
    pageSize: PAGE,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    items: rows.map(mapLead),
  });
});

crmRouter.get('/leads/:id/events', async (req, res) => {
  const lead = await loadLead(req, req.params.id!);
  const rows = (await db
    .prepare(
      `SELECT e.kind, e.detail, e.created_at, u.name AS user_name, a.name AS target_name
         FROM crm_lead_events e
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN users a ON e.kind = 'atribuido' AND a.id = e.detail
        WHERE e.lead_id = ? AND e.tenant_id = ? ORDER BY e.created_at DESC LIMIT 100`
    )
    .all(lead.id, tid(req))) as any[];
  res.json(
    rows.map((r) => ({
      kind: r.kind,
      detail: r.kind === 'atribuido' ? (r.target_name ?? 'usuário removido') : r.detail,
      at: r.created_at,
      user: r.user_name ?? '',
    }))
  );
});

// ---------------------------------------------------------------------------
// Atendimento: classificação, anotação e contato por WhatsApp
// ---------------------------------------------------------------------------
crmRouter.patch('/leads/:id', async (req, res) => {
  const lead = await loadLead(req, req.params.id!);
  const t = tid(req);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (req.body?.status !== undefined) {
    const s = String(req.body.status);
    if (!(LEAD_STATUSES as readonly string[]).includes(s)) throw bad('Classificação inválida.');
    if (s !== lead.status) {
      sets.push(`status = ?`, `status_at = datetime('now')`, `status_by = ?`);
      params.push(s, uid(req));
      await logEvent(t, lead.id, uid(req), 'classificado', s);
    }
  }
  if (req.body?.agentNotes !== undefined) {
    const n = String(req.body.agentNotes ?? '').trim().slice(0, 4000);
    if (n !== lead.agent_notes) {
      sets.push(`agent_notes = ?`);
      params.push(n);
      await logEvent(t, lead.id, uid(req), 'anotacao', n.slice(0, 200));
    }
  }
  if (canManage(req)) {
    for (const [key, col, max] of [
      ['name', 'name', 200],
      ['email', 'email', 200],
      ['city', 'city', 120],
      ['notes', 'notes', 2000],
    ] as const) {
      if (req.body?.[key] !== undefined) {
        const v = clean(req.body[key], max);
        if (key === 'name' && !v) throw bad('Informe o nome.');
        if (key === 'email' && v && !isEmail(v)) throw bad('E-mail inválido.');
        sets.push(`${col} = ?`);
        params.push(key === 'email' ? v.toLowerCase() : v);
      }
    }
    if (req.body?.phone !== undefined) {
      sets.push(`phone = ?`);
      params.push(normPhone(req.body.phone));
    }
  }
  if (sets.length) {
    await db.prepare(`UPDATE crm_leads SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(...params, lead.id, t);
  }
  const row = await db
    .prepare(`SELECT l.*, u.name AS assigned_name FROM crm_leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE l.id = ?`)
    .get(lead.id);
  res.json(mapLead(row));
});

async function markContacted(req: Request, lead: any, via: string, text: string) {
  await db
    .prepare(
      `UPDATE crm_leads SET contact_count = contact_count + 1, last_contact_at = datetime('now'), updated_at = datetime('now'),
              status = CASE WHEN status = 'novo' THEN 'contatado' ELSE status END,
              status_at = CASE WHEN status = 'novo' THEN datetime('now') ELSE status_at END,
              status_by = CASE WHEN status = 'novo' THEN ? ELSE status_by END
        WHERE id = ? AND tenant_id = ?`
    )
    .run(uid(req), lead.id, tid(req));
  await logEvent(tid(req), lead.id, uid(req), via === 'gabinete' ? 'whatsapp_gabinete' : 'whatsapp_link', text.slice(0, 500));
  const row = await db
    .prepare(`SELECT l.*, u.name AS assigned_name FROM crm_leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE l.id = ?`)
    .get(lead.id);
  return mapLead(row);
}

/** Envia a mensagem pelo número do gabinete conectado em Canais & Integrações. */
crmRouter.post('/leads/:id/whatsapp', async (req, res) => {
  const lead = await loadLead(req, req.params.id!);
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw bad('Digite a mensagem.');
  if (text.length > 4000) throw bad('Mensagem longa demais (máx. 4.000 caracteres).');
  if (!toWaPhone(lead.phone)) throw bad('Este lead não tem um celular válido com DDD.');
  const sent = await sendWhatsAppText(tid(req), lead.phone, text);
  res.json({ lead: await markContacted(req, lead, 'gabinete', text), warning: sent.warning });
});

/** Registra o contato feito pelo WhatsApp do próprio usuário (link wa.me). */
crmRouter.post('/leads/:id/contacted', async (req, res) => {
  const lead = await loadLead(req, req.params.id!);
  res.json({ lead: await markContacted(req, lead, 'link', String(req.body?.text ?? '')) });
});

// ---------------------------------------------------------------------------
// Gestão: atribuição, distribuição e exclusão
// ---------------------------------------------------------------------------
const leadIdList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String))].slice(0, 20_000) : []);

crmRouter.post('/assign', async (req, res) => {
  requireManager(req);
  const t = tid(req);
  const ids = leadIdList(req.body?.leadIds);
  if (!ids.length) throw bad('Selecione ao menos um lead.');
  const userId = req.body?.userId ? (await activeUserIds(t, [req.body.userId]))[0]! : null;
  const r = await tx(async () => {
    const out = await db
      .prepare(
        `UPDATE crm_leads SET assigned_to = ?, assigned_at = CASE WHEN ?::text IS NULL THEN NULL ELSE datetime('now') END, updated_at = datetime('now')
          WHERE tenant_id = ? AND id = ANY(?::text[])`
      )
      .run(userId, userId, t, ids);
    const valid = ((await db.prepare(`SELECT id FROM crm_leads WHERE tenant_id = ? AND id = ANY(?::text[])`).all(t, ids)) as any[]).map((x) => x.id);
    await logEvents(t, valid, uid(req), userId ? 'atribuido' : 'desatribuido', userId ?? '');
    return out;
  });
  await audit({ ...actor(req), action: 'crm.leads_assigned', details: { count: r.changes, userId } });
  res.json({ updated: r.changes });
});

crmRouter.post('/distribute', async (req, res) => {
  requireManager(req);
  const t = tid(req);
  const userIds = await activeUserIds(t, req.body?.userIds);
  if (!userIds.length) throw bad('Selecione ao menos um usuário para receber os leads.');
  let ids = leadIdList(req.body?.leadIds);
  if (!ids.length && req.body?.scope === 'unassigned') {
    ids = ((await db.prepare(`SELECT id FROM crm_leads WHERE tenant_id = ? AND assigned_to IS NULL ORDER BY created_at, name`).all(t)) as any[]).map(
      (r) => r.id
    );
  } else if (ids.length) {
    // Só leads deste gabinete.
    ids = ((await db.prepare(`SELECT id FROM crm_leads WHERE tenant_id = ? AND id = ANY(?::text[]) ORDER BY created_at, name`).all(t, ids)) as any[]).map(
      (r) => r.id
    );
  }
  if (!ids.length) throw bad('Não há leads para distribuir.');
  const summary = await tx(() => distribute(t, ids, userIds, uid(req)));
  await audit({ ...actor(req), action: 'crm.leads_distributed', details: { count: ids.length, users: userIds.length } });
  res.json({ distributed: ids.length, perUser: Object.fromEntries(summary) });
});

crmRouter.post('/leads/delete', async (req, res) => {
  requireManager(req);
  const ids = leadIdList(req.body?.leadIds);
  if (!ids.length) throw bad('Selecione ao menos um lead.');
  const r = await db.prepare(`DELETE FROM crm_leads WHERE tenant_id = ? AND id = ANY(?::text[])`).run(tid(req), ids);
  await audit({ ...actor(req), action: 'crm.leads_deleted', details: { count: r.changes } });
  res.json({ deleted: r.changes });
});

crmRouter.delete('/imports/:id', async (req, res) => {
  requireManager(req);
  const t = tid(req);
  const imp = (await db.prepare(`SELECT * FROM crm_imports WHERE id = ? AND tenant_id = ?`).get(req.params.id, t)) as any;
  if (!imp) throw new HttpError(404, 'Importação não encontrada.');
  const r = await tx(async () => {
    const del = await db.prepare(`DELETE FROM crm_leads WHERE tenant_id = ? AND import_id = ?`).run(t, imp.id);
    await db.prepare(`DELETE FROM crm_imports WHERE id = ?`).run(imp.id);
    return del;
  });
  await audit({ ...actor(req), action: 'crm.import_deleted', target: imp.name, details: { leads: r.changes } });
  res.json({ deleted: r.changes });
});

// ---------------------------------------------------------------------------
// Importação de planilha
// ---------------------------------------------------------------------------
const COLUMNS = [
  { header: 'Nome', key: 'name', width: 32, hint: 'Obrigatório.' },
  { header: 'E-mail', key: 'email', width: 32, hint: 'Opcional.' },
  { header: 'Telefone', key: 'phone', width: 20, hint: 'Celular com DDD (usado no WhatsApp). Ex.: (65) 99999-0000.' },
  { header: 'Cidade', key: 'city', width: 24, hint: 'Opcional.' },
  { header: 'Obs', key: 'notes', width: 44, hint: 'Opcional. Origem do lead, interesse, evento...' },
] as const;
type Key = (typeof COLUMNS)[number]['key'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, Key> = {
  nome: 'name', nomecompleto: 'name', lead: 'name', contato: 'name',
  email: 'email', mail: 'email', emailpessoal: 'email',
  telefone: 'phone', fone: 'phone', celular: 'phone', whatsapp: 'phone', whats: 'phone', zap: 'phone', telefonewhatsapp: 'phone',
  cidade: 'city', municipio: 'city', localidade: 'city',
  obs: 'notes', observacao: 'notes', observacoes: 'notes', notas: 'notes', anotacoes: 'notes', comentario: 'notes',
};

crmRouter.get('/template', async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Parlamentta';
  const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102C45' } };
  head.height = 22;
  COLUMNS.forEach((c, i) => (head.getCell(i + 1).note = c.hint));
  ws.addRow({
    name: 'EXEMPLO - João Pereira (linhas iniciadas por EXEMPLO são ignoradas)',
    email: 'joao.pereira@exemplo.com.br',
    phone: '(65) 99999-0000',
    city: 'Cuiabá',
    notes: 'Cadastro no evento de 10/11',
  }).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.getColumn(3).numFmt = '@';
  const help = wb.addWorksheet('Instruções');
  help.columns = [{ width: 16 }, { width: 90 }];
  help.addRow(['Planilha modelo de importação de leads — Parlamentta CRM']).font = { bold: true, size: 14, color: { argb: 'FF102C45' } };
  help.addRow([]);
  for (const c of COLUMNS) help.addRow([c.header, c.hint]);
  help.addRow([]);
  [
    '• Preencha a aba "Leads" a partir da linha 2. Não altere os nomes das colunas.',
    '• Cada lead precisa de Nome e de Telefone ou E-mail. Para enviar WhatsApp, o telefone deve ser celular com DDD.',
    '• Leads já cadastrados no CRM (mesmo telefone ou e-mail) são apontados na prévia e podem ser ignorados.',
    '• Também é aceito arquivo .csv (separado por ponto e vírgula ou vírgula, UTF-8).',
  ].forEach((t) => help.addRow([t]));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="parlamentta-modelo-leads-crm.xlsx"');
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

interface ParsedLead {
  line: number;
  name: string;
  email: string;
  phone: string;
  city: string;
  notes: string;
  duplicate: boolean;
}
/** Prévia guardada em memória até a confirmação (o arquivo não é salvo). */
const pending = new Map<string, { tenantId: string; userId: string; fileName: string; leads: ParsedLead[]; expires: number }>();
const PENDING_TTL = 30 * 60_000;
function sweep() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
}

crmRouter.post('/import/preview', async (req, res) => {
  requireManager(req);
  sweep();
  const t = tid(req);
  const fileName = fileNameHeader(req) || 'planilha.xlsx';
  const buf = await readBody(req, MAX_IMPORT_BYTES);
  if (!buf.length) throw bad('Arquivo vazio.');
  const rows = await readSheet(buf, fileName);
  if (rows.length < 2) throw bad('A planilha não tem linhas de dados.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw bad(`A planilha tem mais de ${MAX_IMPORT_ROWS.toLocaleString('pt-BR')} linhas. Divida em arquivos menores.`);

  const header = rows[0]!.map((h) => norm(String(h ?? '')));
  const colOf = new Map<Key, number>();
  header.forEach((h, i) => {
    const k = ALIASES[h];
    if (k && !colOf.has(k)) colOf.set(k, i);
  });
  if (!colOf.has('name')) throw bad('Coluna "Nome" não encontrada. Use a planilha modelo.');
  if (!colOf.has('phone') && !colOf.has('email')) throw bad('A planilha precisa de uma coluna "Telefone" ou "E-mail".');
  const ignored = rows[0]!.map((h, i) => ({ h: String(h ?? '').trim(), i })).filter((x) => x.h && ![...colOf.values()].includes(x.i)).map((x) => x.h);

  const get = (r: unknown[], k: Key) => {
    const i = colOf.get(k);
    if (i === undefined) return '';
    const v = r[i];
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
  };

  // Telefones e e-mails já existentes no CRM do gabinete.
  const existing = (await db.prepare(`SELECT phone, email FROM crm_leads WHERE tenant_id = ?`).all(t)) as any[];
  const seenPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
  const seenEmails = new Set(existing.map((e) => e.email).filter(Boolean));
  const inFilePhones = new Set<string>();
  const inFileEmails = new Set<string>();

  const leads: ParsedLead[] = [];
  const errors: { line: number; name: string; reason: string }[] = [];
  let skippedExamples = 0;
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    if (r.every((v) => String(v ?? '').trim() === '')) return;
    const name = clean(get(r, 'name'), 200);
    if (/^exemplo\b/i.test(name)) {
      skippedExamples++;
      return;
    }
    const email = clean(get(r, 'email'), 200).toLowerCase();
    const phone = normPhone(get(r, 'phone'));
    const city = clean(get(r, 'city'), 120);
    const notes = clean(get(r, 'notes'), 2000);
    if (!name) return errors.push({ line, name: '', reason: 'Nome em branco.' });
    if (email && !isEmail(email)) return errors.push({ line, name, reason: `E-mail inválido: ${email}` });
    if (phone && (phone.length < 10 || phone.length > 13)) return errors.push({ line, name, reason: `Telefone inválido: ${get(r, 'phone')}` });
    if (!phone && !email) return errors.push({ line, name, reason: 'Sem telefone e sem e-mail.' });
    if ((phone && inFilePhones.has(phone)) || (email && inFileEmails.has(email))) {
      return errors.push({ line, name, reason: 'Repetido na própria planilha.' });
    }
    if (phone) inFilePhones.add(phone);
    if (email) inFileEmails.add(email);
    const duplicate = Boolean((phone && seenPhones.has(phone)) || (email && seenEmails.has(email)));
    leads.push({ line, name, email, phone, city, notes, duplicate });
  });
  if (!leads.length && !errors.length) throw bad('Nenhum lead encontrado na planilha.');

  const token = crypto.randomUUID();
  pending.set(token, { tenantId: t, userId: uid(req), fileName, leads, expires: Date.now() + PENDING_TTL });
  res.json({
    token,
    fileName,
    valid: leads.length,
    duplicates: leads.filter((l) => l.duplicate).length,
    withoutWhatsApp: leads.filter((l) => !toWaPhone(l.phone)).length,
    skippedExamples,
    ignoredColumns: ignored,
    errors: errors.slice(0, 200),
    errorCount: errors.length,
    sample: leads.slice(0, 15),
  });
});

crmRouter.post('/import/:token/confirm', async (req, res) => {
  requireManager(req);
  const t = tid(req);
  const p = pending.get(String(req.params.token));
  if (!p || p.tenantId !== t || p.expires < Date.now()) throw bad('A prévia expirou. Envie a planilha novamente.');
  const userIds = await activeUserIds(t, req.body?.userIds);
  const skipDuplicates = req.body?.skipDuplicates !== false;
  const leads = p.leads.filter((l) => !(skipDuplicates && l.duplicate));
  if (!leads.length) throw bad('Nenhum lead novo para importar (todos já existem no CRM).');
  const name = clean(req.body?.name, 120) || p.fileName.replace(/\.(xlsx|csv)$/i, '');

  const result = await tx(async () => {
    const importId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO crm_imports (id, tenant_id, name, file_name, total, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(importId, t, name, p.fileName, leads.length, uid(req));
    const ids: string[] = [];
    // Inserção em lotes (um INSERT por 500 linhas).
    for (let i = 0; i < leads.length; i += 500) {
      const chunk = leads.slice(i, i + 500);
      const values: unknown[] = [];
      const ph = chunk.map((l) => {
        const id = crypto.randomUUID();
        ids.push(id);
        values.push(id, t, importId, l.name, l.email, l.phone, l.city, l.notes);
        return '(?, ?, ?, ?, ?, ?, ?, ?)';
      });
      await db.prepare(`INSERT INTO crm_leads (id, tenant_id, import_id, name, email, phone, city, notes) VALUES ${ph.join(', ')}`).run(...values);
    }
    const perUser = userIds.length ? await distribute(t, ids, userIds, uid(req)) : new Map();
    return { importId, imported: ids.length, perUser: Object.fromEntries(perUser) };
  });
  pending.delete(String(req.params.token));
  await audit({ ...actor(req), action: 'crm.import', target: name, details: { imported: result.imported, users: userIds.length } });
  res.json(result);
});
