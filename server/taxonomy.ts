/**
 * Categorias de contatos e Etiquetas de classificação — controlled vocabularies per cabinet.
 * Contacts store the names; renames and deletions are propagated to every contact of the tenant.
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import { db, tx, audit } from './db';
import { HttpError, bad } from './http';

export const TAG_COLORS = ['teal', 'navy', 'emerald', 'amber', 'rose', 'violet', 'sky', 'slate'] as const;

const DEFAULT_CATEGORIES: [string, string][] = [
  ['Cidadão', 'Pessoa atendida pelo gabinete'],
  ['Liderança Comunitária', 'Presidentes de associação, líderes de bairro'],
  ['Liderança Política', 'Prefeitos, vereadores, dirigentes partidários'],
  ['Servidor Público', 'Servidores e gestores de órgãos públicos'],
  ['Imprensa', 'Jornalistas e veículos de comunicação'],
  ['Empresário', 'Empreendedores e representantes de empresas'],
  ['Entidade / Associação', 'Sindicatos, ONGs, cooperativas'],
  ['Apoiador', 'Apoiadores do mandato'],
];
const DEFAULT_TAGS: [string, string][] = [
  ['Saúde', 'rose'],
  ['Educação', 'sky'],
  ['Infraestrutura', 'amber'],
  ['Segurança Pública', 'navy'],
  ['Agro', 'emerald'],
  ['Meio Ambiente', 'emerald'],
  ['Assistência Social', 'violet'],
  ['Cultura & Esporte', 'teal'],
];

const DEFAULT_PROPOSITION_TYPES: [string, string, string][] = [
  ['Ofício', 'OF', 'Comunicação oficial a órgãos e autoridades'],
  ['Requerimento', 'REQ', 'Requerimento de informação ou de providências'],
  ['Projeto de Lei', 'PL', 'Proposta de nova lei ou alteração legislativa'],
  ['Indicação', 'IND', 'Sugestão de medida ao Poder Executivo'],
  ['Emenda Parlamentar', 'EMD', 'Emenda ao orçamento ou a proposição em tramitação'],
];

/**
 * Simple per-cabinet option lists (name + description). Each default carries the seed version that
 * introduced it, so new defaults reach existing cabinets once without re-adding ones they deleted.
 */
type SimpleList = { table: 'entry_channels' | 'demand_themes'; seededCol: string; defaults: [string, string, number][] };

const ENTRY_CHANNELS: SimpleList = {
  table: 'entry_channels',
  seededCol: 'entry_channels_seeded',
  defaults: [
    ['Presencial no Gabinete', 'Cidadão compareceu ao gabinete', 1],
    ['Ligação Telefônica', 'Contato pela linha telefônica oficial', 1],
    ['WhatsApp Oficial', 'Mensagem no WhatsApp do gabinete', 2],
    ['E-mail Institucional', 'Mensagem no e-mail oficial', 2],
    ['Instagram Direct', 'Mensagem direta no Instagram', 2],
  ],
};
const DEMAND_THEMES: SimpleList = {
  table: 'demand_themes',
  seededCol: 'demand_themes_seeded',
  defaults: [
    ['Saúde', '', 1],
    ['Educação', '', 1],
    ['Infraestrutura', '', 1],
    ['Agricultura Familiar', '', 1],
    ['Segurança Pública', '', 1],
    ['Cultura & Esporte', '', 1],
    ['Meio Ambiente', '', 1],
  ],
};

async function ensureSimpleList(list: SimpleList, tenantId: string) {
  const t = await db.prepare(`SELECT ${list.seededCol} AS v FROM tenants WHERE id = ?`).get(tenantId) as any;
  const target = Math.max(...list.defaults.map((d) => d[2]));
  if (!t || t.v >= target) return;
  const ins = db.prepare(`INSERT INTO ${list.table} (id, tenant_id, name, description) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`);
  await tx(async () => {
    for (const [n, d, v] of list.defaults) if (v > t.v) await ins.run(crypto.randomUUID(), tenantId, n, d);
    await db.prepare(`UPDATE tenants SET ${list.seededCol} = ? WHERE id = ?`).run(target, tenantId);
  });
}
export const ensureEntryChannels = (tenantId: string) => ensureSimpleList(ENTRY_CHANNELS, tenantId);
export const ensureDemandThemes = (tenantId: string) => ensureSimpleList(DEMAND_THEMES, tenantId);

