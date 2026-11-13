/**
 * "Banco de Dados" section: Contatos, Importação de planilhas e Discursos.
 * Mounted under /api/tenant/db — every query is filtered by req.auth.tenantId,
 * which comes from the server-side session, never from the client.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { db, tx, audit, tenantStorageBytes, DATA_DIR } from './db';
import { HttpError, bad } from './http';
import { taxonomyRouter, categoryMap, tagMap, resolveTaxonomy, createCategoryIfMissing, createTagIfMissing } from './taxonomy';
import { THEMES, OCCASIONS, keywordThemes, aiAvailable, extractTextWithAI, classifyWithAI } from './ai';

export const bancoRouter = express.Router();
bancoRouter.use(taxonomyRouter);
const tkey = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

const MANAGER_ROLES = ['deputado', 'chefe_gabinete', 'coordenador_atendimento'];
const MAX_SPEECH_BYTES = Number(process.env.MAX_SPEECH_UPLOAD_MB || 1024) * 1024 * 1024;
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_ROWS = 50_000;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const ah =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });

function requireManager(req: Request) {
  if (!MANAGER_ROLES.includes(req.auth!.role)) {
    throw new HttpError(403, 'Apenas Parlamentar, Chefe de Gabinete ou Coordenação podem executar esta ação.');
  }
}

async function assertQuota(tenantId: string, extraBytes: number) {
  const t = await db.prepare(`SELECT storage_quota_mb FROM tenants WHERE id = ?`).get(tenantId) as any;
  const used = (await tenantStorageBytes()).get(tenantId) ?? 0;
  if (used + extraBytes > t.storage_quota_mb * 1024 * 1024) {
    throw new HttpError(413, 'Cota de armazenamento do gabinete esgotada. Solicite ampliação ao administrador da plataforma.');
  }
}

/** Reads a small raw request body into memory, with a hard size limit. */
function readBody(req: Request, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `Arquivo maior que ${Math.round(limit / 1024 / 1024)} MB.`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Streams a (possibly large) raw request body to disk with a size limit. */
export function streamToFile(req: Request, dest: string, limit: number): Promise<number> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(dest, { flags: 'wx', mode: 0o600 });
    let size = 0;
    let failed = false;
    const fail = (e: Error) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.rm(dest, { force: true }, () => reject(e));
    };
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        fail(new HttpError(413, `Arquivo maior que ${Math.round(limit / 1024 / 1024)} MB.`));
        req.destroy();
      }
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => !failed && resolve(size));
    req.pipe(out);
  });
}

export const fileNameHeader = (req: Request) => {
  try {
    return path.basename(decodeURIComponent(String(req.headers['x-file-name'] ?? ''))).slice(0, 200);
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------------------
// contact normalization (shared by manual CRUD and imports)
// ---------------------------------------------------------------------------
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const GENDERS = ['Masculino', 'Feminino', 'Não Quis Se Identificar'];
/** Maps common spellings (M/F, masc., "não informado"...) to the fixed list; '' if empty, null if unrecognized. */
function normGender(v: string): string | null {
  const k = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return '';
  if (['m', 'masc', 'masculino', 'homem'].includes(k)) return 'Masculino';
  if (['f', 'fem', 'feminino', 'mulher'].includes(k)) return 'Feminino';
  if (k.startsWith('naoquis') || k.startsWith('naoinform') || k.startsWith('prefironao') || ['ni', 'naoidentificado', 'outro', 'naodeclarado'].includes(k))
    return 'Não Quis Se Identificar';
  return null;
}
const onlyDigits = (s: string) => s.replace(/\D/g, '');
function normPhone(v: string): string {
  let d = onlyDigits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
function normDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return 'invalid';
}
const yes = (v: unknown) => /^(s|sim|y|yes|1|true|x|verdadeiro)$/i.test(String(v ?? '').trim());
const splitTags = (v: unknown): string[] =>
  String(v ?? '')
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 40));
const uniq = (a: string[]) => [...new Map(a.map((x) => [x.toLowerCase(), x])).values()];

type ContactInput = {
  name: string; phone: string; whatsapp: string; email: string; birth_date: string; gender: string;
  street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zip: string;
  category: string; organization: string; tags: string[]; notes: string; consent_whatsapp: number; consent_email: number;
};
const TEXT_FIELDS: (keyof ContactInput)[] = ['name','phone','whatsapp','email','birth_date','gender','street','number','complement','neighborhood','city','state','zip','category','organization','notes'];

/** Validates & normalizes; returns errors instead of throwing so imports can report per row. */
function normalizeContact(raw: Record<string, unknown>): { value: ContactInput; errors: string[] } {
  const s = (k: string, max = 200) => String(raw[k] ?? '').trim().slice(0, max);
  const errors: string[] = [];
  const value: ContactInput = {
    name: s('name', 160),
    phone: normPhone(s('phone', 40)),
    whatsapp: normPhone(s('whatsapp', 40)),
    email: s('email', 254).toLowerCase(),
    birth_date: normDate(raw.birth_date),
    gender: normGender(s('gender', 40)) ?? 'invalid',
    street: s('street'),
    number: s('number', 20),
    complement: s('complement', 80),
    neighborhood: s('neighborhood', 100),
    city: s('city', 100),
    state: s('state', 2).toUpperCase(),
    zip: onlyDigits(s('zip', 20)),
    category: s('category', 60),
    organization: s('organization', 120),
    tags: uniq(Array.isArray(raw.tags) ? (raw.tags as unknown[]).map(String).map((t) => t.trim().slice(0, 40)).filter(Boolean) : splitTags(raw.tags)).slice(0, 30),
    notes: s('notes', 2000),
    consent_whatsapp: raw.consent_whatsapp === true || yes(raw.consent_whatsapp) ? 1 : 0,
    consent_email: raw.consent_email === true || yes(raw.consent_email) ? 1 : 0,
  };
  if (!value.whatsapp && value.phone.length === 11 && value.phone[2] === '9') value.whatsapp = value.phone;
  if (!value.name) errors.push('Nome obrigatório');
  if (!value.phone && !value.whatsapp && !value.email) errors.push('Informe ao menos telefone, WhatsApp ou e-mail');
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.push('E-mail inválido');
  if (value.phone && (value.phone.length < 10 || value.phone.length > 11)) errors.push('Telefone deve ter DDD + número');
  if (value.whatsapp && (value.whatsapp.length < 10 || value.whatsapp.length > 11)) errors.push('WhatsApp deve ter DDD + número');
  if (value.zip && value.zip.length !== 8) errors.push('CEP deve ter 8 dígitos');
  if (value.state && !UFS.includes(value.state)) errors.push('UF inválida');
  if (value.gender === 'invalid') {
    errors.push('Gênero inválido (use Masculino, Feminino ou Não Quis Se Identificar)');
    value.gender = '';
  }
  if (value.birth_date === 'invalid') {
    errors.push('Data de nascimento inválida (use DD/MM/AAAA)');
    value.birth_date = '';
  }
  return { value, errors };
}

