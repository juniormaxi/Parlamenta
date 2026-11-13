/**
 * PostgreSQL data layer (Railway: DATABASE_URL).
 *
 * API kept close to the previous SQLite one so queries read the same:
 *   await db.prepare(sql).get(...params)   -> first row | undefined
 *   await db.prepare(sql).all(...params)   -> rows
 *   await db.prepare(sql).run(...params)   -> { changes }
 * `?` placeholders are converted to $1..$n. Inside `tx(async () => ...)` every query
 * automatically runs on the transaction's connection (AsyncLocalStorage).
 *
 * Conventions preserved from the SQLite schema:
 * - timestamps are TEXT in UTC "YYYY-MM-DD HH:MM:SS" (SQL helper datetime('now'[, modifier]) exists
 *   in Postgres too, see migration), so the front-end sees exactly the same values;
 * - case-insensitive names use CITEXT;
 * - JSON arrays are TEXT columns (cast to jsonb only when queried).
 */
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

/** Uploaded files (speeches) still live on disk — mount a Railway Volume here in production.
 *  PARLAMENTA_DATA_DIR (nome antigo) continua aceito para não quebrar deploys existentes. */
export const DATA_DIR = process.env.PARLAMENTTA_DATA_DIR || process.env.PARLAMENTA_DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// COUNT/SUM return int8/numeric; the app always treated them as JS numbers.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL não definida. Em desenvolvimento rode `npm run dev:db` e use DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres');
}
const needsSsl = /sslmode=require/.test(DATABASE_URL) || process.env.PGSSL === 'require';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  idleTimeoutMillis: 30_000,
});
pool.on('error', (e) => console.error('[pg] erro em conexão ociosa:', e.message));
// Stored timestamps are UTC text; parse/format them in UTC regardless of the server's default.
pool.on('connect', (c) => {
  c.query("SET TIME ZONE 'UTC'").catch(() => undefined);
});

const txStore = new AsyncLocalStorage<pg.PoolClient>();

/** Converts `?` placeholders (outside string literals / quoted identifiers) to $1..$n. */
function toPg(sql: string): string {
  let out = '';
  let n = 0;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      out += c;
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else if (c === '?') {
      out += `$${++n}`;
    } else {
      out += c;
    }
  }
  return out;
}

const cache = new Map<string, string>();
async function query(sql: string, params: unknown[]) {
  let text = cache.get(sql);
  if (!text) {
    text = toPg(sql);
    if (cache.size < 2000) cache.set(sql, text);
  }
  const values = params.map((v) => (v === undefined ? null : v));
  const client = txStore.getStore();
  return client ? client.query(text, values) : pool.query(text, values);
}

