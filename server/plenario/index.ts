/**
 * Legislativo › Plenário. Dados oficiais da casa legislativa do gabinete (compartilhados por casa em
 * plenary_houses/plenary_votes) + ajustes do próprio gabinete (plenary_tenant).
 *
 * Montado em /api/tenant/plenario — sempre filtrado por req.auth.tenantId:
 *   GET    /                     composição, votações (sem os votos), alinhamento e situação da importação
 *   GET    /votacoes/:id         votos nominais de uma votação
 *   POST   /sincronizar          atualiza os dados oficiais agora
 *   PUT    /config               parlamentar do mandato (referência do alinhamento)
 *   POST   /membros              cadastra parlamentar à mão
 *   PATCH  /membros/:id          corrige dados (partido, bloco, cadeira, contato…) ou oculta
 *   DELETE /membros/:id          remove cadastro manual / desfaz ajustes
 *   POST   /votacoes             registra votação nominal à mão
 *   PATCH  /votacoes/:id         análise do gabinete / tema
 *   DELETE /votacoes/:id         remove votação registrada à mão
 *   GET    /foto/:key            foto importada de arquivo do TSE
 */
import crypto from 'node:crypto';
import express, { type Request } from 'express';
import { db, tx, audit } from '../db';
import { HttpError, bad } from '../http';
import { chamberConfig, ufInfo, type Sphere } from '../../src/lib/chamber';
import {
  syncFederal,
  syncEstadual,
  syncMunicipal,
  syncSapl,
  normalizeSaplUrl,
  classifyTheme,
  type HouseMember,
  type HouseSession,
  type SyncContext,
  type SyncOutput,
  type Vote,
  type Theme,
} from './sources';
import { norm } from './net';

export const plenarioRouter = express.Router();

const STALE_MS = 12 * 3600_000;
const BLOCS = ['Governo', 'Oposição', 'Independente'] as const;
const THEMES: Theme[] = ['Saúde', 'Infraestrutura', 'Agricultura & Meio Ambiente', 'Educação', 'Tributário & Orçamento', 'Segurança Pública', 'Servidores Públicos', 'Outros'];
const QUORUMS = ['Maioria Simples', 'Maioria Absoluta', 'Três Quintos (3/5)', 'Dois Terços (2/3)'] as const;
const CHOICES = ['sim', 'nao', 'abstencao', 'ausente'] as const;

const tid = (req: Request) => req.auth!.tenantId!;
const actor = (req: Request) => ({ actorId: req.auth!.userId, actorEmail: req.auth!.email, tenantId: tid(req), ip: req.ip });
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

interface TenantChamber {
  id: string;
  sphere: Sphere;
  state: string;
  city: string;
  seats: number;
  house: string;
  sapl_url: string;
}

/** Chave da casa: gabinetes da mesma casa (e mesma fonte) compartilham os dados importados. */
export function houseKeyFor(t: Pick<TenantChamber, 'sphere' | 'state' | 'city' | 'sapl_url'>): string {
  const sapl = t.sphere !== 'federal' && t.sapl_url ? `:sapl:${new URL(t.sapl_url).host}` : '';
  if (t.sphere === 'federal') return 'federal';
  if (t.sphere === 'estadual') return `estadual:${t.state}${sapl}`;
  return `municipal:${t.state}:${norm(t.city).replace(/ /g, '-')}${sapl}`;
}

