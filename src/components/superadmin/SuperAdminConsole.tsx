import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  Cpu,
  Database,
  HardDrive,
  KeyRound,
  LogOut,
  MemoryStick,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  UserX,
  UserCheck,
  Users,
  X,
  Ban,
  PlayCircle,
  Wand2,
} from 'lucide-react';
import { useDialog } from '../common/Dialogs';
import { api, ApiError, type ApiTenant, type ApiUser, type PlatformRole } from '../../lib/api';

// ---------------------------------------------------------------------------
// types & helpers
// ---------------------------------------------------------------------------
interface TenantStats extends ApiTenant {
  userCount: number;
  activeUserCount: number;
  recordCount: number;
  activeSessions: number;
  lastActivity: string | null;
  storageBytes: number;
}
interface Overview {
  generatedAt: string;
  process: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number; heapLimitBytes: number; externalBytes: number; uptimeSeconds: number; nodeVersion: string };
  system: { totalMemBytes: number; freeMemBytes: number; loadAvg: number[]; cpus: number; platform: string };
  database: { fileBytes: number; path: string };
  totals: { tenants: number; active_tenants: number; users: number; super_admins: number; records: number; active_sessions: number };
  tenants: TenantStats[];
}
interface AuditRow {
  id: number;
  at: string;
  actor_email: string | null;
  tenant_id: string | null;
  action: string;
  target: string | null;
  details: string | null;
  ip: string | null;
}

const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: 'Super Admin (Plataforma)',
  deputado: 'Parlamentar Titular',
  chefe_gabinete: 'Chefe de Gabinete',
  coordenador_atendimento: 'Coord. Atendimento',
  assessor_parlamentar: 'Assessor Temático',
  comunicacao: 'Comunicação',
};
const TENANT_ROLES: PlatformRole[] = ['deputado', 'chefe_gabinete', 'coordenador_atendimento', 'assessor_parlamentar', 'comunicacao'];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}
function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`;
}
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function genPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*'];
  const all = sets.join('');
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
  const chars = sets.map((s) => s[rnd(s.length)]!);
  while (chars.length < 16) chars.push(all[rnd(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

// ---------------------------------------------------------------------------
// small UI primitives (match the app's palette)
// ---------------------------------------------------------------------------
const inputCls =
  'w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80] focus:border-[#176B80]';
const btnPrimary =
  'inline-flex items-center gap-1.5 px-3 py-2 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-500">{hint}</span>}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Bar({ value, max, tone = 'teal' }: { value: number; max: number; tone?: 'teal' | 'navy' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : tone === 'navy' ? 'bg-[#102C45]' : 'bg-[#36B7A5]';
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(pct, value > 0 ? 1 : 0)}%` }} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-[#176B80]" />
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      {ok ? okLabel : badLabel}
    </span>
  );
}

// ---------------------------------------------------------------------------
// main console
// ---------------------------------------------------------------------------
type Tab = 'overview' | 'tenants' | 'users' | 'audit';

