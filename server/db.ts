import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.PARLAMENTA_DATA_DIR || path.resolve(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'parlamenta.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

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
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- tenant_id NULL only for platform super admins (enforced by CHECK).
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at  TEXT,
    CHECK ((role = 'super_admin' AND tenant_id IS NULL) OR (role <> 'super_admin' AND tenant_id IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

  -- Only a SHA-256 of the session token is stored; the raw token lives only in the httpOnly cookie.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL,
    ip          TEXT,
    user_agent  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- Generic per-tenant document store (protocols, contacts, documents...).
  -- Every row carries tenant_id; tenant routes always filter by the session's tenant.
  CREATE TABLE IF NOT EXISTS tenant_records (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_records_tenant_kind ON tenant_records(tenant_id, kind);

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL DEFAULT (datetime('now')),
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
    category         TEXT NOT NULL DEFAULT '',   -- e.g. Liderança, Eleitor, Servidor, Imprensa
    organization     TEXT NOT NULL DEFAULT '',
    tags             TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
    notes            TEXT NOT NULL DEFAULT '',
    source           TEXT NOT NULL DEFAULT 'manual', -- manual | import:<id> | atendimento
    consent_whatsapp INTEGER NOT NULL DEFAULT 0,  -- LGPD opt-in for messaging
    consent_email    INTEGER NOT NULL DEFAULT 0,
    created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    committed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_imports_tenant ON contact_imports(tenant_id, created_at);

  -- ===== Banco de Dados: Discursos (acervo do que o parlamentar disse) =====
  CREATE TABLE IF NOT EXISTS speeches (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    speech_date     TEXT NOT NULL,             -- YYYY-MM-DD when it was said
    occasion        TEXT NOT NULL,             -- Sessão Plenária, Audiência Pública, Entrevista...
    location        TEXT NOT NULL DEFAULT '',
    media_type      TEXT NOT NULL DEFAULT 'pending' CHECK (media_type IN ('pending','audio','video','pdf','docx','text')),
    file_name       TEXT NOT NULL DEFAULT '',
    mime_type       TEXT NOT NULL DEFAULT '',
    file_bytes      INTEGER NOT NULL DEFAULT 0, -- size of the original upload
    stored_bytes    INTEGER NOT NULL DEFAULT 0, -- bytes kept on disk (0 for videos: discarded)
    file_kept       INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'awaiting_file'
                    CHECK (status IN ('awaiting_file','queued','processing','done','needs_ai','error')),
    status_detail   TEXT NOT NULL DEFAULT '',
    text            TEXT NOT NULL DEFAULT '',  -- transcript / OCR / native text
    summary         TEXT NOT NULL DEFAULT '',
    themes          TEXT NOT NULL DEFAULT '[]', -- JSON array (fixed catalog)
    keywords        TEXT NOT NULL DEFAULT '[]', -- JSON array (free labels)
    tagged_by       TEXT NOT NULL DEFAULT '',   -- ia | palavras-chave | manual
    created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_speeches_tenant_date ON speeches(tenant_id, speech_date);

  -- ===== Banco de Dados: Categorias de contatos e Etiquetas de classificação =====
  -- Controlled vocabularies managed by each cabinet; contacts reference them by name.
  CREATE TABLE IF NOT EXISTS contact_categories (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS contact_tags (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL COLLATE NOCASE,
    color       TEXT NOT NULL DEFAULT 'teal',
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, name)
  );

  -- Canais de entrada de atendimento (Presencial, Telefone...) usados em Caixa de Entrada › Registrar Manual.
  CREATE TABLE IF NOT EXISTS entry_channels (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, name)
  );

  -- ===== Protocolos & Demandas =====
  -- "data" holds the full client-side Protocol object (minus timeline); columns hold what the server
  -- queries or exposes publicly. Numbers are sequential per tenant and year (PRT-2026-00001).
  CREATE TABLE IF NOT EXISTS protocols (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number       TEXT NOT NULL,
    year         INTEGER NOT NULL,
    seq          INTEGER NOT NULL,
    source       TEXT NOT NULL DEFAULT 'interno',  -- interno | web
    status       TEXT NOT NULL DEFAULT 'novo',
    theme        TEXT NOT NULL DEFAULT '',
    city         TEXT NOT NULL DEFAULT '',
    phone_last4  TEXT NOT NULL DEFAULT '',
    data         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, number),
    UNIQUE (tenant_id, year, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_protocols_tenant ON protocols(tenant_id, created_at);
  -- Append-only timeline. visibility: internal (equipe) | public (cidadão) | both.
  CREATE TABLE IF NOT EXISTS protocol_events (
    id          TEXT PRIMARY KEY,
    protocol_id TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id   TEXT,
    at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    author      TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    badge       TEXT,
    visibility  TEXT NOT NULL DEFAULT 'internal',
    UNIQUE (protocol_id, client_id)
  );
  CREATE INDEX IF NOT EXISTS idx_protocol_events ON protocol_events(protocol_id, at);

  -- Fila de e-mails transacionais (Resend). Gravada na mesma transação do evento que a origina;
  -- um worker envia e reenvia com backoff. status: pending | sent | failed
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
    next_try_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_error   TEXT,
    provider_id  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(status, next_try_at);

  -- Temas de demanda (Saúde, Educação...) usados em Protocolos › Novo Protocolo.
  CREATE TABLE IF NOT EXISTS demand_themes (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, name)
  );

  -- Tipos de proposição/documento (Ofício, Requerimento, Projeto de Lei...) used by "Documentos do Gabinete".
  CREATE TABLE IF NOT EXISTS proposition_types (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL COLLATE NOCASE,
    acronym     TEXT NOT NULL DEFAULT '',  -- prefix for document numbers, e.g. OF, REQ, PL
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, name)
  );

  -- ===== Comunicação: Clipping =====
  -- Monitored topics: each one becomes a news search and a filter for feed items.
  CREATE TABLE IF NOT EXISTS clipping_topics (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          TEXT NOT NULL COLLATE NOCASE,
    terms         TEXT NOT NULL DEFAULT '[]',  -- JSON: any of these terms matches
    exclude_terms TEXT NOT NULL DEFAULT '[]',  -- JSON: items containing these are dropped
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, name)
  );
  -- Sites monitored through their RSS/Atom feed (auto-discovered from the site URL).
  CREATE TABLE IF NOT EXISTS clipping_sources (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    site_url        TEXT NOT NULL DEFAULT '',
    feed_url        TEXT NOT NULL,
    capture_all     INTEGER NOT NULL DEFAULT 0, -- 1 = keep every item, not only topic matches
    active          INTEGER NOT NULL DEFAULT 1,
    last_fetched_at TEXT,
    last_status     TEXT NOT NULL DEFAULT '',
    last_error      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
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
    origin            TEXT NOT NULL DEFAULT '',    -- google | bing | feed
    published_at      TEXT NOT NULL,
    fetched_at        TEXT NOT NULL DEFAULT (datetime('now')),
    topics            TEXT NOT NULL DEFAULT '[]',
    themes            TEXT NOT NULL DEFAULT '[]',
    sentiment_auto    TEXT NOT NULL DEFAULT 'neutro' CHECK (sentiment_auto IN ('bom','neutro','ruim')),
    sentiment_reason  TEXT NOT NULL DEFAULT '',
    sentiment_method  TEXT NOT NULL DEFAULT 'palavras-chave', -- ia | palavras-chave
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
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status      TEXT NOT NULL DEFAULT 'running', -- running | done | error
    new_items   INTEGER NOT NULL DEFAULT 0,
    requests    INTEGER NOT NULL DEFAULT 0,
    errors      TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_clip_runs_tenant ON clipping_runs(tenant_id, started_at);
`);

// Additive migration: marks tenants whose default categories/tags were already created.
const tenantCols = db.prepare(`PRAGMA table_info(tenants)`).all() as { name: string }[];
if (!tenantCols.some((c) => c.name === 'taxonomy_seeded')) {
  db.exec(`ALTER TABLE tenants ADD COLUMN taxonomy_seeded INTEGER NOT NULL DEFAULT 0`);
}
if (!tenantCols.some((c) => c.name === 'proposition_types_seeded')) {
  db.exec(`ALTER TABLE tenants ADD COLUMN proposition_types_seeded INTEGER NOT NULL DEFAULT 0`);
}
if (!tenantCols.some((c) => c.name === 'demand_themes_seeded')) {
  db.exec(`ALTER TABLE tenants ADD COLUMN demand_themes_seeded INTEGER NOT NULL DEFAULT 0`);
}
if (!tenantCols.some((c) => c.name === 'entry_channels_seeded')) {
  db.exec(`ALTER TABLE tenants ADD COLUMN entry_channels_seeded INTEGER NOT NULL DEFAULT 0`);
}

export function audit(entry: {
  actorId?: string | null;
  actorEmail?: string | null;
  tenantId?: string | null;
  action: string;
  target?: string | null;
  details?: unknown;
  ip?: string | null;
}) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, actor_email, tenant_id, action, target, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
export function tenantStorageBytes(): Map<string, number> {
  const rows = db
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
         AS bytes
       FROM tenants t`
    )
    .all() as { tenant_id: string; bytes: number }[];
  return new Map(rows.map((r) => [r.tenant_id, Number(r.bytes)]));
}

export function dbFileBytes(): number {
  let total = 0;
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try {
      total += fs.statSync(f).size;
    } catch {
      /* file may not exist */
    }
  }
  return total;
}
