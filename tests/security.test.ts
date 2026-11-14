/**
 * Correções da auditoria de segurança (2026-11-14): feeds hostis, links perigosos, limites de login,
 * limpeza de arquivos do gabinete, ambiente do wacli, cabeçalhos HTTP e cota por gabinete.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { startTestEnv, type TestEnv } from './helpers/env';

let env: TestEnv;
let h: typeof import('./helpers/app');
let close: () => Promise<void>;

before(async () => {
  env = await startTestEnv();
  h = await import('./helpers/app');
  close = (await h.setupApp()).close;
});
after(async () => {
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

test('feed com entidades em expansão exponencial ("billion laughs") é lido sem expandir', async () => {
  const { parseFeed } = await import('../server/clipping');
  const lol = [
    '<?xml version="1.0"?>',
    '<!DOCTYPE rss [',
    '  <!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">',
    ...Array.from({ length: 12 }, (_, i) => `  <!ENTITY ${String.fromCharCode(98 + i)} "${`&${String.fromCharCode(97 + i)};`.repeat(10)}">`),
    ']>',
    '<rss version="2.0"><channel><title>Bomba &m;</title>',
    '<item><title>Notícia &amp; fato</title><link>https://exemplo.com.br/a</link><description>&m;</description></item>',
    '</channel></rss>',
  ].join('\n');
  const t0 = performance.now();
  const feed = parseFeed(lol);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `levou ${Math.round(ms)} ms`);
  assert.ok(feed, 'feed lido');
  assert.equal(feed!.items.length, 1);
  assert.equal(feed!.items[0]!.title, 'Notícia & fato', 'entidades padrão continuam decodificadas');
  assert.ok(JSON.stringify(feed).length < 10_000, 'nenhuma entidade personalizada foi expandida');
});

test('links de notícias: só http(s)', async () => {
  const { safeLink, stripDoctype } = await import('../server/clipping');
  assert.equal(safeLink('https://g1.globo.com/a?b=1'), 'https://g1.globo.com/a?b=1');
  assert.equal(safeLink('http://exemplo.com/'), 'http://exemplo.com/');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', '//sem-esquema', 'lixo']) {
    assert.equal(safeLink(bad), '', bad);
  }
  assert.equal(stripDoctype('<!DOCTYPE html><p/>'), '<p/>');
  assert.equal(stripDoctype('<?xml?>\n<!DOCTYPE x [<!ENTITY a "b">]>\n<r/>'), '<?xml?>\n\n<r/>');
});

test('login: um atacante não consegue bloquear a conta de outra pessoa; muitos IPs sim, até o teto', async () => {
  const { loginKeys, loginBlocked, registerLoginFailure, clearLoginFailures } = await import('../server/auth');
  const victim = `vitima-${Date.now()}@x.local`;
  const attacker = loginKeys('198.51.100.7', victim);
  for (let i = 0; i < 5; i++) registerLoginFailure(attacker);
  assert.equal(loginBlocked(attacker), true, 'o IP do atacante é barrado');
  assert.equal(loginBlocked(loginKeys('203.0.113.9', victim)), false, 'a vítima, de outro IP, continua entrando');
  // ataque distribuído: 20 IPs diferentes → teto da conta
  for (let i = 0; i < 15; i++) registerLoginFailure(loginKeys(`192.0.2.${i}`, victim));
  assert.equal(loginBlocked(loginKeys('203.0.113.9', victim)), true, 'teto global da conta atingido');
  clearLoginFailures(loginKeys('203.0.113.9', victim).filter((k) => !k.startsWith('ip:')));
  assert.equal(loginBlocked(loginKeys('203.0.113.9', victim)), false);
});

test('sessões expiradas são removidas', async () => {
  const { purgeExpiredSessions } = await import('../server/auth');
  const T = await h.createTenant(env.su, `sec-sess-${Date.now()}`);
  const u = await h.createUser(env.su, T, 'deputado');
  await env.su.query(`UPDATE sessions SET expires_at = $1 WHERE user_id = $2`, [new Date(Date.now() - 1000).toISOString(), u.id]);
  const live = await h.createUser(env.su, T, 'assessor_parlamentar');
  assert.ok((await purgeExpiredSessions()) >= 1);
  assert.equal((await env.su.query(`SELECT COUNT(*)::int n FROM sessions WHERE user_id = $1`, [u.id])).rows[0].n, 0);
  assert.equal((await env.su.query(`SELECT COUNT(*)::int n FROM sessions WHERE user_id = $1`, [live.id])).rows[0].n, 1);
});

test('exclusão do gabinete apaga os arquivos dele no volume, e só os dele', async () => {
  const { purgeTenantFiles, DATA_DIR } = await import('../server/db');
  const mk = (...p: string[]) => {
    const f = path.join(DATA_DIR, ...p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'x');
    return f;
  };
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  const files = [mk('tenants', a, 'speeches', '1.pdf'), mk('crm', a, 'c.png')];
  const other = mk('tenants', b, 'speeches', '2.pdf');
  assert.equal(purgeTenantFiles(a), 2);
  for (const f of files) assert.equal(fs.existsSync(f), false, f);
  assert.equal(fs.existsSync(other), true, 'outro gabinete intacto');
  for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b']) assert.throws(() => purgeTenantFiles(bad), bad);
  assert.equal(fs.existsSync(DATA_DIR), true);
});

test('wacli não recebe segredos do servidor', async () => {
  process.env.SECRET_TEST_KEY = 'nao-pode-vazar';
  const { wacliEnv } = await import('../server/whatsapp');
  const e = wacliEnv();
  for (const k of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'GEMINI_API_KEY', 'SUPERADMIN_PASSWORD', 'RESEND_API_KEY', 'SECRET_TEST_KEY']) {
    assert.equal(e[k], undefined, k);
  }
  assert.equal(e.PATH, process.env.PATH);
  delete process.env.SECRET_TEST_KEY;
});

test('cabeçalhos: CSP, HSTS e incorporação só do site público', async () => {
  const { securityHeaders } = await import('../server/securityHeaders');
  const app = express();
  app.use(securityHeaders({ production: true }));
  app.get('*', (_req, res) => res.send('ok'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const app1 = await fetch(`${base}/api/health`);
    const csp = app1.headers.get('content-security-policy') ?? '';
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(app1.headers.get('x-frame-options'), 'DENY');
    assert.match(app1.headers.get('strict-transport-security') ?? '', /max-age=31536000/);
    const site = await fetch(`${base}/site/gabinete-x?embed=1`);
    assert.match(site.headers.get('content-security-policy') ?? '', /frame-ancestors \*/);
    assert.equal(site.headers.get('x-frame-options'), null);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('cota: o cálculo por gabinete devolve só aquele gabinete', async () => {
  const { tenantStorageBytes } = await import('../server/db');
  const A = await h.createTenant(env.su, `sec-cota-a-${Date.now()}`);
  await h.createTenant(env.su, `sec-cota-b-${Date.now()}`);
  const one = await tenantStorageBytes(A);
  assert.deepEqual([...one.keys()], [A]);
  const all = await tenantStorageBytes();
  assert.ok(all.size >= 2);
  assert.equal(all.get(A), one.get(A));
});

