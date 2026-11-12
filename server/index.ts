import 'dotenv/config';
import crypto from 'node:crypto';
import os from 'node:os';
import v8 from 'node:v8';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { HttpError, bad } from './http';
import { bancoRouter, startSpeechWorker } from './banco';
import { clippingRouter, startClippingScheduler } from './clipping';
import { db, audit, tenantStorageBytes, dbFileBytes, DB_PATH } from './db';
import {
  TENANT_ROLES,
  TENANT_ADMIN_ROLES,
  type Role,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  createSession,
  destroySession,
  revokeUserSessions,
  revokeTenantSessions,
  parseCookies,
  loadSession,
  requireAuth,
  requireSuperAdmin,
  requireTenantUser,
  requireCsrfHeader,
  loginBlocked,
  registerLoginFailure,
  clearLoginFailures,
  login,
} from './auth';

const PORT = Number(process.env.API_PORT || 3001);
const HOST = process.env.API_HOST || '127.0.0.1';

// ---------------------------------------------------------------------------
// Bootstrap: guarantee one platform super admin exists.
// ---------------------------------------------------------------------------
function bootstrapSuperAdmin() {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'`).get() as any;
  if (existing.n > 0) return;
  const email = (process.env.SUPERADMIN_EMAIL || 'admin@parlamenta.local').toLowerCase();
  let password = process.env.SUPERADMIN_PASSWORD || '';
  const generated = !password;
  if (generated) password = crypto.randomBytes(12).toString('base64url') + 'Aa1';
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(`SUPERADMIN_PASSWORD inválida: ${weak}`);
  db.prepare(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, NULL, ?, ?, ?, 'super_admin')`
  ).run(crypto.randomUUID(), 'Administrador da Plataforma', email, hashPassword(password));
  audit({ action: 'platform.bootstrap_super_admin', target: email });
  console.log('\n=========================================================');
  console.log(' Super admin criado');
  console.log(`   e-mail: ${email}`);
  if (generated) console.log(`   senha : ${password}   (gerada; exibida só esta vez)`);
  else console.log('   senha : definida em SUPERADMIN_PASSWORD');
  console.log('=========================================================\n');
}
bootstrapSuperAdmin();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(v: unknown, field: string, { min = 1, max = 200 } = {}): string {
  if (typeof v !== 'string') throw bad(`Campo "${field}" é obrigatório.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`Campo "${field}" deve ter entre ${min} e ${max} caracteres.`);
  return s;
}
function optStr(v: unknown, field: string, max = 200): string | undefined {
  return v === undefined ? undefined : str(v, field, { min: 0, max });
}
function int(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`Campo "${field}" deve ser inteiro entre ${min} e ${max}.`);
  return n;
}
function email(v: unknown): string {
  const e = str(v, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('E-mail inválido.');
  return e;
}
function password(v: unknown): string {
  const err = validatePasswordStrength(v);
  if (err) throw bad(err);
  return v as string;
}
function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (!allowed.includes(v as T)) throw bad(`Campo "${field}" inválido.`);
  return v as T;
}
function emailTaken(e: string, exceptId?: string) {
  const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(e) as any;
  return row && row.id !== exceptId;
}
const actor = (req: Request) => ({
  actorId: req.auth?.userId,
  actorEmail: req.auth?.email,
  ip: req.ip,
});
function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const publicUser = (u: any) => ({
  id: u.id,
  tenantId: u.tenant_id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at,
});
const publicTenant = (t: any) => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  parliamentarian: t.parliamentarian,
  sphere: t.sphere,
  house: t.house,
  state: t.state,
  status: t.status,
  storageQuotaMb: t.storage_quota_mb,
  maxUsers: t.max_users,
  createdAt: t.created_at,
});

// ---------------------------------------------------------------------------
// app
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const api = express.Router();
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
api.use(express.json({ limit: '256kb' }));
api.use(parseCookies);
api.use(requireCsrfHeader);
api.use(loadSession);

