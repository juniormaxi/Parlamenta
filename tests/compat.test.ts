/**
 * Compatibilidade dos módulos de origem com a nova arquitetura (papel com RLS ativo):
 * Ofícios, Discursos, Protocolos (equipe e site público) e Clipping continuam funcionando pela API,
 * com as mesmas respostas, e a Base de Conhecimento acompanha.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let h: typeof import('./helpers/app');
let api: ReturnType<typeof import('./helpers/app').client>;
let base = '';
let close: () => Promise<void>;
let T = '';
let dep: import('./helpers/app').User;
let ass: import('./helpers/app').User;

before(async () => {
  env = await startTestEnv();
  h = await import('./helpers/app');
  const s = await h.setupApp();
  base = s.base;
  api = h.client(s.base);
  close = s.close;
  T = await h.createTenant(env.su, 'compat');
  dep = await h.createUser(env.su, T, 'deputado');
  ass = await h.createUser(env.su, T, 'assessor_parlamentar');
  h.startWorker(2);
});
after(async () => {
  await h?.stopWorker();
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

const kbCount = async (source: string) =>
  (await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_items WHERE tenant_id = $1 AND source = $2 AND deleted_at IS NULL`, [T, source])).rows[0].n;

test('Ofícios: CRUD com o mesmo formato de resposta', async () => {
  const body = { code: 'OF-1', subject: 'Assunto', body: 'Texto', recipientName: 'Fulano', recipientOrg: 'SES', status: 'minuta', date: '2026-11-01' };
  const c = await api(ass, 'POST', '/tenant/oficios', body);
  assert.equal(c.status, 201);
  for (const k of ['id', 'code', 'subject', 'body', 'recipientName', 'recipientOrg', 'status', 'date', 'createdAt', 'updatedAt']) assert.ok(k in c.body, k);
  const list = await api(ass, 'GET', '/tenant/oficios');
  assert.equal(list.body.length, 1);
  const u = await api(ass, 'PATCH', `/tenant/oficios/${c.body.id}`, { status: 'assinado_deputado' });
  assert.equal(u.body.status, 'assinado_deputado');
  assert.equal(await kbCount('oficio'), 1);
  // validation unchanged
  assert.equal((await api(ass, 'POST', '/tenant/oficios', { code: '', subject: 'x', body: 'y' })).status, 400);
  assert.equal((await api(ass, 'DELETE', `/tenant/oficios/${c.body.id}`)).status, 200);
  assert.equal((await api(ass, 'GET', '/tenant/oficios')).body.length, 0);
  assert.equal(await kbCount('oficio'), 0);
});

test('Discursos: criação, listagem, detalhe, metadados, edição e exclusão', async () => {
  const meta = await api(dep, 'GET', '/tenant/db/speeches/meta');
  assert.equal(meta.status, 200);
  assert.ok(meta.body.acceptedExtensions.includes('pdf'));
  const c = await api(dep, 'POST', '/tenant/db/speeches', { title: 'Fala', occasion: 'Sessão Plenária', speechDate: '2026-10-01' });
  const r = await fetch(`${base}/tenant/db/speeches/${c.body.id}/file`, {
    method: 'PUT',
    headers: { cookie: dep.cookie, 'x-parlamentta-request': '1', 'x-file-name': 'fala.txt' },
    body: 'Senhor presidente, a educação pública precisa de investimento em escolas e professores.',
  });
  assert.equal(r.status, 200);
  await h.waitIdle(env.su);
  const list = await api(dep, 'GET', '/tenant/db/speeches');
  assert.equal(list.body[0].status, 'done');
  for (const k of ['id', 'title', 'status', 'themes', 'keywords', 'excerpt', 'wordCount']) assert.ok(k in list.body[0], k);
  const one = await api(dep, 'GET', `/tenant/db/speeches/${c.body.id}`);
  assert.match(one.body.text, /educação pública/);
  assert.ok(one.body.themes.includes('Educação'), 'classificação por palavras-chave mantida sem IA');
  assert.equal(await kbCount('discurso'), 1);
  assert.equal((await api(dep, 'PATCH', `/tenant/db/speeches/${c.body.id}`, { title: 'Fala editada' })).status, 200);
  assert.equal((await api(dep, 'POST', `/tenant/db/speeches/${c.body.id}/reprocess`)).status, 200);
  await h.waitIdle(env.su);
  assert.equal((await api(dep, 'GET', `/tenant/db/speeches/${c.body.id}`)).body.status, 'done');
  assert.equal((await api(ass, 'DELETE', `/tenant/db/speeches/${c.body.id}`)).status, 403, 'regra de papel mantida');
  assert.equal((await api(dep, 'DELETE', `/tenant/db/speeches/${c.body.id}`)).status, 200);
  assert.equal(await kbCount('discurso'), 0);
});

test('Protocolos: equipe e site público (abertura e consulta) inalterados', async () => {
  await env.su.query(`INSERT INTO demand_themes (id, tenant_id, name) VALUES ('t-infra', $1, 'Infraestrutura') ON CONFLICT DO NOTHING`, [T]);
  const c = await api(dep, 'POST', '/tenant/protocols', { citizenName: 'Ana', citizenPhone: '65999990000', subject: 'Buraco', description: 'Rua X', theme: 'Infraestrutura' });
  assert.equal(c.status, 201);
  for (const k of ['id', 'number', 'status', 'timeline', 'persisted', 'description', 'citizenName']) assert.ok(k in c.body, k);
  const p = await api(dep, 'PATCH', `/tenant/protocols/${c.body.id}`, { status: 'em_analise' });
  assert.equal(p.body.status, 'em_analise');
  const ev = await env.su.query(`SELECT visibility FROM protocol_events WHERE protocol_id = $1 AND action LIKE 'Status:%'`, [c.body.id]);
  assert.deepEqual(ev.rows, [{ visibility: 'public' }], 'evento de status continua público (visível ao cidadão)');
  // public site
  const site = await api(null, 'GET', '/public/sites/compat');
  assert.equal(site.status, 200);
  const web = await api(null, 'POST', '/public/sites/compat/protocols', {
    consent: true, name: 'Beto', city: 'Sinop', phone: '(66) 99999-1234', theme: 'Infraestrutura', subject: 'Ponte', description: 'Ponte caiu',
  });
  assert.equal(web.status, 201, JSON.stringify(web.body));
  const track = await api(null, 'POST', '/public/sites/compat/consulta', { number: web.body.number, phoneLast4: '1234' });
  assert.equal(track.status, 200);
  assert.equal(track.body.number, web.body.number);
  assert.equal(await kbCount('protocolo'), 2);
});

test('Clipping: listagem, facetas, arquivar e desarquivar', async () => {
  await env.su.query(
    `INSERT INTO clipping_items (id, tenant_id, url, url_hash, title_hash, title, summary, source_name, published_at)
     VALUES ('c1', $1, 'https://n.example/1', 'h1', 't1', 'Hospital inaugurado', 'Em Sinop', 'Jornal', '2026-11-01T10:00:00Z')`,
    [T]
  );
  const { requestSync } = await import('../server/kb/ingest');
  await requestSync(T, 'clipping', 'c1');
  await h.waitIdle(env.su);
  const items = await api(dep, 'GET', '/tenant/clipping/items');
  assert.equal(items.status, 200);
  assert.equal(items.body.total ?? items.body.items?.length ?? items.body.length, 1);
  assert.equal((await api(dep, 'GET', '/tenant/clipping/facets')).status, 200);
  assert.equal((await api(dep, 'POST', '/tenant/clipping/items/bulk', { ids: ['c1'], archived: true })).status, 200);
  await h.waitIdle(env.su);
  assert.equal(await kbCount('clipping'), 0);
  assert.equal((await api(dep, 'PATCH', '/tenant/clipping/items/c1', { archived: false })).status, 200);
  assert.equal(await kbCount('clipping'), 1);
  assert.equal((await api(ass, 'PATCH', '/tenant/clipping/items/c1', { archived: true })).status, 403, 'regra de papel mantida');
});