test('db:migrate com APP_DB_PASSWORD: papel restrito criado/ajustado sem privilégios e utilizável', async () => {
  const { ensureAppRole, connectionFor } = await import('../server/migrations');
  const pg = (await import('pg')).default;
  const owner = connectionFor(env.superUrl);
  await owner.connect();
  const original = decodeURIComponent(new URL(env.appUrl).password);
  try {
    await assert.rejects(() => ensureAppRole(owner, 'curta'), /24 caracteres/);
    const pw = 'Rot-' + crypto.randomUUID().replace(/-/g, '');
    assert.equal(await ensureAppRole(owner, pw), 'atualizado');
    const r = (await owner.query(`SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = 'parlamentta_app'`)).rows[0];
    assert.deepEqual(r, { rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolcanlogin: true });
    const u = new URL(env.appUrl);
    u.password = pw;
    const app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    try {
      // sem contexto de gabinete, a Base de Conhecimento não mostra nada (RLS efetivo)
      assert.equal((await app.query(`SELECT COUNT(*)::int n FROM knowledge_items`)).rows[0].n, 0);
      await assert.rejects(() => app.query(`CREATE TABLE x_proibida (id int)`));
    } finally {
      await app.end();
    }
  } finally {
    await ensureAppRole(owner, original.length >= 24 ? original : original.padEnd(24, 'x')).catch(() => undefined);
    await owner.end();
  }
});