export async function ensurePropositionTypes(tenantId: string) {
  const t = await db.prepare(`SELECT proposition_types_seeded FROM tenants WHERE id = ?`).get(tenantId) as any;
  if (!t || t.proposition_types_seeded) return;
  const ins = db.prepare(`INSERT INTO proposition_types (id, tenant_id, name, acronym, description) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`);
  await tx(async () => {
    for (const [n, a, d] of DEFAULT_PROPOSITION_TYPES) await ins.run(crypto.randomUUID(), tenantId, n, a, d);
    await db.prepare(`UPDATE tenants SET proposition_types_seeded = 1 WHERE id = ?`).run(tenantId);
  });
}

/**
 * Creates the defaults once per tenant, plus any category/tag already used by existing contacts,
 * so older data stays valid under the new controlled vocabulary.
 */
export async function ensureTaxonomy(tenantId: string) {
  const t = await db.prepare(`SELECT taxonomy_seeded FROM tenants WHERE id = ?`).get(tenantId) as any;
  if (!t || t.taxonomy_seeded) return;
  await tx(async () => {
    const insCat = db.prepare(`INSERT INTO contact_categories (id, tenant_id, name, description) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`);
    const insTag = db.prepare(`INSERT INTO contact_tags (id, tenant_id, name, color) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`);
    for (const [n, d] of DEFAULT_CATEGORIES) await insCat.run(crypto.randomUUID(), tenantId, n, d);
    for (const [n, c] of DEFAULT_TAGS) await insTag.run(crypto.randomUUID(), tenantId, n, c);
    for (const r of await db.prepare(`SELECT DISTINCT category FROM contacts WHERE tenant_id = ? AND category <> ''`).all(tenantId) as any[]) {
      await insCat.run(crypto.randomUUID(), tenantId, r.category, '');
    }
    for (const r of await db.prepare(`SELECT DISTINCT j.value AS v FROM contacts c, json_each(c.tags) j WHERE c.tenant_id = ?`).all(tenantId) as any[]) {
      await insTag.run(crypto.randomUUID(), tenantId, r.v, 'teal');
    }
    await db.prepare(`UPDATE tenants SET taxonomy_seeded = 1 WHERE id = ?`).run(tenantId);
  });
}

const key = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

/** name (lowercased) -> canonical name */
export async function categoryMap(tenantId: string): Promise<Map<string, string>> {
  await ensureTaxonomy(tenantId);
  const rows = await db.prepare(`SELECT name FROM contact_categories WHERE tenant_id = ?`).all(tenantId) as { name: string }[];
  return new Map(rows.map((r) => [key(r.name), r.name]));
}
export async function tagMap(tenantId: string): Promise<Map<string, string>> {
  await ensureTaxonomy(tenantId);
  const rows = await db.prepare(`SELECT name FROM contact_tags WHERE tenant_id = ?`).all(tenantId) as { name: string }[];
  return new Map(rows.map((r) => [key(r.name), r.name]));
}

/** Validates a contact's category and tags against the tenant's vocabularies; returns canonical names. */
export async function resolveTaxonomy(tenantId: string, category: string, tags: string[]) {
  const cats = await categoryMap(tenantId);
  const tagsM = await tagMap(tenantId);
  let canonicalCategory = '';
  if (category.trim()) {
    const c = cats.get(key(category));
    if (!c) throw bad(`A categoria "${category}" não está cadastrada. Cadastre-a em Banco de Dados › Categorias.`);
    canonicalCategory = c;
  }
  const unknown = tags.filter((t) => !tagsM.has(key(t)));
  if (unknown.length) throw bad(`Etiqueta(s) não cadastrada(s): ${unknown.join(', ')}. Cadastre em Banco de Dados › Categorias › Etiquetas.`);
  const canonicalTags = [...new Set(tags.map((t) => tagsM.get(key(t))!))];
  return { category: canonicalCategory, tags: canonicalTags };
}

export async function createCategoryIfMissing(tenantId: string, name: string) {
  await db.prepare(`INSERT INTO contact_categories (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`).run(crypto.randomUUID(), tenantId, name.trim().slice(0, 60));
}
export async function createTagIfMissing(tenantId: string, name: string) {
  await db.prepare(`INSERT INTO contact_tags (id, tenant_id, name, color) VALUES (?, ?, ?, 'teal') ON CONFLICT DO NOTHING`).run(crypto.randomUUID(), tenantId, name.trim().slice(0, 40));
}

// ---------------------------------------------------------------------------
// routes (mounted inside the Banco de Dados router → /api/tenant/db/...)
// ---------------------------------------------------------------------------
export const taxonomyRouter = express.Router();