async function findDuplicate(tenantId: string, c: ContactInput): Promise<any> {
  const keys: [string, string][] = [];
  if (c.email) keys.push(['email', c.email]);
  if (c.phone) keys.push(['phone', c.phone], ['whatsapp', c.phone]);
  if (c.whatsapp) keys.push(['whatsapp', c.whatsapp], ['phone', c.whatsapp]);
  for (const [col, val] of keys) {
    const row = await db.prepare(`SELECT * FROM contacts WHERE tenant_id = ? AND ${col} = ? LIMIT 1`).get(tenantId, val);
    if (row) return row;
  }
  return null;
}

async function insertContact(tenantId: string, c: ContactInput, source: string, userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO contacts (id, tenant_id, ${TEXT_FIELDS.join(', ')}, tags, consent_whatsapp, consent_email, source, created_by)
     VALUES (?, ?, ${TEXT_FIELDS.map(() => '?').join(', ')}, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, ...TEXT_FIELDS.map((f) => c[f] as string), JSON.stringify(c.tags), c.consent_whatsapp, c.consent_email, source, userId);
  return id;
}

/** Fills empty fields of an existing contact and merges tags; never erases data. */
async function mergeContact(existing: any, c: ContactInput) {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of TEXT_FIELDS) {
    if (c[f] && !existing[f]) {
      sets.push(`${f} = ?`);
      vals.push(c[f]);
    }
  }
  const tags = uniq([...JSON.parse(existing.tags || '[]'), ...c.tags]);
  sets.push('tags = ?', 'consent_whatsapp = GREATEST(consent_whatsapp, ?)', 'consent_email = GREATEST(consent_email, ?)', "updated_at = datetime('now')");
  vals.push(JSON.stringify(tags), c.consent_whatsapp, c.consent_email);
  await db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...vals, existing.id, existing.tenant_id);
}

const publicContact = (r: any) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  whatsapp: r.whatsapp,
  email: r.email,
  birthDate: r.birth_date,
  gender: r.gender,
  street: r.street,
  number: r.number,
  complement: r.complement,
  neighborhood: r.neighborhood,
  city: r.city,
  state: r.state,
  zip: r.zip,
  category: r.category,
  organization: r.organization,
  tags: JSON.parse(r.tags || '[]'),
  notes: r.notes,
  source: r.source,
  consentWhatsapp: !!r.consent_whatsapp,
  consentEmail: !!r.consent_email,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Maps API camelCase body to normalizeContact's snake_case keys. */
const fromBody = (b: any) => ({
  name: b.name, phone: b.phone, whatsapp: b.whatsapp, email: b.email, birth_date: b.birthDate, gender: b.gender,
  street: b.street, number: b.number, complement: b.complement, neighborhood: b.neighborhood, city: b.city,
  state: b.state, zip: b.zip, category: b.category, organization: b.organization, tags: b.tags, notes: b.notes,
  consent_whatsapp: b.consentWhatsapp, consent_email: b.consentEmail,
});

// ---------------------------------------------------------------------------
// CONTATOS
// ---------------------------------------------------------------------------
function contactFilter(req: Request) {
  const where = ['c.tenant_id = ?'];
  const args: any[] = [tid(req)];
  const q = String(req.query.q ?? '').trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const digits = onlyDigits(q);
    where.push(`(c.name ILIKE ? OR c.email ILIKE ? OR c.neighborhood ILIKE ? OR c.organization ILIKE ?${digits.length >= 4 ? ' OR c.phone ILIKE ? OR c.whatsapp ILIKE ?' : ''})`);
    args.push(like, like, like, like);
    if (digits.length >= 4) args.push(`%${digits}%`, `%${digits}%`);
  }
  for (const [param, col] of [['city', 'city'], ['category', 'category'], ['neighborhood', 'neighborhood']] as const) {
    const v = String(req.query[param] ?? '').trim();
    if (v) {
      where.push(`c.${col} = ?`);
      args.push(v);
    }
  }
  const tag = String(req.query.tag ?? '').trim();
  if (tag) {
    where.push(`EXISTS (SELECT 1 FROM json_each(c.tags) WHERE json_each.value = ?)`);
    args.push(tag);
  }
  if (req.query.consent === 'whatsapp') where.push(`c.consent_whatsapp = 1 AND c.whatsapp <> ''`);
  if (req.query.consent === 'email') where.push(`c.consent_email = 1 AND c.email <> ''`);
  return { sql: where.join(' AND '), args };
}

