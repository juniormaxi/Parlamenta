-- Papel dedicado da aplicação, sujeito ao Row-Level Security da Base de Conhecimento.
--
-- NÃO é executado automaticamente. Rodar UMA vez, como dono do banco (ex.: usuário postgres da Railway),
-- somente com autorização, e depois:
--   1. MIGRATION_DATABASE_URL = URL atual (dono das tabelas) → `npm run db:migrate` (concede os privilégios)
--   2. DATABASE_URL           = mesma URL com usuário parlamentta_app e a senha abaixo
--   3. `npm run db:check` (com a DATABASE_URL nova) → rls.effective = true
-- Procedimento completo: docs/kb-homologacao-staging.md
--
-- Rollback: voltar DATABASE_URL para a URL do dono (o RLS deixa de valer; os filtros da aplicação continuam).
--
-- Troque a senha antes de executar (psql: \set app_password '...').

CREATE ROLE parlamentta_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
-- GRANT CONNECT ON DATABASE <nome_do_banco> TO parlamentta_app;  -- se o banco restringir CONNECT a PUBLIC
GRANT USAGE ON SCHEMA public TO parlamentta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO parlamentta_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO parlamentta_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO parlamentta_app;
-- Tabelas criadas por migrações futuras recebem os privilégios a cada `npm run db:migrate` (KB_GRANTS em server/kb/schema.ts).
-- Nunca conceda TRUNCATE, REFERENCES, TRIGGER, CREATE nem a posse de tabelas a este papel: isso anula o RLS.