const MANAGER_ROLES = ['deputado', 'chefe_gabinete', 'coordenador_atendimento'];
const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
function requireManager(req: Request) {
  if (!MANAGER_ROLES.includes(req.auth!.role)) {
    throw new HttpError(403, 'Apenas Parlamentar, Chefe de Gabinete ou Coordenação podem gerenciar categorias e etiquetas.');
  }
}
function cleanName(v: unknown, max: number, what: string) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) throw bad(`Informe o nome da ${what}.`);
  if (s.length > max) throw bad(`O nome da ${what} deve ter até ${max} caracteres.`);
  if (/[;,|]/.test(s)) throw bad('O nome não pode conter ponto e vírgula, vírgula ou barra vertical.');
  return s;
}
const cleanColor = (v: unknown) => ((TAG_COLORS as readonly string[]).includes(String(v)) ? String(v) : 'teal');

taxonomyRouter.get('/taxonomy', async (req, res) => {
  await ensureTaxonomy(tid(req));
  await ensurePropositionTypes(tid(req));
  await ensureEntryChannels(tid(req));
  await ensureDemandThemes(tid(req));
  const simple = async (table: string) =>
    await db.prepare(`SELECT id, name, description, created_at FROM ${table} WHERE tenant_id = ? ORDER BY lower(name)`).all(tid(req));
  const entryChannels = await simple('entry_channels');
  const demandThemes = await simple('demand_themes');
  const propositionTypes = await db
    .prepare(`SELECT id, name, acronym, description, created_at FROM proposition_types WHERE tenant_id = ? ORDER BY lower(name)`)
    .all(tid(req));
  const categories = await db
    .prepare(
      `SELECT cc.id, cc.name, cc.description, cc.created_at,
              (SELECT COUNT(*) FROM contacts c WHERE c.tenant_id = cc.tenant_id AND lower(c.category) = lower(cc.name)) AS count
         FROM contact_categories cc WHERE cc.tenant_id = ? ORDER BY lower(cc.name)`
    )
    .all(tid(req));
  const tags = await db
    .prepare(
      `SELECT ct.id, ct.name, ct.color, ct.description, ct.created_at,
              (SELECT COUNT(*) FROM contacts c, json_each(c.tags) j
                WHERE c.tenant_id = ct.tenant_id AND lower(j.value) = lower(ct.name)) AS count
         FROM contact_tags ct WHERE ct.tenant_id = ? ORDER BY lower(ct.name)`
    )
    .all(tid(req));
  res.json({ categories, tags, propositionTypes, entryChannels, demandThemes, colors: TAG_COLORS });
});

// ----- categories -----
taxonomyRouter.post('/categories', async (req, res) => {
  requireManager(req);
  await ensureTaxonomy(tid(req));
  const name = cleanName(req.body?.name, 60, 'categoria');
  if ((await categoryMap(tid(req))).has(key(name))) throw new HttpError(409, `A categoria "${name}" já existe.`);
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO contact_categories (id, tenant_id, name, description) VALUES (?, ?, ?, ?)`).run(
    id, tid(req), name, String(req.body?.description ?? '').trim().slice(0, 200)
  );
  await audit({ ...actor(req), action: 'category.created', target: name });
  res.status(201).json({ id });
});

taxonomyRouter.patch('/categories/:id', async (req, res) => {
  requireManager(req);
  const cur = await db.prepare(`SELECT * FROM contact_categories WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Categoria não encontrada.');
  const name = req.body?.name === undefined ? cur.name : cleanName(req.body.name, 60, 'categoria');
  const clash = await db.prepare(`SELECT id FROM contact_categories WHERE tenant_id = ? AND name = ? AND id <> ?`).get(tid(req), name, cur.id);
  if (clash) throw new HttpError(409, `A categoria "${name}" já existe.`);
  const description = req.body?.description === undefined ? cur.description : String(req.body.description).trim().slice(0, 200);
  await tx(async () => {
    await db.prepare(`UPDATE contact_categories SET name = ?, description = ? WHERE id = ?`).run(name, description, cur.id);
    if (name !== cur.name) {
      await db.prepare(`UPDATE contacts SET category = ?, updated_at = datetime('now') WHERE tenant_id = ? AND lower(category) = lower(?)`).run(name, tid(req), cur.name);
    }
  });
  await audit({ ...actor(req), action: 'category.updated', target: name, details: name !== cur.name ? { renamedFrom: cur.name } : undefined });
  res.json({ ok: true });
});