bancoRouter.get('/contacts', async (req, res) => {
  const { sql, args } = contactFilter(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM contacts c WHERE ${sql}`).get(...args) as any).n;
  const rows = await db.prepare(`SELECT * FROM contacts c WHERE ${sql} ORDER BY lower(c.name) LIMIT ? OFFSET ?`).all(...args, limit, offset);
  res.json({ total, items: rows.map(publicContact) });
});

bancoRouter.get('/contacts/facets', async (req, res) => {
  const t = tid(req);
  const facet = async (col: string) =>
    await db.prepare(`SELECT ${col} AS value, COUNT(*) AS count FROM contacts WHERE tenant_id = ? AND ${col} <> '' GROUP BY ${col} ORDER BY count DESC LIMIT 200`).all(t);
  const tags = await db
    .prepare(`SELECT j.value AS value, COUNT(*) AS count FROM contacts c, json_each(c.tags) j WHERE c.tenant_id = ? GROUP BY j.value ORDER BY count DESC LIMIT 200`)
    .all(t);
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE consent_whatsapp = 1 AND whatsapp <> '') AS whatsapp,
              COUNT(*) FILTER (WHERE consent_email = 1 AND email <> '') AS email
         FROM contacts WHERE tenant_id = ?`
    )
    .get(t) as any;
  res.json({
    total: totals.total ?? 0,
    withWhatsappConsent: totals.whatsapp ?? 0,
    withEmailConsent: totals.email ?? 0,
    cities: await facet('city'),
    categories: await facet('category'),
    tags,
    categoryOptions: [...(await categoryMap(t)).values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    tagOptions: [...(await tagMap(t)).values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  });
});

bancoRouter.post('/contacts', async (req, res) => {
  const { value, errors } = normalizeContact(fromBody(req.body ?? {}));
  if (errors.length) throw bad(errors.join('; '));
  Object.assign(value, await resolveTaxonomy(tid(req), value.category, value.tags));
  const dup = await findDuplicate(tid(req), value);
  if (dup) throw new HttpError(409, `Já existe um contato com este telefone/e-mail: ${dup.name}.`);
  await assertQuota(tid(req), 1024);
  const id = await insertContact(tid(req), value, 'manual', req.auth!.userId);
  await audit({ ...actor(req), action: 'contact.created', target: value.name });
  res.status(201).json(publicContact(await db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id)));
});

bancoRouter.patch('/contacts/:id', async (req, res) => {
  const existing = await db.prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!existing) throw new HttpError(404, 'Contato não encontrado.');
  const { value, errors } = normalizeContact(fromBody({ ...publicContact(existing), ...(req.body ?? {}) }));
  if (errors.length) throw bad(errors.join('; '));
  Object.assign(value, await resolveTaxonomy(tid(req), value.category, value.tags));
  const dup = await findDuplicate(tid(req), value);
  if (dup && dup.id !== existing.id) throw new HttpError(409, `Telefone/e-mail já pertence a outro contato: ${dup.name}.`);
  await db.prepare(
    `UPDATE contacts SET ${TEXT_FIELDS.map((f) => `${f} = ?`).join(', ')}, tags = ?, consent_whatsapp = ?, consent_email = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?`
  ).run(...TEXT_FIELDS.map((f) => value[f] as string), JSON.stringify(value.tags), value.consent_whatsapp, value.consent_email, existing.id, tid(req));
  await audit({ ...actor(req), action: 'contact.updated', target: value.name });
  res.json(publicContact(await db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(existing.id)));
});

bancoRouter.delete('/contacts/:id', async (req, res) => {
  requireManager(req);
  const existing = await db.prepare(`SELECT name FROM contacts WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!existing) throw new HttpError(404, 'Contato não encontrado.');
  await db.prepare(`DELETE FROM contacts WHERE id = ? AND tenant_id = ?`).run(req.params.id, tid(req));
  await audit({ ...actor(req), action: 'contact.deleted', target: existing.name });
  res.json({ ok: true });
});

/**
 * Bulk delete. Either explicit `ids`, or `allMatching: true` to delete every contact matching
 * the same filters as GET /contacts (passed in the query string). Always scoped to the tenant.
 */
bancoRouter.post('/contacts/bulk-delete', async (req, res) => {
  requireManager(req);
  const b = req.body ?? {};
  let deleted = 0;
  await tx(async () => {
    if (b.allMatching === true) {
      const { sql, args } = contactFilter(req);
      deleted = Number((await db.prepare(`DELETE FROM contacts AS c WHERE ${sql}`).run(...args)).changes);
    } else {
      const ids: string[] = Array.isArray(b.ids) ? [...new Set<string>(b.ids.map(String))].slice(0, 5000) : [];
      if (!ids.length) throw bad('Nenhum contato selecionado.');
      const del = db.prepare(`DELETE FROM contacts WHERE id = ? AND tenant_id = ?`);
      for (const id of ids) deleted += Number((await del.run(id, tid(req))).changes);
    }
  });
  await audit({
    ...actor(req),
    action: 'contacts.bulk_deleted',
    target: `${deleted} contato(s)`,
    details: b.allMatching ? { allMatching: true, filter: req.query } : { count: deleted },
  });
  res.json({ deleted });
});

// ---------------------------------------------------------------------------
// CEP lookup (ViaCEP — base dos Correios — with BrasilAPI as fallback)
// ---------------------------------------------------------------------------
type CepResult = { cep: string; street: string; neighborhood: string; city: string; state: string };
const cepCache = new Map<string, { at: number; value: CepResult | null }>();
const CEP_TTL_MS = 7 * 24 * 3600_000;

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function lookupCep(cep: string): Promise<CepResult | null> {
  const hit = cepCache.get(cep);
  if (hit && Date.now() - hit.at < CEP_TTL_MS) return hit.value;
  let value: CepResult | null = null;
  let anyOk = false;
  try {
    const v = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
    anyOk = true;
    if (v && !v.erro) value = { cep, street: v.logradouro ?? '', neighborhood: v.bairro ?? '', city: v.localidade ?? '', state: v.uf ?? '' };
  } catch {
    /* fall through to BrasilAPI */
  }
  if (!value) {
    try {
      const b = await fetchJson(`https://brasilapi.com.br/api/cep/v1/${cep}`);
      anyOk = true;
      if (b) value = { cep, street: b.street ?? '', neighborhood: b.neighborhood ?? '', city: b.city ?? '', state: b.state ?? '' };
    } catch {
      /* both failed */
    }
  }
  if (!anyOk) throw new HttpError(503, 'Serviço de consulta de CEP indisponível no momento. Preencha o endereço manualmente.');
  if (cepCache.size > 5000) cepCache.clear();
  cepCache.set(cep, { at: Date.now(), value });
  return value;
}

bancoRouter.get(
  '/cep/:cep',
  ah(async (req, res) => {
    const cep = onlyDigits(String(req.params.cep));
    if (cep.length !== 8) throw bad('CEP deve ter 8 dígitos.');
    const r = await lookupCep(cep);
    if (!r) throw new HttpError(404, 'CEP não encontrado.');
    res.json(r);
  })
);

