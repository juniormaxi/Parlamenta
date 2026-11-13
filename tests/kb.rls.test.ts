/**
 * Validação do RLS com o papel de aplicação SEM privilégios administrativos (parlamentta_app):
 * propriedade das tabelas, privilégios efetivos, tentativas de contornar o RLS, reutilização de conexões
 * do pool (pool com UMA conexão), workers, transações aninhadas e com erro, e o diagnóstico db:check.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import pg from 'pg';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let h: typeof import('./helpers/app');
let api: ReturnType<typeof import('./helpers/app').client>;
let close: () => Promise<void>;
let ctx: typeof import('../server/kb/context');
let ingest: typeof import('../server/kb/ingest');
let kbJobs: typeof import('../server/kb/jobs');
const T: Record<string, string> = {};
const U: Record<string, import('./helpers/app').User> = {};
const ids: Record<string, string> = {};

before(async () => {
  env = await startTestEnv({ PG_POOL_MAX: '1' }); // one pooled connection: every request reuses it
  h = await import('./helpers/app');
  ctx = await import('../server/kb/context');
  ingest = await import('../server/kb/ingest');
  kbJobs = await import('../server/kb/jobs');
  const s = await h.setupApp();
  api = h.client(s.base);
  close = s.close;
  T.a = await h.createTenant(env.su, 'rls-a');
  T.b = await h.createTenant(env.su, 'rls-b');
  U.a = await h.createUser(env.su, T.a, 'deputado');
  U.b = await h.createUser(env.su, T.b, 'deputado');
  for (let i = 0; i < 5; i++) {
    await ingest.publishDocument(T.a, 'teste', `a${i}`, { title: `A${i}`, content: `conteúdo do gabinete A ${i}` }, U.a.id);
    await ingest.publishDocument(T.b, 'teste', `b${i}`, { title: `B${i}`, content: `conteúdo do gabinete B ${i}` }, U.b.id);
  }
  ids.a0 = (await env.su.query(`SELECT id FROM knowledge_items WHERE source_id = 'a0'`)).rows[0].id;
});
after(async () => {
  await h?.stopWorker();
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

const asApp = async <T>(fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: env.appUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
};

test('papel da aplicação: não é superusuário, não tem BYPASSRLS e não é dono de nenhuma tabela', async () => {
  const r = await asApp(async (c) => (await c.query(`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user`)).rows[0]);
  assert.deepEqual(r, { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
  const owned = await env.su.query(`SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'parlamentta_app'`);
  assert.equal(owned.rows[0].n, 0);
  const rls = await env.su.query(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('knowledge_items','knowledge_acl','knowledge_versions','knowledge_chunks','knowledge_links','knowledge_graph_state') ORDER BY 1`
  );
  assert.equal(rls.rows.length, 6);
  assert.ok(rls.rows.every((x) => x.relrowsecurity));
});

test('privilégios efetivos: só DML; sem TRUNCATE/DDL; versão do esquema somente leitura', async () => {
  await asApp(async (c) => {
    const p = (await c.query(
      `SELECT has_table_privilege('knowledge_items','SELECT') s, has_table_privilege('knowledge_items','INSERT') i,
              has_table_privilege('knowledge_items','TRUNCATE') t, has_table_privilege('knowledge_items','REFERENCES') ref,
              has_table_privilege('knowledge_items','TRIGGER') trg, has_schema_privilege('public','CREATE') cr,
              has_table_privilege('schema_migrations','SELECT') ms, has_table_privilege('schema_migrations','INSERT') mi`
    )).rows[0];
    assert.deepEqual(p, { s: true, i: true, t: false, ref: false, trg: false, cr: false, ms: true, mi: false });
    await assert.rejects(c.query(`TRUNCATE knowledge_items`), /permission denied/);
    await assert.rejects(c.query(`ALTER TABLE knowledge_items DISABLE ROW LEVEL SECURITY`), /must be owner/);
    await assert.rejects(c.query(`DROP POLICY knowledge_items_tenant ON knowledge_items`), /must be owner/);
    await assert.rejects(c.query(`CREATE TABLE x (a int)`), /permission denied/);
    await assert.rejects(c.query(`INSERT INTO schema_migrations (id, checksum) VALUES ('9999', 'x')`), /permission denied/);
    await assert.rejects(c.query(`SET ROLE postgres`), /permission denied/);
  });
});

test('não dá para desligar o RLS na sessão (row_security = off)', async () => {
  await asApp(async (c) => {
    await c.query(`SET row_security = off`);
    await assert.rejects(c.query(`SELECT * FROM knowledge_items`), /row-level security/);
  });
});

test('pool de UMA conexão: o contexto nunca vaza entre requisições de gabinetes diferentes', async () => {
  const { db, pool } = h;
  assert.equal((pool as any).options.max, 1);
  // A request of A, then an unscoped query on the same (only) connection: no context, no rows.
  await ctx.withKb({ tenantId: T.a, userId: U.a.id, role: 'deputado', scope: 'user' }, async () => {
    const n = await db.prepare(`SELECT COUNT(*)::int AS n FROM knowledge_items`).get<{ n: number }>();
    assert.equal(n!.n, 5);
  });
  const after = await db.prepare(`SELECT current_setting('app.tenant_id', true) AS t, current_setting('app.kb_scope', true) AS s`).get<any>();
  assert.ok(!after.t && !after.s, JSON.stringify(after));
  assert.equal((await db.prepare(`SELECT COUNT(*)::int AS n FROM knowledge_items`).get<{ n: number }>())!.n, 0);
  // An error inside the transaction rolls back and also clears the context.
  await assert.rejects(
    ctx.withKb({ tenantId: T.a, userId: U.a.id, role: 'deputado', scope: 'system' }, async () => {
      throw new Error('falha proposital');
    })
  );
  assert.equal((await db.prepare(`SELECT COUNT(*)::int AS n FROM knowledge_items`).get<{ n: number }>())!.n, 0);
  // 60 interleaved concurrent API requests of A and B over the single connection: never mixed.
  const res = await Promise.all(Array.from({ length: 60 }, (_, i) => api(i % 2 ? U.b : U.a, 'GET', '/tenant/knowledge').then((r) => ({ i, r }))));
  for (const { i, r } of res) {
    assert.equal(r.status, 200);
    const want = i % 2 ? 'B' : 'A';
    assert.ok(r.body.items.length === 5 && r.body.items.every((x: any) => x.title.startsWith(want)), `requisição ${i}`);
  }
});

test('transações aninhadas restauram o contexto anterior', async () => {
  const { db } = h;
  await ctx.withKb({ tenantId: T.a, userId: U.a.id, role: 'deputado', scope: 'system' }, async () => {
    await ctx.withKb({ tenantId: T.a, userId: U.a.id, role: 'assessor_parlamentar', scope: 'user' }, async () => {
      const s = await db.prepare(`SELECT current_setting('app.kb_scope', true) AS s, current_setting('app.role', true) AS r`).get<any>();
      assert.deepEqual(s, { s: 'user', r: 'assessor_parlamentar' });
    });
    const s = await db.prepare(`SELECT current_setting('app.kb_scope', true) AS s`).get<any>();
    assert.equal(s.s, 'system');
  });
});

test('workers: um job com tenant errado não alcança documentos de outro gabinete', async () => {
  // indexing/purging A's document "as B" finds nothing and changes nothing
  await env.su.query(`UPDATE knowledge_items SET index_status = 'pending' WHERE id = $1`, [ids.a0]);
  const r = await kbJobs.indexItem(T.b, ids.a0);
  assert.deepEqual(r, { chunks: 0, skipped: true });
  assert.equal((await env.su.query(`SELECT index_status FROM knowledge_items WHERE id = $1`, [ids.a0])).rows[0].index_status, 'pending');
  await env.su.query(`UPDATE knowledge_items SET deleted_at = '2026-01-01 00:00:00' WHERE id = $1`, [ids.a0]);
  const jobs = await import('../server/jobs');
  await jobs.enqueue({ tenantId: T.b, kind: 'kb.purge', ref: ids.a0 });
  h.startWorker(1);
  await h.waitIdle(env.su);
  await h.stopWorker();
  assert.equal((await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_items WHERE id = $1`, [ids.a0])).rows[0].n, 1, 'não expurgado por outro tenant');
  await env.su.query(`UPDATE knowledge_items SET deleted_at = NULL WHERE id = $1`, [ids.a0]);
  // after the worker, the pooled connection has no leftover context
  const s = await h.db.prepare(`SELECT current_setting('app.tenant_id', true) AS t`).get<any>();
  assert.ok(!s.t);
});

test('db:check (somente leitura) confirma RLS efetivo para o papel e inefetivo para o superusuário', async () => {
  const run = (url: string) =>
    new Promise<{ code: number; out: any }>((resolve) => {
      execFile(process.execPath, ['--import', 'tsx', 'scripts/db-check.ts'], { env: { ...process.env, DATABASE_URL: url } }, (err, stdout) => {
        resolve({ code: (err as any)?.code ?? 0, out: JSON.parse(stdout) });
      });
    });
  const app = await run(env.appUrl);
  assert.equal(app.code, 0, JSON.stringify(app.out.rls));
  assert.equal(app.out.rls.effective, true);
  assert.deepEqual(app.out.schema.pending, []);
  const su = await run(env.superUrl);
  assert.equal(su.code, 2);
  assert.ok(su.out.rls.reasons.some((x: string) => /SUPERUSER/.test(x)));
  console.log('PostgreSQL de teste:', app.out.postgres.version, '· pgvector:', JSON.stringify(app.out.extensions.vector));
});
