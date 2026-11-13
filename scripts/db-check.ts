/**
 * Diagnóstico SOMENTE LEITURA do banco (não cria, altera nem instala nada).
 *
 *   npm run db:check            usa DATABASE_URL (a conexão da aplicação)
 *
 * Informa: versão do PostgreSQL e compatibilidade com pgvector, extensões disponíveis/instaladas, papel da
 * conexão (superusuário? BYPASSRLS?), dono das tabelas de conhecimento, RLS habilitado e políticas,
 * privilégios efetivos do papel da aplicação e versão do esquema. Sai com código 2 se o RLS não estiver efetivo.
 */
import 'dotenv/config';
import { connectionFor, migrationStatus } from '../server/migrations';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
const KB_TABLES = ['knowledge_items', 'knowledge_acl', 'knowledge_versions', 'knowledge_chunks', 'knowledge_links', 'knowledge_graph_state'];

const c = connectionFor(url);
await c.connect();
try {
  await c.query('SET default_transaction_read_only = on');
  const v = (await c.query(`SELECT current_setting('server_version') AS version, current_setting('server_version_num')::int AS num`)).rows[0];
  const ext = (await c.query(
    `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector','citext','pg_trgm') ORDER BY name`
  )).rows;
  const role = (await c.query(
    `SELECT current_user AS role, rolsuper AS superuser, rolbypassrls AS bypassrls, rolcreaterole AS createrole, rolcreatedb AS createdb
       FROM pg_roles WHERE rolname = current_user`
  )).rows[0];
  const tables = (await c.query(
    `SELECT c.relname AS table, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
            (SELECT COUNT(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
            has_table_privilege(current_user, c.oid, 'SELECT') AS sel, has_table_privilege(current_user, c.oid, 'INSERT') AS ins,
            has_table_privilege(current_user, c.oid, 'UPDATE') AS upd, has_table_privilege(current_user, c.oid, 'DELETE') AS del,
            has_table_privilege(current_user, c.oid, 'TRUNCATE') AS trunc
       FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1) ORDER BY c.relname`,
    [KB_TABLES]
  )).rows;
  const createInPublic = (await c.query(`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS ok`)).rows[0].ok;
  const schema = await migrationStatus(c).catch((e) => ({ error: (e as Error).message }));

  const ownsAny = tables.some((t: any) => t.owner === role.role);
  const rlsEffective = !role.superuser && !role.bypassrls && !ownsAny && tables.length === KB_TABLES.length && tables.every((t: any) => t.rls && t.policies > 0);
  const vector = ext.find((e: any) => e.name === 'vector');
  const report = {
    postgres: {
      version: v.version,
      pgvectorCompatible: v.num >= 130000,
      note: 'pgvector 0.8.x suporta PostgreSQL 13 a 18; HNSW requer pgvector ≥ 0.5; halfvec ≥ 0.7; iterative index scan ≥ 0.8.',
    },
    extensions: {
      vector: vector ? { available: vector.default_version, installed: vector.installed_version } : 'NÃO disponível neste servidor (precisa ser instalada pelo provedor)',
      others: ext.filter((e: any) => e.name !== 'vector'),
    },
    connection: { ...role, canCreateInPublic: createInPublic },
    knowledgeTables: tables,
    rls: {
      effective: rlsEffective,
      reasons: [
        role.superuser && 'papel é SUPERUSER (ignora RLS)',
        role.bypassrls && 'papel tem BYPASSRLS',
        ownsAny && 'papel é DONO de tabelas de conhecimento (dono ignora RLS sem FORCE)',
        tables.some((t: any) => !t.rls) && 'há tabela sem RLS habilitado',
        tables.some((t: any) => t.trunc) && 'papel tem TRUNCATE (ignora RLS)',
        createInPublic && 'papel pode criar objetos no schema public',
      ].filter(Boolean),
    },
    schema,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!rlsEffective) process.exitCode = 2;
} finally {
  await c.end();
}
