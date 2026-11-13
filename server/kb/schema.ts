/**
 * Base de Conhecimento — schema aditivo (fases 1 e 2).
 *
 * Tudo é idempotente e não destrutivo: só CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 * Roda no boot, depois do SCHEMA principal (server/db.ts → migrate()).
 *
 * Isolamento (RLS): as tabelas de conhecimento têm Row-Level Security. O contexto vem de variáveis
 * LOCAIS da transação (set_config(..., true)), aplicadas por server/kb/context.ts → somem no COMMIT/ROLLBACK,
 * então uma conexão devolvida ao pool nunca carrega o tenant de outra requisição.
 *   app.tenant_id  — gabinete da sessão (sem ele, nenhuma linha é visível: falha fechada)
 *   app.user_id    — usuário da sessão
 *   app.role       — papel do usuário
 *   app.kb_scope   — 'user' (consultas de usuário: aplica visibilidade) | 'system' (ingestão/workers do
 *                    MESMO tenant: ignora a visibilidade por documento, nunca o tenant)
 *
 * Atenção: o PostgreSQL ignora o RLS para SUPERUSER, papéis com BYPASSRLS e para o DONO das tabelas.
 * Para que as políticas valham, a aplicação deve conectar com um papel dedicado (ver scripts/create-app-role.sql)
 * e as migrações com o dono (MIGRATION_DATABASE_URL). GET /api/admin/kb-metrics informa se o RLS está efetivo.
 */