export interface Statement {
  get<T = any>(...params: unknown[]): Promise<T | undefined>;
  all<T = any>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

export const db = {
  prepare(sql: string): Statement {
    return {
      get: async (...p) => (await query(sql, p)).rows[0],
      all: async (...p) => (await query(sql, p)).rows,
      run: async (...p) => ({ changes: (await query(sql, p)).rowCount ?? 0 }),
    };
  },
  /** Multiple statements, no parameters (DDL). */
  async exec(sql: string) {
    const client = txStore.getStore();
    await (client ? client.query(sql) : pool.query(sql));
  },
};

/**
 * Runs `fn` in a transaction; queries made inside (even in called functions) use its connection.
 * Nested calls join the outer transaction.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStore.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Schema (idempotent). Runs on boot — creates every table in a fresh database.
// ---------------------------------------------------------------------------
const SCHEMA = `
  CREATE EXTENSION IF NOT EXISTS citext;

  -- SQLite-compatible time helpers: UTC text "YYYY-MM-DD HH:MM:SS".
  CREATE OR REPLACE FUNCTION datetime(base text) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT to_char((CASE WHEN base = 'now' THEN now() ELSE base::timestamptz END) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
  $$;
  CREATE OR REPLACE FUNCTION datetime(base text, modifier text) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT to_char((CASE WHEN base = 'now' THEN now() ELSE base::timestamptz END) AT TIME ZONE 'UTC' + modifier::interval, 'YYYY-MM-DD HH24:MI:SS')
  $$;
  -- SQLite json_each(text) over a JSON array of strings: FROM t, json_each(t.tags) j ... j.value
  CREATE OR REPLACE FUNCTION json_each(arr text) RETURNS TABLE(value text) LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_array_elements_text(COALESCE(NULLIF(arr, ''), '[]')::jsonb)
  $$;
  -- SQLite date(ts, 'localtime'): calendar day in the cabinets' time zone.
  CREATE OR REPLACE FUNCTION date(ts text, modifier text) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT to_char(CASE WHEN modifier = 'localtime' THEN (ts::timestamptz AT TIME ZONE 'America/Cuiaba') ELSE (ts::timestamptz AT TIME ZONE 'UTC') END, 'YYYY-MM-DD')
  $$;
  CREATE OR REPLACE FUNCTION utc_iso_now() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  $$;

  CREATE TABLE IF NOT EXISTS tenants (
    id                TEXT PRIMARY KEY,
    slug              TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    parliamentarian   TEXT NOT NULL DEFAULT '',
    sphere            TEXT NOT NULL CHECK (sphere IN ('estadual','federal','municipal')),
    house             TEXT NOT NULL DEFAULT '',
    state             TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    storage_quota_mb  INTEGER NOT NULL DEFAULT 512,
    max_users         INTEGER NOT NULL DEFAULT 25,
    taxonomy_seeded          INTEGER NOT NULL DEFAULT 0,
    proposition_types_seeded INTEGER NOT NULL DEFAULT 0,
    demand_themes_seeded     INTEGER NOT NULL DEFAULT 0,
    entry_channels_seeded    INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT datetime('now')
  );

  -- tenant_id NULL only for platform super admins (enforced by CHECK).
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    email          CITEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    created_at     TEXT NOT NULL DEFAULT datetime('now'),
    last_login_at  TEXT,
    CHECK ((role = 'super_admin' AND tenant_id IS NULL) OR (role <> 'super_admin' AND tenant_id IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

  -- Only a SHA-256 of the session token is stored; the raw token lives only in the httpOnly cookie.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    expires_at  TEXT NOT NULL,
    ip          TEXT,
    user_agent  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- Generic per-tenant document store.
  CREATE TABLE IF NOT EXISTS tenant_records (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE INDEX IF NOT EXISTS idx_records_tenant_kind ON tenant_records(tenant_id, kind);

  CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    at          TEXT NOT NULL DEFAULT datetime('now'),
    actor_id    TEXT,
    actor_email TEXT,
    tenant_id   TEXT,
    action      TEXT NOT NULL,
    target      TEXT,
    details     TEXT,
    ip          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, at);

  -- ===== Banco de Dados: Contatos =====
  CREATE TABLE IF NOT EXISTS contacts (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    phone            TEXT NOT NULL DEFAULT '',   -- digits only, with DDD (e.g. 65999990000)
    whatsapp         TEXT NOT NULL DEFAULT '',
    email            TEXT NOT NULL DEFAULT '',
    birth_date       TEXT NOT NULL DEFAULT '',
    gender           TEXT NOT NULL DEFAULT '',
    street           TEXT NOT NULL DEFAULT '',
    number           TEXT NOT NULL DEFAULT '',
    complement       TEXT NOT NULL DEFAULT '',
    neighborhood     TEXT NOT NULL DEFAULT '',
    city             TEXT NOT NULL DEFAULT '',
    state            TEXT NOT NULL DEFAULT '',
    zip              TEXT NOT NULL DEFAULT '',
    category         CITEXT NOT NULL DEFAULT '',
    organization     TEXT NOT NULL DEFAULT '',
    tags             TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
    notes            TEXT NOT NULL DEFAULT '',
    source           TEXT NOT NULL DEFAULT 'manual', -- manual | import:<id> | atendimento
    consent_whatsapp INTEGER NOT NULL DEFAULT 0,  -- LGPD opt-in for messaging
    consent_email    INTEGER NOT NULL DEFAULT 0,
    created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TEXT NOT NULL DEFAULT datetime('now'),
    updated_at       TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON contacts(tenant_id, name);
  CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON contacts(tenant_id, phone);
  CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email ON contacts(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_contacts_tenant_city ON contacts(tenant_id, city);

  -- ===== Banco de Dados: Importações de planilhas =====
  CREATE TABLE IF NOT EXISTS contact_imports (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','discarded')),
    total_rows   INTEGER NOT NULL DEFAULT 0,
    valid_rows   INTEGER NOT NULL DEFAULT 0,
    inserted     INTEGER NOT NULL DEFAULT 0,
    updated      INTEGER NOT NULL DEFAULT 0,
    skipped      INTEGER NOT NULL DEFAULT 0,
    tags         TEXT NOT NULL DEFAULT '[]',
    rows_json    TEXT,                        -- parsed rows kept only while in preview
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT datetime('now'),
    committed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_imports_tenant ON contact_imports(tenant_id, created_at);

  -- ===== Banco de Dados: Discursos =====
  CREATE TABLE IF NOT EXISTS speeches (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    speech_date     TEXT NOT NULL,
    occasion        TEXT NOT NULL,
    location        TEXT NOT NULL DEFAULT '',
    media_type      TEXT NOT NULL DEFAULT 'pending' CHECK (media_type IN ('pending','audio','video','pdf','docx','text')),
    file_name       TEXT NOT NULL DEFAULT '',
    mime_type       TEXT NOT NULL DEFAULT '',
    file_bytes      BIGINT NOT NULL DEFAULT 0,
    stored_bytes    BIGINT NOT NULL DEFAULT 0,
    file_kept       INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'awaiting_file'
                    CHECK (status IN ('awaiting_file','queued','processing','done','needs_ai','error')),
    status_detail   TEXT NOT NULL DEFAULT '',
    text            TEXT NOT NULL DEFAULT '',
    summary         TEXT NOT NULL DEFAULT '',
    themes          TEXT NOT NULL DEFAULT '[]',
    keywords        TEXT NOT NULL DEFAULT '[]',
    tagged_by       TEXT NOT NULL DEFAULT '',
    created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT datetime('now'),
    processed_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_speeches_tenant_date ON speeches(tenant_id, speech_date);

  -- ===== Categorias (vocabulários controlados por gabinete) =====
  CREATE TABLE IF NOT EXISTS contact_categories (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        CITEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS contact_tags (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        CITEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT 'teal',
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS entry_channels (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        CITEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS demand_themes (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        CITEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS proposition_types (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        CITEXT NOT NULL,
    acronym     TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, name)
  );

  -- ===== Protocolos & Demandas =====
  CREATE TABLE IF NOT EXISTS protocols (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number       TEXT NOT NULL,
    year         INTEGER NOT NULL,
    seq          INTEGER NOT NULL,
    source       TEXT NOT NULL DEFAULT 'interno',
    status       TEXT NOT NULL DEFAULT 'novo',
    theme        TEXT NOT NULL DEFAULT '',
    city         TEXT NOT NULL DEFAULT '',
    phone_last4  TEXT NOT NULL DEFAULT '',
    data         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT datetime('now'),
    updated_at   TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, number),
    UNIQUE (tenant_id, year, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_protocols_tenant ON protocols(tenant_id, created_at);
  -- Append-only timeline. visibility: internal (equipe) | public (cidadão) | both.
  CREATE TABLE IF NOT EXISTS protocol_events (
    id          TEXT PRIMARY KEY,
    pos         BIGSERIAL,
    protocol_id TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id   TEXT,
    at          TEXT NOT NULL DEFAULT utc_iso_now(),
    author      TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    badge       TEXT,
    visibility  TEXT NOT NULL DEFAULT 'internal',
    UNIQUE (protocol_id, client_id)
  );
  CREATE INDEX IF NOT EXISTS idx_protocol_events ON protocol_events(protocol_id, at);

  -- Fila de e-mails transacionais (Resend). status: pending | sent | failed
  CREATE TABLE IF NOT EXISTS email_outbox (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    to_email     TEXT NOT NULL,
    subject      TEXT NOT NULL,
    html         TEXT NOT NULL,
    text         TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT '',
    ref          TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    attempts     INTEGER NOT NULL DEFAULT 0,
    next_try_at  TEXT NOT NULL DEFAULT datetime('now'),
    last_error   TEXT,
    provider_id  TEXT,
    created_at   TEXT NOT NULL DEFAULT datetime('now'),
    sent_at      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(status, next_try_at);

  -- ===== WhatsApp (wacli) — uma conta conectada por gabinete =====
  -- status: disconnected | pairing | connected. A sessão em si fica em DATA_DIR/whatsapp/<tenant_id>.
  CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    tenant_id      TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'disconnected',
    jid            TEXT NOT NULL DEFAULT '',
    connected_at   TEXT,
    last_error     TEXT,
    alerts_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT NOT NULL DEFAULT datetime('now')
  );

  -- Fila de mensagens automáticas (alertas de protocolo). status: pending | sent | failed | uncertain
  -- "uncertain": o envio caiu no meio e o WhatsApp pode ter entregue — nunca é reenviado sozinho.
  CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    to_phone     TEXT NOT NULL,
    body         TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT '',
    ref          TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    attempts     INTEGER NOT NULL DEFAULT 0,
    next_try_at  TEXT NOT NULL DEFAULT datetime('now'),
    last_error   TEXT,
    message_id   TEXT,
    created_at   TEXT NOT NULL DEFAULT datetime('now'),
    sent_at      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_pending ON whatsapp_outbox(status, next_try_at);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_tenant ON whatsapp_outbox(tenant_id, created_at);

  -- ===== Comunicação: Clipping =====
  CREATE TABLE IF NOT EXISTS clipping_topics (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          CITEXT NOT NULL,
    terms         TEXT NOT NULL DEFAULT '[]',
    exclude_terms TEXT NOT NULL DEFAULT '[]',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS clipping_sources (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    site_url        TEXT NOT NULL DEFAULT '',
    feed_url        TEXT NOT NULL,
    capture_all     INTEGER NOT NULL DEFAULT 0,
    active          INTEGER NOT NULL DEFAULT 1,
    last_fetched_at TEXT,
    last_status     TEXT NOT NULL DEFAULT '',
    last_error      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, feed_url)
  );
  CREATE TABLE IF NOT EXISTS clipping_settings (
    tenant_id      TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    google_news    INTEGER NOT NULL DEFAULT 1,
    bing_news      INTEGER NOT NULL DEFAULT 1,
    interval_min   INTEGER NOT NULL DEFAULT 60,
    auto_collect   INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS clipping_items (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url               TEXT NOT NULL,
    url_hash          TEXT NOT NULL,
    title_hash        TEXT NOT NULL,
    title             TEXT NOT NULL,
    summary           TEXT NOT NULL DEFAULT '',
    source_name       TEXT NOT NULL DEFAULT '',
    source_domain     TEXT NOT NULL DEFAULT '',
    origin            TEXT NOT NULL DEFAULT '',
    published_at      TEXT NOT NULL,
    fetched_at        TEXT NOT NULL DEFAULT datetime('now'),
    topics            TEXT NOT NULL DEFAULT '[]',
    themes            TEXT NOT NULL DEFAULT '[]',
    sentiment_auto    TEXT NOT NULL DEFAULT 'neutro' CHECK (sentiment_auto IN ('bom','neutro','ruim')),
    sentiment_reason  TEXT NOT NULL DEFAULT '',
    sentiment_method  TEXT NOT NULL DEFAULT 'palavras-chave',
    sentiment_manual  TEXT CHECK (sentiment_manual IN ('bom','neutro','ruim')),
    sentiment_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    sentiment_at      TEXT,
    archived          INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, url_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_clip_items_tenant_pub ON clipping_items(tenant_id, published_at);
  CREATE INDEX IF NOT EXISTS idx_clip_items_tenant_title ON clipping_items(tenant_id, title_hash);
  CREATE TABLE IF NOT EXISTS clipping_runs (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger     TEXT NOT NULL,
    started_at  TEXT NOT NULL DEFAULT datetime('now'),
    finished_at TEXT,
    status      TEXT NOT NULL DEFAULT 'running',
    new_items   INTEGER NOT NULL DEFAULT 0,
    requests    INTEGER NOT NULL DEFAULT 0,
    errors      TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_clip_runs_tenant ON clipping_runs(tenant_id, started_at);

  -- Comunicação › CRM: leads importados de planilha e distribuídos entre os usuários.
  CREATE TABLE IF NOT EXISTS crm_imports (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    file_name   TEXT NOT NULL DEFAULT '',
    total       INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE TABLE IF NOT EXISTS crm_leads (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    import_id       TEXT REFERENCES crm_imports(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL DEFAULT '',
    phone           TEXT NOT NULL DEFAULT '',
    city            TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    agent_notes     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'novo',
    status_at       TEXT,
    status_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at     TEXT,
    last_contact_at TEXT,
    contact_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT datetime('now'),
    updated_at      TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_assignee ON crm_leads(tenant_id, assigned_to, status);
  CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_phone ON crm_leads(tenant_id, phone);
  CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_email ON crm_leads(tenant_id, email);
  CREATE TABLE IF NOT EXISTS crm_lead_events (
    id         TEXT PRIMARY KEY,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id    TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE INDEX IF NOT EXISTS idx_crm_events_lead ON crm_lead_events(lead_id, created_at);

  -- Campanha (mensagem: texto, imagem e link) vinculada a uma lista importada do CRM.
  CREATE TABLE IF NOT EXISTS crm_campaigns (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    import_id   TEXT UNIQUE REFERENCES crm_imports(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    image_name  TEXT,
    image_mime  TEXT,
    image_size  INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    updated_at  TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE INDEX IF NOT EXISTS idx_crm_campaigns_tenant ON crm_campaigns(tenant_id);

  -- Casa legislativa do gabinete: município (esfera municipal) e nº de cadeiras do plenário (0 = padrão da esfera).
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city  TEXT NOT NULL DEFAULT '';
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 0;
  -- Endereço do SAPL da casa (opcional): composição e votações nominais vêm de lá quando informado.
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sapl_url TEXT NOT NULL DEFAULT '';

  -- ===== Legislativo › Plenário: dados oficiais por casa legislativa (compartilhados entre gabinetes) =====
  -- house_key: federal | estadual:MT | municipal:MT:cuiaba (| :sapl:<host> quando a casa usa SAPL).
  CREATE TABLE IF NOT EXISTS plenary_houses (
    house_key    TEXT PRIMARY KEY,
    label        TEXT NOT NULL DEFAULT '',
    sources      TEXT NOT NULL DEFAULT '[]',   -- JSON [{ name, url, scope }]
    legislature  TEXT NOT NULL DEFAULT '',
    members      TEXT NOT NULL DEFAULT '[]',   -- JSON dos parlamentares em exercício
    meta         TEXT NOT NULL DEFAULT '{}',   -- JSON: anos já importados, avisos
    status       TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','syncing','ok','error')),
    progress     TEXT NOT NULL DEFAULT '',
    error        TEXT NOT NULL DEFAULT '',
    synced_at    TEXT,
    started_at   TEXT
  );
  -- Votações nominais oficiais. votes: JSON { memberId: sim|nao|abstencao|obstrucao }; quem não votou fica de fora.
  CREATE TABLE IF NOT EXISTS plenary_votes (
    house_key  TEXT NOT NULL REFERENCES plenary_houses(house_key) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    date       TEXT NOT NULL,
    data       TEXT NOT NULL,
    votes      TEXT NOT NULL,
    PRIMARY KEY (house_key, id)
  );
  CREATE INDEX IF NOT EXISTS idx_plenary_votes_date ON plenary_votes(house_key, date DESC);
  -- Fotos extraídas de arquivos do TSE (servidas pela API; as demais fontes têm URL pública).
  CREATE TABLE IF NOT EXISTS plenary_photos (
    key         TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BYTEA NOT NULL,
    fetched_at  TEXT NOT NULL DEFAULT datetime('now')
  );
  -- Ajustes do gabinete: member (correção de dados ou parlamentar cadastrado à mão), session (votação
  -- registrada à mão), note (análise do gabinete sobre votação oficial), config (parlamentar do mandato).
  CREATE TABLE IF NOT EXISTS plenary_tenant (
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('member','session','note','config')),
    id          TEXT NOT NULL,
    data        TEXT NOT NULL,
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TEXT NOT NULL DEFAULT datetime('now'),
    PRIMARY KEY (tenant_id, kind, id)
  );

  -- Legislativo › Ofícios (dados do ofício em JSON; colunas para busca/ordenação).
  CREATE TABLE IF NOT EXISTS official_letters (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    updated_at  TEXT NOT NULL DEFAULT datetime('now')
  );
  CREATE INDEX IF NOT EXISTS idx_letters_tenant ON official_letters(tenant_id, created_at);

  -- Banco de Dados › Base de Conhecimento: documentos do gabinete (ofícios, etc.) com etiquetas.
  CREATE TABLE IF NOT EXISTS knowledge_items (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    meta        TEXT NOT NULL DEFAULT '{}',
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    updated_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, source, source_id)
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_tenant ON knowledge_items(tenant_id, updated_at);

  -- Mesma chave de server/blocklist.ts (blockKey): dígitos, sem 55, com o 9 do celular.
  CREATE OR REPLACE FUNCTION phone_key(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN length(d) = 10 AND substr(d, 3, 1) IN ('6','7','8','9') THEN substr(d, 1, 2) || '9' || substr(d, 3) ELSE d END
      FROM (SELECT CASE WHEN length(x) >= 12 AND left(x, 2) = '55' THEN substr(x, 3) ELSE x END AS d
              FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS x) a) b
  $$;

  -- LGPD: números que pediram para não receber mais mensagens. Nenhum envio de WhatsApp sai para eles.
  CREATE TABLE IF NOT EXISTS blocked_numbers (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_key   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    reason      TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'manual',
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT datetime('now'),
    UNIQUE (tenant_id, phone_key)
  );
`;

/** Creates/updates the schema. A cluster-wide advisory lock keeps concurrent boots from racing. */
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(SCHEMA);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
}

