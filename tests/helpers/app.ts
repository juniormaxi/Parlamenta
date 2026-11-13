/**
 * Monta a API de teste com os MESMOS middlewares de produção (cookies, CSRF, sessão, requireTenantUser)
 * e os routers reais. Deve ser importado depois de startTestEnv() (as variáveis de ambiente já definidas).
 */
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import '../../server/http';
import { db, migrate, pool } from '../../server/db';
import { parseCookies, requireCsrfHeader, loadSession, requireTenantUser, requireSuperAdmin } from '../../server/auth';
import { HttpError } from '../../server/http';
import { knowledgeRouter } from '../../server/knowledge';
import { oficiosRouter } from '../../server/oficios';
import { tenantProtocolsRouter } from '../../server/protocols';
import { bancoRouter } from '../../server/banco';
import { clippingRouter } from '../../server/clipping';
import { startJobWorker, type WorkerHandle } from '../../server/jobs';
import '../../server/kb/jobs';
import { rlsStatus } from '../../server/kb/context';

export { db, pool };

export async function setupApp() {
  await migrate();
  const app = express();
  const api = express.Router();
  api.use(express.json({ limit: '256kb' }));
  api.use(parseCookies);
  api.use(requireCsrfHeader);
  api.use(loadSession);
  api.get('/admin/rls', requireSuperAdmin, async (_req, res) => res.json(await rlsStatus()));
  const tenant = express.Router();
  tenant.use(requireTenantUser);
  tenant.use('/knowledge', knowledgeRouter);
  tenant.use('/oficios', oficiosRouter);
  tenant.use('/protocols', tenantProtocolsRouter);
  tenant.use('/db', bancoRouter);
  tenant.use('/clipping', clippingRouter);
  api.use('/tenant', tenant);
  api.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  });
  app.use('/api', api);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return {
    base,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

// ---------------------------------------------------------------------------
// fixtures (superuser pool: setup only — never used by the code under test)
// ---------------------------------------------------------------------------
import type pg from 'pg';
export interface User {
  id: string;
  tenantId: string | null;
  role: string;
  cookie: string;
}

export async function createTenant(su: pg.Pool, slug: string) {
  const id = crypto.randomUUID();
  await su.query(`INSERT INTO tenants (id, slug, name, sphere) VALUES ($1, $2, $3, 'estadual')`, [id, slug, `Gabinete ${slug}`]);
  return id;
}

export async function createUser(su: pg.Pool, tenantId: string | null, role: string): Promise<User> {
  const id = crypto.randomUUID();
  await su.query(`INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'x', $5)`, [
    id,
    tenantId,
    `${role} ${id.slice(0, 4)}`,
    `${id}@test.local`,
    role,
  ]);
  const token = crypto.randomBytes(24).toString('hex');
  await su.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    crypto.createHash('sha256').update(token).digest('hex'),
    id,
    new Date(Date.now() + 3600_000).toISOString(),
  ]);
  return { id, tenantId, role, cookie: `parlamentta_sid=${token}` };
}

export function client(base: string) {
  return async function call(user: User | null, method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.csrf !== false) headers['x-parlamentta-request'] = '1';
    if (user) headers.cookie = user.cookie;
    const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: r.status, body: json };
  };
}

// ---------------------------------------------------------------------------
// worker helpers
// ---------------------------------------------------------------------------
let worker: WorkerHandle | null = null;
export function startWorker(concurrency = 2) {
  worker = startJobWorker({ concurrency, pollMs: 25 });
  return worker;
}
export async function stopWorker() {
  await worker?.stop();
  worker = null;
}

/** Waits until no job is runnable or running (delayed jobs in the future are ignored). */
export async function waitIdle(su: pg.Pool, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await su.query(
      `SELECT COUNT(*)::int AS n FROM jobs WHERE status = 'running' OR (status = 'queued' AND run_after <= now())`
    );
    if (r.rows[0].n === 0) return;
    await new Promise((res) => setTimeout(res, 40));
  }
  const left = await su.query(`SELECT kind, status, attempts, last_error FROM jobs WHERE status IN ('queued','running')`);
  throw new Error(`Fila não esvaziou: ${JSON.stringify(left.rows)}`);
}
