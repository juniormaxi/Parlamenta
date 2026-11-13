/**
 * Ingestão: sincronização dos módulos, idempotência, versões/hash, exclusão e atualização, consistência
 * transacional, documentos extensos, ausência de duplicação e compatibilidade com a API anterior.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let h: typeof import('./helpers/app');
let api: ReturnType<typeof import('./helpers/app').client>;
let close: () => Promise<void>;
let ingest: typeof import('../server/kb/ingest');
let kbJobs: typeof import('../server/kb/jobs');
let T = '';
let T2 = '';
const U: Record<string, import('./helpers/app').User> = {};

before(async () => {
  env = await startTestEnv();
  h = await import('./helpers/app');
  ingest = await import('../server/kb/ingest');
  kbJobs = await import('../server/kb/jobs');
  const s = await h.setupApp();
  api = h.client(s.base);
  close = s.close;
  T = await h.createTenant(env.su, 'gab-ingest');
  T2 = await h.createTenant(env.su, 'gab-ingest-2');
  U.dep = await h.createUser(env.su, T, 'deputado');
  U.ass = await h.createUser(env.su, T, 'assessor_parlamentar');
  U.coord = await h.createUser(env.su, T, 'coordenador_atendimento');
  h.startWorker(2);
});
after(async () => {
  await h?.stopWorker();
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

const items = async (u = U.dep, q = '') => (await api(u, 'GET', `/tenant/knowledge${q}`)).body.items as any[];
const row = async (source: string, sourceId: string) =>
  (await env.su.query(`SELECT * FROM knowledge_items WHERE source = $1 AND source_id = $2`, [source, sourceId])).rows[0];

test('ofício: criar, editar e excluir sincronizam a base (mesma transação)', async () => {
  const c = await api(U.dep, 'POST', '/tenant/oficios', { code: 'OF-1', subject: 'Leitos de UTI', body: 'Solicitamos leitos de UTI no hospital.', recipientOrg: 'SES-MT' });
  assert.equal(c.status, 201);
  let r = await row('oficio', c.body.id);
  assert.equal(r.version, 1);
  assert.equal(r.doc_number, 'OF-1');
  assert.equal(r.visibility, 'tenant');
  assert.match(r.content_hash, /^[0-9a-f]{64}$/);
  assert.ok(JSON.parse(r.themes).some((t: any) => t.theme === 'Saúde'));

  // metadata only (status) → no new version, no reindex
  await h.waitIdle(env.su);
  await api(U.dep, 'PATCH', `/tenant/oficios/${c.body.id}`, { status: 'assinado_deputado' });
  r = await row('oficio', c.body.id);
  assert.equal(r.version, 1);
  assert.equal(JSON.parse(r.meta).statusLabel, 'Assinado');
  assert.equal(r.index_status, 'indexed');

  // content change → version 2, reindexed
  await api(U.dep, 'PATCH', `/tenant/oficios/${c.body.id}`, { body: 'Solicitamos leitos de UTI e um tomógrafo no hospital.' });
  r = await row('oficio', c.body.id);
  assert.equal(r.version, 2);
  await h.waitIdle(env.su);
  const chunks = await env.su.query(`SELECT DISTINCT version FROM knowledge_chunks WHERE item_id = $1`, [r.id]);
  assert.deepEqual(chunks.rows.map((x) => x.version), [2], 'só fragmentos da versão vigente');
  const versions = await env.su.query(`SELECT version FROM knowledge_versions WHERE item_id = $1 ORDER BY version`, [r.id]);
  assert.deepEqual(versions.rows.map((x) => x.version), [1, 2]);
  assert.ok((await items(U.dep, '?q=tomógrafo')).some((i) => i.id === r.id), 'busca textual pelos fragmentos');

  // delete → invisible immediately, purged later
  const d = await api(U.dep, 'DELETE', `/tenant/oficios/${c.body.id}`);
  assert.equal(d.status, 200);
  assert.ok(!(await items()).some((i) => i.id === r.id), 'some na hora');
  assert.equal((await api(U.dep, 'GET', `/tenant/knowledge/${r.id}`)).status, 404);
  await h.waitIdle(env.su);
  assert.equal(await row('oficio', c.body.id), undefined, 'limpeza física concluída');
  const left = await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_chunks WHERE item_id = $1`, [r.id]);
  assert.equal(left.rows[0].n, 0);
  const actions = (await env.su.query(`SELECT action FROM audit_log WHERE target = $1 ORDER BY id`, [r.id])).rows.map((x) => x.action);
  assert.deepEqual(actions, ['kb.document.created', 'kb.document.updated', 'kb.document.updated', 'kb.document.deleted']);
});

test('consistência transacional: falha na base desfaz a gravação do ofício', async () => {
  // Force the KB insert to fail (constraint on the catalog) and check the letter was not saved.
  await env.su.query(`ALTER TABLE knowledge_items ADD CONSTRAINT kb_test_fail CHECK (title NOT LIKE 'FALHAR%')`);
  try {
    const before = (await env.su.query(`SELECT COUNT(*)::int AS n FROM official_letters`)).rows[0].n;
    const r = await api(U.dep, 'POST', '/tenant/oficios', { code: 'FALHAR-1', subject: 'x', body: 'y' });
    assert.equal(r.status, 500);
    const afterN = (await env.su.query(`SELECT COUNT(*)::int AS n FROM official_letters`)).rows[0].n;
    assert.equal(afterN, before);
  } finally {
    await env.su.query(`ALTER TABLE knowledge_items DROP CONSTRAINT kb_test_fail`);
  }
});

test('idempotência: publicar o mesmo conteúdo de novo não cria versão nem job', async () => {
  const doc = { title: 'Relatório', content: 'Conteúdo estável.\r\n' };
  const a = await ingest.publishDocument(T, 'teste', 'idem', doc, U.dep.id);
  await h.waitIdle(env.su);
  const jobsBefore = (await env.su.query(`SELECT COUNT(*)::int AS n FROM jobs`)).rows[0].n;
  const b = await ingest.publishDocument(T, 'teste', 'idem', { ...doc, content: 'Conteúdo estável.\n' }, U.dep.id); // same after normalization
  assert.equal(a.change, 'created');
  assert.equal(b.change, 'unchanged');
  assert.equal(b.version, 1);
  const jobsAfter = (await env.su.query(`SELECT COUNT(*)::int AS n FROM jobs`)).rows[0].n;
  assert.equal(jobsAfter, jobsBefore);
});

test('sem duplicação sob concorrência: 20 publicações simultâneas do mesmo registro', async () => {
  const runs = await Promise.all(
    Array.from({ length: 20 }, (_, i) => h.db && ingest.publishDocument(T, 'teste', 'concorrente', { title: 'C', content: `versão ${i % 2}` }, U.dep.id))
  );
  const n = (await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_items WHERE source = 'teste' AND source_id = 'concorrente'`)).rows[0].n;
  assert.equal(n, 1);
  assert.equal(runs.filter((r) => r.change === 'created').length, 1);
  await h.waitIdle(env.su);
  const r = await row('teste', 'concorrente');
  const dupChunks = await env.su.query(`SELECT ord, COUNT(*) FROM knowledge_chunks WHERE item_id = $1 GROUP BY ord HAVING COUNT(*) > 1`, [r.id]);
  assert.equal(dupChunks.rows.length, 0);
  const v = await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_versions WHERE item_id = $1`, [r.id]);
  assert.equal(v.rows[0].n, r.version, 'uma linha de versão por versão');
});

test('mesmo conteúdo em origens diferentes: documentos distintos, identificados como iguais', async () => {
  const a = await ingest.publishDocument(T, 'teste', 'dup-a', { title: 'Ofício X', content: 'Texto idêntico em duas origens.' }, U.dep.id);
  const b = await ingest.publishDocument(T, 'outro', 'dup-b', { title: 'Ofício X (cópia)', content: 'Texto idêntico em duas origens.' }, U.dep.id);
  assert.notEqual(a.id, b.id);
  const got = await api(U.dep, 'GET', `/tenant/knowledge/${a.id}`);
  assert.deepEqual(got.body.sameContent.map((s: any) => s.id), [b.id]);
  // similar name, different content → not "same"
  const c = await ingest.publishDocument(T, 'teste', 'dup-c', { title: 'Ofício X', content: 'Outro texto.' }, U.dep.id);
  assert.ok(!(await api(U.dep, 'GET', `/tenant/knowledge/${c.id}`)).body.sameContent.length);
});

test('documento extenso: fragmentado por completo, sem truncamento', async () => {
  const para = (i: number) => `Parágrafo ${i}. ` + 'A saúde pública do município precisa de investimentos contínuos em atenção básica. '.repeat(12);
  const content = Array.from({ length: 1200 }, (_, i) => para(i)).join('\n\n'); // ~1.2 MB
  const pages = [0, Math.floor(content.length / 3), Math.floor((2 * content.length) / 3)];
  const r = await ingest.publishDocument(T, 'teste', 'grande', { title: 'Plano de saúde', content, pages }, U.dep.id);
  await h.waitIdle(env.su, 60_000);
  const ch = (await env.su.query(`SELECT ord, char_start, char_end, page_from, page_to, token_estimate, text FROM knowledge_chunks WHERE item_id = $1 ORDER BY ord`, [r.id])).rows;
  assert.ok(ch.length > 100);
  assert.equal(ch[0].char_start, 0);
  assert.equal(ch.at(-1).char_end, content.trimEnd().length, 'último fragmento termina no fim do texto');
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].char_start <= ch[i - 1].char_end, `sem lacunas entre ${i - 1} e ${i}`);
  assert.ok(ch.every((c) => c.token_estimate <= 820));
  assert.equal(ch[0].page_from, 1);
  assert.equal(ch.at(-1).page_to, 3);
  assert.ok(ch.some((c) => c.text.includes('Parágrafo 1199.')));
  const item = await row('teste', 'grande');
  assert.equal(item.index_status, 'indexed');
});

test('protocolo: só campos estruturados na base; texto livre e dados do cidadão nunca saem do módulo', async () => {
  await env.su.query(`INSERT INTO demand_themes (id, tenant_id, name) VALUES ('th-saude', $1, 'Saúde') ON CONFLICT DO NOTHING`, [T]);
  const S = 'ZQXSENT'; // marcador único: não pode aparecer em lugar nenhum da camada de conhecimento
  const p = await api(U.dep, 'POST', '/tenant/protocols', {
    citizenName: `Maria ${S}nome`,
    citizenPhone: '(65) 99876-5432',
    citizenEmail: `${S}mail@exemplo.com`,
    citizenCity: 'Cuiabá',
    theme: 'Saúde',
    subject: `Consulta ${S}assunto`,
    description: `A vizinha Joana ${S}relato, que mora na rua das Flores 12, está com câncer.`,
    priority: 'alta',
  });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  await api(U.dep, 'PATCH', `/tenant/protocols/${p.body.id}`, {
    resolutionNotes: `Encaminhado ao Dr. ${S}nota`,
    citizenFeedbackStatus: 'enviada_sucesso',
    citizenFeedbackText: `Prezada, ${S}resposta`,
    status: 'em_execucao',
  });
  // a free-text theme typed by staff is not a controlled category → generic label
  const p2 = await api(U.dep, 'POST', '/tenant/protocols', { citizenName: 'X', subject: 'y', theme: `Tema ${S}livre`, citizenCity: 'Sinop' });
  assert.equal(p2.status, 201);
  await h.waitIdle(env.su);

  const r = await row('protocolo', p.body.id);
  assert.equal(r.title, `${r.doc_number} · Saúde · Cuiabá`);
  assert.match(r.content, /Situação: Em execução/);
  assert.equal(r.visibility, 'roles');
  assert.equal(r.file_ref, `protocol:${p.body.id}`);
  assert.equal((await row('protocolo', p2.body.id)).title.includes('Outro tema'), true);

  // nothing of the free text anywhere in the knowledge layer (catalog, chunks, versions, queue, KB audit)
  const leaks = await env.su.query(
    `SELECT 'items' AS t FROM knowledge_items WHERE (title || summary || content || meta || tags) LIKE $1
     UNION ALL SELECT 'chunks' FROM knowledge_chunks WHERE text LIKE $1
     UNION ALL SELECT 'jobs' FROM jobs WHERE payload LIKE $1 OR ref LIKE $1 OR last_error LIKE $1
     UNION ALL SELECT 'audit' FROM audit_log WHERE action LIKE 'kb.%' AND COALESCE(details, '') LIKE $1`,
    [`%${S}%`]
  );
  assert.deepEqual(leaks.rows, []);
  for (const pii of ['Joana', 'Flores', 'câncer', '99876', 'Maria']) assert.ok(!(r.content + r.title + r.meta).includes(pii), pii);
  // nor through the API (search by the marker finds nothing, even for the Parlamentar)
  assert.equal((await items(U.dep, `?q=${S}`)).length, 0);
  assert.equal((await items(U.dep, '?q=Joana')).length, 0);
  // the original stays intact in the Protocolos module, under its own rules
  const orig = (await api(U.dep, 'GET', '/tenant/protocols')).body.find((x: any) => x.id === p.body.id);
  assert.ok(orig.description.includes(`${S}relato`));
  assert.ok(orig.timeline.length >= 1);

  // restricted access: assessor (not assignee) cannot see; coordination and Parlamentar can
  const vis = async (u: any) => (await items(u)).some((i) => i.id === r.id);
  assert.equal(await vis(U.ass), false);
  assert.equal(await vis(U.coord), true);
  assert.equal(await vis(U.dep), true);
  await api(U.dep, 'PATCH', `/tenant/protocols/${p.body.id}`, { assigneeId: U.ass.id, assigneeName: 'Assessor' });
  assert.equal(await vis(U.ass), true, 'responsável passa a ver');
});

test('clipping: notícias novas entram pela fila; arquivar retira, desarquivar devolve', async () => {
  const id = 'clip-1';
  await env.su.query(
    `INSERT INTO clipping_items (id, tenant_id, url, url_hash, title_hash, title, summary, source_name, published_at)
     VALUES ($1, $2, 'https://n.example/1', 'h1', 't1', 'Governo anuncia novo hospital', 'Obra em Sinop', 'Jornal', '2026-11-01T10:00:00Z')`,
    [id, T]
  );
  await ingest.requestSync(T, 'clipping', id, null);
  await h.waitIdle(env.su);
  let r = await row('clipping', id);
  assert.ok(r && !r.deleted_at);
  assert.equal(r.doc_date, '2026-11-01');
  const patch = await api(U.dep, 'PATCH', `/tenant/clipping/items/${id}`, { archived: true });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  r = await row('clipping', id);
  assert.ok(r === undefined || r.deleted_at, 'arquivada sai da base');
  await api(U.dep, 'PATCH', `/tenant/clipping/items/${id}`, { archived: false });
  r = await row('clipping', id);
  assert.ok(r && !r.deleted_at, 'desarquivada volta');
});

test('carga inicial (backfill) publica registros existentes, em lotes e só uma vez', async () => {
  // A letter that exists but was never published (e.g. created before this version).
  await env.su.query(
    `INSERT INTO official_letters (id, tenant_id, code, subject, data) VALUES ('legacy-1', $1, 'OF-L', 'Antigo', $2)`,
    [T2, JSON.stringify({ code: 'OF-L', subject: 'Antigo', body: 'Ofício antigo sobre educação nas escolas.', status: 'minuta' })]
  );
  await kbJobs.scheduleKbMaintenance();
  await h.waitIdle(env.su);
  const r = await row('oficio', 'legacy-1');
  assert.ok(r);
  assert.equal(r.tenant_id, T2);
  const done = await env.su.query(`SELECT source FROM knowledge_backfill WHERE tenant_id = $1 AND done_at IS NOT NULL ORDER BY source`, [T2]);
  assert.deepEqual(done.rows.map((x) => x.source), ['clipping', 'discurso', 'oficio', 'protocolo']);
  // running maintenance again does not republish
  const audits = async () => (await env.su.query(`SELECT COUNT(*)::int AS n FROM audit_log WHERE tenant_id = $1 AND action LIKE 'kb.document.%'`, [T2])).rows[0].n;
  const n1 = await audits();
  await kbJobs.scheduleKbMaintenance();
  await h.waitIdle(env.su);
  assert.equal(await audits(), n1);
});

test('contadores incrementais batem com o catálogo (reconciliação)', async () => {
  await h.waitIdle(env.su);
  const inc = (await env.su.query(`SELECT source, docs, bytes FROM knowledge_stats WHERE tenant_id = $1 AND docs > 0 ORDER BY source`, [T])).rows;
  await ingest.reconcileStats(T);
  const exact = (await env.su.query(`SELECT source, docs, bytes FROM knowledge_stats WHERE tenant_id = $1 AND docs > 0 ORDER BY source`, [T])).rows;
  assert.deepEqual(inc, exact);
});

test('compatibilidade: formato da listagem e API antiga upsertKnowledge/removeKnowledge', async () => {
  const k = await import('../server/knowledge');
  await k.upsertKnowledge({ tenantId: T, source: 'legado', sourceId: 'l1', title: 'Legado', summary: 's', content: 'c', tags: ['X'], meta: { a: 1 }, userId: U.dep.id });
  const list = await api(U.dep, 'GET', '/tenant/knowledge?tag=X');
  assert.equal(list.status, 200);
  const it = list.body.items[0];
  for (const key of ['id', 'source', 'sourceId', 'title', 'summary', 'tags', 'meta', 'themes', 'createdBy', 'createdAt', 'updatedAt']) assert.ok(key in it, key);
  assert.ok(Array.isArray(list.body.tags));
  await k.removeKnowledge(T, 'legado', 'l1');
  assert.equal((await api(U.dep, 'GET', '/tenant/knowledge?tag=X')).body.items.length, 0);
});

test('Mapa Neural: pré-calculado em segundo plano, filtros por tema/período e sem documentos sigilosos', async () => {
  for (let i = 0; i < 6; i++) {
    await ingest.publishDocument(T, 'mapa', `m${i}`, {
      title: `Hospital regional ${i}`,
      content: `Solicitação de leitos hospitalares e médicos plantonistas para o hospital regional de Sinop. Caso ${i}.`,
      docDate: `2026-0${(i % 3) + 1}-10`,
    }, U.dep.id);
  }
  await ingest.publishDocument(T, 'mapa', 'secreto', { title: 'Hospital secreto', content: 'Solicitação de leitos hospitalares sigilosa.', visibility: 'confidential', acl: { users: [U.dep.id] } }, U.dep.id);
  await h.waitIdle(env.su, 60_000);
  const g = await api(U.dep, 'GET', '/tenant/knowledge/graph?source=mapa');
  assert.equal(g.status, 200);
  const docs = g.body.nodes.filter((n: any) => n.kind === 'doc');
  assert.equal(docs.length, 6);
  assert.ok(!docs.some((d: any) => d.label.includes('secreto')));
  assert.ok(g.body.links.some((l: any) => l.kind === 'similar'), 'ligações de semelhança vindas do pré-cálculo');
  assert.equal(g.body.state.pending, false);
  const byPeriod = await api(U.dep, 'GET', '/tenant/knowledge/graph?source=mapa&from=2026-01-01&to=2026-01-31');
  assert.equal(byPeriod.body.nodes.filter((n: any) => n.kind === 'doc').length, 2);
  const byTheme = await api(U.dep, 'GET', '/tenant/knowledge/graph?source=mapa&theme=Educa%C3%A7%C3%A3o');
  assert.equal(byTheme.body.nodes.filter((n: any) => n.kind === 'doc').length, 0);
  const st = (await env.su.query(`SELECT dirty, duration_ms, docs FROM knowledge_graph_state WHERE tenant_id = $1`, [T])).rows[0];
  assert.equal(st.dirty, false);
  assert.ok(st.duration_ms >= 0);
});