// ----- auth -----
api.post('/auth/login', (req, res) => {
  const e = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const p = typeof req.body?.password === 'string' ? req.body.password : '';
  const keys = [`ip:${req.ip}`, `email:${e}`];
  if (loginBlocked(keys)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  }
  if (!e || !p || p.length > 256) return res.status(400).json({ error: 'Informe e-mail e senha.' });

  const result = login(e, p);
  if (!result.ok) {
    registerLoginFailure(keys);
    audit({ action: 'auth.login_failed', target: e, details: { reason: result.reason }, ip: req.ip });
    const msg =
      result.reason === 'tenant_suspended'
        ? 'O gabinete desta conta está suspenso. Contate o administrador da plataforma.'
        : 'E-mail ou senha inválidos.';
    return res.status(401).json({ error: msg });
  }
  // Only the e-mail counter is reset: clearing the IP counter would let an attacker
  // reset it by logging into their own account between guesses.
  clearLoginFailures([`email:${e}`]);
  const u = result.user;
  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(u.id);
  createSession(u.id, req, res);
  audit({ actorId: u.id, actorEmail: u.email, tenantId: u.tenant_id, action: 'auth.login', ip: req.ip });
  res.json({ ok: true });
});

api.post('/auth/logout', (req, res) => {
  if (req.auth) audit({ ...actor(req), tenantId: req.auth.tenantId, action: 'auth.logout' });
  destroySession(req, res);
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.auth!.userId);
  const t = req.auth!.tenantId ? db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(req.auth!.tenantId) : null;
  res.json({ user: publicUser(u), tenant: t ? publicTenant(t) : null });
});

api.post('/auth/change-password', requireAuth, (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.auth!.userId) as any;
  if (!verifyPassword(String(req.body?.currentPassword ?? ''), u.password_hash)) throw bad('Senha atual incorreta.');
  const next = password(req.body?.newPassword);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(next), u.id);
  revokeUserSessions(u.id);
  createSession(u.id, req, res);
  audit({ ...actor(req), tenantId: u.tenant_id, action: 'auth.password_changed' });
  res.json({ ok: true });
});

// ----- super admin: platform overview / metrics -----
api.get('/admin/overview', requireSuperAdmin, (_req, res) => {
  const mem = process.memoryUsage();
  const storage = tenantStorageBytes();
  const tenants = db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
         (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.status = 'active') AS active_user_count,
         (SELECT COUNT(*) FROM tenant_records r WHERE r.tenant_id = t.id) AS record_count,
         (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE u.tenant_id = t.id AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS active_sessions,
         (SELECT MAX(u.last_login_at) FROM users u WHERE u.tenant_id = t.id) AS last_activity
       FROM tenants t ORDER BY t.created_at`
    )
    .all() as any[];
  const totals = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM tenants) AS tenants,
              (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active_tenants,
              (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE role = 'super_admin') AS super_admins,
              (SELECT COUNT(*) FROM tenant_records) AS records,
              (SELECT COUNT(*) FROM sessions WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS active_sessions`
    )
    .get();
  res.json({
    generatedAt: new Date().toISOString(),
    process: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      heapLimitBytes: v8.getHeapStatistics().heap_size_limit,
      externalBytes: mem.external,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
    },
    system: {
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
      loadAvg: os.loadavg(),
      cpus: os.cpus().length,
      platform: `${os.type()} ${os.release()}`,
    },
    database: { fileBytes: dbFileBytes(), path: path.basename(DB_PATH) },
    totals,
    tenants: tenants.map((t) => ({
      ...publicTenant(t),
      userCount: t.user_count,
      activeUserCount: t.active_user_count,
      recordCount: t.record_count,
      activeSessions: t.active_sessions,
      lastActivity: t.last_activity,
      storageBytes: storage.get(t.id) ?? 0,
    })),
  });
});