// ---------------------------------------------------------------------------
// IMPORTAÇÃO
// ---------------------------------------------------------------------------
const TEMPLATE_COLUMNS: { header: string; key: keyof ContactInput | 'tags'; width: number; hint: string }[] = [
  { header: 'Nome', key: 'name', width: 32, hint: 'Obrigatório. Nome completo.' },
  { header: 'Telefone', key: 'phone', width: 18, hint: 'Com DDD. Ex.: (65) 3333-4444 ou 65999990000.' },
  { header: 'WhatsApp', key: 'whatsapp', width: 18, hint: 'Com DDD. Se vazio e o telefone for celular, ele é usado.' },
  { header: 'E-mail', key: 'email', width: 30, hint: 'Ao menos um entre Telefone, WhatsApp ou E-mail.' },
  { header: 'Data de Nascimento', key: 'birth_date', width: 18, hint: 'DD/MM/AAAA.' },
  { header: 'Gênero', key: 'gender', width: 24, hint: 'Opcional. Masculino, Feminino ou Não Quis Se Identificar.' },
  { header: 'Endereço', key: 'street', width: 34, hint: 'Logradouro (rua, avenida...).' },
  { header: 'Número', key: 'number', width: 10, hint: '' },
  { header: 'Complemento', key: 'complement', width: 18, hint: '' },
  { header: 'Bairro', key: 'neighborhood', width: 22, hint: '' },
  { header: 'Cidade', key: 'city', width: 22, hint: '' },
  { header: 'UF', key: 'state', width: 6, hint: 'Sigla com 2 letras. Ex.: MT.' },
  { header: 'CEP', key: 'zip', width: 12, hint: '8 dígitos.' },
  { header: 'Categoria', key: 'category', width: 24, hint: 'Uma das categorias cadastradas em Banco de Dados › Categorias (lista na aba Listas).' },
  { header: 'Organização / Entidade', key: 'organization', width: 28, hint: 'Associação, empresa, órgão...' },
  { header: 'Etiquetas', key: 'tags', width: 30, hint: 'Etiquetas cadastradas em Banco de Dados › Categorias › Etiquetas, separadas por ponto e vírgula.' },
  { header: 'Observações', key: 'notes', width: 34, hint: '' },
  { header: 'Aceita WhatsApp', key: 'consent_whatsapp', width: 16, hint: 'Sim/Não. Consentimento LGPD para receber mensagens.' },
  { header: 'Aceita E-mail', key: 'consent_email', width: 14, hint: 'Sim/Não. Consentimento LGPD para receber e-mails.' },
];

/** Header aliases so spreadsheets that don't follow the template still map. */
const HEADER_ALIASES: Record<string, string> = {};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
for (const c of TEMPLATE_COLUMNS) HEADER_ALIASES[norm(c.header)] = c.key;
Object.assign(HEADER_ALIASES, {
  nomecompleto: 'name', contato: 'name', fone: 'phone', telefone1: 'phone', telefonefixo: 'phone', celular: 'phone',
  whats: 'whatsapp', zap: 'whatsapp', celularwhatsapp: 'whatsapp', email: 'email', mail: 'email', emailpessoal: 'email',
  nascimento: 'birth_date', datanascimento: 'birth_date', dtnascimento: 'birth_date', sexo: 'gender',
  logradouro: 'street', rua: 'street', enderecocompleto: 'street', numero: 'number', no: 'number', n: 'number',
  municipio: 'city', localidade: 'city', estado: 'state', uf: 'state', cep: 'zip', segmento: 'category', perfil: 'category',
  entidade: 'organization', organizacao: 'organization', empresa: 'organization', orgao: 'organization',
  tags: 'tags', etiqueta: 'tags', classificacao: 'tags', obs: 'notes', observacao: 'notes',
  optinwhatsapp: 'consent_whatsapp', consentimentowhatsapp: 'consent_whatsapp', aceitawhats: 'consent_whatsapp',
  optinemail: 'consent_email', consentimentoemail: 'consent_email',
});

bancoRouter.get(
  '/import/template',
  ah(async (req, res) => {
    const cats = [...(await categoryMap(tid(req))).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tagNames = [...(await tagMap(tid(req))).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Parlamentta';
    const ws = wb.addWorksheet('Contatos', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102C45' } };
    head.alignment = { vertical: 'middle' };
    head.height = 22;
    TEMPLATE_COLUMNS.forEach((c, i) => {
      if (c.hint) head.getCell(i + 1).note = c.hint;
    });
    ws.addRow({
      name: 'EXEMPLO - Maria da Silva (linhas iniciadas por EXEMPLO são ignoradas)',
      phone: '(65) 3322-1100', whatsapp: '(65) 99999-0000', email: 'maria.silva@exemplo.com.br', birth_date: '15/03/1980',
      gender: 'Feminino', street: 'Rua das Flores', number: '120', complement: 'Casa 2', neighborhood: 'Centro Norte',
      city: 'Cuiabá', state: 'MT', zip: '78005-000', category: cats[0] ?? '', organization: 'Associação de Moradores',
      tags: tagNames.slice(0, 2).join('; '), notes: 'Contato feito em audiência pública', consent_whatsapp: 'Sim', consent_email: 'Não',
    }).font = { italic: true, color: { argb: 'FF64748B' } };
    const colIdx = (k: string) => TEMPLATE_COLUMNS.findIndex((c) => c.key === k) + 1;
    const list = (k: string, formula: string) => {
      for (let r = 2; r <= 5001; r++) {
        ws.getCell(r, colIdx(k)).dataValidation = { type: 'list', allowBlank: true, formulae: [formula] };
      }
    };
    // Cabinet's own categories/tags live in a "Listas" sheet (inline list formulas are capped at 255 chars).
    const lists = wb.addWorksheet('Listas');
    lists.columns = [{ header: 'Categorias', width: 32 }, { header: 'Etiquetas', width: 32 }];
    lists.getRow(1).font = { bold: true };
    const maxLen = Math.max(cats.length, tagNames.length);
    for (let i = 0; i < maxLen; i++) lists.addRow([cats[i] ?? null, tagNames[i] ?? null]);
    list('consent_whatsapp', '"Sim,Não"');
    list('consent_email', '"Sim,Não"');
    list('gender', `"${GENDERS.join(',')}"`);
    if (cats.length) list('category', `Listas!$A$2:$A$${cats.length + 1}`);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TEMPLATE_COLUMNS.length } };

    const help = wb.addWorksheet('Instruções');
    help.columns = [{ width: 26 }, { width: 14 }, { width: 80 }];
    help.addRow(['Planilha modelo de importação de contatos — Parlamentta']).font = { bold: true, size: 14, color: { argb: 'FF102C45' } };
    help.addRow([]);
    help.addRow(['Coluna', 'Obrigatória', 'Formato / observações']).font = { bold: true };
    for (const c of TEMPLATE_COLUMNS) help.addRow([c.header, c.key === 'name' ? 'Sim' : '', c.hint]);
    help.addRow([]);
    help.addRow(['Regras gerais']).font = { bold: true };
    [
      '• Preencha a aba "Contatos" a partir da linha 2. Não altere os nomes das colunas.',
      '• Cada contato precisa de Nome e de ao menos um meio de contato (Telefone, WhatsApp ou E-mail).',
      '• Contatos já existentes (mesmo telefone, WhatsApp ou e-mail) são detectados e podem ser ignorados ou complementados.',
      '• Categorias e etiquetas devem ser as cadastradas em Banco de Dados › Categorias (veja a aba "Listas").',
      '• Valores novos são apontados na prévia; você escolhe se serão cadastrados automaticamente ou descartados.',
      '• LGPD: só marque "Aceita WhatsApp/E-mail = Sim" quando houver consentimento registrado do titular.',
      '• Também é aceito arquivo .csv (separado por ponto e vírgula ou vírgula, UTF-8).',
    ].forEach((t) => help.addRow([t]));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="parlamentta-modelo-importacao-contatos.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  })
);

function cellText(v: ExcelJS.CellValue): unknown {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as any;
    if ('result' in o) return cellText(o.result);
    if ('text' in o) return typeof o.text === 'string' ? o.text : cellText(o.text);
    if ('richText' in o) return o.richText.map((r: any) => r.text).join('');
    if ('hyperlink' in o) return o.hyperlink;
    return '';
  }
  return String(v);
}

function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readSheet(buf: Buffer, fileName: string): Promise<unknown[][]> {
  if (/\.csv$/i.test(fileName)) {
    let text = buf.toString('utf8');
    if (text.includes('�')) text = buf.toString('latin1');
    return parseCsv(text);
  }
  if (!/\.xlsx$/i.test(fileName)) throw bad('Formato não suportado. Envie .xlsx (planilha modelo) ou .csv.');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch {
    throw bad('Não foi possível ler a planilha. Verifique se o arquivo é um .xlsx válido.');
  }
  const ws = wb.getWorksheet('Contatos') ?? wb.worksheets[0];
  if (!ws) throw bad('Planilha vazia.');
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals: any[] = [];
    for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(r.getCell(c).value));
    rows.push(vals);
  });
  return rows;
}

