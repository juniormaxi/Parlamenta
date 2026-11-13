/**
 * Migração explícita do esquema (nunca roda no boot da aplicação).
 *
 *   npm run db:migrate          aplica as migrações pendentes
 *   npm run db:migrate -- --status   só mostra aplicadas/pendentes (somente leitura)
 *
 * Conexão: MIGRATION_DATABASE_URL (dono das tabelas) ou DATABASE_URL.
 * Seguro com várias réplicas/execuções simultâneas (advisory lock + registro em schema_migrations).
 */
import 'dotenv/config';

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Defina MIGRATION_DATABASE_URL (dono das tabelas) ou DATABASE_URL.');
  process.exit(1);
}
process.env.DATABASE_URL ||= url; // server/db.ts exige a variável ao ser importado (o pool não é usado aqui)
const { runMigrations, migrationStatus, connectionFor, SCHEMA_VERSION } = await import('../server/migrations');
const { pool } = await import('../server/db');

const client = connectionFor(url);
await client.connect();
try {
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify(await migrationStatus(client), null, 2));
  } else {
    const r = await runMigrations(client, (s) => console.log(`[migrate] ${s}`));
    console.log(`[migrate] versão do esquema: ${SCHEMA_VERSION} · aplicadas agora: ${r.applied.join(', ') || 'nenhuma'}`);
    if (r.checksumMismatch.length) console.warn(`[migrate] atenção: migrações aplicadas e depois editadas: ${r.checksumMismatch.join(', ')}`);
  }
} catch (e) {
  console.error(`[migrate] ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
  await pool.end().catch(() => undefined);
}