// ----- super admin: tenants -----
api.get('/admin/tenants', requireSuperAdmin, (_req, res) => {
  res.json(db.prepare(`SELECT * FROM tenants ORDER BY created_at`).all().map(publicTenant));
});

api.post('/admin/tenants', requireSuperAdmin, (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name, 'name');
  const slug = str(b.slug, 'slug', { min: 3, max: 40 }).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw bad('Slug deve conter apenas letras minúsculas, números e hífens.');
  if (db.prepare(`SELECT 1 FROM tenants WHERE slug = ?`).get(slug)) throw new HttpError(409, 'Slug já utilizado.');
  const sphere = oneOf(b.sphere, 'sphere', ['estadual', 'federal', 'municipal'] as const);
  const quota = b.storageQuotaMb === undefined ? 512 : int(b.storageQuotaMb, 'storageQuotaMb', 1, 1_048_576);
  const maxUsers = b.maxUsers === undefined ? 25 : int(b.maxUsers, 'maxUsers', 1, 10_000);

  const adminName = str(b.admin?.name, 'admin.name');
  const adminEmail = email(b.admin?.email);
  const adminPassword = password(b.admin?.password);
  const adminRole = b.admin?.role === undefined ? 'chefe_gabinete' : oneOf(b.admin.role, 'admin.role', TENANT_ADMIN_ROLES);
  if (emailTaken(adminEmail)) throw new HttpError(409, 'E-mail do administrador já está em uso.');

  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  transaction(() => {
    db.prepare(
      `INSERT INTO tenants (id, slug, name, parliamentarian, sphere, house, state, storage_quota_mb, max_users)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      tenantId,
      slug,
      name,
      optStr(b.parliamentarian, 'parliamentarian') ?? '',
      sphere,
      optStr(b.house, 'house') ?? '',
      (optStr(b.state, 'state', 2) ?? '').toUpperCase(),
      quota,
      maxUsers
    );
    db.prepare(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, tenantId, adminName, adminEmail, hashPassword(adminPassword), adminRole);
    audit({ ...actor(req), tenantId, action: 'tenant.created', target: slug, details: { name, sphere, quota, maxUsers } });
    audit({ ...actor(req), tenantId, action: 'user.created', target: adminEmail, details: { role: adminRole } });
  });
  res.status(201).json(publicTenant(db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantId)));
});

api.patch('/admin/tenants/:id', requireSuperAdmin, (req, res) => {
  const t = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(req.params.id) as any;
  if (!t) throw new HttpError(404, 'Gabinete não encontrado.');
  const b = req.body ?? {};
  const patch = {
    name: b.name === undefined ? t.name : str(b.name, 'name'),
    parliamentarian: optStr(b.parliamentarian, 'parliamentarian') ?? t.parliamentarian,
    sphere: b.sphere === undefined ? t.sphere : oneOf(b.sphere, 'sphere', ['estadual', 'federal', 'municipal'] as const),
    house: optStr(b.house, 'house') ?? t.house,
    state: (optStr(b.state, 'state', 2) ?? t.state).toUpperCase(),
    status: b.status === undefined ? t.status : oneOf(b.status, 'status', ['active', 'suspended'] as const),
    storage_quota_mb: b.storageQuotaMb === undefined ? t.storage_quota_mb : int(b.storageQuotaMb, 'storageQuotaMb', 1, 1_048_576),
    max_users: b.maxUsers === undefined ? t.max_users : int(b.maxUsers, 'maxUsers', 1, 10_000),
  };
  db.prepare(
    `UPDATE tenants SET name=?, parliamentarian=?, sphere=?, house=?, state=?, status=?, storage_quota_mb=?, max_users=? WHERE id=?`
  ).run(patch.name, patch.parliamentarian, patch.sphere, patch.house, patch.state, patch.status, patch.storage_quota_mb, patch.max_users, t.id);
  if (patch.status === 'suspended' && t.status !== 'suspended') revokeTenantSessions(t.id);
  audit({ ...actor(req), tenantId: t.id, action: 'tenant.updated', target: t.slug, details: b });
  res.json(publicTenant(db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(t.id)));
});

api.delete('/admin/tenants/:id', requireSuperAdmin, (req, res) => {
  const t = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(req.params.id) as any;
  if (!t) throw new HttpError(404, 'Gabinete não encontrado.');
  if (req.body?.confirmSlug !== t.slug) throw bad('Confirme digitando o slug do gabinete.');
  if (t.status !== 'suspended') throw bad('Suspenda o gabinete antes de excluí-lo.');
  db.prepare(`DELETE FROM tenants WHERE id = ?`).run(t.id); // cascades users, sessions, records
  audit({ ...actor(req), tenantId: t.id, action: 'tenant.deleted', target: t.slug });
  res.json({ ok: true });
});

// ----- super admin: users (any tenant) -----
api.get('/admin/users', requireSuperAdmin, (req, res) => {
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : null;
  const rows =
    tenantId === 'platform'
      ? db.prepare(`SELECT * FROM users WHERE tenant_id IS NULL ORDER BY name`).all()
      : tenantId
        ? db.prepare(`SELECT * FROM users WHERE tenant_id = ? ORDER BY name`).all(tenantId)
        : db.prepare(`SELECT * FROM users ORDER BY tenant_id IS NOT NULL, name`).all();
  res.json(rows.map(publicUser));
});

api.post('/admin/users', requireSuperAdmin, (req, res) => {
  const b = req.body ?? {};
  const role = oneOf(b.role, 'role', [...TENANT_ROLES, 'super_admin'] as const) as Role;
  let tenantId: string | null = null;
  if (role !== 'super_admin') {
    tenantId = str(b.tenantId, 'tenantId');
    const t = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantId) as any;
    if (!t) throw bad('Gabinete inexistente.');
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?`).get(tenantId) as any).n;
    if (n >= t.max_users) throw new HttpError(409, `Limite de ${t.max_users} usuários atingido para este gabinete.`);
  }
  const e = email(b.email);
  if (emailTaken(e)) throw new HttpError(409, 'E-mail já está em uso.');
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    tenantId,
    str(b.name, 'name'),
    e,
    hashPassword(password(b.password)),
    role
  );
  audit({ ...actor(req), tenantId, action: 'user.created', target: e, details: { role } });
  res.status(201).json(publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(id)));
});