bancoRouter.post(
  '/import/preview',
  ah(async (req, res) => {
    const fileName = fileNameHeader(req) || 'planilha.xlsx';
    const buf = await readBody(req, MAX_IMPORT_BYTES);
    if (!buf.length) throw bad('Arquivo vazio.');
    const rows = await readSheet(buf, fileName);
    if (rows.length < 2) throw bad('A planilha não tem linhas de dados.');

    const header = rows[0]!.map((h) => HEADER_ALIASES[norm(String(h ?? ''))] ?? null);
    if (!header.includes('name')) throw bad('Coluna "Nome" não encontrada. Use a planilha modelo.');
    const unmapped = rows[0]!.filter((h, i) => String(h ?? '').trim() && !header[i]).map(String);

    const dataRows = rows.slice(1).filter((r) => r.some((v) => String(v ?? '').trim()));
    if (dataRows.length > MAX_IMPORT_ROWS) throw bad(`Limite de ${MAX_IMPORT_ROWS} linhas por importação.`);

    const cats = await categoryMap(tid(req));
    const tagsM = await tagMap(tid(req));
    const unknownCategories = new Map<string, string>();
    const unknownTags = new Map<string, string>();
    const seen = new Set<string>();
    // One query instead of one lookup per row: email/phone/whatsapp -> existing contact name.
    const existingByKey = new Map<string, string>();
    for (const e of await db.prepare(`SELECT name, email, phone, whatsapp FROM contacts WHERE tenant_id = ?`).all(tid(req))) {
      if (e.email) existingByKey.set(`email:${e.email}`, e.name);
      for (const p of [e.phone, e.whatsapp]) if (p) existingByKey.set(`tel:${p}`, e.name);
    }
    const findExisting = (c: ContactInput) =>
      (c.email && existingByKey.get(`email:${c.email}`)) ||
      (c.phone && existingByKey.get(`tel:${c.phone}`)) ||
      (c.whatsapp && existingByKey.get(`tel:${c.whatsapp}`)) ||
      undefined;
    const parsed = dataRows.map((r, i) => {
      const raw: Record<string, unknown> = {};
      header.forEach((k, ci) => {
        if (k) raw[k] = r[ci];
      });
      const line = i + 2;
      if (/^exemplo\b/i.test(String(raw.name ?? '').trim())) return { line, status: 'ignored' as const, errors: ['Linha de exemplo'], value: null };
      const { value, errors } = normalizeContact(raw);
      if (errors.length) return { line, status: 'invalid' as const, errors, value };
      if (value.category) {
        const c = cats.get(tkey(value.category));
        if (c) value.category = c;
        else unknownCategories.set(tkey(value.category), value.category);
      }
      value.tags = uniq(
        value.tags.map((t) => {
          const c = tagsM.get(tkey(t));
          if (!c) unknownTags.set(tkey(t), t);
          return c ?? t;
        })
      );
      const keys = [value.email, value.phone, value.whatsapp].filter(Boolean);
      if (keys.some((k) => seen.has(k))) return { line, status: 'invalid' as const, errors: ['Duplicado dentro da planilha'], value };
      keys.forEach((k) => seen.add(k));
      const existing = findExisting(value);
      return { line, status: existing ? ('duplicate' as const) : ('new' as const), errors: [], value, existing };
    });

    const id = crypto.randomUUID();
    const counts = {
      total: parsed.length,
      new: parsed.filter((p) => p.status === 'new').length,
      duplicate: parsed.filter((p) => p.status === 'duplicate').length,
      invalid: parsed.filter((p) => p.status === 'invalid').length,
      ignored: parsed.filter((p) => p.status === 'ignored').length,
    };
    await db.prepare(`DELETE FROM contact_imports WHERE tenant_id = ? AND status = 'preview' AND created_at < datetime('now','-1 day')`).run(tid(req));
    await db.prepare(
      `INSERT INTO contact_imports (id, tenant_id, file_name, total_rows, valid_rows, rows_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, tid(req), fileName, counts.total, counts.new + counts.duplicate, JSON.stringify(parsed), req.auth!.userId);

    res.json({
      importId: id,
      fileName,
      counts,
      unmappedColumns: unmapped,
      unknownCategories: [...unknownCategories.values()],
      unknownTags: [...unknownTags.values()],
      rows: parsed.slice(0, 300).map((p) => ({
        line: p.line,
        status: p.status,
        errors: p.errors,
        existing: (p as any).existing,
        name: p.value?.name ?? '',
        phone: p.value?.phone ?? '',
        whatsapp: p.value?.whatsapp ?? '',
        email: p.value?.email ?? '',
        city: p.value?.city ?? '',
        category: p.value?.category ?? '',
        tags: p.value?.tags ?? [],
      })),
    });
  })
);

bancoRouter.post('/import/:id/commit', async (req, res) => {
  requireManager(req);
  const imp = await db.prepare(`SELECT * FROM contact_imports WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!imp) throw new HttpError(404, 'Importação não encontrada.');
  if (imp.status !== 'preview') throw bad('Esta importação já foi processada.');
  const policy = req.body?.duplicatePolicy === 'update' ? 'update' : 'skip';
  const createMissing = req.body?.createMissing !== false;
  const requested = uniq(splitTags(Array.isArray(req.body?.tags) ? req.body.tags.join(';') : req.body?.tags)).slice(0, 10);
  // List-wide tags and default category must already be registered.
  const { tags: extraTags, category } = await resolveTaxonomy(tid(req), String(req.body?.category ?? '').trim().slice(0, 60), requested);
  const cats = await categoryMap(tid(req));
  const tagsM = await tagMap(tid(req));
  const created = { categories: [] as string[], tags: [] as string[] };
  const canonCategory = async (name: string) => {
    if (!name) return '';
    const hit = cats.get(tkey(name));
    if (hit) return hit;
    if (!createMissing) return '';
    await createCategoryIfMissing(tid(req), name);
    cats.set(tkey(name), name);
    created.categories.push(name);
    return name;
  };
  const canonTag = async (name: string): Promise<string[]> => {
    const hit = tagsM.get(tkey(name));
    if (hit) return [hit];
    if (!createMissing) return [];
    await createTagIfMissing(tid(req), name);
    tagsM.set(tkey(name), name);
    created.tags.push(name);
    return [name];
  };
  const rows = JSON.parse(imp.rows_json) as { status: string; value: ContactInput | null }[];
  const valid = rows.filter((r) => r.value && (r.status === 'new' || r.status === 'duplicate'));
  await assertQuota(tid(req), valid.length * 400);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  await tx(async () => {
    for (const r of valid) {
      const canonTags: string[] = [];
      for (const t of r.value!.tags) canonTags.push(...(await canonTag(t)));
      const c = { ...r.value!, tags: uniq([...canonTags, ...extraTags]), category: await canonCategory(r.value!.category) };
      if (category && !c.category) c.category = category;
      const dup = await findDuplicate(tid(req), c); // re-check: data may have changed since preview
      if (!dup) {
        await insertContact(tid(req), c, `import:${imp.id}`, req.auth!.userId);
        inserted++;
      } else if (policy === 'update') {
        await mergeContact(dup, c);
        updated++;
      } else skipped++;
    }
    skipped += rows.length - valid.length;
    await db.prepare(
      `UPDATE contact_imports SET status='committed', inserted=?, updated=?, skipped=?, tags=?, rows_json=NULL, committed_at=datetime('now') WHERE id=?`
    ).run(inserted, updated, skipped, JSON.stringify(extraTags), imp.id);
  });
  await audit({ ...actor(req), action: 'contacts.imported', target: imp.file_name, details: { inserted, updated, skipped, tags: extraTags, policy, created } });
  res.json({ inserted, updated, skipped, created });
});

bancoRouter.delete('/import/:id', async (req, res) => {
  await db.prepare(`UPDATE contact_imports SET status='discarded', rows_json=NULL WHERE id = ? AND tenant_id = ? AND status='preview'`).run(req.params.id, tid(req));
  res.json({ ok: true });
});

bancoRouter.get('/import/history', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT i.id, i.file_name, i.status, i.total_rows, i.inserted, i.updated, i.skipped, i.tags, i.created_at, i.committed_at, u.name AS by_name
         FROM contact_imports i LEFT JOIN users u ON u.id = i.created_by
        WHERE i.tenant_id = ? AND i.status = 'committed' ORDER BY i.committed_at DESC LIMIT 50`
    )
    .all(tid(req)) as any[];
  res.json(rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
});

// ---------------------------------------------------------------------------
// DISCURSOS
// ---------------------------------------------------------------------------
const EXT: Record<string, { kind: 'audio' | 'video' | 'pdf' | 'docx' | 'text'; mime: string }> = {
  mp3: { kind: 'audio', mime: 'audio/mpeg' }, wav: { kind: 'audio', mime: 'audio/wav' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' }, ogg: { kind: 'audio', mime: 'audio/ogg' }, oga: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/ogg' }, flac: { kind: 'audio', mime: 'audio/flac' }, weba: { kind: 'audio', mime: 'audio/webm' },
  mp4: { kind: 'video', mime: 'video/mp4' }, mov: { kind: 'video', mime: 'video/quicktime' }, webm: { kind: 'video', mime: 'video/webm' },
  mkv: { kind: 'video', mime: 'video/x-matroska' }, avi: { kind: 'video', mime: 'video/x-msvideo' }, mpeg: { kind: 'video', mime: 'video/mpeg' },
  mpg: { kind: 'video', mime: 'video/mpeg' }, '3gp': { kind: 'video', mime: 'video/3gpp' }, wmv: { kind: 'video', mime: 'video/x-ms-wmv' },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  docx: { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  txt: { kind: 'text', mime: 'text/plain' }, md: { kind: 'text', mime: 'text/plain' }, srt: { kind: 'text', mime: 'text/plain' }, vtt: { kind: 'text', mime: 'text/plain' },
};

const speechDir = (tenantId: string) => path.join(DATA_DIR, 'tenants', tenantId, 'speeches');
const speechPath = (s: { tenant_id: string; id: string; file_name: string }) =>
  path.join(speechDir(s.tenant_id), `${s.id}${path.extname(s.file_name).toLowerCase()}`);

const publicSpeech = (r: any, full = false) => ({
  id: r.id,
  title: r.title,
  speechDate: r.speech_date,
  occasion: r.occasion,
  location: r.location,
  mediaType: r.media_type,
  fileName: r.file_name,
  fileBytes: r.file_bytes,
  fileKept: !!r.file_kept,
  status: r.status,
  statusDetail: r.status_detail,
  summary: r.summary,
  themes: JSON.parse(r.themes || '[]'),
  keywords: JSON.parse(r.keywords || '[]'),
  taggedBy: r.tagged_by,
  wordCount: r.text ? r.text.split(/\s+/).filter(Boolean).length : 0,
  createdAt: r.created_at,
  processedAt: r.processed_at,
  createdByName: r.created_by_name,
  ...(full ? { text: r.text } : { excerpt: r.text ? r.text.slice(0, 280) : '' }),
});

function validDate(v: unknown): string {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw bad('Data do discurso inválida.');
  return s;
}

bancoRouter.get('/speeches/meta', async (_req, res) => {
  res.json({ themes: THEMES, occasions: OCCASIONS, aiAvailable: aiAvailable(), acceptedExtensions: Object.keys(EXT), maxUploadMb: MAX_SPEECH_BYTES / 1024 / 1024 });
});

bancoRouter.get('/speeches', async (req, res) => {
  const where = ['s.tenant_id = ?'];
  const args: any[] = [tid(req)];
  const q = String(req.query.q ?? '').trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    where.push('(s.title ILIKE ? OR s.text ILIKE ? OR s.summary ILIKE ? OR s.keywords ILIKE ? OR s.location ILIKE ?)');
    args.push(like, like, like, like, like);
  }
  const theme = String(req.query.theme ?? '').trim();
  if (theme) {
    where.push('EXISTS (SELECT 1 FROM json_each(s.themes) WHERE json_each.value = ?)');
    args.push(theme);
  }
  const occasion = String(req.query.occasion ?? '').trim();
  if (occasion) {
    where.push('s.occasion = ?');
    args.push(occasion);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from ?? ''))) {
    where.push('s.speech_date >= ?');
    args.push(req.query.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to ?? ''))) {
    where.push('s.speech_date <= ?');
    args.push(req.query.to);
  }
  const rows = await db
    .prepare(
      `SELECT s.*, u.name AS created_by_name FROM speeches s LEFT JOIN users u ON u.id = s.created_by
        WHERE ${where.join(' AND ')} ORDER BY s.speech_date DESC, s.created_at DESC LIMIT 300`
    )
    .all(...args);
  res.json(rows.map((r) => publicSpeech(r)));
});

bancoRouter.get('/speeches/:id', async (req, res) => {
  const r = await db
    .prepare(`SELECT s.*, u.name AS created_by_name FROM speeches s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ? AND s.tenant_id = ?`)
    .get(req.params.id, tid(req));
  if (!r) throw new HttpError(404, 'Discurso não encontrado.');
  res.json(publicSpeech(r, true));
});

bancoRouter.post('/speeches', async (req, res) => {
  const b = req.body ?? {};
  const title = String(b.title ?? '').trim().slice(0, 200);
  if (!title) throw bad('Informe o título do discurso.');
  const occasion = String(b.occasion ?? '').trim().slice(0, 80);
  if (!occasion) throw bad('Informe a ocasião.');
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO speeches (id, tenant_id, title, speech_date, occasion, location, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, tid(req), title, validDate(b.speechDate), occasion, String(b.location ?? '').trim().slice(0, 200), req.auth!.userId
  );
  res.status(201).json({ id });
});

bancoRouter.put(
  '/speeches/:id/file',
  ah(async (req, res) => {
    const s = await db.prepare(`SELECT * FROM speeches WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
    if (!s) throw new HttpError(404, 'Discurso não encontrado.');
    if (s.status !== 'awaiting_file') throw bad('Este discurso já recebeu um arquivo.');
    const fileName = fileNameHeader(req);
    const ext = path.extname(fileName).slice(1).toLowerCase();
    if (ext === 'doc') throw bad('Arquivos .doc (Word 97-2003) não são suportados. Salve como .docx ou PDF.');
    const info = EXT[ext];
    if (!info) throw bad(`Formato .${ext || '?'} não suportado. Aceitos: ${Object.keys(EXT).join(', ')}.`);
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > MAX_SPEECH_BYTES) throw new HttpError(413, `Arquivo maior que ${MAX_SPEECH_BYTES / 1024 / 1024} MB.`);
    // Videos are discarded after transcription, so they only need temporary room.
    if (info.kind !== 'video') await assertQuota(tid(req), declared);

    const dest = speechPath({ tenant_id: s.tenant_id, id: s.id, file_name: fileName });
    const size = await streamToFile(req, dest, MAX_SPEECH_BYTES);
    if (!size) {
      fs.rmSync(dest, { force: true });
      throw bad('Arquivo vazio.');
    }
    await db.prepare(
      `UPDATE speeches SET file_name=?, mime_type=?, media_type=?, file_bytes=?, stored_bytes=?, file_kept=1, status='queued', status_detail='' WHERE id=?`
    ).run(fileName, info.mime, info.kind, size, info.kind === 'video' ? 0 : size, s.id);
    await audit({ ...actor(req), action: 'speech.uploaded', target: s.title, details: { fileName, size, kind: info.kind } });
    enqueue(s.id);
    res.json({ ok: true });
  })
);

