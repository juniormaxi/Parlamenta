# Deploy na Railway

Tudo sai deste repositório, pelo terminal, com a CLI `railway` autenticada (`railway login`).

## Comandos

```bash
npm run railway:config -- --env staging              # compara o serviço com deploy/railway.json (não altera)
npm run railway:config -- --env production --apply   # aplica a configuração (não dispara deploy)

npm run deploy -- --env staging                      # envia o commit atual para staging (upload)
npm run deploy -- --env production --yes             # push da main → deploy pelo gatilho do GitHub
npm run deploy -- --env production --rollback --yes  # volta o CÓDIGO para o deploy anterior
```

`npm run deploy` sempre faz, nesta ordem:

1. Confere que não há alterações sem commit. Em produção, o commit precisa ser um avanço direto (fast-forward) da `origin/main`, publicado com `push HEAD:main`; a `main` nunca é reescrita.
2. Roda `npm run lint` e `npm test` (pule com `--skip-tests`).
3. Confere a configuração do serviço contra `deploy/railway.json` e **para** se houver diferença.
4. Faz backup do volume do Postgres. Em produção é obrigatório; em staging, `--no-backup` pula.
5. Faz o deploy: push da `main` em produção, upload do `git archive` do commit em staging.
6. Acompanha até `SUCCESS` ou `FAILED` e confere `/api/health`.

## Configuração do serviço (`deploy/railway.json`)

- **Pré-deploy:** `npm run db:migrate`, com `MIGRATION_DATABASE_URL` apontando para o dono das tabelas.
  Se a migração falhar, o deploy fica `FAILED` e a versão anterior continua no ar.
- **Healthcheck:** `/api/health`, com 120 s. Se a versão nova não responder, a Railway não troca de versão.
- **Réplicas:** 1 (veja abaixo).
- **`RAILPACK_PRUNE_DEPS=true`:** o build remove as dependências de desenvolvimento, como o
  `embedded-postgres` dos testes.

O antigo `railway.json` da raiz foi removido porque a Railway não o lia: nenhum serviço estava apontado para
ele, e o formato foi depreciado. A configuração agora é aplicada pela API, com o script acima.

## Conexões com o banco (RLS)

- `MIGRATION_DATABASE_URL = ${{Postgres.DATABASE_URL}}`: dono das tabelas. Só o pré-deploy usa essa conexão.
- `APP_DB_PASSWORD`: senha do papel restrito `parlamentta_app`, com 32 bytes aleatórios. O `npm run db:migrate`
  cria o papel ou acerta a senha e os atributos dele (sem superusuário, sem BYPASSRLS, sem posse de nada) e
  concede só DML.
- `DATABASE_URL = postgresql://parlamentta_app:${{APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}`:
  a aplicação conecta com o papel restrito, então o RLS vale. Confira em `/api/admin/kb-metrics`, no campo `rls.effective`.
- **Trocar a senha:** defina uma nova `APP_DB_PASSWORD` e faça deploy. O pré-deploy acerta o papel antes de a
  nova versão subir.
- **Rollback:** volte a `DATABASE_URL` para `${{Postgres.DATABASE_URL}}`. O RLS deixa de valer, mas os filtros
  da aplicação continuam.

## Réplicas: por que 1

A Railway não permite mais de uma réplica num serviço com volume, e este serviço precisa do volume (`/app/data`):

- **Sessões do WhatsApp (wacli):** guardadas em SQLite por gabinete. Uma sessão não pode rodar em dois
  processos ao mesmo tempo, então esse componente é, por natureza, de instância única.
- **Arquivos dos discursos e das campanhas do CRM.**

A fila de jobs já é segura para vários workers: isso foi homologado com 1.500 documentos, workers externos
e um worker morto no meio da carga. Para ganhar vazão sem réplicas, use `JOBS_CONCURRENCY` (workers por
processo) e, se preciso, mais CPU e memória no serviço. Mais réplicas exigem duas mudanças de arquitetura:
levar os arquivos para armazenamento de objetos e separar o WhatsApp num serviço próprio.

Em todo redeploy de serviço com volume há alguns segundos de indisponibilidade enquanto o volume troca de
contêiner. É uma limitação da Railway.

## Rollback

- **Código:** `npm run deploy -- --env production --rollback --yes`. As migrações são só aditivas, então a
  versão anterior roda sobre o esquema novo.
- **Banco:** restaurar o backup feito no passo 4, pelo painel da Railway (Postgres → Backups). Isso apaga o
  que foi gravado depois do backup, então só faça em último caso.