async function tenantChamber(tenantId: string): Promise<TenantChamber> {
  const t = (await db.prepare(`SELECT id, sphere, state, city, seats, house, sapl_url FROM tenants WHERE id = ?`).get(tenantId)) as TenantChamber | undefined;
  if (!t) throw new HttpError(404, 'Gabinete não encontrado.');
  return t;
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------
const running = new Map<string, Promise<void>>();

async function runSync(key: string, t: TenantChamber): Promise<void> {
  const house = (await db.prepare(`SELECT meta FROM plenary_houses WHERE house_key = ?`).get(key)) as any;
  const meta = JSON.parse(house?.meta || '{}');
  const warnings: string[] = [];
  const ctx: SyncContext = {
    meta,
    warnings,
    progress: async (msg) => {
      await db.prepare(`UPDATE plenary_houses SET progress = ? WHERE house_key = ?`).run(msg, key);
    },
    saveSessions: async (sessions, { from, to }) => {
      await tx(async () => {
        await db.prepare(`DELETE FROM plenary_votes WHERE house_key = ? AND date >= ? AND date <= ?`).run(key, from, to);
        for (const s of sessions) {
          const { votes, ...data } = s;
          await db
            .prepare(`INSERT INTO plenary_votes (house_key, id, date, data, votes) VALUES (?, ?, ?, ?, ?) ON CONFLICT (house_key, id) DO UPDATE SET date = EXCLUDED.date, data = EXCLUDED.data, votes = EXCLUDED.votes`)
            .run(key, s.id, s.date, JSON.stringify(data), JSON.stringify(votes));
        }
      });
      votesCache.delete(key);
    },
    hasPhoto: async (k) => !!(await db.prepare(`SELECT 1 AS x FROM plenary_photos WHERE key = ?`).get(k)),
    savePhoto: async (k, mime, data) => {
      await db
        .prepare(`INSERT INTO plenary_photos (key, mime, data) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, fetched_at = datetime('now')`)
        .run(k, mime, data);
    },
  };

  await db.prepare(`UPDATE plenary_houses SET status = 'syncing', progress = 'Iniciando…', error = '', started_at = datetime('now') WHERE house_key = ?`).run(key);
  try {
    let out: SyncOutput;
    if (t.sphere === 'federal') out = await syncFederal(ctx);
    else {
      let sapl: Awaited<ReturnType<typeof syncSapl>> = null;
      if (t.sapl_url) {
        try {
          sapl = await syncSapl(t.sapl_url, t.state, ctx);
        } catch (e: any) {
          warnings.push(`SAPL indisponível (${e.message}).`);
        }
      }
      const base = t.sphere === 'estadual' ? await syncEstadual(t.state, ctx) : await syncMunicipal(t.state, t.city, ctx);
      out = sapl
        ? { ...base, legislature: sapl.legislature || base.legislature, members: sapl.members, sources: [...sapl.sources, ...base.sources.map((s) => ({ ...s, scope: `${s.scope} (referência)` }))] }
        : base;
    }
    meta.warnings = warnings;
    await db
      .prepare(
        `UPDATE plenary_houses SET status = 'ok', progress = '', error = '', label = ?, legislature = ?, members = ?, sources = ?, meta = ?, synced_at = datetime('now') WHERE house_key = ?`
      )
      .run(out.label, out.legislature, JSON.stringify(out.members), JSON.stringify(out.sources), JSON.stringify(meta), key);
  } catch (e: any) {
    console.error(`[plenario] falha ao importar ${key}:`, e);
    meta.warnings = warnings;
    await db
      .prepare(`UPDATE plenary_houses SET status = 'error', progress = '', error = ?, meta = ? WHERE house_key = ?`)
      .run(String(e?.message ?? e).slice(0, 500), JSON.stringify(meta), key);
  } finally {
    votesCache.delete(key);
  }
}

/** Dispara a importação em segundo plano (uma por casa por vez). */
function startSync(key: string, t: TenantChamber): Promise<void> {
  const cur = running.get(key);
  if (cur) return cur;
  const p = runSync(key, t).finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

async function ensureHouse(t: TenantChamber) {
  const key = houseKeyFor(t);
  await db.prepare(`INSERT INTO plenary_houses (house_key) VALUES (?) ON CONFLICT (house_key) DO NOTHING`).run(key);
  const row = (await db.prepare(`SELECT * FROM plenary_houses WHERE house_key = ?`).get(key)) as any;
  const stale = !row.synced_at || Date.now() - Date.parse(`${row.synced_at.replace(' ', 'T')}Z`) > STALE_MS;
  const failedRecently = row.status === 'error' && row.started_at && Date.now() - Date.parse(`${row.started_at.replace(' ', 'T')}Z`) < 30 * 60_000;
  if (stale && !running.has(key) && !failedRecently) {
    void startSync(key, t);
    row.status = 'syncing';
  }
  if (running.has(key)) row.status = 'syncing';
  return { key, row };
}

/** Ao iniciar: limpa importações interrompidas e mantém em dia as casas com gabinetes ativos. */
export async function startPlenarioScheduler() {
  await db.prepare(`UPDATE plenary_houses SET status = CASE WHEN synced_at IS NULL THEN 'idle' ELSE 'ok' END, progress = '' WHERE status = 'syncing'`).run();
  const tick = async () => {
    try {
      const tenants = (await db.prepare(`SELECT id, sphere, state, city, seats, house, sapl_url FROM tenants WHERE status = 'active'`).all()) as TenantChamber[];
      const seen = new Set<string>();
      for (const t of tenants) {
        const key = houseKeyFor(t);
        if (seen.has(key)) continue;
        seen.add(key);
        const row = (await db.prepare(`SELECT synced_at FROM plenary_houses WHERE house_key = ?`).get(key)) as any;
        if (!row) continue; // casa ainda não aberta por nenhum gabinete: importa no primeiro acesso
        const age = row.synced_at ? Date.now() - Date.parse(`${row.synced_at.replace(' ', 'T')}Z`) : Infinity;
        if (age > 24 * 3600_000) await startSync(key, t); // uma casa por vez
      }
    } catch (e) {
      console.error('[plenario] agendador:', e);
    }
  };
  setInterval(tick, 3600_000).unref();
  setTimeout(tick, 60_000).unref();
}

// ---------------------------------------------------------------------------
// Leitura e cálculo (alinhamento, blocos, placar)
// ---------------------------------------------------------------------------
interface StoredSession extends Omit<HouseSession, 'votes'> {
  votes: Record<string, Vote>;
}
const votesCache = new Map<string, { at: number; sessions: StoredSession[] }>();

async function houseSessions(key: string): Promise<StoredSession[]> {
  const c = votesCache.get(key);
  if (c && Date.now() - c.at < 10 * 60_000) return c.sessions;
  const rows = (await db.prepare(`SELECT data, votes FROM plenary_votes WHERE house_key = ? ORDER BY date DESC, id DESC`).all(key)) as any[];
  const sessions = rows.map((r) => ({ ...JSON.parse(r.data), votes: JSON.parse(r.votes) }));
  votesCache.set(key, { at: Date.now(), sessions });
  return sessions;
}

type Choice = (typeof CHOICES)[number];
interface ManualSession {
  id: string;
  matterCode: string;
  matterTitle: string;
  theme: Theme;
  date: string;
  sessionNumber: string;
  quorumType: (typeof QUORUMS)[number];
  mandateVote: Choice;
  result: 'Aprovado' | 'Rejeitado';
  votes: Record<string, Choice>;
  summary: string;
  strategicNote?: string;
}

async function tenantRows(tenantId: string) {
  const rows = (await db.prepare(`SELECT kind, id, data FROM plenary_tenant WHERE tenant_id = ?`).all(tenantId)) as any[];
  const members = new Map<string, any>();
  const sessions: ManualSession[] = [];
  const notes = new Map<string, any>();
  let config: any = {};
  for (const r of rows) {
    const d = JSON.parse(r.data);
    if (r.kind === 'member') members.set(r.id, d);
    else if (r.kind === 'session') sessions.push({ ...d, id: r.id });
    else if (r.kind === 'note') notes.set(r.id, d);
    else if (r.kind === 'config') config = d;
  }
  return { members, sessions, notes, config };
}

const clip = (t: string | undefined, n: number) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : (t ?? ''));

/** sim/não para fins de alinhamento (obstrução conta como "não"). */
const polar = (v?: string) => (v === 'sim' ? 'sim' : v === 'nao' || v === 'obstrucao' ? 'nao' : null);

async function buildState(tenantId: string) {
  const t = await tenantChamber(tenantId);
  const chamber = chamberConfig({ sphere: t.sphere, state: t.state, city: t.city, house: t.house, seats: t.seats });
  const { key, row } = await ensureHouse(t);
  const official: HouseMember[] = JSON.parse(row.members || '[]');
  const sessions = await houseSessions(key);
  const own = await tenantRows(tenantId);

  // Composição: oficial + ajustes do gabinete + cadastros manuais.
  type Member = HouseMember & {
    bloc?: (typeof BLOCS)[number];
    seatNumber?: number;
    electoralBase?: string;
    source: 'oficial' | 'gabinete';
    adjusted?: boolean;
  };
  const members: Member[] = [];
  const hidden: { id: string; popularName: string; party: string }[] = [];
  for (const m of official) {
    const o = own.members.get(m.id);
    if (o?.hidden) {
      hidden.push({ id: m.id, popularName: o.popularName ?? m.popularName, party: o.party ?? m.party });
      continue;
    }
    members.push({ ...m, ...(o ?? {}), id: m.id, source: 'oficial', adjusted: !!o });
  }
  for (const [id, o] of own.members) if (o.manual && !o.hidden) members.push({ ...o, id, source: 'gabinete' });
  const ids = new Set(members.map((m) => m.id));
  const mandateId: string | null = own.config.mandateMemberId && ids.has(own.config.mandateMemberId) ? own.config.mandateMemberId : null;

  // Votações (oficiais + registradas à mão), mais recentes primeiro.
  const all = [
    ...sessions.map((s) => ({ ...s, source: 'oficial' as const, mandateVote: undefined as Choice | undefined, strategicNote: own.notes.get(s.id)?.strategicNote as string | undefined, theme: (own.notes.get(s.id)?.theme ?? s.theme) as Theme })),
    ...own.sessions.map((s) => ({ ...s, votes: s.votes as Record<string, string>, description: s.summary, source: 'gabinete' as const, gov: undefined as string | undefined, url: undefined as string | undefined })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  // Alinhamento: concordância (sim/não) com o parlamentar do mandato; sem ele, com a maioria do plenário.
  const agree = new Map<string, { a: number; n: number; th: Record<string, { a: number; n: number }>; g: number; gn: number }>();
  for (const m of members) agree.set(m.id, { a: 0, n: 0, th: {}, g: 0, gn: 0 });
  for (const s of all) {
    let ref: 'sim' | 'nao' | null;
    if (mandateId) ref = polar(s.votes[mandateId]) ?? (s.source === 'gabinete' ? polar(s.mandateVote) : null);
    else {
      let y = 0;
      let n = 0;
      for (const v of Object.values(s.votes)) {
        const p = polar(v);
        if (p === 'sim') y++;
        else if (p === 'nao') n++;
      }
      ref = y === n ? null : y > n ? 'sim' : 'nao';
    }
    const gov = polar(s.gov);
    for (const m of members) {
      const v = polar(s.votes[m.id]);
      if (!v) continue;
      const st = agree.get(m.id)!;
      if (ref) {
        st.n++;
        if (v === ref) st.a++;
        const th = (st.th[s.theme] ??= { a: 0, n: 0 });
        th.n++;
        if (v === ref) th.a++;
      }
      if (gov) {
        st.gn++;
        if (v === gov) st.g++;
      }
    }
  }

  // Cadeiras: as definidas pelo gabinete são respeitadas; as demais são distribuídas por partido.
  const taken = new Set(members.map((m) => m.seatNumber).filter((n): n is number => !!n));
  const partySize = new Map<string, number>();
  members.forEach((m) => partySize.set(m.party, (partySize.get(m.party) ?? 0) + 1));
  let next = 1;
  [...members]
    .filter((m) => !m.seatNumber)
    .sort((a, b) => (partySize.get(b.party)! - partySize.get(a.party)!) || a.party.localeCompare(b.party) || a.popularName.localeCompare(b.popularName))
    .forEach((m) => {
      while (taken.has(next)) next++;
      m.seatNumber = next;
      taken.add(next);
    });

  const out = members.map((m) => {
    const st = agree.get(m.id)!;
    const themeAlignments: Record<string, number> = {};
    for (const [th, v] of Object.entries(st.th)) if (v.n >= 3) themeAlignments[th] = Math.round((100 * v.a) / v.n);
    const govPct = st.gn >= 15 ? Math.round((100 * st.g) / st.gn) : null;
    const computedBloc = govPct === null ? null : govPct >= 70 ? 'Governo' : govPct <= 40 ? 'Oposição' : 'Independente';
    return {
      id: m.id,
      name: m.name,
      popularName: m.popularName,
      party: m.party,
      partyColor: '',
      bloc: m.bloc ?? computedBloc ?? 'Independente',
      blocSource: m.bloc ? 'gabinete' : computedBloc ? 'governo' : 'padrao',
      seatNumber: m.seatNumber!,
      uf: m.uf,
      role: m.role,
      electoralBase: m.electoralBase ?? '',
      photoUrl: m.photoUrl,
      phone: m.phone,
      email: m.email,
      status: m.status,
      source: m.source,
      adjusted: m.adjusted ?? false,
      alignmentScore: m.id === mandateId ? 100 : st.n ? Math.round((100 * st.a) / st.n) : 0,
      alignmentSample: m.id === mandateId ? st.n : st.n,
      govAlignment: govPct,
      themeAlignments: Object.keys(themeAlignments).length ? themeAlignments : undefined,
    };
  });

  const summaries = all.map((s) => {
    const tally = { sim: 0, nao: 0, abstencao: 0, obstrucao: 0, ausente: 0 };
    for (const m of members) {
      const v = s.votes[m.id];
      if (v === 'sim' || v === 'nao' || v === 'abstencao' || v === 'obstrucao') tally[v]++;
      else tally.ausente++;
    }
    const mv = mandateId ? s.votes[mandateId] : undefined;
    return {
      id: s.id,
      matterCode: s.matterCode,
      matterTitle: clip(s.matterTitle, 240),
      theme: s.theme,
      date: s.date,
      sessionNumber: s.sessionNumber,
      quorumType: s.quorumType,
      result: s.result,
      mandateVote: (mv === 'obstrucao' ? 'nao' : mv) ?? (s.source === 'gabinete' ? s.mandateVote : 'ausente'),
      summary: clip(s.source === 'gabinete' ? s.summary : s.description, 200),
      strategicNote: s.strategicNote,
      source: s.source,
      url: s.url,
      gov: s.gov,
      tally,
    };
  });

  const meta = JSON.parse(row.meta || '{}');
  return {
    house: {
      key,
      label: row.label || chamber.houseShort,
      legislature: row.legislature,
      sources: JSON.parse(row.sources || '[]'),
      status: row.status,
      progress: row.progress,
      error: row.error,
      warnings: meta.warnings ?? [],
      syncedAt: row.synced_at,
    },
    mandateMemberId: mandateId,
    alignmentBasis: mandateId ? 'mandato' : 'maioria',
    members: out,
    hiddenMembers: hidden,
    sessions: summaries,
  };
}

plenarioRouter.get('/', async (req, res) => {
  res.json(await buildState(tid(req)));
});

plenarioRouter.get('/votacoes/:id', async (req, res) => {
  const t = await tenantChamber(tid(req));
  const own = await tenantRows(tid(req));
  const manual = own.sessions.find((s) => s.id === req.params.id);
  if (manual) return res.json({ votes: manual.votes, matterTitle: manual.matterTitle, summary: manual.summary });
  const s = (await houseSessions(houseKeyFor(t))).find((x) => x.id === req.params.id);
  if (!s) throw new HttpError(404, 'Votação não encontrada.');
  res.json({ votes: s.votes, matterTitle: s.matterTitle, summary: s.description });
});

plenarioRouter.post('/sincronizar', async (req, res) => {
  const t = await tenantChamber(tid(req));
  const key = houseKeyFor(t);
  await db.prepare(`INSERT INTO plenary_houses (house_key) VALUES (?) ON CONFLICT (house_key) DO NOTHING`).run(key);
  if (!running.has(key)) {
    const row = (await db.prepare(`SELECT started_at, status FROM plenary_houses WHERE house_key = ?`).get(key)) as any;
    const recent = row?.started_at && Date.now() - Date.parse(`${row.started_at.replace(' ', 'T')}Z`) < 5 * 60_000 && row.status === 'ok';
    if (recent) throw new HttpError(429, 'Os dados acabaram de ser atualizados. Tente de novo em alguns minutos.');
    void startSync(key, t);
    await audit({ ...actor(req), action: 'plenario.sync', target: key });
  }
  res.status(202).json({ ok: true });
});

plenarioRouter.get('/foto/:key', async (req, res) => {
  const r = (await db.prepare(`SELECT mime, data FROM plenary_photos WHERE key = ?`).get(req.params.key)) as any;
  if (!r) throw new HttpError(404, 'Foto não encontrada.');
  res.setHeader('Content-Type', r.mime);
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.end(r.data);
});

// ---------------------------------------------------------------------------
// Ajustes do gabinete
// ---------------------------------------------------------------------------
async function putTenantRow(tenantId: string, kind: string, id: string, data: unknown, userId: string) {
  await db
    .prepare(
      `INSERT INTO plenary_tenant (tenant_id, kind, id, data, updated_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, kind, id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = datetime('now')`
    )
    .run(tenantId, kind, id, JSON.stringify(data), userId);
}

plenarioRouter.put('/config', async (req, res) => {
  const mandateMemberId = req.body?.mandateMemberId ? txt(req.body.mandateMemberId, 80) : null;
  await putTenantRow(tid(req), 'config', 'config', { mandateMemberId }, req.auth!.userId);
  await audit({ ...actor(req), action: 'plenario.mandate', target: mandateMemberId ?? '—' });
  res.json(await buildState(tid(req)));
});

/** Campos que o gabinete pode ajustar. */
function memberPatch(b: any, seats: number) {
  const o: Record<string, unknown> = {};
  const s = (k: string, max: number) => {
    if (b?.[k] !== undefined) o[k] = txt(b[k], max);
  };
  s('popularName', 120);
  s('name', 200);
  s('party', 40);
  s('electoralBase', 300);
  s('role', 200);
  s('phone', 40);
  s('email', 160);
  if (b?.uf !== undefined) {
    const uf = txt(b.uf, 2).toUpperCase();
    if (uf && !ufInfo(uf)) throw bad('UF inválida.');
    o.uf = uf || undefined;
  }
  if (b?.bloc !== undefined) {
    if (b.bloc !== null && !BLOCS.includes(b.bloc)) throw bad('Bloco inválido.');
    o.bloc = b.bloc ?? undefined;
  }
  if (b?.seatNumber !== undefined && b.seatNumber !== null) {
    const n = Number(b.seatNumber);
    if (!Number.isInteger(n) || n < 1 || n > Math.max(seats, 600)) throw bad('Cadeira inválida.');
    o.seatNumber = n;
  }
  if (b?.hidden !== undefined) o.hidden = !!b.hidden;
  if (o.popularName === '' || o.party === '') throw bad('Nome e partido não podem ficar vazios.');
  return o;
}

async function seatConflict(tenantId: string, id: string, seat: unknown) {
  if (seat === undefined || seat === null) return;
  const state = await buildState(tenantId);
  const other = state.members.find((m) => m.seatNumber === Number(seat) && m.id !== id);
  // Só conflita com cadeira fixada pelo gabinete; as automáticas são redistribuídas.
  if (other) {
    const own = await tenantRows(tenantId);
    if (own.members.get(other.id)?.seatNumber === Number(seat)) throw bad(`A cadeira ${seat} já está com ${other.popularName}.`);
  }
}

plenarioRouter.post('/membros', async (req, res) => {
  const t = await tenantChamber(tid(req));
  const p = memberPatch(req.body, t.seats);
  if (!p.popularName || !p.party) throw bad('Informe o nome parlamentar e o partido.');
  await seatConflict(tid(req), '', p.seatNumber);
  const id = `man-${crypto.randomUUID()}`;
  await putTenantRow(tid(req), 'member', id, { ...p, name: p.name || p.popularName, manual: true }, req.auth!.userId);
  await audit({ ...actor(req), action: 'plenario.member.created', target: String(p.popularName) });
  res.status(201).json({ id, state: await buildState(tid(req)) });
});

plenarioRouter.patch('/membros/:id', async (req, res) => {
  const t = await tenantChamber(tid(req));
  const id = txt(req.params.id, 80);
  const own = await tenantRows(tid(req));
  const cur = own.members.get(id);
  const official = (JSON.parse(((await db.prepare(`SELECT members FROM plenary_houses WHERE house_key = ?`).get(houseKeyFor(t))) as any)?.members || '[]') as HouseMember[]).find(
    (m) => m.id === id
  );
  if (!cur && !official) throw new HttpError(404, 'Parlamentar não encontrado.');
  const p = memberPatch(req.body, t.seats);
  await seatConflict(tid(req), id, p.seatNumber);
  // Para parlamentares oficiais, guarda só o que difere da fonte (a próxima importação continua valendo para o resto).
  const merged: Record<string, unknown> = { ...(cur ?? {}), ...p };
  if (official)
    for (const k of Object.keys(merged)) {
      const o = (official as any)[k];
      if (merged[k] === undefined || merged[k] === o || ((merged[k] === '' || merged[k] === false) && (o === undefined || o === ''))) delete merged[k];
    }
  if (official && !Object.keys(merged).length) await db.prepare(`DELETE FROM plenary_tenant WHERE tenant_id = ? AND kind = 'member' AND id = ?`).run(tid(req), id);
  else await putTenantRow(tid(req), 'member', id, merged, req.auth!.userId);
  await audit({ ...actor(req), action: 'plenario.member.updated', target: id, details: p });
  res.json(await buildState(tid(req)));
});

plenarioRouter.delete('/membros/:id', async (req, res) => {
  const r = await db.prepare(`DELETE FROM plenary_tenant WHERE tenant_id = ? AND kind = 'member' AND id = ?`).run(tid(req), txt(req.params.id, 80));
  if (!r.changes) throw new HttpError(404, 'Nada a remover para este parlamentar.');
  await audit({ ...actor(req), action: 'plenario.member.reset', target: req.params.id });
  res.json(await buildState(tid(req)));
});

plenarioRouter.post('/votacoes', async (req, res) => {
  const b = req.body ?? {};
  const s: Omit<ManualSession, 'id'> = {
    matterCode: txt(b.matterCode, 60),
    matterTitle: txt(b.matterTitle, 500),
    theme: THEMES.includes(b.theme) ? b.theme : classifyTheme(String(b.matterTitle ?? '')),
    date: txt(b.date, 10),
    sessionNumber: txt(b.sessionNumber, 120) || 'Sessão plenária',
    quorumType: QUORUMS.includes(b.quorumType) ? b.quorumType : 'Maioria Simples',
    mandateVote: CHOICES.includes(b.mandateVote) ? b.mandateVote : 'ausente',
    result: b.result === 'Rejeitado' ? 'Rejeitado' : 'Aprovado',
    votes: {},
    summary: txt(b.summary, 2000),
    strategicNote: txt(b.strategicNote, 2000) || undefined,
  };
  if (!s.matterCode || !s.matterTitle) throw bad('Informe o número e o título da matéria.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw bad('Data inválida.');
  if (b.votes && typeof b.votes === 'object') {
    for (const [k, v] of Object.entries(b.votes).slice(0, 700)) if (CHOICES.includes(v as Choice)) s.votes[txt(k, 80)] = v as Choice;
  }
  const id = `man-vot-${crypto.randomUUID()}`;
  await putTenantRow(tid(req), 'session', id, s, req.auth!.userId);
  await audit({ ...actor(req), action: 'plenario.session.created', target: s.matterCode });
  res.status(201).json({ id, state: await buildState(tid(req)) });
});

plenarioRouter.patch('/votacoes/:id', async (req, res) => {
  const id = txt(req.params.id, 120);
  const b = req.body ?? {};
  const own = await tenantRows(tid(req));
  const manual = own.sessions.find((s) => s.id === id);
  const patch: Record<string, unknown> = {};
  if (b.strategicNote !== undefined) patch.strategicNote = txt(b.strategicNote, 2000) || undefined;
  if (b.theme !== undefined) {
    if (!THEMES.includes(b.theme)) throw bad('Tema inválido.');
    patch.theme = b.theme;
  }
  await tx(async () => {
    if (manual) {
      const { id: _id, ...rest } = manual;
      await putTenantRow(tid(req), 'session', id, { ...rest, ...patch }, req.auth!.userId);
    } else await putTenantRow(tid(req), 'note', id, { ...(own.notes.get(id) ?? {}), ...patch }, req.auth!.userId);
  });
  await audit({ ...actor(req), action: 'plenario.session.updated', target: id });
  res.json(await buildState(tid(req)));
});

plenarioRouter.delete('/votacoes/:id', async (req, res) => {
  const r = await db.prepare(`DELETE FROM plenary_tenant WHERE tenant_id = ? AND kind = 'session' AND id = ?`).run(tid(req), txt(req.params.id, 120));
  if (!r.changes) throw new HttpError(404, 'Só votações registradas pelo gabinete podem ser excluídas.');
  await audit({ ...actor(req), action: 'plenario.session.deleted', target: req.params.id });
  res.json(await buildState(tid(req)));
});

export { normalizeSaplUrl };
