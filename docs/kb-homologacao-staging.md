# Base de Conhecimento — homologação em staging e rollback

Escopo: commits das fases 1 e 2 da Base de Conhecimento (RLS, permissões, fila persistente, ingestão,
migrações explícitas). **Nada disto foi aplicado em produção.** Cada passo marcado com ⚠️ altera um ambiente
e só deve ser executado por quem tem autorização para aquele ambiente.

## 0. Pré-requisitos

- Um banco de **staging** separado (nunca a base de produção), de preferência restaurado de um backup recente
  de produção para validar a migração sobre dados reais.
- Duas URLs de conexão para staging:
  - `MIGRATION_DATABASE_URL` — usuário **dono** das tabelas (o atual, ex.: `postgres`).
  - `DATABASE_URL` — usuário da aplicação `parlamentta_app` (criado no passo 2).
- Backup/snapshot do banco de staging antes de começar.

## 1. Diagnóstico inicial (somente leitura)

```bash
DATABASE_URL=<url do dono> npm run db:check      # versão do Postgres, pgvector, papel, RLS, esquema
DATABASE_URL=<url do dono> npm run db:status     # migrações aplicadas/pendentes (esquema antigo: tudo pendente)
```

Registre: `postgres.version`, `extensions.vector` (disponível? versão?), dono das tabelas.
O `db:check` sai com código 2 enquanto o RLS não estiver efetivo — esperado neste passo.

## 2. ⚠️ Papel da aplicação

```bash
psql "$MIGRATION_DATABASE_URL" -v app_password='<senha forte>' -f scripts/create-app-role.sql
```

Cria `parlamentta_app` com `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`. Se o PostgreSQL for < 15,
o schema `public` concede CREATE a todos por padrão: avalie `REVOKE CREATE ON SCHEMA public FROM PUBLIC`
(afeta outros usuários do banco — decisão do responsável pelo ambiente).

## 3. ⚠️ Migração explícita

```bash
MIGRATION_DATABASE_URL=<dono> npm run db:migrate
MIGRATION_DATABASE_URL=<dono> npm run db:status  # pending: [], altered: []
```

- Aplica `0001_base` (o esquema que antes rodava no boot — idempotente sobre bancos existentes) e
  `0002_kb_fases_1_2` (aditiva: só cria colunas/tabelas/índices/políticas; não apaga nada).
- Ao final concede ao `parlamentta_app` apenas SELECT/INSERT/UPDATE/DELETE (sem TRUNCATE/DDL) e revoga
  escrita em `schema_migrations`.
- Rodar duas vezes, ou em paralelo, é seguro (advisory lock + registro por migração).
- Na Railway, `railway.json` passou a declarar `preDeployCommand: npm run db:migrate`: confirme no painel do
  serviço de staging que o comando pré-deploy roda **uma vez** com `MIGRATION_DATABASE_URL` definida
  (comportamento da Railway não verificado neste trabalho).

## 4. ⚠️ Trocar a conexão da aplicação

Variáveis do serviço de staging:

| Variável | Valor |
|---|---|
| `MIGRATION_DATABASE_URL` | URL do dono (usada só por `db:migrate`) |
| `DATABASE_URL` | URL com usuário `parlamentta_app` |
| `JOBS_CONCURRENCY` | `2` (padrão) |

A aplicação **não migra mais no boot**: se o esquema estiver desatualizado ela não sobe e informa o comando.

## 5. Verificações

1. `DATABASE_URL=<url parlamentta_app> npm run db:check` → `rls.effective: true`, `reasons: []`, código 0.
2. Log do boot **sem** a linha `[kb] RLS INATIVO`.
3. `GET /api/admin/kb-metrics` (super admin) → `rls.effective: true`; fila sem crescimento contínuo.
4. Com dois gabinetes de teste e usuários de papéis diferentes:
   - criar/editar/excluir ofício → aparece/atualiza/some na Base de Conhecimento;
   - enviar discurso (TXT, DOCX, PDF com texto) → processado, publicado; PDF digitalizado sem chave → "aguardando IA";
   - abrir protocolo (equipe e site público) → na base aparecem só número/tema/município/situação; assessor
     que não é responsável não vê; o texto do cidadão não aparece em nenhuma busca;
   - arquivar/desarquivar notícia do clipping;
   - gabinete A não encontra nada do gabinete B (lista, busca, documento por id, Mapa Neural);
   - documento sigiloso: só autor e pessoas listadas; Parlamentar não vê; acesso auditado.
5. Escalar o serviço para **2 réplicas** e repetir o envio de discursos: cada job processado uma vez
   (`SELECT kind, status, count(*) FROM jobs GROUP BY 1,2`), sem `dead` inesperado.
6. Reiniciar uma réplica durante o processamento de um discurso: o job volta para a fila em ~1 min (lease)
   e termina.
7. Suíte local antes de promover: `npm test` (todos verdes).

Critério de aceite: todos os itens acima OK, `db:check` com RLS efetivo e nenhum erro novo nos logs por 24 h.

## Rollback

| Situação | Ação | Efeito |
|---|---|---|
| Problema só de permissão/RLS | Voltar `DATABASE_URL` para a URL do dono e reiniciar | RLS deixa de valer (o dono o ignora); filtros da aplicação continuam; dados intactos |
| Problema no código novo | Reimplantar o commit anterior a `204cfc0` **e** voltar `DATABASE_URL` para o dono | O código antigo roda sobre o esquema novo (só aditivo) e volta a aplicar o esquema base no boot |
| Remover o papel | `DROP OWNED BY parlamentta_app; DROP ROLE parlamentta_app;` (dono) após voltar a `DATABASE_URL` | Sem impacto em dados |
| Desligar RLS sem trocar código | `ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY` nas 6 tabelas `knowledge_*` (dono) | Último recurso; preferir trocar `DATABASE_URL` |

Não há migração "down": as migrações são aditivas e o código anterior tolera as colunas/tabelas novas.
Remover tabelas/colunas novas **não** é necessário para o rollback e destruiria dados — não fazer sem
decisão explícita e backup.
