/**
 * Clipping — collects news from search engines (Google Notícias / Bing Notícias RSS) and from
 * registered sites (RSS/Atom, auto-discovered), keeps only what matches the cabinet's topics,
 * de-duplicates, tags themes and sentiment automatically, and lets users override sentiment.
 * Mounted at /api/tenant/clipping; every query is scoped to the session's tenant.
 */
import crypto from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { XMLParser } from 'fast-xml-parser';
import { db, audit } from './db';
import { HttpError, bad } from './http';
import { safeGet, FetchError } from './safeFetch';
import { aiAvailable, keywordThemes, lexiconSentiment, classifyClippingWithAI, THEMES, type Sentiment } from './ai';

export const clippingRouter = express.Router();

const MANAGERS = ['deputado', 'chefe_gabinete', 'coordenador_atendimento', 'comunicacao'];
const MAX_TOPICS = 30;
const MAX_SOURCES = 50;
const MAX_AGE_DAYS = 30;
const REQUEST_GAP_MS = 900;

const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
const ah =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
function requireManager(req: Request) {
  if (!MANAGERS.includes(req.auth!.role)) throw new HttpError(403, 'Apenas Parlamentar, Chefe de Gabinete, Coordenação ou Comunicação podem alterar o clipping.');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function cleanText(html: string, max = 600) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function normalizeUrl(raw: string) {
  try {
    const u = new URL(raw);
    u.hash = '';
    [...u.searchParams.keys()].forEach((k) => /^(utm_|fbclid|gclid|mc_|ref$|ref_src)/i.test(k) && u.searchParams.delete(k));
    return u.toString();
  } catch {
    return raw;
  }
}
const titleKey = (t: string) => sha1(fold(t).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 140));
const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------------------
// feed parsing (RSS 2.0 + Atom)
// ---------------------------------------------------------------------------
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: true, htmlEntities: true });
const txt = (v: any): string => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));
const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

interface RawItem {
  url: string;
  title: string;
  summary: string;
  sourceName: string;
  publishedAt: string;
}