export const KB_SCHEMA = `
  -- ---------- catálogo: colunas novas em knowledge_items ----------
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'tenant'
    CHECK (visibility IN ('tenant','roles','users','confidential'));
  -- 'source': permissões definidas pelo módulo de origem; 'manual': alteradas por um usuário (a origem não sobrescreve).
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS acl_managed TEXT NOT NULL DEFAULT 'source' CHECK (acl_managed IN ('source','manual'));
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS content_bytes INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS deleted_at TEXT;
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS index_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (index_status IN ('pending','indexed','error','skipped'));
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS indexed_version INTEGER;
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS index_error TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS doc_number TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS doc_date TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS file_ref TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS pages TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS themes TEXT NOT NULL DEFAULT '[]';
  CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_source ON knowledge_items(tenant_id, source, updated_at);
  CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_hash ON knowledge_items(tenant_id, content_hash);
  CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_date ON knowledge_items(tenant_id, doc_date);
  CREATE INDEX IF NOT EXISTS idx_knowledge_attention ON knowledge_items(tenant_id, index_status) WHERE index_status IN ('pending','error');

  -- ---------- permissões por documento ----------
  CREATE TABLE IF NOT EXISTS knowledge_acl (
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id        TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    principal_type TEXT NOT NULL CHECK (principal_type IN ('role','user')),
    principal      TEXT NOT NULL,
    granted_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    granted_at     TEXT NOT NULL DEFAULT datetime('now'),
    PRIMARY KEY (item_id, principal_type, principal)
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_acl_tenant ON knowledge_acl(tenant_id, principal_type, principal);

  -- ---------- histórico de versões (só hash e tamanho; o conteúdo vigente fica no catálogo) ----------
  CREATE TABLE IF NOT EXISTS knowledge_versions (
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id      TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    version      INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    bytes        INTEGER NOT NULL DEFAULT 0,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT datetime('now'),
    PRIMARY KEY (item_id, version)
  );

  -- ---------- fragmentos (base para pesquisa textual, vetorial e citações) ----------
  -- A coluna de embedding será adicionada na fase de RAG (pgvector), depois de validar a extensão no
  -- Postgres de produção e aprovar volume/custo. chunk_hash permite reaproveitar embeddings de trechos iguais.
  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id        TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    version        INTEGER NOT NULL,
    ord            INTEGER NOT NULL,
    text           TEXT NOT NULL,
    chunk_hash     TEXT NOT NULL,
    char_start     INTEGER NOT NULL,
    char_end       INTEGER NOT NULL,
    page_from      INTEGER,
    page_to        INTEGER,
    section        TEXT NOT NULL DEFAULT '',
    token_estimate INTEGER NOT NULL,
    index_status   TEXT NOT NULL DEFAULT 'text_only' CHECK (index_status IN ('text_only','embedding_pending','embedded','error')),
    embedding_model TEXT,
    created_at     TEXT NOT NULL DEFAULT datetime('now'),
    tsv            tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', text)) STORED,
    UNIQUE (item_id, version, ord)
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_tenant_item ON knowledge_chunks(tenant_id, item_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_tenant_hash ON knowledge_chunks(tenant_id, chunk_hash);
  CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON knowledge_chunks USING GIN (tsv);

  -- ---------- Mapa Neural pré-calculado ----------
  CREATE TABLE IF NOT EXISTS knowledge_links (
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    a          TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    b          TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    strength   REAL NOT NULL,
    shared     TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (tenant_id, a, b),
    CHECK (a < b)
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_links_b ON knowledge_links(tenant_id, b);
  CREATE TABLE IF NOT EXISTS knowledge_graph_state (
    tenant_id    TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    dirty        BOOLEAN NOT NULL DEFAULT true,
    gen          BIGINT NOT NULL DEFAULT 0,
    built_at     TIMESTAMPTZ,
    duration_ms  INTEGER,
    docs         INTEGER NOT NULL DEFAULT 0,
    links        INTEGER NOT NULL DEFAULT 0,
    error        TEXT NOT NULL DEFAULT ''
  );

  -- ---------- contadores por gabinete (sem conteúdo; evita COUNT(*) a cada tela) ----------
  CREATE TABLE IF NOT EXISTS knowledge_stats (
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source     TEXT NOT NULL,
    docs       INTEGER NOT NULL DEFAULT 0,
    bytes      BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source)
  );
  -- Carga inicial dos módulos já existentes (uma vez por gabinete e origem).
  CREATE TABLE IF NOT EXISTS knowledge_backfill (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source    TEXT NOT NULL,
    cursor    TEXT NOT NULL DEFAULT '',
    done_at   TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, source)
  );

  -- ---------- fila persistente (sem conteúdo documental: só referências) ----------
  CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,
    ref          TEXT NOT NULL DEFAULT '',
    dedupe_key   TEXT,
    payload      TEXT NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dead')),
    priority     INTEGER NOT NULL DEFAULT 100,
    attempts     INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 6,
    run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by    TEXT,
    lease_until  TIMESTAMPTZ,
    last_error   TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    duration_ms  INTEGER
  );
  -- No máximo um job pendente por chave (reenfileirar a mesma coisa só adia/atualiza o existente).
  CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_queued ON jobs(dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS jobs_claim ON jobs(priority, run_after) WHERE status = 'queued';
  CREATE INDEX IF NOT EXISTS jobs_running_key ON jobs(dedupe_key) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS jobs_lease ON jobs(lease_until) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS jobs_finished ON jobs(finished_at) WHERE status IN ('done','dead');
  CREATE INDEX IF NOT EXISTS jobs_tenant_status ON jobs(tenant_id, status);

  -- ---------- métricas operacionais (agregadas por minuto, somadas entre réplicas) ----------
  CREATE TABLE IF NOT EXISTS ops_metrics (
    bucket    TEXT NOT NULL,
    name      TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT '',
    count     INTEGER NOT NULL DEFAULT 0,
    errors    INTEGER NOT NULL DEFAULT 0,
    sum_ms    DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_ms    DOUBLE PRECISION NOT NULL DEFAULT 0,
    hist      INTEGER[] NOT NULL DEFAULT '{0,0,0,0,0,0,0,0}',
    PRIMARY KEY (bucket, name, tenant_id)
  );

  -- ---------- Discursos: limites de página do texto extraído e aviso de truncamento ----------
  ALTER TABLE speeches ADD COLUMN IF NOT EXISTS text_pages TEXT NOT NULL DEFAULT '';
  ALTER TABLE speeches ADD COLUMN IF NOT EXISTS text_truncated INTEGER NOT NULL DEFAULT 0;

  -- ---------- funções de contexto (lidas pelas políticas) ----------
  CREATE OR REPLACE FUNCTION kb_tenant() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')
  $$;
  CREATE OR REPLACE FUNCTION kb_user() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')
  $$;
  CREATE OR REPLACE FUNCTION kb_role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.role', true), '')
  $$;
  CREATE OR REPLACE FUNCTION kb_system() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT COALESCE(current_setting('app.kb_scope', true), '') = 'system'
  $$;
  /**
   * Visibilidade de um documento para o usuário do contexto (dentro do tenant — o tenant é checado à parte).
   *  tenant       → todos do gabinete
   *  roles        → papéis listados + Parlamentar/Chefe de Gabinete + autor
   *  users        → usuários listados + Parlamentar/Chefe de Gabinete + autor
   *  confidential → somente usuários listados + autor
   */
  CREATE OR REPLACE FUNCTION kb_can_read(p_id text, p_vis text, p_created_by text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT CASE
      WHEN kb_system() THEN true
      WHEN p_vis = 'tenant' THEN kb_user() IS NOT NULL
      WHEN kb_user() IS NULL THEN false
      WHEN p_created_by = kb_user() THEN true
      WHEN p_vis IN ('roles','users') AND kb_role() IN ('deputado','chefe_gabinete') THEN true
      WHEN p_vis = 'roles' THEN EXISTS (
        SELECT 1 FROM knowledge_acl a WHERE a.item_id = p_id
          AND ((a.principal_type = 'role' AND a.principal = kb_role()) OR (a.principal_type = 'user' AND a.principal = kb_user())))
      WHEN p_vis IN ('users','confidential') THEN EXISTS (
        SELECT 1 FROM knowledge_acl a WHERE a.item_id = p_id AND a.principal_type = 'user' AND a.principal = kb_user())
      ELSE false
    END
  $$;

  CREATE TABLE IF NOT EXISTS kb_schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Bump when the policies change: they are recreated once (DROP/CREATE POLICY does not touch data). */
export const KB_POLICIES_VERSION = '1';

const tenantOnly = (t: string) => `
      ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS ${t}_tenant ON ${t};
      CREATE POLICY ${t}_tenant ON ${t} AS RESTRICTIVE FOR ALL USING (tenant_id = kb_tenant()) WITH CHECK (tenant_id = kb_tenant());
      DROP POLICY IF EXISTS ${t}_write ON ${t};
      CREATE POLICY ${t}_write ON ${t} AS PERMISSIVE FOR ALL USING (kb_system()) WITH CHECK (kb_system());`;

export const KB_POLICIES = `
  DO $kb$
  BEGIN
    IF COALESCE((SELECT value FROM kb_schema_meta WHERE key = 'policies'), '') <> '${KB_POLICIES_VERSION}' THEN
      -- catálogo: tenant obrigatório; leitura respeita a visibilidade e esconde excluídos; escrita só no escopo de sistema
      ${tenantOnly('knowledge_items')}
      DROP POLICY IF EXISTS knowledge_items_read ON knowledge_items;
      CREATE POLICY knowledge_items_read ON knowledge_items AS PERMISSIVE FOR SELECT
        USING (kb_system() OR (deleted_at IS NULL AND kb_can_read(id, visibility, created_by)));

      -- ACL: visível dentro do tenant (é lida por kb_can_read); escrita só no escopo de sistema
      ${tenantOnly('knowledge_acl')}
      DROP POLICY IF EXISTS knowledge_acl_read ON knowledge_acl;
      CREATE POLICY knowledge_acl_read ON knowledge_acl AS PERMISSIVE FOR SELECT USING (true);

      -- fragmentos e versões herdam a visibilidade do documento (a subconsulta passa pelo RLS do catálogo)
      ${tenantOnly('knowledge_chunks')}
      DROP POLICY IF EXISTS knowledge_chunks_read ON knowledge_chunks;
      CREATE POLICY knowledge_chunks_read ON knowledge_chunks AS PERMISSIVE FOR SELECT
        USING (EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = item_id));
      ${tenantOnly('knowledge_versions')}
      DROP POLICY IF EXISTS knowledge_versions_read ON knowledge_versions;
      CREATE POLICY knowledge_versions_read ON knowledge_versions AS PERMISSIVE FOR SELECT
        USING (EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = item_id));

      -- ligações do Mapa Neural: só aparecem se as duas pontas forem visíveis
      ${tenantOnly('knowledge_links')}
      DROP POLICY IF EXISTS knowledge_links_read ON knowledge_links;
      CREATE POLICY knowledge_links_read ON knowledge_links AS PERMISSIVE FOR SELECT
        USING (EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = a) AND EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = b));

      ${tenantOnly('knowledge_graph_state')}
      DROP POLICY IF EXISTS knowledge_graph_state_read ON knowledge_graph_state;
      CREATE POLICY knowledge_graph_state_read ON knowledge_graph_state AS PERMISSIVE FOR SELECT USING (true);

      INSERT INTO kb_schema_meta (key, value) VALUES ('policies', '${KB_POLICIES_VERSION}')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    END IF;

    -- Papel dedicado da aplicação (criado por scripts/create-app-role.sql): mantém os privilégios em dia
    -- a cada boot, inclusive para tabelas novas. Sem o papel, nada a fazer.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'parlamentta_app') THEN
      EXECUTE 'GRANT USAGE ON SCHEMA public TO parlamentta_app';
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO parlamentta_app';
      EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO parlamentta_app';
      EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO parlamentta_app';
    END IF;
  END
  $kb$;
`;
