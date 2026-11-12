import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';

export const TENANT_ROLES = [
  'deputado',
  'chefe_gabinete',
  'coordenador_atendimento',
  'assessor_parlamentar',
  'comunicacao',
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
export type Role = TenantRole | 'super_admin';

/** Roles allowed to manage users inside their own tenant. */
export const TENANT_ADMIN_ROLES: TenantRole[] = ['deputado', 'chefe_gabinete'];

export const SESSION_COOKIE = 'parlamenta_sid';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 8);
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------- passwords (scrypt, per-user salt) ----------
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// A fixed hash used to keep login timing constant when the e-mail doesn't exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export function validatePasswordStrength(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 12) return 'A senha deve ter no mínimo 12 caracteres.';
  if (pw.length > 256) return 'Senha longa demais.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    return 'A senha deve conter letras maiúsculas, minúsculas e números.';
  return null;
}

// ---------- sessions ----------
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string, req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)`
  ).run(sha256(token), userId, expires.toISOString(), req.ip ?? null, String(req.headers['user-agent'] ?? '').slice(0, 200));
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    path: '/api',
    expires,
  });
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/api' });
}

export async function revokeUserSessions(userId: string) {
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}

export async function revokeTenantSessions(tenantId: string) {
  await db.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)`).run(tenantId);
}

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      cookies?: Record<string, string>;
    }
  }
}

/** Minimal cookie parser (avoids an extra dependency). */
export function parseCookies(req: Request, _res: Response, next: NextFunction) {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  req.cookies = out;
  next();
}

/**
 * Resolves the session. The tenant comes ONLY from the stored user row —
 * never from a header, query string or body — so a client cannot pick another tenant.
 * Users of suspended tenants and disabled users are rejected.
 */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const row = await db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.status AS user_status,
                t.status AS tenant_status, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE s.token_hash = ?`
      )
      .get(sha256(token)) as any;
    const valid =
      row &&
      new Date(row.expires_at).getTime() > Date.now() &&
      row.user_status === 'active' &&
      (row.role === 'super_admin' || row.tenant_status === 'active');
    if (valid) {
      req.auth = {
        userId: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        tenantId: row.tenant_id,
      };
    } else if (row) {
      await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(token));
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Não autenticado.' });
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Não autenticado.' });
  if (req.auth.role !== 'super_admin') return res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma.' });
  next();
}

/** Tenant routes: caller must belong to a tenant. Super admins do not see tenant data through these routes. */
export function requireTenantUser(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Não autenticado.' });
  if (!req.auth.tenantId) return res.status(403).json({ error: 'Rota exclusiva de usuários de gabinete.' });
  next();
}

/**
 * CSRF defence: state-changing requests must carry a custom header. Browsers cannot attach
 * custom headers cross-origin without a CORS preflight, and this server never answers CORS.
 * Combined with SameSite=Strict cookies.
 */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-parlamenta-request'] !== '1') return res.status(403).json({ error: 'Requisição recusada (CSRF).' });
  next();
}

// ---------- login rate limit (per IP + per e-mail) ----------
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;

export function loginBlocked(keys: string[]): boolean {
  const now = Date.now();
  return keys.some((k) => {
    const a = attempts.get(k);
    return a && a.resetAt > now && a.count >= MAX_ATTEMPTS;
  });
}
export function registerLoginFailure(keys: string[]) {
  const now = Date.now();
  for (const k of keys) {
    const a = attempts.get(k);
    if (!a || a.resetAt < now) attempts.set(k, { count: 1, resetAt: now + WINDOW_MS });
    else a.count++;
  }
}
export function clearLoginFailures(keys: string[]) {
  keys.forEach((k) => attempts.delete(k));
}

export async function login(email: string, password: string) {
  const user = await db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH) && !!user;
  if (!ok) return { ok: false as const, reason: 'invalid' };
  if (user.status !== 'active') return { ok: false as const, reason: 'disabled' };
  if (user.tenant_id) {
    const t = await db.prepare(`SELECT status FROM tenants WHERE id = ?`).get(user.tenant_id) as any;
    if (t?.status !== 'active') return { ok: false as const, reason: 'tenant_suspended' };
  }
  return { ok: true as const, user };
}