function parseFeed(xml: string): { title: string; items: RawItem[] } | null {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  if (doc?.rss?.channel) {
    const ch = doc.rss.channel;
    return {
      title: cleanText(txt(ch.title), 120),
      items: arr(ch.item).map((it: any) => {
        let url = txt(it.link) || txt(it.guid);
        // Bing wraps the real link in a redirect: extract the "url" parameter.
        if (/bing\.com\/news\/apiclick/i.test(url)) {
          try {
            url = new URL(url).searchParams.get('url') ?? url;
          } catch {
            /* keep */
          }
        }
        return {
          url,
          title: cleanText(txt(it.title), 300),
          summary: cleanText(txt(it.description) || txt(it['content:encoded'])),
          sourceName: cleanText(txt(it.source) || txt(it['News:Source']) || txt(it['dc:creator']), 120),
          publishedAt: txt(it.pubDate) || txt(it['dc:date']),
        };
      }),
    };
  }
  if (doc?.feed) {
    const f = doc.feed;
    return {
      title: cleanText(txt(f.title), 120),
      items: arr(f.entry).map((e: any) => {
        const links = arr(e.link);
        const link = links.find((l: any) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
        return {
          url: link?.['@_href'] ?? txt(link),
          title: cleanText(txt(e.title), 300),
          summary: cleanText(txt(e.summary) || txt(e.content)),
          sourceName: cleanText(txt(e.author?.name), 120),
          publishedAt: txt(e.published) || txt(e.updated),
        };
      }),
    };
  }
  return null;
}

/** Given a site or feed URL, returns a working feed URL (auto-discovery + common paths). */
async function discoverFeed(input: string): Promise<{ feedUrl: string; siteUrl: string; title: string; count: number }> {
  const first = await safeGet(input);
  const direct = parseFeed(first.body);
  if (direct && direct.items.length >= 0 && /<(rss|feed)[\s>]/i.test(first.body.slice(0, 2000))) {
    return { feedUrl: first.url, siteUrl: new URL(first.url).origin, title: direct.title, count: direct.items.length };
  }
  const candidates = new Set<string>();
  for (const m of first.body.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (/rel=["']?alternate/i.test(tag) && /type=["']?application\/(rss|atom)\+xml/i.test(tag)) {
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
      if (href) candidates.add(new URL(decodeEntities(href), first.url).toString());
    }
  }
  const origin = new URL(first.url).origin;
  ['/feed', '/rss', '/feed/', '/rss.xml', '/feed.xml', '/index.xml', '/atom.xml', '/?feed=rss2'].forEach((p) => candidates.add(origin + p));
  for (const c of [...candidates].slice(0, 10)) {
    try {
      const r = await safeGet(c, { timeoutMs: 8000 });
      const f = parseFeed(r.body);
      if (f && f.items.length) return { feedUrl: r.url, siteUrl: origin, title: f.title, count: f.items.length };
    } catch {
      /* try next */
    }
  }
  throw new FetchError('Não encontramos um feed RSS/Atom neste site. Informe o endereço do feed diretamente (ex.: …/rss).');
}

// ---------------------------------------------------------------------------
// search providers
// ---------------------------------------------------------------------------
const quote = (t: string) => (/\s/.test(t) ? `"${t.replace(/"/g, '')}"` : t);
function buildQuery(terms: string[], excludes: string[]) {
  const inc = terms.map(quote).join(' OR ');
  const exc = excludes.map((e) => `-${quote(e)}`).join(' ');
  return [terms.length > 1 ? `(${inc})` : inc, exc].filter(Boolean).join(' ');
}
const PROVIDERS = {
  google: (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
  bing: (q: string) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=pt-BR&cc=BR`,
};

// ---------------------------------------------------------------------------
// collection run
// ---------------------------------------------------------------------------
interface Topic {
  id: string;
  name: string;
  terms: string[];
  excludeTerms: string[];
  active: boolean;
}
const loadTopics = (tenantId: string, onlyActive = false): Topic[] =>
  (db.prepare(`SELECT * FROM clipping_topics WHERE tenant_id = ? ${onlyActive ? 'AND active = 1' : ''} ORDER BY name COLLATE NOCASE`).all(tenantId) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    terms: JSON.parse(r.terms),
    excludeTerms: JSON.parse(r.exclude_terms),
    active: !!r.active,
  }));

function getSettings(tenantId: string) {
  let s = db.prepare(`SELECT * FROM clipping_settings WHERE tenant_id = ?`).get(tenantId) as any;
  if (!s) {
    db.prepare(`INSERT OR IGNORE INTO clipping_settings (tenant_id) VALUES (?)`).run(tenantId);
    s = db.prepare(`SELECT * FROM clipping_settings WHERE tenant_id = ?`).get(tenantId);
  }
  return { googleNews: !!s.google_news, bingNews: !!s.bing_news, intervalMin: s.interval_min as number, autoCollect: !!s.auto_collect };
}

/** Terms match title/summary; exclusions also look at the source name (e.g. "Mato Grosso do Sul"). */
const matchTopics = (text: string, topics: Topic[], sourceName = '') => {
  const t = fold(text);
  const withSource = fold(`${text} ${sourceName}`);
  return topics.filter((tp) => tp.terms.some((term) => t.includes(fold(term))) && !tp.excludeTerms.some((x) => withSource.includes(fold(x)))).map((tp) => tp.name);
};
const excluded = (tp: Topic, it: RawItem) => {
  const t = fold(`${it.title} ${it.summary} ${it.sourceName}`);
  return tp.excludeTerms.some((x) => t.includes(fold(x)));
};

const running = new Set<string>();
export const isRunning = (tenantId: string) => running.has(tenantId);

export async function runCollection(tenantId: string, trigger: 'auto' | 'manual') {
  if (running.has(tenantId)) return;
  running.add(tenantId);
  const runId = crypto.randomUUID();
  db.prepare(`INSERT INTO clipping_runs (id, tenant_id, trigger) VALUES (?, ?, ?)`).run(runId, tenantId, trigger);
  const errors: string[] = [];
  let requests = 0;
  let inserted = 0;
  try {
    const settings = getSettings(tenantId);
    const topics = loadTopics(tenantId, true);
    const sources = db.prepare(`SELECT * FROM clipping_sources WHERE tenant_id = ? AND active = 1`).all(tenantId) as any[];
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;
    const candidates = new Map<string, RawItem & { origin: string; topics: Set<string> }>();

    const add = (it: RawItem, origin: string, topicNames: string[]) => {
      if (!it.url || !it.title) return;
      const pub = Date.parse(it.publishedAt);
      if (pub && pub < cutoff) return;
      const url = normalizeUrl(it.url);
      let title = it.title;
      // Google appends " - Source" to titles.
      if (it.sourceName && title.endsWith(` - ${it.sourceName}`)) title = title.slice(0, -(it.sourceName.length + 3));
      // Google's description is just "title + source": drop summaries that only repeat the title.
      const summary = fold(it.summary).startsWith(fold(title).slice(0, 40)) ? '' : it.summary;
      const key = sha1(url);
      const ex = candidates.get(key);
      if (ex) topicNames.forEach((n) => ex.topics.add(n));
      else candidates.set(key, { ...it, summary, url, title, origin, publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(), topics: new Set(topicNames) });
    };

    // 1) searches per topic
    for (const tp of topics) {
      if (!tp.terms.length) continue;
      // Google understands boolean syntax → one query per topic.
      // Bing's RSS returns nothing for (A OR B) → one simple query per term (max 4).
      const jobs: { provider: 'google' | 'bing'; q: string }[] = [];
      if (settings.googleNews) jobs.push({ provider: 'google', q: buildQuery(tp.terms, tp.excludeTerms) });
      if (settings.bingNews) tp.terms.slice(0, 4).forEach((term) => jobs.push({ provider: 'bing', q: quote(term) }));
      for (const job of jobs) {
        try {
          requests++;
          const r = await safeGet(PROVIDERS[job.provider](job.q));
          const feed = parseFeed(r.body);
          if (!feed) throw new Error('resposta não é um feed');
          for (const it of feed.items.slice(0, 60)) {
            if (excluded(tp, it)) continue;
            add(it, job.provider, [tp.name, ...matchTopics(`${it.title} ${it.summary}`, topics, it.sourceName)]);
          }
        } catch (e) {
          errors.push(`${job.provider === 'google' ? 'Google Notícias' : 'Bing Notícias'} · ${tp.name}: ${(e as Error).message}`);
        }
        await sleep(REQUEST_GAP_MS);
      }
    }

    // 2) registered sites (feeds)
    for (const src of sources) {
      try {
        requests++;
        const r = await safeGet(src.feed_url);
        const feed = parseFeed(r.body);
        if (!feed) throw new Error('o endereço não retornou um feed RSS/Atom');
        let kept = 0;
        for (const it of feed.items.slice(0, 100)) {
          const matched = matchTopics(`${it.title} ${it.summary}`, topics, src.name);
          if (!matched.length && !src.capture_all) continue;
          add({ ...it, sourceName: src.name }, 'feed', matched);
          kept++;
        }
        db.prepare(`UPDATE clipping_sources SET last_fetched_at = datetime('now'), last_status = ?, last_error = '' WHERE id = ?`).run(
          `${feed.items.length} itens lidos · ${kept} relevantes`,
          src.id
        );
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`${src.name}: ${msg}`);
        db.prepare(`UPDATE clipping_sources SET last_fetched_at = datetime('now'), last_status = 'erro', last_error = ? WHERE id = ?`).run(msg.slice(0, 300), src.id);
      }
      await sleep(REQUEST_GAP_MS / 2);
    }

    // 3) persist (dedupe by URL, then by title within 3 days → merge topics)
    const findUrl = db.prepare(`SELECT id FROM clipping_items WHERE tenant_id = ? AND url_hash = ?`);
    const findTitle = db.prepare(`SELECT id, topics FROM clipping_items WHERE tenant_id = ? AND title_hash = ? AND published_at >= ?`);
    const updTopics = db.prepare(`UPDATE clipping_items SET topics = ? WHERE id = ?`);
    const ins = db.prepare(
      `INSERT INTO clipping_items (id, tenant_id, url, url_hash, title_hash, title, summary, source_name, source_domain, origin, published_at, topics, themes, sentiment_auto, sentiment_reason, sentiment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'palavras-chave')`
    );
    const newIds: string[] = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [urlHash, c] of candidates) {
        if (findUrl.get(tenantId, urlHash)) continue;
        const tHash = titleKey(c.title);
        const since = new Date(Date.parse(c.publishedAt) - 3 * 86400_000).toISOString();
        const dup = findTitle.get(tenantId, tHash, since) as any;
        if (dup) {
          const merged = [...new Set([...JSON.parse(dup.topics), ...c.topics])];
          updTopics.run(JSON.stringify(merged), dup.id);
          continue;
        }
        const text = `${c.title}. ${c.summary}`;
        const lex = lexiconSentiment(text);
        const id = crypto.randomUUID();
        ins.run(
          id, tenantId, c.url, urlHash, tHash, c.title, c.summary,
          c.sourceName || domainOf(c.url), domainOf(c.url), c.origin, c.publishedAt,
          JSON.stringify([...c.topics]), JSON.stringify(keywordThemes(text, 1).filter((t) => t !== 'Outros')),
          lex.sentiment, lex.reason
        );
        newIds.push(id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    inserted = newIds.length;

    // 4) AI refinement of sentiment + themes (batched)
    if (aiAvailable() && newIds.length) {
      const t = db.prepare(`SELECT name, parliamentarian FROM tenants WHERE id = ?`).get(tenantId) as any;
      const upd = db.prepare(`UPDATE clipping_items SET sentiment_auto = ?, sentiment_reason = ?, sentiment_method = 'ia', themes = ? WHERE id = ?`);
      for (let i = 0; i < Math.min(newIds.length, 150); i += 25) {
        const chunk = newIds.slice(i, i + 25);
        const rows = chunk.map((id) => db.prepare(`SELECT id, title, summary, topics, themes FROM clipping_items WHERE id = ?`).get(id) as any);
        try {
          const out = await classifyClippingWithAI(
            rows.map((r) => ({ title: r.title, summary: r.summary, topics: JSON.parse(r.topics) })),
            { cabinet: t?.name ?? 'gabinete', parliamentarian: t?.parliamentarian ?? '' }
          );
          for (const o of out) {
            const r = rows[o.index];
            const themes = [...new Set([...o.themes, ...JSON.parse(r.themes)])].slice(0, 4);
            upd.run(o.sentiment, o.reason, JSON.stringify(themes), r.id);
          }
        } catch (e) {
          errors.push(`IA: ${(e as Error).message.slice(0, 150)}`);
          break;
        }
      }
    }

    db.prepare(`UPDATE clipping_runs SET finished_at = datetime('now'), status = 'done', new_items = ?, requests = ?, errors = ? WHERE id = ?`).run(
      inserted, requests, JSON.stringify(errors.slice(0, 30)), runId
    );
  } catch (e) {
    console.error('[clipping] falha', tenantId, e);
    db.prepare(`UPDATE clipping_runs SET finished_at = datetime('now'), status = 'error', new_items = ?, requests = ?, errors = ? WHERE id = ?`).run(
      inserted, requests, JSON.stringify([...errors, (e as Error).message].slice(0, 30)), runId
    );
  } finally {
    running.delete(tenantId);
  }
}

/** Background scheduler: each tenant is collected every `interval_min` minutes (one tenant at a time). */
export function startClippingScheduler() {
  db.prepare(`UPDATE clipping_runs SET status = 'error', finished_at = datetime('now'), errors = '["Interrompida por reinício do servidor"]' WHERE status = 'running'`).run();
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const due = db
        .prepare(
          `SELECT t.id FROM tenants t
             LEFT JOIN clipping_settings s ON s.tenant_id = t.id
            WHERE t.status = 'active'
              AND COALESCE(s.auto_collect, 1) = 1
              AND (EXISTS (SELECT 1 FROM clipping_topics x WHERE x.tenant_id = t.id AND x.active = 1)
                   OR EXISTS (SELECT 1 FROM clipping_sources y WHERE y.tenant_id = t.id AND y.active = 1))
              AND COALESCE((SELECT MAX(r.started_at) FROM clipping_runs r WHERE r.tenant_id = t.id), '1970-01-01')
                  < datetime('now', '-' || COALESCE(s.interval_min, 60) || ' minutes')`
        )
        .all() as { id: string }[];
      for (const t of due) await runCollection(t.id, 'auto');
    } catch (e) {
      console.error('[clipping] scheduler', e);
    } finally {
      busy = false;
    }
  };
  setInterval(tick, 60_000).unref();
  setTimeout(tick, 15_000).unref();
}

// ---------------------------------------------------------------------------
// routes: configuration
// ---------------------------------------------------------------------------
const cleanTerms = (v: unknown, field: string, max = 15): string[] => {
  const list = (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map((s) => String(s).trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (list.some((t) => t.length > 80)) throw bad(`Cada item de "${field}" deve ter até 80 caracteres.`);
  return [...new Map(list.map((t) => [fold(t), t])).values()].slice(0, max);
};

clippingRouter.get('/config', (req, res) => {
  const t = tid(req);
  const runs = db.prepare(`SELECT * FROM clipping_runs WHERE tenant_id = ? ORDER BY started_at DESC LIMIT 8`).all(t) as any[];
  res.json({
    settings: getSettings(t),
    topics: loadTopics(t),
    sources: (db.prepare(`SELECT * FROM clipping_sources WHERE tenant_id = ? ORDER BY name COLLATE NOCASE`).all(t) as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      siteUrl: s.site_url,
      feedUrl: s.feed_url,
      captureAll: !!s.capture_all,
      active: !!s.active,
      lastFetchedAt: s.last_fetched_at,
      lastStatus: s.last_status,
      lastError: s.last_error,
    })),
    runs: runs.map((r) => ({ ...r, errors: JSON.parse(r.errors) })),
    running: isRunning(t),
    aiAvailable: aiAvailable(),
    themes: THEMES.filter((x) => x !== 'Outros'),
    canManage: MANAGERS.includes(req.auth!.role),
  });
});

clippingRouter.put('/settings', (req, res) => {
  requireManager(req);
  getSettings(tid(req));
  const b = req.body ?? {};
  const interval = Number(b.intervalMin);
  if (!Number.isInteger(interval) || interval < 15 || interval > 1440) throw bad('Intervalo deve ser entre 15 e 1440 minutos.');
  db.prepare(`UPDATE clipping_settings SET google_news = ?, bing_news = ?, interval_min = ?, auto_collect = ? WHERE tenant_id = ?`).run(
    b.googleNews ? 1 : 0, b.bingNews ? 1 : 0, interval, b.autoCollect ? 1 : 0, tid(req)
  );
  audit({ ...actor(req), action: 'clipping.settings_updated', details: b });
  res.json({ ok: true });
});

clippingRouter.post('/topics', (req, res) => {
  requireManager(req);
  const name = String(req.body?.name ?? '').trim().slice(0, 60);
  if (!name) throw bad('Informe o nome do tema.');
  const terms = cleanTerms(req.body?.terms, 'termos');
  if (!terms.length) throw bad('Informe ao menos um termo de busca.');
  const excludes = cleanTerms(req.body?.excludeTerms, 'termos excluídos');
  if ((db.prepare(`SELECT COUNT(*) n FROM clipping_topics WHERE tenant_id = ?`).get(tid(req)) as any).n >= MAX_TOPICS) throw bad(`Limite de ${MAX_TOPICS} temas.`);
  if (db.prepare(`SELECT 1 FROM clipping_topics WHERE tenant_id = ? AND name = ?`).get(tid(req), name)) throw new HttpError(409, `O tema "${name}" já existe.`);
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO clipping_topics (id, tenant_id, name, terms, exclude_terms) VALUES (?, ?, ?, ?, ?)`).run(id, tid(req), name, JSON.stringify(terms), JSON.stringify(excludes));
  audit({ ...actor(req), action: 'clipping.topic_created', target: name });
  res.status(201).json({ id });
});

clippingRouter.patch('/topics/:id', (req, res) => {
  requireManager(req);
  const cur = db.prepare(`SELECT * FROM clipping_topics WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Tema não encontrado.');
  const b = req.body ?? {};
  const name = b.name === undefined ? cur.name : String(b.name).trim().slice(0, 60);
  if (!name) throw bad('Informe o nome do tema.');
  if (db.prepare(`SELECT 1 FROM clipping_topics WHERE tenant_id = ? AND name = ? AND id <> ?`).get(tid(req), name, cur.id)) throw new HttpError(409, `O tema "${name}" já existe.`);
  const terms = b.terms === undefined ? JSON.parse(cur.terms) : cleanTerms(b.terms, 'termos');
  if (!terms.length) throw bad('Informe ao menos um termo de busca.');
  const excludes = b.excludeTerms === undefined ? JSON.parse(cur.exclude_terms) : cleanTerms(b.excludeTerms, 'termos excluídos');
  const active = b.active === undefined ? cur.active : b.active ? 1 : 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE clipping_topics SET name = ?, terms = ?, exclude_terms = ?, active = ? WHERE id = ?`).run(name, JSON.stringify(terms), JSON.stringify(excludes), active, cur.id);
    if (name !== cur.name) {
      // keep collected items pointing at the renamed topic
      const rows = db.prepare(`SELECT ci.id, ci.topics FROM clipping_items ci WHERE ci.tenant_id = ? AND EXISTS (SELECT 1 FROM json_each(ci.topics) j WHERE j.value = ?)`).all(tid(req), cur.name) as any[];
      const upd = db.prepare(`UPDATE clipping_items SET topics = ? WHERE id = ?`);
      rows.forEach((r) => upd.run(JSON.stringify([...new Set((JSON.parse(r.topics) as string[]).map((t) => (t === cur.name ? name : t)))]), r.id));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit({ ...actor(req), action: 'clipping.topic_updated', target: name });
  res.json({ ok: true });
});

clippingRouter.delete('/topics/:id', (req, res) => {
  requireManager(req);
  const cur = db.prepare(`SELECT * FROM clipping_topics WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Tema não encontrado.');
  db.prepare(`DELETE FROM clipping_topics WHERE id = ?`).run(cur.id);
  audit({ ...actor(req), action: 'clipping.topic_deleted', target: cur.name });
  res.json({ ok: true });
});

clippingRouter.post(
  '/sources',
  ah(async (req, res) => {
    requireManager(req);
    const url = String(req.body?.url ?? '').trim();
    if (!url) throw bad('Informe o endereço do site ou do feed.');
    if ((db.prepare(`SELECT COUNT(*) n FROM clipping_sources WHERE tenant_id = ?`).get(tid(req)) as any).n >= MAX_SOURCES) throw bad(`Limite de ${MAX_SOURCES} sites.`);
    let found;
    try {
      found = await discoverFeed(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch (e) {
      throw bad(e instanceof FetchError ? e.message : `Não foi possível acessar o site (${(e as Error).message}).`);
    }
    if (db.prepare(`SELECT 1 FROM clipping_sources WHERE tenant_id = ? AND feed_url = ?`).get(tid(req), found.feedUrl)) throw new HttpError(409, 'Este site já está cadastrado.');
    const name = String(req.body?.name ?? '').trim().slice(0, 80) || found.title || domainOf(found.siteUrl);
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO clipping_sources (id, tenant_id, name, site_url, feed_url, capture_all, last_status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, tid(req), name, found.siteUrl, found.feedUrl, req.body?.captureAll ? 1 : 0, `feed encontrado · ${found.count} itens`
    );
    audit({ ...actor(req), action: 'clipping.source_created', target: found.feedUrl });
    res.status(201).json({ id, name, feedUrl: found.feedUrl, items: found.count });
  })
);

clippingRouter.patch('/sources/:id', (req, res) => {
  requireManager(req);
  const cur = db.prepare(`SELECT * FROM clipping_sources WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Site não encontrado.');
  const b = req.body ?? {};
  db.prepare(`UPDATE clipping_sources SET name = ?, active = ?, capture_all = ? WHERE id = ?`).run(
    b.name === undefined ? cur.name : String(b.name).trim().slice(0, 80) || cur.name,
    b.active === undefined ? cur.active : b.active ? 1 : 0,
    b.captureAll === undefined ? cur.capture_all : b.captureAll ? 1 : 0,
    cur.id
  );
  res.json({ ok: true });
});

clippingRouter.delete('/sources/:id', (req, res) => {
  requireManager(req);
  const cur = db.prepare(`SELECT * FROM clipping_sources WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req)) as any;
  if (!cur) throw new HttpError(404, 'Site não encontrado.');
  db.prepare(`DELETE FROM clipping_sources WHERE id = ?`).run(cur.id);
  audit({ ...actor(req), action: 'clipping.source_deleted', target: cur.feed_url });
  res.json({ ok: true });
});

clippingRouter.post('/collect', (req, res) => {
  requireManager(req);
  const t = tid(req);
  if (isRunning(t)) throw new HttpError(409, 'Já existe uma coleta em andamento.');
  const has = db.prepare(`SELECT (SELECT COUNT(*) FROM clipping_topics WHERE tenant_id = ? AND active = 1) + (SELECT COUNT(*) FROM clipping_sources WHERE tenant_id = ? AND active = 1) n`).get(t, t) as any;
  if (!has.n) throw bad('Cadastre ao menos um tema ou site antes de coletar.');
  void runCollection(t, 'manual');
  audit({ ...actor(req), action: 'clipping.collect_started' });
  res.json({ started: true });
});

// ---------------------------------------------------------------------------
// routes: items, facets, dashboard
// ---------------------------------------------------------------------------
const EFFECTIVE = `COALESCE(ci.sentiment_manual, ci.sentiment_auto)`;
const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

function itemFilter(req: Request, { ignoreSentiment = false } = {}) {
  const where = ['ci.tenant_id = ?'];
  const args: any[] = [tid(req)];
  const qy = req.query;
  where.push(qy.archived === '1' ? 'ci.archived = 1' : 'ci.archived = 0');
  if (isDate(qy.from)) {
    where.push(`date(ci.published_at, 'localtime') >= ?`);
    args.push(qy.from);
  }
  if (isDate(qy.to)) {
    where.push(`date(ci.published_at, 'localtime') <= ?`);
    args.push(qy.to);
  }
  const q = String(qy.q ?? '').trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    where.push('(ci.title LIKE ? OR ci.summary LIKE ? OR ci.source_name LIKE ?)');
    args.push(like, like, like);
  }
  for (const [param, col] of [['topic', 'topics'], ['theme', 'themes']] as const) {
    const v = String(qy[param] ?? '').trim();
    if (v) {
      where.push(`EXISTS (SELECT 1 FROM json_each(ci.${col}) WHERE json_each.value = ?)`);
      args.push(v);
    }
  }
  if (qy.source) {
    where.push('ci.source_name = ?');
    args.push(String(qy.source));
  }
  if (!ignoreSentiment && ['bom', 'neutro', 'ruim'].includes(String(qy.sentiment))) {
    where.push(`${EFFECTIVE} = ?`);
    args.push(qy.sentiment);
  }
  if (qy.rating === 'manual') where.push('ci.sentiment_manual IS NOT NULL');
  if (qy.rating === 'auto') where.push('ci.sentiment_manual IS NULL');
  return { sql: where.join(' AND '), args };
}

const publicItem = (r: any) => ({
  id: r.id,
  url: r.url,
  title: r.title,
  summary: r.summary,
  sourceName: r.source_name,
  sourceDomain: r.source_domain,
  origin: r.origin,
  publishedAt: r.published_at,
  fetchedAt: r.fetched_at,
  topics: JSON.parse(r.topics),
  themes: JSON.parse(r.themes),
  sentiment: r.sentiment_manual ?? r.sentiment_auto,
  sentimentAuto: r.sentiment_auto,
  sentimentManual: r.sentiment_manual,
  sentimentReason: r.sentiment_reason,
  sentimentMethod: r.sentiment_method,
  sentimentBy: r.rated_by_name ?? null,
  sentimentAt: r.sentiment_at,
  archived: !!r.archived,
});

clippingRouter.get('/items', (req, res) => {
  const { sql, args } = itemFilter(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = (db.prepare(`SELECT COUNT(*) n FROM clipping_items ci WHERE ${sql}`).get(...args) as any).n;
  const rows = db
    .prepare(
      `SELECT ci.*, u.name AS rated_by_name FROM clipping_items ci LEFT JOIN users u ON u.id = ci.sentiment_user_id
        WHERE ${sql} ORDER BY ci.published_at DESC LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset);
  res.json({ total, items: rows.map(publicItem) });
});

function setSentiment(req: Request, ids: string[], sentiment: Sentiment | null) {
  const upd = db.prepare(
    `UPDATE clipping_items SET sentiment_manual = ?, sentiment_user_id = ?, sentiment_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END WHERE id = ? AND tenant_id = ?`
  );
  let n = 0;
  for (const id of ids) n += Number(upd.run(sentiment, sentiment ? req.auth!.userId : null, sentiment, id, tid(req)).changes);
  return n;
}
const parseSentiment = (v: unknown): Sentiment | null => {
  if (v === null || v === 'auto') return null;
  if (['bom', 'neutro', 'ruim'].includes(String(v))) return v as Sentiment;
  throw bad('Sentimento inválido.');
};

clippingRouter.patch('/items/:id', (req, res) => {
  const b = req.body ?? {};
  const exists = db.prepare(`SELECT 1 FROM clipping_items WHERE id = ? AND tenant_id = ?`).get(req.params.id, tid(req));
  if (!exists) throw new HttpError(404, 'Notícia não encontrada.');
  if (b.sentiment !== undefined) setSentiment(req, [req.params.id], parseSentiment(b.sentiment));
  if (b.archived !== undefined) {
    requireManager(req);
    db.prepare(`UPDATE clipping_items SET archived = ? WHERE id = ? AND tenant_id = ?`).run(b.archived ? 1 : 0, req.params.id, tid(req));
  }
  const r = db.prepare(`SELECT ci.*, u.name AS rated_by_name FROM clipping_items ci LEFT JOIN users u ON u.id = ci.sentiment_user_id WHERE ci.id = ?`).get(req.params.id);
  res.json(publicItem(r));
});

clippingRouter.post('/items/bulk', (req, res) => {
  const b = req.body ?? {};
  const ids: string[] = Array.isArray(b.ids) ? [...new Set<string>(b.ids.map(String))].slice(0, 500) : [];
  if (!ids.length) throw bad('Nenhuma notícia selecionada.');
  let changed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (b.sentiment !== undefined) changed = setSentiment(req, ids, parseSentiment(b.sentiment));
    if (b.archived !== undefined) {
      requireManager(req);
      const upd = db.prepare(`UPDATE clipping_items SET archived = ? WHERE id = ? AND tenant_id = ?`);
      changed = 0;
      for (const id of ids) changed += Number(upd.run(b.archived ? 1 : 0, id, tid(req)).changes);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ changed });
});

clippingRouter.get('/facets', (req, res) => {
  const t = tid(req);
  const facet = (sqlExpr: string) =>
    db.prepare(sqlExpr).all(t) as { value: string; count: number }[];
  res.json({
    topics: facet(`SELECT j.value AS value, COUNT(*) AS count FROM clipping_items ci, json_each(ci.topics) j WHERE ci.tenant_id = ? AND ci.archived = 0 GROUP BY j.value ORDER BY count DESC`),
    themes: facet(`SELECT j.value AS value, COUNT(*) AS count FROM clipping_items ci, json_each(ci.themes) j WHERE ci.tenant_id = ? AND ci.archived = 0 GROUP BY j.value ORDER BY count DESC`),
    sources: facet(`SELECT source_name AS value, COUNT(*) AS count FROM clipping_items WHERE tenant_id = ? AND archived = 0 GROUP BY source_name ORDER BY count DESC LIMIT 150`),
  });
});

clippingRouter.get('/dashboard', (req, res) => {
  // Sentiment filter is ignored here so the dashboard always shows the full split.
  const { sql, args } = itemFilter(req, { ignoreSentiment: true });
  const totals = db
    .prepare(
      `SELECT COUNT(*) total,
              SUM(${EFFECTIVE} = 'bom') bom, SUM(${EFFECTIVE} = 'neutro') neutro, SUM(${EFFECTIVE} = 'ruim') ruim,
              SUM(ci.sentiment_manual IS NOT NULL) manual,
              COUNT(DISTINCT ci.source_name) sources
         FROM clipping_items ci WHERE ${sql}`
    )
    .get(...args) as any;
  const daily = db
    .prepare(
      `SELECT date(ci.published_at, 'localtime') AS day, ${EFFECTIVE} AS sentiment, COUNT(*) AS count
         FROM clipping_items ci WHERE ${sql} GROUP BY day, sentiment ORDER BY day`
    )
    .all(...args);
  const byTopic = db
    .prepare(
      `SELECT j.value AS name, COUNT(*) total, SUM(${EFFECTIVE} = 'bom') bom, SUM(${EFFECTIVE} = 'neutro') neutro, SUM(${EFFECTIVE} = 'ruim') ruim
         FROM clipping_items ci, json_each(ci.topics) j WHERE ${sql} GROUP BY j.value ORDER BY total DESC LIMIT 8`
    )
    .all(...args);
  const bySource = db
    .prepare(
      `SELECT ci.source_name AS name, COUNT(*) total, SUM(${EFFECTIVE} = 'ruim') ruim
         FROM clipping_items ci WHERE ${sql} GROUP BY ci.source_name ORDER BY total DESC LIMIT 8`
    )
    .all(...args);
  const byTheme = db
    .prepare(
      `SELECT j.value AS name, COUNT(*) total FROM clipping_items ci, json_each(ci.themes) j WHERE ${sql} GROUP BY j.value ORDER BY total DESC LIMIT 8`
    )
    .all(...args);
  const lastRun = db.prepare(`SELECT * FROM clipping_runs WHERE tenant_id = ? ORDER BY started_at DESC LIMIT 1`).get(tid(req)) as any;
  res.json({
    totals: {
      total: totals.total ?? 0,
      bom: totals.bom ?? 0,
      neutro: totals.neutro ?? 0,
      ruim: totals.ruim ?? 0,
      manual: totals.manual ?? 0,
      sources: totals.sources ?? 0,
    },
    daily,
    byTopic,
    bySource,
    byTheme,
    lastRun: lastRun ? { ...lastRun, errors: JSON.parse(lastRun.errors) } : null,
    running: isRunning(tid(req)),
  });
});
