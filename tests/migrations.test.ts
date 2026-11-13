/**
 * Migrações explícitas: banco vazio, banco já existente (legado), execução concorrente (várias réplicas),
 * reexecução idempotente, detecção de edição, boot recusando esquema desatualizado e papel sem privilégios.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let mig: typeof import('../server/migrations');
let dbmod: typeof import('../server/db');

before(async () => {
  env = await startTestEnv();
  mig = await import('../server/migrations');
  dbmod = await import('../server/db');
});
after(async () => {
  await dbmod?.pool.end().catch(() => undefined);
  await env?.stop();
});

const fresh = async (name: string) => {
  await env.su.query(`CREATE DATABASE ${name}`);
  return env.superUrl.replace(/\/kbtest$/, `/${name}`);
};
const client = async (url: string) => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
};

test('banco vazio: aplica todas as migrações e registra a versão', async () => {
  const c = await client(await fresh('m_vazio'));
  try {
    const r = await mig.runMigrations(c);
    assert.deepEqual(r.applied, mig.MIGRATIONS.map((m) => m.id));
    const st = await mig.migrationStatus(c);
    assert.deepEqual(st.pending, []);
    assert.equal(st.required, mig.SCHEMA_VERSION);
    // re-run: nothing to do
    const again = await mig.runMigrations(c);
    assert.deepEqual(again.applied, []);
  } finally {
    await c.end();
  }
});

test('banco legado (esquema criado pelo boot antigo, sem schema_migrations): migra sem perder dados', async () => {
  const url = await fresh('m_legado');
  const c = await client(url);
  try {
    await c.query(dbmod.BASE_SCHEMA); // what the old boot did
    await c.query(`INSERT INTO tenants (id, slug, name, sphere) VALUES ('t', 't', 'T', 'estadual')`);
    await c.query(`INSERT INTO knowledge_items (id, tenant_id, source, source_id, title, content) VALUES ('k', 't', 'oficio', 'o', 'Antigo', 'texto')`);
    const r = await mig.runMigrations(c);
    assert.deepEqual(r.applied, mig.MIGRATIONS.map((m) => m.id));
    const k = (await c.query(`SELECT title, content, visibility, version, index_status FROM knowledge_items WHERE id = 'k'`)).rows[0];
    assert.deepEqual(k, { title: 'Antigo', content: 'texto', visibility: 'tenant', version: 1, index_status: 'pending' });
  } finally {
    await c.end();
  }
});

test('várias réplicas migrando ao mesmo tempo: cada migração aplicada uma única vez', async () => {
  const url = await fresh('m_concorrente');
  const cs = await Promise.all(Array.from({ length: 5 }, () => client(url)));
  try {
    const rs = await Promise.all(cs.map((c) => mig.runMigrations(c)));
    const applied = rs.flatMap((r) => r.applied);
    assert.deepEqual(applied.sort(), mig.MIGRATIONS.map((m) => m.id).sort());
    const rows = (await cs[0]!.query(`SELECT id, COUNT(*)::int AS n FROM schema_migrations GROUP BY id`)).rows;
    assert.ok(rows.every((x) => x.n === 1));
  } finally {
    await Promise.all(cs.map((c) => c.end()));
  }
});

test('boot recusa esquema desatualizado e aceita o atual; migração editada é denunciada', async () => {
  const url = await fresh('m_boot');
  const c = await client(url);
  try {
    await assert.rejects(mig.assertSchemaCurrent(c), /npm run db:migrate/);
    await mig.runMigrations(c);
    const st = await mig.assertSchemaCurrent(c);
    assert.deepEqual(st.pending, []);
    await c.query(`UPDATE schema_migrations SET checksum = 'editada' WHERE id = '0001_base'`);
    assert.deepEqual((await mig.migrationStatus(c)).altered, ['0001_base']);
  } finally {
    await c.end();
  }
});

test('o papel da aplicação não consegue migrar (DDL negado) e a aplicação não migra no boot', async () => {
  const url = await fresh('m_papel');
  await env.su.query(`GRANT CONNECT ON DATABASE m_papel TO parlamentta_app`);
  const appUrl = env.appUrl.replace(/\/kbtest$/, '/m_papel');
  const c = await client(appUrl);
  try {
    await assert.rejects(mig.runMigrations(c), /permission denied|must be owner/);
  } finally {
    await c.end();
  }
  const fs = await import('node:fs');
  const index = fs.readFileSync('server/index.ts', 'utf8');
  assert.ok(!/\bmigrate\(\)|runMigrations\(/.test(index), 'server/index.ts não pode migrar');
  assert.ok(/assertSchemaCurrent\(/.test(index));
  void url;
});
