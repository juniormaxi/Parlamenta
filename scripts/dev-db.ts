/**
 * Postgres local para desenvolvimento, sem Docker: PGlite (Postgres 18 em WASM) exposto
 * pelo protocolo do Postgres em 127.0.0.1:5433. Dados em ./data/pg.
 *
 *   npm run dev:db
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run db:migrate   (o boot não migra mais)
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres PG_POOL_MAX=1 npm run dev:api
 *
 * PGlite tem uma única sessão: use PG_POOL_MAX=1 para que transações não se misturem.
 */
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dir = process.env.PGLITE_DIR || path.resolve(process.cwd(), 'data', 'pg');
const port = Number(process.env.PGLITE_PORT || 5433);

const db = await PGlite.create(dir, { extensions: { citext } });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 4 });
await server.start();
console.log(`Postgres local (PGlite) em postgres://postgres:postgres@127.0.0.1:${port}/postgres  ·  dados: ${dir}`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