bancoRouter.patch('/speeches/:id', async (req, res) => {
  const s = await db.prepare(`SELECT * FROM speeches WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!s) throw new HttpError(404, 'Discurso não encontrado.');
  const b = req.body ?? {};
  const title = b.title === undefined ? s.title : String(b.title).trim().slice(0, 200) || s.title;
  const date = b.speechDate === undefined ? s.speech_date : validDate(b.speechDate);
  const occasion = b.occasion === undefined ? s.occasion : String(b.occasion).trim().slice(0, 80) || s.occasion;
  const location = b.location === undefined ? s.location : String(b.location).trim().slice(0, 200);
  const themes = b.themes === undefined ? s.themes : JSON.stringify((b.themes as string[]).filter((t) => (THEMES as readonly string[]).includes(t)).slice(0, 6));
  const keywords = b.keywords === undefined ? s.keywords : JSON.stringify(uniq((b.keywords as unknown[]).map((k) => String(k).trim().slice(0, 60)).filter(Boolean)).slice(0, 20));
  const text = b.text === undefined ? s.text : String(b.text).slice(0, 5_000_000);
  const taggedBy = b.themes !== undefined || b.keywords !== undefined ? 'manual' : s.tagged_by;
  await db.prepare(`UPDATE speeches SET title=?, speech_date=?, occasion=?, location=?, themes=?, keywords=?, text=?, tagged_by=? WHERE id=?`).run(
    title, date, occasion, location, themes, keywords, text, taggedBy, s.id
  );
  await audit({ ...actor(req), action: 'speech.updated', target: title });
  res.json({ ok: true });
});

bancoRouter.post('/speeches/:id/reprocess', async (req, res) => {
  const s = await db.prepare(`SELECT * FROM speeches WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!s) throw new HttpError(404, 'Discurso não encontrado.');
  if (!['error', 'needs_ai', 'done'].includes(s.status)) throw bad('O discurso ainda está em processamento.');
  if (!s.file_kept && !s.text) throw bad('O arquivo original não está mais disponível.');
  // Reprocessing re-runs the automatic tagging, replacing manual tags.
  await db.prepare(`UPDATE speeches SET status='queued', status_detail='', tagged_by='' WHERE id=?`).run(s.id);
  await audit({ ...actor(req), action: 'speech.reprocessed', target: s.title });
  enqueue(s.id);
  res.json({ ok: true });
});

