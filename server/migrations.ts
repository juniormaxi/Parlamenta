/**
 * Migrações explícitas e versionadas do esquema.
 *
 * - NÃO rodam no boot. São aplicadas por `npm run db:migrate` (scripts/migrate.ts), uma vez por deploy
 *   (ex.: preDeployCommand da Railway) ou à mão. Várias execuções simultâneas são seguras: um advisory lock
 *   global serializa, e cada migração já aplicada é pulada.
 * - Cada migração roda numa transação própria e é registrada em schema_migrations (id + checksum do SQL).
 * - No boot, a aplicação só VERIFICA (assertSchemaCurrent): se faltar alguma migração, ela não sobe e
 *   informa o comando a executar. Réplicas nunca alteram o esquema.
 * - Migrações aplicadas não podem ser editadas (o checksum denuncia): mudanças entram como uma migração NOVA
 *   no fim da lista.
 *
 * A conexão de migração é MIGRATION_DATABASE_URL (dono das tabelas) ou, na falta dela, DATABASE_URL.
 */
import crypto from 'node:crypto';
import pg from 'pg';
import { BASE_SCHEMA } from './db';
import { KB_SCHEMA, KB_POLICIES, KB_GRANTS } from './kb/schema';

export interface Migration {
  id: string;
  description: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  // Esquema que antes era aplicado no boot (idempotente: segura em bancos que já o têm).
  { id: '0001_base', description: 'Esquema base da plataforma', sql: BASE_SCHEMA },
  { id: '0002_kb_fases_1_2', description: 'Base de Conhecimento: RLS, permissões, versões, fragmentos, fila, métricas', sql: KB_SCHEMA + KB_POLICIES },
];
/** Versão de esquema exigida por este código. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.id;

const LOCK = 727274;
const checksum = (sql: string) => crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
const TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT current_user
)`;

export function connectionFor(url: string) {
  return new pg.Client({ connectionString: url, ssl: /sslmode=require/.test(url) || process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined });
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  checksumMismatch: string[];
  version: string;
}

/** Applies pending migrations (owner connection). Safe to run concurrently and repeatedly. */
export async function runMigrations(client: pg.Client | pg.PoolClient, log: (s: string) => void = () => {}): Promise<MigrationReport> {
  const report: MigrationReport = { applied: [], skipped: [], checksumMismatch: [], version: SCHEMA_VERSION };
  await client.query('SELECT pg_advisory_lock($1)', [LOCK]);
  try {
    await client.query(TABLE);
    const done = new Map(((await client.query(`SELECT id, checksum FROM schema_migrations`)).rows as any[]).map((r) => [r.id, r.checksum]));
    for (const m of MIGRATIONS) {
      const sum = checksum(m.sql);
      if (done.has(m.id)) {
        if (done.get(m.id) !== sum) report.checksumMismatch.push(m.id);
        report.skipped.push(m.id);
        continue;
      }
      log(`aplicando ${m.id} — ${m.description}`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(`INSERT INTO schema_migrations (id, checksum, description) VALUES ($1, $2, $3)`, [m.id, sum, m.description]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migração ${m.id} falhou e foi desfeita: ${(e as Error).message}`);
      }
      report.applied.push(m.id);
    }
    await client.query(KB_GRANTS);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => undefined);
  }
  return report;
}

/** Read-only status: applied, pending and altered migrations. */
export async function migrationStatus(q: { query: (sql: string) => Promise<{ rows: any[] }> }) {
  const exists = (await q.query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`)).rows[0].ok;
  const rows = exists ? (await q.query(`SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id`)).rows : [];
  const applied = new Map(rows.map((r: any) => [r.id, r]));
  return {
    required: SCHEMA_VERSION,
    applied: rows.map((r: any) => ({ id: r.id, appliedAt: r.applied_at })),
    pending: MIGRATIONS.filter((m) => !applied.has(m.id)).map((m) => m.id),
    altered: MIGRATIONS.filter((m) => applied.has(m.id) && (applied.get(m.id) as any).checksum !== checksum(m.sql)).map((m) => m.id),
    unknown: rows.filter((r: any) => !MIGRATIONS.some((m) => m.id === r.id)).map((r: any) => r.id),
  };
}

/** Boot check: refuses to start on an outdated schema (never migrates). */
export async function assertSchemaCurrent(q: { query: (sql: string) => Promise<{ rows: any[] }> }) {
  const st = await migrationStatus(q);
  if (st.pending.length) {
    throw new Error(
      `Esquema do banco desatualizado: faltam as migrações ${st.pending.join(', ')} (versão exigida ${st.required}). ` +
        'Execute `npm run db:migrate` com MIGRATION_DATABASE_URL (dono das tabelas) antes de iniciar a aplicação.'
    );
  }
  if (st.altered.length) console.warn(`[schema] migrações já aplicadas foram editadas no código: ${st.altered.join(', ')} (não serão reaplicadas).`);
  if (st.unknown.length) console.warn(`[schema] o banco tem migrações que este código não conhece (versão mais nova?): ${st.unknown.join(', ')}.`);
  return st;
}