taxonomyRouter.delete('/categories/:id', async (req, res) => {
  requireManager(req);
  const cur = await db.prepare(`SELECT * FROM contact_categories WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Categoria não encontrada.');
  let cleared = 0;
  await tx(async () => {
    cleared = Number(
      (await db.prepare(`UPDATE contacts SET category = '', updated_at = datetime('now') WHERE tenant_id = ? AND lower(category) = lower(?)`).run(tid(req), cur.name)).changes
    );
    await db.prepare(`DELETE FROM contact_categories WHERE id = ?`).run(cur.id);
  });
  await audit({ ...actor(req), action: 'category.deleted', target: cur.name, details: { contactsCleared: cleared } });
  res.json({ ok: true, contactsCleared: cleared });
});

// ----- tags -----
taxonomyRouter.post('/tags', async (req, res) => {
  requireManager(req);
  await ensureTaxonomy(tid(req));
  const name = cleanName(req.body?.name, 40, 'etiqueta');
  if ((await tagMap(tid(req))).has(key(name))) throw new HttpError(409, `A etiqueta "${name}" já existe.`);
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO contact_tags (id, tenant_id, name, color, description) VALUES (?, ?, ?, ?, ?)`).run(
    id, tid(req), name, cleanColor(req.body?.color), String(req.body?.description ?? '').trim().slice(0, 200)
  );
  await audit({ ...actor(req), action: 'tag.created', target: name });
  res.status(201).json({ id });
});

/** Rewrites a tag name inside every contact's JSON tag array (or removes it when `to` is null). */
async function rewriteTag(tenantId: string, from: string, to: string | null): Promise<number> {
  const rows = await db
    .prepare(`SELECT c.id, c.tags FROM contacts c WHERE c.tenant_id = ? AND EXISTS (SELECT 1 FROM json_each(c.tags) j WHERE lower(j.value) = lower(?))`)
    .all(tenantId, from) as { id: string; tags: string }[];
  const upd = db.prepare(`UPDATE contacts SET tags = ?, updated_at = datetime('now') WHERE id = ?`);
  for (const r of rows) {
    const list = (JSON.parse(r.tags) as string[]).flatMap((t) => (key(t) === key(from) ? (to ? [to] : []) : [t]));
    await upd.run(JSON.stringify([...new Set(list)]), r.id);
  }
  return rows.length;
}

taxonomyRouter.patch('/tags/:id', async (req, res) => {
  requireManager(req);
  const cur = await db.prepare(`SELECT * FROM contact_tags WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Etiqueta não encontrada.');
  const name = req.body?.name === undefined ? cur.name : cleanName(req.body.name, 40, 'etiqueta');
  const clash = await db.prepare(`SELECT id FROM contact_tags WHERE tenant_id = ? AND name = ? AND id <> ?`).get(tid(req), name, cur.id);
  if (clash) throw new HttpError(409, `A etiqueta "${name}" já existe.`);
  const color = req.body?.color === undefined ? cur.color : cleanColor(req.body.color);
  const description = req.body?.description === undefined ? cur.description : String(req.body.description).trim().slice(0, 200);
  await tx(async () => {
    await db.prepare(`UPDATE contact_tags SET name = ?, color = ?, description = ? WHERE id = ?`).run(name, color, description, cur.id);
    if (name !== cur.name) await rewriteTag(tid(req), cur.name, name);
  });
  await audit({ ...actor(req), action: 'tag.updated', target: name, details: name !== cur.name ? { renamedFrom: cur.name } : undefined });
  res.json({ ok: true });
});

taxonomyRouter.delete('/tags/:id', async (req, res) => {
  requireManager(req);
  const cur = await db.prepare(`SELECT * FROM contact_tags WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Etiqueta não encontrada.');
  let affected = 0;
  await tx(async () => {
    affected = await rewriteTag(tid(req), cur.name, null);
    await db.prepare(`DELETE FROM contact_tags WHERE id = ?`).run(cur.id);
  });
  await audit({ ...actor(req), action: 'tag.deleted', target: cur.name, details: { contactsAffected: affected } });
  res.json({ ok: true, contactsAffected: affected });
});

// ----- tipos de proposição -----
function cleanAcronym(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) throw bad('Informe a sigla (ex.: OF, REQ, PL).');
  if (!/^[A-Z0-9]{1,8}$/.test(s)) throw bad('A sigla deve ter até 8 letras ou números, sem espaços.');
  return s;
}