bancoRouter.get('/speeches/:id/file', async (req, res) => {
  const s = await db.prepare(`SELECT * FROM speeches WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!s || !s.file_kept) throw new HttpError(404, 'Arquivo original não disponível.');
  const p = speechPath(s);
  if (!fs.existsSync(p)) throw new HttpError(404, 'Arquivo original não disponível.');
  res.setHeader('Content-Type', s.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(s.file_name)}`);
  fs.createReadStream(p).pipe(res);
});

bancoRouter.delete('/speeches/:id', async (req, res) => {
  requireManager(req);
  const s = await db.prepare(`SELECT * FROM speeches WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!s) throw new HttpError(404, 'Discurso não encontrado.');
  if (s.status === 'processing') throw bad('Aguarde o fim do processamento para excluir.');
  if (s.file_name) fs.rmSync(speechPath(s), { force: true });
  await db.prepare(`DELETE FROM speeches WHERE id = ?`).run(s.id);
  await audit({ ...actor(req), action: 'speech.deleted', target: s.title });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// background worker (in-process queue, 1 job at a time)
// ---------------------------------------------------------------------------
const queue: string[] = [];
let running = false;

function enqueue(id: string) {
  if (!queue.includes(id)) queue.push(id);
  void drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await processSpeech(id);
      } catch (e) {
        console.error('[discursos] falha', id, e);
        await db.prepare(`UPDATE speeches SET status='error', status_detail=? WHERE id=?`).run(String((e as Error).message ?? e).slice(0, 500), id);
      }
    }
  } finally {
    running = false;
  }
}

const setStatus = async (id: string, status: string, detail = '') =>
  await db.prepare(`UPDATE speeches SET status=?, status_detail=? WHERE id=?`).run(status, detail, id);

async function processSpeech(id: string) {
  const s = await db.prepare(`SELECT * FROM speeches WHERE id = ?`).get(id) as any;
  if (!s) return;
  const kind = s.media_type as 'audio' | 'video' | 'pdf' | 'docx' | 'text';
  const file = speechPath(s);
  let text: string = s.text;

  // 1) obtain text
  if (!text || s.status === 'queued') {
    if (kind === 'text') {
      const buf = fs.readFileSync(file);
      text = buf.toString('utf8');
      if (text.includes('�')) text = buf.toString('latin1');
      text = text.replace(/^﻿/, '').trim();
    } else if (kind === 'docx') {
      await setStatus(id, 'processing', 'Extraindo texto do documento…');
      text = (await mammoth.extractRawText({ path: file })).value.trim();
    } else if (!text) {
      if (!aiAvailable()) {
        await setStatus(id, 'needs_ai', kind === 'pdf' ? 'OCR do PDF requer a chave da IA (GEMINI_API_KEY).' : 'A decupagem requer a chave da IA (GEMINI_API_KEY).');
        return;
      }
      await setStatus(id, 'processing', kind === 'pdf' ? 'Extraindo texto do PDF (OCR)…' : 'Decupando o áudio com IA…');
      text = await extractTextWithAI(file, s.mime_type, kind as 'audio' | 'video' | 'pdf');
    }
    if (!text) throw new Error('Nenhum texto encontrado no arquivo.');
    await db.prepare(`UPDATE speeches SET text=? WHERE id=?`).run(text, id);
  }

  // Videos are discarded once the transcript is safely stored.
  if (kind === 'video' && s.file_kept) {
    fs.rmSync(file, { force: true });
    await db.prepare(`UPDATE speeches SET file_kept=0, stored_bytes=0 WHERE id=?`).run(id);
  }

  // 2) classify (AI, or keyword fallback); keep manual tags untouched
  if (s.tagged_by === 'manual') {
    await db.prepare(`UPDATE speeches SET status='done', status_detail='', processed_at=datetime('now') WHERE id=?`).run(id);
    return;
  }
  await setStatus(id, 'processing', 'Classificando temas…');
  let summary = '';
  let themes: string[] = [];
  let keywords: string[] = [];
  let taggedBy = 'palavras-chave';
  let detail = '';
  if (aiAvailable()) {
    try {
      const c = await classifyWithAI(text, { title: s.title, occasion: s.occasion, date: s.speech_date });
      summary = c.summary;
      themes = c.themes.length ? c.themes : keywordThemes(text);
      keywords = c.keywords;
      taggedBy = 'ia';
      const hints = [
        c.occasionSuggestion && c.occasionSuggestion.toLowerCase() !== s.occasion.toLowerCase() ? `ocasião "${c.occasionSuggestion}"` : '',
        c.dateSuggestion && c.dateSuggestion !== s.speech_date ? `data ${c.dateSuggestion.split('-').reverse().join('/')}` : '',
      ].filter(Boolean);
      if (hints.length) detail = `A IA identificou no conteúdo: ${hints.join(' e ')}. Confira os dados informados.`;
    } catch (e) {
      themes = keywordThemes(text);
      detail = `Classificação por IA falhou (${(e as Error).message.slice(0, 120)}); temas sugeridos por palavras-chave.`;
    }
  } else {
    themes = keywordThemes(text);
    detail = 'Temas sugeridos por palavras-chave. Configure a IA para resumo e etiquetas automáticas.';
  }
  await db.prepare(
    `UPDATE speeches SET summary=?, themes=?, keywords=?, tagged_by=?, status='done', status_detail=?, processed_at=datetime('now') WHERE id=?`
  ).run(summary, JSON.stringify(themes), JSON.stringify(keywords), taggedBy, detail, id);
}

/** Resume jobs interrupted by a restart. */
export async function startSpeechWorker() {
  const pending = await db.prepare(`SELECT id FROM speeches WHERE status IN ('queued','processing')`).all() as { id: string }[];
  await db.prepare(`UPDATE speeches SET status='queued' WHERE status='processing'`).run();
  pending.forEach((p) => enqueue(p.id));
}