export function SuperAdminConsole({ user, onLogout }: { user: ApiUser; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [error, setError] = useState('');
  const dialog = useDialog();

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>('/admin/overview'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout();
      else setError((e as Error).message);
    }
  }, [onLogout]);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api<ApiUser[]>('/admin/users'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadUsers();
    const t = setInterval(loadOverview, 10_000);
    return () => clearInterval(t);
  }, [loadOverview, loadUsers]);

  const reloadAll = useCallback(() => {
    loadOverview();
    loadUsers();
  }, [loadOverview, loadUsers]);

  /** Runs an API mutation, shows the result, and reloads data. */
  const run = useCallback(
    async (fn: () => Promise<unknown>, okMsg: string) => {
      setError('');
      try {
        await fn();
        dialog.toast(okMsg);
        reloadAll();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [reloadAll, dialog]
  );

  const tenants = overview?.tenants ?? [];
  const tenantName = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants]);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Visão Geral & Recursos', icon: Activity },
    { id: 'tenants', label: 'Gabinetes (Tenants)', icon: Building2 },
    { id: 'users', label: 'Usuários', icon: Users },
    { id: 'audit', label: 'Auditoria', icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-[#102C45] text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center p-1 shrink-0">
              <img src="/logo-parlamentta.png" alt="Parlamentta" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="font-bold leading-tight">Parlamentta · Console da Plataforma</p>
              <p className="text-[11px] text-white/60 truncate">Administração de gabinetes, usuários e recursos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[10px] text-[#36B7A5] flex items-center gap-1 justify-end">
                <ShieldCheck className="w-3 h-3" /> Super Admin
              </p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-white/10" title="Sair" aria-label="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 md:px-6 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-[#36B7A5] text-white' : 'border-transparent text-white/60 hover:text-white'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Fechar erro">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {tab === 'overview' && <OverviewTab overview={overview} onRefresh={loadOverview} />}
        {tab === 'tenants' && <TenantsTab tenants={tenants} run={run} />}
        {tab === 'users' && <UsersTab users={users} tenants={tenants} tenantName={tenantName} me={user} run={run} />}
        {tab === 'audit' && <AuditTab tenants={tenants} tenantName={tenantName} />}
      </main>

    </div>
  );
}

type Runner = (fn: () => Promise<unknown>, okMsg: string) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Overview tab: platform KPIs, server memory, per-tenant storage
// ---------------------------------------------------------------------------
function OverviewTab({ overview, onRefresh }: { overview: Overview | null; onRefresh: () => void }) {
  if (!overview) return <p className="text-xs text-slate-500">Carregando métricas…</p>;
  const { process: p, system: s, totals, database, tenants } = overview;
  const sysUsed = s.totalMemBytes - s.freeMemBytes;
  const sorted = [...tenants].sort((a, b) => b.storageBytes - a.storageBytes);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Visão geral da plataforma</h1>
          <p className="text-xs text-slate-500">Atualiza a cada 10 s · última leitura {fmtDate(overview.generatedAt)}</p>
        </div>
        <button onClick={onRefresh} className={btnGhost}>
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Building2} label="Gabinetes" value={totals.tenants} sub={`${totals.active_tenants} ativos · ${totals.tenants - totals.active_tenants} suspensos`} />
        <Stat icon={Users} label="Usuários" value={totals.users} sub={`${totals.super_admins} super admin(s)`} />
        <Stat icon={Activity} label="Sessões ativas" value={totals.active_sessions} sub="em todos os gabinetes" />
        <Stat icon={Database} label="Banco de dados" value={fmtBytes(database.fileBytes)} sub={`${totals.records} registros`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-[#176B80]" /> Memória do servidor da API
          </h2>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Heap JavaScript</span>
              <span className="font-mono tabular-nums text-slate-900">
                {fmtBytes(p.heapUsedBytes)} / {fmtBytes(p.heapLimitBytes)} limite
              </span>
            </div>
            <Bar value={p.heapUsedBytes} max={p.heapLimitBytes} tone="navy" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Memória do processo (RSS)</span>
              <span className="font-mono tabular-nums text-slate-900">
                {fmtBytes(p.rssBytes)} / {fmtBytes(s.totalMemBytes)}
              </span>
            </div>
            <Bar value={p.rssBytes} max={s.totalMemBytes} tone="navy" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
            <div>
              <p className="text-slate-500">Uptime</p>
              <p className="font-mono text-slate-900">{fmtUptime(p.uptimeSeconds)}</p>
            </div>
            <div>
              <p className="text-slate-500">Buffers externos</p>
              <p className="font-mono text-slate-900">{fmtBytes(p.externalBytes)}</p>
            </div>
            <div>
              <p className="text-slate-500">Node</p>
              <p className="font-mono text-slate-900">{p.nodeVersion}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#176B80]" /> Host
          </h2>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Memória RAM do sistema</span>
              <span className="font-mono tabular-nums text-slate-900">
                {fmtBytes(sysUsed)} / {fmtBytes(s.totalMemBytes)}
              </span>
            </div>
            <Bar value={sysUsed} max={s.totalMemBytes} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Carga (1 min) por CPU</span>
              <span className="font-mono tabular-nums text-slate-900">
                {s.loadAvg[0]!.toFixed(2)} / {s.cpus} CPUs
              </span>
            </div>
            <Bar value={s.loadAvg[0]!} max={s.cpus} />
          </div>
          <p className="text-[11px] text-slate-500 truncate">{s.platform}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#176B80]" /> Consumo de armazenamento por gabinete
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5 mb-4">
          Dados do gabinete (registros, usuários e trilha de auditoria) comparados à cota contratada.
        </p>
        {sorted.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum gabinete cadastrado ainda.</p>
        ) : (
          <div className="space-y-3">
            {sorted.map((t) => {
              const quota = t.storageQuotaMb * 1024 * 1024;
              return (
                <div key={t.id} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-12 sm:col-span-4 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{t.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {t.userCount} usuários · {t.activeSessions} sessões · {t.recordCount} registros
                    </p>
                  </div>
                  <div className="col-span-8 sm:col-span-6">
                    <Bar value={t.storageBytes} max={quota} />
                  </div>
                  <div className="col-span-4 sm:col-span-2 text-right text-[11px] font-mono tabular-nums text-slate-700">
                    {fmtBytes(t.storageBytes)} / {t.storageQuotaMb} MB
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tenants tab
// ---------------------------------------------------------------------------
function TenantsTab({ tenants, run }: { tenants: TenantStats[]; run: Runner }) {
  const dialog = useDialog();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TenantStats | null>(null);
  const [deleting, setDeleting] = useState<TenantStats | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Gabinetes (tenants)</h1>
          <p className="text-xs text-slate-500">Cada gabinete tem dados, usuários e cota isolados.</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> Novo gabinete
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left font-semibold px-4 py-2.5">Gabinete</th>
              <th className="text-left font-semibold px-4 py-2.5">Esfera</th>
              <th className="text-left font-semibold px-4 py-2.5">Status</th>
              <th className="text-left font-semibold px-4 py-2.5">Usuários</th>
              <th className="text-left font-semibold px-4 py-2.5 min-w-[160px]">Armazenamento</th>
              <th className="text-left font-semibold px-4 py-2.5">Última atividade</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Nenhum gabinete. Crie o primeiro para começar.
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{t.slug}</p>
                </td>
                <td className="px-4 py-3 capitalize text-slate-700">
                  {t.sphere}
                  {t.state && <span className="text-slate-400"> · {t.state}</span>}
                </td>
                <td className="px-4 py-3">
                  <StatusPill ok={t.status === 'active'} okLabel="Ativo" badLabel="Suspenso" />
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                  {t.userCount}/{t.maxUsers}
                </td>
                <td className="px-4 py-3 space-y-1">
                  <Bar value={t.storageBytes} max={t.storageQuotaMb * 1024 * 1024} />
                  <p className="text-[10px] font-mono text-slate-500">
                    {fmtBytes(t.storageBytes)} / {t.storageQuotaMb} MB
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(t.lastActivity)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button className={btnGhost} onClick={() => setEditing(t)} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {t.status === 'active' ? (
                      <button
                        className={btnGhost}
                        title="Suspender (encerra todas as sessões do gabinete)"
                        onClick={async () => {
                          const ok = await dialog.confirm({
                            title: 'Suspender gabinete',
                            message: (
                              <>
                                Suspender <strong>{t.name}</strong>?{' '}
                                {t.userCount === 1 ? 'O usuário do gabinete será desconectado' : `Os ${t.userCount} usuários do gabinete serão desconectados`}{' '}
                                imediatamente e não poderá{t.userCount === 1 ? '' : 'ão'} entrar até a reativação.
                              </>
                            ),
                            confirmLabel: 'Suspender',
                            tone: 'warning',
                          });
                          if (ok)
                            run(() => api(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { status: 'suspended' } }), 'Gabinete suspenso.');
                        }}
                      >
                        <Ban className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                    ) : (
                      <>
                        <button
                          className={btnGhost}
                          title="Reativar"
                          onClick={() => run(() => api(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { status: 'active' } }), 'Gabinete reativado.')}
                        >
                          <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                        </button>
                        <button className={btnGhost} title="Excluir definitivamente" onClick={() => setDeleting(t)}>
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <CreateTenantModal onClose={() => setCreating(false)} run={run} />}
      {editing && <EditTenantModal tenant={editing} onClose={() => setEditing(null)} run={run} />}
      {deleting && <DeleteTenantModal tenant={deleting} onClose={() => setDeleting(null)} run={run} />}
    </div>
  );
}

function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input className={`${inputCls} font-mono`} value={value} onChange={(e) => onChange(e.target.value)} required minLength={12} autoComplete="new-password" />
      <button type="button" className={btnGhost} onClick={() => onChange(genPassword())} title="Gerar senha forte">
        <Wand2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CreateTenantModal({ onClose, run }: { onClose: () => void; run: Runner }) {
  const [f, setF] = useState({
    name: '',
    slug: '',
    parliamentarian: '',
    sphere: 'estadual',
    house: '',
    state: 'MT',
    storageQuotaMb: 512,
    maxUsers: 25,
    adminName: '',
    adminEmail: '',
    adminRole: 'chefe_gabinete',
    adminPassword: genPassword(),
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value, ...(k === 'name' && !slugTouched ? { slug: slugify(e.target.value) } : {}) }));

  return (
    <Modal title="Novo gabinete" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () =>
              api('/admin/tenants', {
                method: 'POST',
                body: {
                  name: f.name,
                  slug: f.slug,
                  parliamentarian: f.parliamentarian,
                  sphere: f.sphere,
                  house: f.house,
                  state: f.state,
                  storageQuotaMb: Number(f.storageQuotaMb),
                  maxUsers: Number(f.maxUsers),
                  admin: { name: f.adminName, email: f.adminEmail, role: f.adminRole, password: f.adminPassword },
                },
              }),
            `Gabinete criado. Envie a senha inicial a ${f.adminEmail} por canal seguro.`
          );
          if (ok) onClose();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome do gabinete">
              <input className={inputCls} value={f.name} onChange={set('name')} required placeholder="Gabinete Dep. Fulana de Tal" />
            </Field>
          </div>
          <Field label="Slug (identificador)" hint="minúsculas, números e hífens">
            <input
              className={`${inputCls} font-mono`}
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug')(e);
              }}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </Field>
          <Field label="Esfera">
            <select className={inputCls} value={f.sphere} onChange={set('sphere')}>
              <option value="estadual">Estadual</option>
              <option value="federal">Federal</option>
              <option value="municipal">Municipal</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Parlamentar">
              <input className={inputCls} value={f.parliamentarian} onChange={set('parliamentarian')} />
            </Field>
          </div>
          <Field label="Casa legislativa">
            <input className={inputCls} value={f.house} onChange={set('house')} placeholder="ALMT" />
          </Field>
          <Field label="UF">
            <input className={inputCls} value={f.state} onChange={set('state')} maxLength={2} />
          </Field>
          <Field label="Cota de armazenamento (MB)">
            <input className={inputCls} type="number" min={1} value={f.storageQuotaMb} onChange={set('storageQuotaMb')} />
          </Field>
          <Field label="Limite de usuários">
            <input className={inputCls} type="number" min={1} value={f.maxUsers} onChange={set('maxUsers')} />
          </Field>
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-3">
          <p className="text-xs font-bold text-slate-900">Administrador inicial do gabinete</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome">
              <input className={inputCls} value={f.adminName} onChange={set('adminName')} required />
            </Field>
            <Field label="Papel">
              <select className={inputCls} value={f.adminRole} onChange={set('adminRole')}>
                <option value="chefe_gabinete">Chefe de Gabinete</option>
                <option value="deputado">Parlamentar Titular</option>
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="E-mail institucional">
                <input className={inputCls} type="email" value={f.adminEmail} onChange={set('adminEmail')} required />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Senha inicial" hint="Mín. 12 caracteres com maiúsculas, minúsculas e números.">
                <PasswordInput value={f.adminPassword} onChange={(v) => setF((p) => ({ ...p, adminPassword: v }))} />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Criar gabinete
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditTenantModal({ tenant, onClose, run }: { tenant: TenantStats; onClose: () => void; run: Runner }) {
  const [f, setF] = useState({
    name: tenant.name,
    parliamentarian: tenant.parliamentarian,
    sphere: tenant.sphere,
    house: tenant.house,
    state: tenant.state,
    storageQuotaMb: tenant.storageQuotaMb,
    maxUsers: tenant.maxUsers,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal title={`Editar ${tenant.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () =>
              api(`/admin/tenants/${tenant.id}`, {
                method: 'PATCH',
                body: { ...f, storageQuotaMb: Number(f.storageQuotaMb), maxUsers: Number(f.maxUsers) },
              }),
            'Gabinete atualizado.'
          );
          if (ok) onClose();
        }}
      >
        <Field label="Nome">
          <input className={inputCls} value={f.name} onChange={set('name')} required />
        </Field>
        <Field label="Parlamentar">
          <input className={inputCls} value={f.parliamentarian} onChange={set('parliamentarian')} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Esfera">
            <select className={inputCls} value={f.sphere} onChange={set('sphere')}>
              <option value="estadual">Estadual</option>
              <option value="federal">Federal</option>
              <option value="municipal">Municipal</option>
            </select>
          </Field>
          <Field label="Casa">
            <input className={inputCls} value={f.house} onChange={set('house')} />
          </Field>
          <Field label="UF">
            <input className={inputCls} value={f.state} onChange={set('state')} maxLength={2} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cota (MB)" hint={`Em uso: ${fmtBytes(tenant.storageBytes)}`}>
            <input className={inputCls} type="number" min={1} value={f.storageQuotaMb} onChange={set('storageQuotaMb')} />
          </Field>
          <Field label="Limite de usuários" hint={`Atual: ${tenant.userCount}`}>
            <input className={inputCls} type="number" min={1} value={f.maxUsers} onChange={set('maxUsers')} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteTenantModal({ tenant, onClose, run }: { tenant: TenantStats; onClose: () => void; run: Runner }) {
  const [confirmSlug, setConfirmSlug] = useState('');
  return (
    <Modal title="Excluir gabinete definitivamente" onClose={onClose}>
      <div className="space-y-3 text-xs text-slate-700">
        <p>
          Isto apaga <strong>{tenant.name}</strong> com todos os seus {tenant.userCount} usuários e {tenant.recordCount} registros. Não
          pode ser desfeito.
        </p>
        <Field label={`Digite o slug "${tenant.slug}" para confirmar`}>
          <input className={`${inputCls} font-mono`} value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            disabled={confirmSlug !== tenant.slug}
            onClick={async () => {
              const ok = await run(
                () => api(`/admin/tenants/${tenant.id}`, { method: 'DELETE', body: { confirmSlug } }),
                'Gabinete excluído.'
              );
              if (ok) onClose();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------
function UsersTab({
  users,
  tenants,
  tenantName,
  me,
  run,
}: {
  users: ApiUser[];
  tenants: TenantStats[];
  tenantName: Map<string, string>;
  me: ApiUser;
  run: Runner;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<ApiUser | null>(null);
  const dialog = useDialog();

  const visible = users.filter((u) => {
    if (filter === 'platform' && u.tenantId) return false;
    if (filter !== 'all' && filter !== 'platform' && u.tenantId !== filter) return false;
    const s = q.trim().toLowerCase();
    return !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  const patch = (u: ApiUser, body: Record<string, unknown>, msg: string) =>
    run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body }), msg);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Usuários</h1>
          <p className="text-xs text-slate-500">Todos os usuários da plataforma, de qualquer gabinete.</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> Novo usuário
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-8`} placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inputCls.replace('w-full ', 'w-auto ')} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos os gabinetes</option>
          <option value="platform">Plataforma (super admins)</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left font-semibold px-4 py-2.5">Usuário</th>
              <th className="text-left font-semibold px-4 py-2.5">Gabinete</th>
              <th className="text-left font-semibold px-4 py-2.5">Papel</th>
              <th className="text-left font-semibold px-4 py-2.5">Status</th>
              <th className="text-left font-semibold px-4 py-2.5">Último acesso</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
            {visible.map((u) => {
              const isMe = u.id === me.id;
              return (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {u.name} {isMe && <span className="text-[10px] text-[#176B80]">(você)</span>}
                    </p>
                    <p className="text-[10px] text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {u.tenantId ? tenantName.get(u.tenantId) ?? '—' : <span className="text-[#176B80] font-semibold">Plataforma</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.tenantId ? (
                      <select
                        className="text-xs bg-transparent border border-transparent hover:border-slate-200 rounded px-1 py-0.5"
                        value={u.role}
                        onChange={(e) => patch(u, { role: e.target.value }, 'Papel atualizado.')}
                      >
                        {TENANT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-700">{ROLE_LABELS[u.role]}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill ok={u.status === 'active'} okLabel="Ativo" badLabel="Desativado" />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button className={btnGhost} title="Redefinir senha" onClick={() => setResetting(u)}>
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      {!isMe && (
                        <>
                          <button
                            className={btnGhost}
                            title="Encerrar sessões"
                            onClick={() => run(() => api(`/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }), 'Sessões encerradas.')}
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                          {u.status === 'active' ? (
                            <button className={btnGhost} title="Desativar" onClick={() => patch(u, { status: 'disabled' }, 'Usuário desativado.')}>
                              <UserX className="w-3.5 h-3.5 text-amber-600" />
                            </button>
                          ) : (
                            <button className={btnGhost} title="Reativar" onClick={() => patch(u, { status: 'active' }, 'Usuário reativado.')}>
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            </button>
                          )}
                          <button
                            className={btnGhost}
                            title="Excluir"
                            onClick={async () => {
                              const ok = await dialog.confirm({
                                title: 'Excluir usuário',
                                message: (
                                  <>
                                    Excluir <strong>{u.name}</strong> ({u.email})? Esta ação não pode ser desfeita.
                                  </>
                                ),
                                confirmLabel: 'Excluir',
                                tone: 'danger',
                              });
                              if (ok)
                                run(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }), 'Usuário excluído.');
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateUserModal
          tenants={tenants}
          defaultTenant={filter !== 'all' && filter !== 'platform' ? filter : tenants[0]?.id ?? 'platform'}
          onClose={() => setCreating(false)}
          run={run}
        />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} run={run} />}
    </div>
  );
}

function CreateUserModal({
  tenants,
  defaultTenant,
  onClose,
  run,
}: {
  tenants: TenantStats[];
  defaultTenant: string;
  onClose: () => void;
  run: Runner;
}) {
  const [tenantId, setTenantId] = useState(defaultTenant);
  const [role, setRole] = useState<PlatformRole>(defaultTenant === 'platform' ? 'super_admin' : 'assessor_parlamentar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(genPassword());
  const isPlatform = tenantId === 'platform';

  return (
    <Modal title="Novo usuário" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () =>
              api('/admin/users', {
                method: 'POST',
                body: { tenantId: isPlatform ? null : tenantId, role: isPlatform ? 'super_admin' : role, name, email, password },
              }),
            `Usuário criado. Envie a senha inicial a ${email} por canal seguro.`
          );
          if (ok) onClose();
        }}
      >
        <Field label="Gabinete">
          <select
            className={inputCls}
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              setRole(e.target.value === 'platform' ? 'super_admin' : 'assessor_parlamentar');
            }}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="platform">— Plataforma (novo super admin) —</option>
          </select>
        </Field>
        {isPlatform ? (
          <p className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            Super admins têm acesso total a todos os gabinetes. Crie apenas para operadores da plataforma.
          </p>
        ) : (
          <Field label="Papel">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as PlatformRole)}>
              {TENANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Nome">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="E-mail">
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha inicial" hint="Mín. 12 caracteres com maiúsculas, minúsculas e números.">
          <PasswordInput value={password} onChange={setPassword} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Criar usuário
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, run }: { user: ApiUser; onClose: () => void; run: Runner }) {
  const [password, setPassword] = useState(genPassword());
  return (
    <Modal title={`Redefinir senha · ${user.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () => api(`/admin/users/${user.id}`, { method: 'PATCH', body: { password } }),
            'Senha redefinida e sessões do usuário encerradas.'
          );
          if (ok) onClose();
        }}
      >
        <Field label="Nova senha" hint="As sessões abertas do usuário serão encerradas.">
          <PasswordInput value={password} onChange={setPassword} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Redefinir
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Audit tab
// ---------------------------------------------------------------------------
function AuditTab({ tenants, tenantName }: { tenants: TenantStats[]; tenantName: Map<string, string> }) {
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<AuditRow[]>(`/admin/audit?limit=300${filter ? `&tenantId=${encodeURIComponent(filter)}` : ''}`));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const tone = (a: string) =>
    a.includes('failed') || a.includes('deleted')
      ? 'text-rose-700 bg-rose-50'
      : a.startsWith('tenant')
        ? 'text-[#102C45] bg-[#E9F1F4]'
        : a.startsWith('auth')
          ? 'text-slate-700 bg-slate-100'
          : 'text-emerald-700 bg-emerald-50';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Trilha de auditoria</h1>
          <p className="text-xs text-slate-500">Logins, falhas de acesso e toda alteração administrativa.</p>
        </div>
        <div className="flex gap-2">
          <select className={inputCls.replace('w-full ', 'w-auto ')} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos os eventos</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className={btnGhost} onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left font-semibold px-4 py-2.5">Quando</th>
              <th className="text-left font-semibold px-4 py-2.5">Ação</th>
              <th className="text-left font-semibold px-4 py-2.5">Alvo</th>
              <th className="text-left font-semibold px-4 py-2.5">Gabinete</th>
              <th className="text-left font-semibold px-4 py-2.5">Autor</th>
              <th className="text-left font-semibold px-4 py-2.5">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} title={r.details ?? undefined}>
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.at)}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${tone(r.action)}`}>{r.action}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-700">{r.target ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">{r.tenant_id ? tenantName.get(r.tenant_id) ?? r.tenant_id.slice(0, 8) : '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">{r.actor_email ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono">{r.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