export async function audit(entry: {
  actorId?: string | null;
  actorEmail?: string | null;
  tenantId?: string | null;
  action: string;
  target?: string | null;
  details?: unknown;
  ip?: string | null;
}) {
  await db
    .prepare(
      `INSERT INTO audit_log (actor_id, actor_email, tenant_id, action, target, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.actorId ?? null,
      entry.actorEmail ?? null,
      entry.tenantId ?? null,
      entry.action,
      entry.target ?? null,
      entry.details === undefined ? null : JSON.stringify(entry.details),
      entry.ip ?? null
    );
}

/** Bytes used by each tenant: records + user rows + its audit trail. */
export async function tenantStorageBytes(): Promise<Map<string, number>> {
  const rows = await db
    .prepare(
      `SELECT t.id AS tenant_id,
         COALESCE((SELECT SUM(length(r.data) + length(r.kind) + 64) FROM tenant_records r WHERE r.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(u.name) + length(u.email) + length(u.password_hash) + 64) FROM users u WHERE u.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(COALESCE(a.details,'')) + length(a.action) + 48) FROM audit_log a WHERE a.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(c.name) + length(c.email) + length(c.street) + length(c.neighborhood) + length(c.city)
                              + length(c.tags) + length(c.notes) + 160) FROM contacts c WHERE c.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(s.text) + length(s.summary) + length(s.title) + s.stored_bytes + 128)
                     FROM speeches s WHERE s.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(COALESCE(i.rows_json,'')) + 96) FROM contact_imports i WHERE i.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(ci.title) + length(ci.summary) + length(ci.url) + 200) FROM clipping_items ci WHERE ci.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(p.data) + 128) FROM protocols p WHERE p.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(ol.data) + 128) FROM official_letters ol WHERE ol.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(k.content) + length(k.title) + length(k.tags) + 128) FROM knowledge_items k WHERE k.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(l.name) + length(l.email) + length(l.notes) + length(l.agent_notes) + 96) FROM crm_leads l WHERE l.tenant_id = t.id), 0)
       + COALESCE((SELECT SUM(length(cc.body) + length(cc.url) + cc.image_size + 128) FROM crm_campaigns cc WHERE cc.tenant_id = t.id), 0)
         AS bytes
       FROM tenants t`
    )
    .all<{ tenant_id: string; bytes: number }>();
  return new Map(rows.map((r) => [r.tenant_id, Number(r.bytes)]));
}

/** Total size of the Postgres database (replaces the SQLite file size). */
export async function dbFileBytes(): Promise<number> {
  const r = await db.prepare(`SELECT pg_database_size(current_database()) AS n`).get<{ n: number }>();
  return Number(r?.n ?? 0);
}
