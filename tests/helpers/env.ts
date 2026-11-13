/**
 * Ambiente de teste isolado: um PostgreSQL 17 real e descartável (embedded-postgres), num diretório temporário,
 * em porta própria. Nunca toca DATABASE_URL de desenvolvimento ou produção.
 *
 * - Migrações rodam como superusuário (MIGRATION_DATABASE_URL), como seria com o dono das tabelas.
 * - A APLICAÇÃO conecta como parlamentta_app (NOSUPERUSER, NOBYPASSRLS, não dono): o RLS vale de verdade.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

export interface TestEnv {
  superUrl: string;
  appUrl: string;
  dataDir: string;
  stop(): Promise<void>;
  su: pg.Pool;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });

function hydrateEmbeddedPostgres() {
  // npm may skip the package's postinstall (it only recreates symlinks of the bundled binaries).
  const dir = path.resolve('node_modules/@embedded-postgres/linux-x64');
  if (fs.existsSync(path.join(dir, 'scripts/hydrate-symlinks.js'))) {
    execFileSync(process.execPath, ['scripts/hydrate-symlinks.js'], { cwd: dir, stdio: 'ignore' });
  }
}

export async function startTestEnv(extraEnv: Record<string, string> = {}): Promise<TestEnv> {
  hydrateEmbeddedPostgres();
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const base = fs.mkdtempSync(path.join(process.env.KB_TEST_TMP || os.tmpdir(), 'parlamentta-test-'));
  const port = await freePort();
  const pgi = new EmbeddedPostgres({
    databaseDir: path.join(base, 'pg'),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pgi.initialise();
  await pgi.start();
  const appPassword = crypto.randomBytes(12).toString('hex');
  const c = pgi.getPgClient();
  await c.connect();
  await c.query(`CREATE DATABASE kbtest`);
  await c.query(`CREATE ROLE parlamentta_app LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS`);
  await c.end();

  const superUrl = `postgres://postgres:postgres@127.0.0.1:${port}/kbtest`;
  const appUrl = `postgres://parlamentta_app:${appPassword}@127.0.0.1:${port}/kbtest`;
  Object.assign(process.env, {
    DATABASE_URL: appUrl,
    MIGRATION_DATABASE_URL: superUrl,
    PARLAMENTTA_DATA_DIR: path.join(base, 'data'),
    PG_POOL_MAX: '12',
    KB_GRAPH_DEBOUNCE_MS: '0',
    KB_PURGE_DELAY_MS: '0',
    JOBS_LEASE_SECONDS: '3',
    GEMINI_API_KEY: '',
    ...extraEnv,
  });
  const su = new pg.Pool({ connectionString: superUrl, max: 4 });
  return {
    superUrl,
    appUrl,
    dataDir: base,
    su,
    async stop() {
      await su.end().catch(() => undefined);
      await pgi.stop().catch(() => undefined);
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}