taxonomyRouter.post('/proposition-types', async (req, res) => {
  requireManager(req);
  await ensurePropositionTypes(tid(req));
  const name = cleanName(req.body?.name, 60, 'tipo de proposição');
  const acronym = cleanAcronym(req.body?.acronym);
  if (await db.prepare(`SELECT 1 FROM proposition_types WHERE tenant_id = ? AND name = ?`).get(tid(req), name)) {
    throw new HttpError(409, `O tipo "${name}" já existe.`);
  }
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO proposition_types (id, tenant_id, name, acronym, description) VALUES (?, ?, ?, ?, ?)`).run(
    id, tid(req), name, acronym, String(req.body?.description ?? '').trim().slice(0, 200)
  );
  await audit({ ...actor(req), action: 'proposition_type.created', target: name });
  res.status(201).json({ id });
});

taxonomyRouter.patch('/proposition-types/:id', async (req, res) => {
  requireManager(req);
  const cur = await db.prepare(`SELECT * FROM proposition_types WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Tipo de proposição não encontrado.');
  const name = req.body?.name === undefined ? cur.name : cleanName(req.body.name, 60, 'tipo de proposição');
  if (await db.prepare(`SELECT 1 FROM proposition_types WHERE tenant_id = ? AND name = ? AND id <> ?`).get(tid(req), name, cur.id)) {
    throw new HttpError(409, `O tipo "${name}" já existe.`);
  }
  const acronym = req.body?.acronym === undefined ? cur.acronym : cleanAcronym(req.body.acronym);
  const description = req.body?.description === undefined ? cur.description : String(req.body.description).trim().slice(0, 200);
  await db.prepare(`UPDATE proposition_types SET name = ?, acronym = ?, description = ? WHERE id = ?`).run(name, acronym, description, cur.id);
  await audit({ ...actor(req), action: 'proposition_type.updated', target: name, details: name !== cur.name ? { renamedFrom: cur.name } : undefined });
  res.json({ ok: true });
});

taxonomyRouter.delete('/proposition-types/:id', async (req, res) => {
  requireManager(req);
  const cur = await db.prepare(`SELECT * FROM proposition_types WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Tipo de proposição não encontrado.');
  await db.prepare(`DELETE FROM proposition_types WHERE id = ?`).run(cur.id);
  await audit({ ...actor(req), action: 'proposition_type.deleted', target: cur.name });
  res.json({ ok: true });
});

// ----- listas simples: canais de entrada e temas de demanda -----
function simpleListRoutes(path: string, list: SimpleList, label: { one: string; notFound: string; audit: string }) {
  taxonomyRouter.post(`/${path}`, async (req, res) => {
    requireManager(req);
    await ensureSimpleList(list, tid(req));
    const name = cleanName(req.body?.name, 60, label.one);
    if (await db.prepare(`SELECT 1 FROM ${list.table} WHERE tenant_id = ? AND name = ?`).get(tid(req), name)) {
      throw new HttpError(409, `"${name}" já existe.`);
    }
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO ${list.table} (id, tenant_id, name, description) VALUES (?, ?, ?, ?)`).run(
      id, tid(req), name, String(req.body?.description ?? '').trim().slice(0, 200)
    );
    await audit({ ...actor(req), action: `${label.audit}.created`, target: name });
    res.status(201).json({ id });
  });

  taxonomyRouter.patch(`/${path}/:id`, async (req, res) => {
    requireManager(req);
    const cur = await db.prepare(`SELECT * FROM ${list.table} WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
    if (!cur) throw new HttpError(404, label.notFound);
    const name = req.body?.name === undefined ? cur.name : cleanName(req.body.name, 60, label.one);
    if (await db.prepare(`SELECT 1 FROM ${list.table} WHERE tenant_id = ? AND name = ? AND id <> ?`).get(tid(req), name, cur.id)) {
      throw new HttpError(409, `"${name}" já existe.`);
    }
    const description = req.body?.description === undefined ? cur.description : String(req.body.description).trim().slice(0, 200);
    await db.prepare(`UPDATE ${list.table} SET name = ?, description = ? WHERE id = ?`).run(name, description, cur.id);
    await audit({ ...actor(req), action: `${label.audit}.updated`, target: name, details: name !== cur.name ? { renamedFrom: cur.name } : undefined });
    res.json({ ok: true });
  });

  taxonomyRouter.delete(`/${path}/:id`, async (req, res) => {
    requireManager(req);
    const cur = await db.prepare(`SELECT * FROM ${list.table} WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
    if (!cur) throw new HttpError(404, label.notFound);
    await db.prepare(`DELETE FROM ${list.table} WHERE id = ?`).run(cur.id);
    await audit({ ...actor(req), action: `${label.audit}.deleted`, target: cur.name });
    res.json({ ok: true });
  });
}

simpleListRoutes('entry-channels', ENTRY_CHANNELS, { one: 'canal de entrada', notFound: 'Canal de entrada não encontrado.', audit: 'entry_channel' });
simpleListRoutes('demand-themes', DEMAND_THEMES, { one: 'tema de demanda', notFound: 'Tema de demanda não encontrado.', audit: 'demand_theme' });