api.patch('/admin/users/:id', requireSuperAdmin, (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as any;
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const b = req.body ?? {};
  const isSelf = u.id === req.auth!.userId;

  const name = b.name === undefined ? u.name : str(b.name, 'name');
  const status = b.status === undefined ? u.status : oneOf(b.status, 'status', ['active', 'disabled'] as const);
  let role = u.role;
  if (b.role !== undefined) {
    // Role changes cannot move a user across the platform/tenant boundary.
    role = u.tenant_id ? oneOf(b.role, 'role', TENANT_ROLES) : oneOf(b.role, 'role', ['super_admin'] as const);
  }
  const e = b.email === undefined ? u.email : email(b.email);
  if (emailTaken(e, u.id)) throw new HttpError(409, 'E-mail já está em uso.');
  if (isSelf && status !== 'active') throw bad('Você não pode desativar a sua própria conta.');
  if (u.role === 'super_admin' && status !== 'active') {
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='super_admin' AND status='active'`).get() as any).n;
    if (n <= 1) throw bad('É necessário manter ao menos um super admin ativo.');
  }

  db.prepare(`UPDATE users SET name=?, email=?, role=?, status=? WHERE id=?`).run(name, e, role, status, u.id);
  if (b.password !== undefined) {
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hashPassword(password(b.password)), u.id);
  }
  if (status !== 'active' || b.password !== undefined || role !== u.role) {
    if (!isSelf) revokeUserSessions(u.id);
  }
  const { password: _pw, ...logged } = b;
  audit({
    ...actor(req),
    tenantId: u.tenant_id,
    action: b.password !== undefined ? 'user.updated_password_reset' : 'user.updated',
    target: u.email,
    details: logged,
  });
  res.json(publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id)));
});

api.delete('/admin/users/:id', requireSuperAdmin, (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as any;
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  if (u.id === req.auth!.userId) throw bad('Você não pode excluir a sua própria conta.');
  if (u.role === 'super_admin') {
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='super_admin'`).get() as any).n;
    if (n <= 1) throw bad('É necessário manter ao menos um super admin.');
  }
  db.prepare(`DELETE FROM users WHERE id = ?`).run(u.id);
  audit({ ...actor(req), tenantId: u.tenant_id, action: 'user.deleted', target: u.email });
  res.json({ ok: true });
});

