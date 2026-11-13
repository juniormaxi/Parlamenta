/**
 * Isolamento entre gabinetes, permissões por documento, RLS no banco e segurança dos endpoints.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let h: typeof import('./helpers/app');
let api: ReturnType<typeof import('./helpers/app').client>;
let close: () => Promise<void>;
let ingest: typeof import('../server/kb/ingest');
const T: Record<string, string> = {};
const U: Record<string, import('./helpers/app').User> = {};

before(async () => {
  env = await startTestEnv();
  h = await import('./helpers/app');
  ingest = await import('../server/kb/ingest');
  const s = await h.setupApp();
  api = h.client(s.base);
  close = s.close;
  T.a = await h.createTenant(env.su, 'gab-a');
  T.b = await h.createTenant(env.su, 'gab-b');
  U.aDep = await h.createUser(env.su, T.a, 'deputado');
  U.aAss = await h.createUser(env.su, T.a, 'assessor_parlamentar');
  U.aAss2 = await h.createUser(env.su, T.a, 'assessor_parlamentar');
  U.aCoord = await h.createUser(env.su, T.a, 'coordenador_atendimento');
  U.aCom = await h.createUser(env.su, T.a, 'comunicacao');
  U.bDep = await h.createUser(env.su, T.b, 'deputado');
  U.admin = await h.createUser(env.su, null, 'super_admin');
});
after(async () => {
  await h?.stopWorker();
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

test('RLS está efetivo para a conexão da aplicação (papel sem privilégios)', async () => {
  const r = await api(U.admin, 'GET', '/admin/rls');
  assert.equal(r.status, 200);
  assert.equal(r.body.effective, true, JSON.stringify(r.body));
  assert.equal(r.body.role, 'parlamentta_app');
});

test('um gabinete nunca vê documentos de outro (API)', async () => {
  const a = await api(U.aDep, 'POST', '/tenant/oficios', { code: 'OF-A-1', subject: 'Reforma do hospital regional', body: 'Texto do gabinete A sobre saúde.' });
  assert.equal(a.status, 201);
  const b = await api(U.bDep, 'POST', '/tenant/oficios', { code: 'OF-B-1', subject: 'Pavimentação', body: 'Texto do gabinete B sobre asfalto.' });
  assert.equal(b.status, 201);

  const listA = await api(U.aDep, 'GET', '/tenant/knowledge');
  const listB = await api(U.bDep, 'GET', '/tenant/knowledge');
  assert.deepEqual(listA.body.items.map((i: any) => i.title), ['OF-A-1 · Reforma do hospital regional']);
  assert.deepEqual(listB.body.items.map((i: any) => i.title), ['OF-B-1 · Pavimentação']);

  // direct id access across tenants → 404 (no existence leak)
  const idA = listA.body.items[0].id;
  assert.equal((await api(U.bDep, 'GET', `/tenant/knowledge/${idA}`)).status, 404);
  assert.equal((await api(U.bDep, 'PUT', `/tenant/knowledge/${idA}/access`, { visibility: 'tenant' })).status, 404);
  // search across tenants finds nothing
  const s = await api(U.bDep, 'GET', '/tenant/knowledge?q=hospital');
  assert.equal(s.body.items.length, 0);
  // graph only has own documents
  const g = await api(U.bDep, 'GET', '/tenant/knowledge/graph');
  assert.ok(g.body.nodes.filter((n: any) => n.kind === 'doc').every((n: any) => n.label.startsWith('OF-B')));
});

test('RLS no banco: sem contexto não há linhas; contexto de A não enxerga B nem com SQL direto', async () => {
  const app = new pg.Client({ connectionString: env.appUrl });
  await app.connect();
  try {
    const none = await app.query(`SELECT COUNT(*)::int AS n FROM knowledge_items`);
    assert.equal(none.rows[0].n, 0, 'sem contexto (falha fechada)');
    await app.query('BEGIN');
    await app.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', 'deputado', true), set_config('app.kb_scope', 'user', true)`, [T.a, U.aDep.id]);
    const own = await app.query(`SELECT tenant_id FROM knowledge_items`);
    assert.ok(own.rows.length >= 1);
    assert.ok(own.rows.every((r) => r.tenant_id === T.a));
    const cross = await app.query(`SELECT COUNT(*)::int AS n FROM knowledge_items WHERE tenant_id = $1`, [T.b]);
    assert.equal(cross.rows[0].n, 0);
    // writing into another tenant is rejected even in system scope
    await app.query(`SELECT set_config('app.kb_scope', 'system', true)`);
    await assert.rejects(
      app.query(`INSERT INTO knowledge_items (id, tenant_id, source, source_id, title) VALUES ('x', $1, 't', 'x', 'x')`, [T.b]),
      /row-level security/
    );
    await app.query('ROLLBACK');
    // the context does not survive the transaction (pooled connection comes back clean)
    const after = await app.query(`SELECT current_setting('app.tenant_id', true) AS t`);
    assert.ok(!after.rows[0].t);
    // user scope cannot write
    await app.query('BEGIN');
    await app.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), set_config('app.kb_scope', 'user', true)`, [T.a, U.aDep.id]);
    const upd = await app.query(`UPDATE knowledge_items SET title = 'hack'`);
    assert.equal(upd.rowCount, 0);
    await app.query('ROLLBACK');
  } finally {
    await app.end();
  }
});

test('permissões por documento: roles, users, confidential', async () => {
  const mk = async (sourceId: string, visibility: any, acl: any, author: string) =>
    (await ingest.publishDocument(T.a, 'teste', sourceId, { title: `Doc ${sourceId}`, content: `conteúdo ${sourceId}`, visibility, acl, authorId: author }, author)).id;
  const rolesDoc = await mk('r1', 'roles', { roles: ['coordenador_atendimento'] }, U.aCom.id);
  const usersDoc = await mk('u1', 'users', { users: [U.aAss.id] }, U.aCom.id);
  const confDoc = await mk('c1', 'confidential', { users: [U.aAss2.id] }, U.aCom.id);

  const sees = async (u: any, id: string) => (await api(u, 'GET', `/tenant/knowledge/${id}`)).status === 200;
  // roles
  assert.equal(await sees(U.aCoord, rolesDoc), true);
  assert.equal(await sees(U.aDep, rolesDoc), true, 'Parlamentar vê documentos restritos por papel');
  assert.equal(await sees(U.aAss, rolesDoc), false);
  assert.equal(await sees(U.aCom, rolesDoc), true, 'autor sempre vê');
  // users
  assert.equal(await sees(U.aAss, usersDoc), true);
  assert.equal(await sees(U.aAss2, usersDoc), false);
  assert.equal(await sees(U.aDep, usersDoc), true);
  // confidential: only listed users + author, not even the Parlamentar
  assert.equal(await sees(U.aAss2, confDoc), true);
  assert.equal(await sees(U.aDep, confDoc), false);
  assert.equal(await sees(U.aAss, confDoc), false);
  assert.equal(await sees(U.bDep, confDoc), false);

  // list and search respect the same rules
  const titles = async (u: any, q = '') => (await api(u, 'GET', `/tenant/knowledge${q}`)).body.items.map((i: any) => i.title);
  assert.ok(!(await titles(U.aAss)).includes('Doc r1'));
  assert.ok((await titles(U.aCoord)).includes('Doc r1'));
  assert.ok(!(await titles(U.aDep, '?q=c1')).includes('Doc c1'));

  // restricted access is audited, without content
  const audit = await env.su.query(`SELECT details FROM audit_log WHERE action = 'kb.document.accessed' AND target = $1`, [confDoc]);
  assert.ok(audit.rows.length >= 1);
  assert.ok(!JSON.stringify(audit.rows).includes('conteúdo'));
});

test('alteração de permissões: só administradores/autor; revogação imediata; auditada', async () => {
  const id = (await ingest.publishDocument(T.a, 'teste', 'p1', { title: 'Plano', content: 'texto do plano' }, U.aAss.id)).id;
  assert.equal((await api(U.aAss2, 'GET', `/tenant/knowledge/${id}`)).status, 200);
  // another assessor cannot change permissions
  assert.equal((await api(U.aAss2, 'PUT', `/tenant/knowledge/${id}/access`, { visibility: 'confidential', users: [] })).status, 403);
  // invalid input
  assert.equal((await api(U.aDep, 'PUT', `/tenant/knowledge/${id}/access`, { visibility: 'x' })).status, 400);
  assert.equal((await api(U.aDep, 'PUT', `/tenant/knowledge/${id}/access`, { visibility: 'users', users: [U.bDep.id] })).status, 400, 'usuário de outro gabinete');
  // the Parlamentar restricts → assessor 2 loses access immediately
  const r = await api(U.aDep, 'PUT', `/tenant/knowledge/${id}/access`, { visibility: 'users', users: [U.aAss.id] });
  assert.equal(r.status, 200);
  assert.equal((await api(U.aAss2, 'GET', `/tenant/knowledge/${id}`)).status, 404);
  assert.equal((await api(U.aAss, 'GET', `/tenant/knowledge/${id}`)).status, 200);
  const a = await env.su.query(`SELECT actor_id, details FROM audit_log WHERE action = 'kb.acl.changed' AND target = $1`, [id]);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].actor_id, U.aDep.id);
  // a later sync from the source does not overwrite manual permissions
  await ingest.publishDocument(T.a, 'teste', 'p1', { title: 'Plano', content: 'texto do plano v2' }, U.aAss.id);
  assert.equal((await api(U.aAss2, 'GET', `/tenant/knowledge/${id}`)).status, 404);
});

test('segurança dos endpoints', async () => {
  assert.equal((await api(null, 'GET', '/tenant/knowledge')).status, 401);
  assert.equal((await api(U.admin, 'GET', '/tenant/knowledge')).status, 403, 'super admin não lê dados de gabinete');
  const any = (await api(U.aDep, 'GET', '/tenant/knowledge')).body.items[0].id;
  assert.equal((await api(U.aDep, 'PUT', `/tenant/knowledge/${any}/access`, { visibility: 'tenant' }, { csrf: false })).status, 403, 'CSRF');
  assert.equal((await api(U.aAss, 'GET', '/tenant/knowledge/metrics')).status, 403);
  assert.equal((await api(U.aDep, 'GET', '/tenant/knowledge/metrics')).status, 200);
  assert.equal((await api(U.aAss, 'POST', `/tenant/knowledge/${any}/reprocess`)).status, 403);
  assert.equal((await api(U.aDep, 'GET', '/admin/rls')).status, 403);
  // SQL-ish input is just data
  const r = await api(U.aDep, 'GET', `/tenant/knowledge?q=${encodeURIComponent("'; DROP TABLE knowledge_items; --")}&tag=${encodeURIComponent("x' OR '1'='1")}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 0);
});

test('busca é auditada sem o texto pesquisado', async () => {
  await api(U.aDep, 'GET', '/tenant/knowledge?q=cpf%20123.456.789-00');
  const a = await env.su.query(`SELECT details FROM audit_log WHERE action = 'kb.search' AND actor_id = $1`, [U.aDep.id]);
  assert.ok(a.rows.length >= 1);
  assert.ok(!JSON.stringify(a.rows).includes('123.456'));
});