api.post('/admin/users/:id/revoke-sessions', requireSuperAdmin, (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as any;
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  revokeUserSessions(u.id);
  audit({ ...actor(req), tenantId: u.tenant_id, action: 'user.sessions_revoked', target: u.email });
  res.json({ ok: true });
});

// ----- super admin: audit -----
api.get('/admin/audit', requireSuperAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : null;
  const rows = tenantId
    ? db.prepare(`SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY id DESC LIMIT ?`).all(tenantId, limit)
    : db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`).all(limit);
  res.json(rows);
});

// ----- tenant-scoped routes (tenant ALWAYS taken from the session) -----
const tenant = express.Router();
tenant.use(requireTenantUser);

tenant.get('/users', (req, res) => {
  res.json(db.prepare(`SELECT * FROM users WHERE tenant_id = ? ORDER BY name`).all(req.auth!.tenantId).map(publicUser));
});

tenant.get('/records', (req, res) => {
  const kind = str(req.query.kind, 'kind', { max: 40 });
  const rows = db
    .prepare(`SELECT id, kind, data, created_at FROM tenant_records WHERE tenant_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 500`)
    .all(req.auth!.tenantId, kind) as any[];
  res.json(rows.map((r) => ({ id: r.id, kind: r.kind, createdAt: r.created_at, data: JSON.parse(r.data) })));
});

tenant.post('/records', (req, res) => {
  const tenantId = req.auth!.tenantId!;
  const kind = str(req.body?.kind, 'kind', { max: 40 });
  if (req.body?.data === undefined) throw bad('Campo "data" é obrigatório.');
  const data = JSON.stringify(req.body.data);
  const t = db.prepare(`SELECT storage_quota_mb FROM tenants WHERE id = ?`).get(tenantId) as any;
  const used = tenantStorageBytes().get(tenantId) ?? 0;
  if (used + data.length > t.storage_quota_mb * 1024 * 1024) {
    throw new HttpError(413, 'Cota de armazenamento do gabinete esgotada.');
  }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO tenant_records (id, tenant_id, kind, data, created_by) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    tenantId,
    kind,
    data,
    req.auth!.userId
  );
  res.status(201).json({ id });
});

tenant.delete('/records/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM tenant_records WHERE id = ? AND tenant_id = ?`).run(req.params.id, req.auth!.tenantId);
  if (r.changes === 0) throw new HttpError(404, 'Registro não encontrado.');
  audit({ ...actor(req), tenantId: req.auth!.tenantId, action: 'record.deleted', target: req.params.id });
  res.json({ ok: true });
});

// Banco de Dados (contatos, importações, discursos) — always scoped to the session's tenant.
tenant.use('/db', bancoRouter);
// Comunicação › Clipping — always scoped to the session's tenant.
tenant.use('/clipping', clippingRouter);

api.use('/tenant', tenant);

api.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
api.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Requisição grande demais.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno.' });
});

app.use('/api', api);

// Serve the built front-end in production (`npm run build && npm start`).
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

startSpeechWorker();
startClippingScheduler();

app.listen(PORT, HOST, () => {
  console.log(`Parlamenta API em http://${HOST}:${PORT}/api`);
});
