import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Rss,
  RefreshCw,
  Settings2,
  Newspaper,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ExternalLink,
  Search,
  FilterX,
  Archive,
  ArchiveRestore,
  Plus,
  Pencil,
  Trash2,
  Globe,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Table2,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Bot,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useDialog } from '../common/Dialogs';
import { Modal, Field, Chip, TagInput, inputCls, inputAutoCls, btnPrimary, btnGhost } from './banco/ui';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------
type Sentiment = 'bom' | 'neutro' | 'ruim';
interface Item {
  id: string;
  url: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceDomain: string;
  origin: 'google' | 'bing' | 'feed';
  publishedAt: string;
  topics: string[];
  themes: string[];
  sentiment: Sentiment;
  sentimentAuto: Sentiment;
  sentimentManual: Sentiment | null;
  sentimentReason: string;
  sentimentMethod: string;
  sentimentBy: string | null;
  archived: boolean;
}
interface Topic {
  id: string;
  name: string;
  terms: string[];
  excludeTerms: string[];
  active: boolean;
}
interface Source {
  id: string;
  name: string;
  siteUrl: string;
  feedUrl: string;
  captureAll: boolean;
  active: boolean;
  lastFetchedAt: string | null;
  lastStatus: string;
  lastError: string;
}
interface Run {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'done' | 'error';
  new_items: number;
  requests: number;
  errors: string[];
}
interface Config {
  settings: { googleNews: boolean; bingNews: boolean; intervalMin: number; autoCollect: boolean };
  topics: Topic[];
  sources: Source[];
  runs: Run[];
  running: boolean;
  aiAvailable: boolean;
  themes: string[];
  canManage: boolean;
}
interface Dashboard {
  totals: { total: number; bom: number; neutro: number; ruim: number; manual: number; sources: number };
  daily: { day: string; sentiment: Sentiment; count: number }[];
  byTopic: { name: string; total: number; bom: number; neutro: number; ruim: number }[];
  bySource: { name: string; total: number; ruim: number }[];
  byTheme: { name: string; total: number }[];
}
interface Facets {
  topics: { value: string; count: number }[];
  themes: { value: string; count: number }[];
  sources: { value: string; count: number }[];
}

// Diverging pair validated with the dataviz palette checker (CVD ΔE 17, contrast ≥ 3:1 on white);
// neutral midpoint is gray by design and always paired with an icon + label.
const SENT: Record<Sentiment, { label: string; color: string; icon: React.ElementType }> = {
  bom: { label: 'Bom', color: '#0b8bb0', icon: ThumbsUp },
  neutro: { label: 'Neutro', color: '#a8a6a0', icon: Minus },
  ruim: { label: 'Ruim', color: '#d64545', icon: ThumbsDown },
};
const ORDER: Sentiment[] = ['bom', 'neutro', 'ruim'];
const ORIGIN: Record<Item['origin'], string> = { google: 'Google Notícias', bing: 'Bing Notícias', feed: 'Site monitorado' };
const PAGE = 30;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const parseDb = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
function relTime(s: string) {
  const diff = (Date.now() - parseDb(s).getTime()) / 60000;
  if (diff < 1) return 'agora';
  if (diff < 60) return `há ${Math.round(diff)} min`;
  if (diff < 1440) return `há ${Math.round(diff / 60)} h`;
  if (diff < 2880) return 'ontem';
  return parseDb(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);

type Period = '1' | '7' | '30' | '90' | 'custom';

// ---------------------------------------------------------------------------
export function ClippingModule() {
  const dialog = useDialog();
  const [view, setView] = useState<'noticias' | 'config'>('noticias');
  const [config, setConfig] = useState<Config | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // filters
  const [period, setPeriod] = useState<Period>('30');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(iso(new Date()));
  const [topic, setTopic] = useState('');
  const [theme, setTheme] = useState('');
  const [sentiment, setSentiment] = useState<'' | Sentiment>('');
  const [source, setSource] = useState('');
  const [rating, setRating] = useState<'' | 'manual' | 'auto'>('');
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (period !== 'custom') {
      setFrom(daysAgo(Number(period) - 1));
      setTo(iso(new Date()));
    }
  }, [period]);

  const params = useCallback(
    (withSentiment = true) => {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (topic) p.set('topic', topic);
      if (theme) p.set('theme', theme);
      if (source) p.set('source', source);
      if (rating) p.set('rating', rating);
      if (dq) p.set('q', dq);
      if (archived) p.set('archived', '1');
      if (withSentiment && sentiment) p.set('sentiment', sentiment);
      return p;
    },
    [from, to, topic, theme, source, rating, dq, archived, sentiment]
  );

  const loadConfig = useCallback(() => api<Config>('/tenant/clipping/config').then(setConfig).catch(() => undefined), []);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const p = params();
      p.set('limit', String(PAGE));
      p.set('offset', String(page * PAGE));
      const [d, list, f] = await Promise.all([
        api<Dashboard>(`/tenant/clipping/dashboard?${params(false)}`),
        api<{ total: number; items: Item[] }>(`/tenant/clipping/items?${p}`),
        api<Facets>('/tenant/clipping/facets'),
      ]);
      setDash(d);
      setItems(list.items);
      setTotal(list.total);
      setFacets(f);
    } catch (e) {
      dialog.alert({ title: 'Erro ao carregar o clipping', message: (e as Error).message, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [params, page, dialog]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [from, to, topic, theme, source, rating, dq, archived, sentiment]);
  useEffect(() => {
    loadData();
  }, [loadData]);

  // While a collection runs, poll its status; refresh data when it ends.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!config?.running) {
      if (wasRunning.current) {
        wasRunning.current = false;
        const r = config?.runs[0];
        if (r) dialog.toast(r.status === 'done' ? `Coleta concluída: ${r.new_items} nova${r.new_items === 1 ? '' : 's'} notícia${r.new_items === 1 ? '' : 's'}.` : 'A coleta terminou com erro.', r.status === 'done' ? 'success' : 'warning');
        loadData();
      }
      return;
    }
    wasRunning.current = true;
    const t = setInterval(loadConfig, 4000);
    return () => clearInterval(t);
  }, [config?.running, config?.runs, loadConfig, loadData, dialog]);

  const collect = async () => {
    try {
      await api('/tenant/clipping/collect', { method: 'POST' });
      loadConfig();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível coletar', message: (e as Error).message, tone: 'warning' });
    }
  };

  const rate = async (ids: string[], s: Sentiment | null) => {
    try {
      if (ids.length === 1) {
        const updated = await api<Item>(`/tenant/clipping/items/${ids[0]}`, { method: 'PATCH', body: { sentiment: s } });
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        api<Dashboard>(`/tenant/clipping/dashboard?${params(false)}`).then(setDash).catch(() => undefined);
      } else {
        await api('/tenant/clipping/items/bulk', { method: 'POST', body: { ids, sentiment: s } });
        dialog.toast(`${ids.length} notícias marcadas como ${s ? SENT[s].label : 'automático'}.`);
        setSelected(new Set());
        loadData();
      }
    } catch (e) {
      dialog.alert({ title: 'Não foi possível classificar', message: (e as Error).message, tone: 'warning' });
    }
  };
  const archive = async (ids: string[], value: boolean) => {
    try {
      await api('/tenant/clipping/items/bulk', { method: 'POST', body: { ids, archived: value } });
      dialog.toast(value ? `${ids.length} notícia(s) arquivada(s).` : `${ids.length} notícia(s) restaurada(s).`);
      setSelected(new Set());
      loadData();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível arquivar', message: (e as Error).message, tone: 'warning' });
    }
  };

  const hasFilters = !!(topic || theme || sentiment || source || rating || dq || archived || period !== '30');
  const clearFilters = () => {
    setPeriod('30');
    setTopic('');
    setTheme('');
    setSentiment('');
    setSource('');
    setRating('');
    setQ('');
    setArchived(false);
  };
  const lastRun = config?.runs[0];
  const canManage = !!config?.canManage;
  const noSetup = config && !config.topics.length && !config.sources.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Rss className="w-5 h-5 text-[#176B80]" />
            Clipping
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>Monitoramento de notícias sobre os temas do mandato</span>
            {config && (
              <span className="text-slate-400">
                ·{' '}
                {config.running ? (
                  <span className="text-[#176B80] font-semibold inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> coletando agora…
                  </span>
                ) : lastRun ? (
                  <>
                    última coleta {relTime(lastRun.started_at)}
                    {config.settings.autoCollect ? ` · automática a cada ${config.settings.intervalMin} min` : ' · coleta automática desligada'}
                  </>
                ) : (
                  'nenhuma coleta ainda'
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex p-1 bg-slate-100 rounded-lg" role="tablist">
            {(
              [
                ['noticias', 'Notícias & Painel', Newspaper],
                ['config', 'Temas & Fontes', Settings2],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  view === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {canManage && (
            <button className={btnPrimary} onClick={collect} disabled={config?.running || !!noSetup}>
              <RefreshCw className={`w-3.5 h-3.5 text-[#36B7A5] ${config?.running ? 'animate-spin' : ''}`} />
              {config?.running ? 'Coletando…' : 'Coletar agora'}
            </button>
          )}
        </div>
      </div>

      {config && !config.aiAvailable && view === 'noticias' && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>IA não configurada:</strong> o sentimento automático está usando palavras-chave, que é menos preciso. Revise as classificações ou configure{' '}
            <code className="font-mono">GEMINI_API_KEY</code> no servidor.
          </span>
        </div>
      )}

      {view === 'config' && config ? (
        <ConfigView config={config} onChanged={loadConfig} />
      ) : noSetup ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#E9F1F4] text-[#176B80] flex items-center justify-center mb-3">
            <Rss className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-900">Defina os temas que o clipping deve monitorar</p>
          <p className="text-xs text-slate-500 mt-1 mb-4 max-w-md mx-auto">
            Cadastre temas (ex.: nome da parlamentar, municípios, pautas) e, se quiser, sites específicos. O sistema busca notícias nas buscas e nos sites,
            etiqueta os assuntos e classifica cada notícia como boa, neutra ou ruim.
          </p>
          {canManage && (
            <button className={btnPrimary} onClick={() => setView('config')}>
              <Plus className="w-3.5 h-3.5" /> Cadastrar temas
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Filters: one row above the charts, shared by dashboard and list */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex p-0.5 bg-slate-100 rounded-lg" role="group" aria-label="Período">
                {(
                  [
                    ['1', 'Hoje'],
                    ['7', '7 dias'],
                    ['30', '30 dias'],
                    ['90', '90 dias'],
                    ['custom', 'Período'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setPeriod(v)}
                    aria-pressed={period === v}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${period === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input type="date" className={inputAutoCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
                  <span className="text-[11px] text-slate-400">até</span>
                  <input type="date" className={inputAutoCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
                </div>
              )}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className={`${inputCls} pl-8`} placeholder="Buscar no título, resumo ou fonte…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className={inputAutoCls} value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Tema monitorado">
                <option value="">Todos os temas</option>
                {facets?.topics.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.value} ({t.count})
                  </option>
                ))}
              </select>
              <select className={inputAutoCls} value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Assunto">
                <option value="">Todos os assuntos</option>
                {facets?.themes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.value} ({t.count})
                  </option>
                ))}
              </select>
              <select className={inputAutoCls} value={sentiment} onChange={(e) => setSentiment(e.target.value as '' | Sentiment)} aria-label="Sentimento">
                <option value="">Qualquer sentimento</option>
                {ORDER.map((s) => (
                  <option key={s} value={s}>
                    {SENT[s].label}
                  </option>
                ))}
              </select>
              <select className={`${inputAutoCls} max-w-[220px]`} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Fonte">
                <option value="">Todas as fontes</option>
                {facets?.sources.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value} ({s.count})
                  </option>
                ))}
              </select>
              <select className={inputAutoCls} value={rating} onChange={(e) => setRating(e.target.value as '' | 'manual' | 'auto')} aria-label="Avaliação">
                <option value="">Avaliação: todas</option>
                <option value="auto">Somente automáticas (a revisar)</option>
                <option value="manual">Revisadas pela equipe</option>
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 px-1 cursor-pointer">
                <input type="checkbox" className="rounded text-[#176B80]" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                Ver arquivadas
              </label>
              {hasFilters && (
                <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-[11px] text-[#176B80] hover:underline font-semibold">
                  <FilterX className="w-3.5 h-3.5" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          {dash && (
            <DashboardView
              dash={dash}
              from={from}
              to={to}
              activeTopic={topic}
              activeTheme={theme}
              activeSentiment={sentiment}
              onTopic={(t) => setTopic(t === topic ? '' : t)}
              onTheme={(t) => setTheme(t === theme ? '' : t)}
              onSource={(s) => setSource(s === source ? '' : s)}
              onSentiment={(s) => setSentiment(s === sentiment ? '' : s)}
            />
          )}

          <ItemList
            items={items}
            total={total}
            page={page}
            loading={loading}
            selected={selected}
            canManage={canManage}
            archivedView={archived}
            onPage={setPage}
            onToggle={(id) =>
              setSelected((prev) => {
                const n = new Set(prev);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            onTogglePage={() =>
              setSelected((prev) => (items.every((i) => prev.has(i.id)) ? new Set() : new Set(items.map((i) => i.id))))
            }
            onRate={rate}
            onArchive={archive}
            onTopic={(t) => setTopic(t)}
            onTheme={(t) => setTheme(t)}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini dashboard
// ---------------------------------------------------------------------------
function DashboardView({
  dash,
  from,
  to,
  activeTopic,
  activeTheme,
  activeSentiment,
  onTopic,
  onTheme,
  onSource,
  onSentiment,
}: {
  dash: Dashboard;
  from: string;
  to: string;
  activeTopic: string;
  activeTheme: string;
  activeSentiment: string;
  onTopic: (t: string) => void;
  onTheme: (t: string) => void;
  onSource: (s: string) => void;
  onSentiment: (s: Sentiment) => void;
}) {
  const { totals } = dash;
  const [table, setTable] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Notícias" value={totals.total} sub={`${totals.sources} fonte${totals.sources === 1 ? '' : 's'}`} />
        {ORDER.map((s) => {
          const Icon = SENT[s].icon;
          return (
            <button
              key={s}
              onClick={() => onSentiment(s)}
              aria-pressed={activeSentiment === s}
              className={`text-left bg-white border rounded-xl p-3.5 shadow-xs transition-colors ${
                activeSentiment === s ? 'border-[#176B80] ring-1 ring-[#176B80]/30' : 'border-slate-200 hover:border-slate-300'
              }`}
              title={`Filtrar notícias: ${SENT[s].label}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{SENT[s].label}</span>
                <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${SENT[s].color}1a` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: SENT[s].color }} />
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">{totals[s]}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{pct(totals[s], totals.total)}% do período</div>
            </button>
          );
        })}
        <Tile
          label="Revisadas"
          value={`${pct(totals.manual, totals.total)}%`}
          sub={`${totals.manual} de ${totals.total} pela equipe`}
          icon={UserCheck}
        />
        <Tile
          label="Saldo"
          value={`${totals.bom - totals.ruim > 0 ? '+' : ''}${totals.bom - totals.ruim}`}
          sub="boas menos ruins"
          icon={BarChart3}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Notícias por dia</h3>
              <p className="text-[11px] text-slate-500">Volume diário por sentimento</p>
            </div>
            <div className="flex items-center gap-3">
              <Legend />
              <button className={`${btnGhost} px-2 py-1`} onClick={() => setTable((t) => !t)} aria-pressed={table} title={table ? 'Ver gráfico' : 'Ver tabela'}>
                {table ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <DailyChart daily={dash.daily} from={from} to={to} table={table} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900">Sentimento por tema</h3>
          <p className="text-[11px] text-slate-500 mb-3">Clique para filtrar</p>
          {dash.byTopic.length === 0 ? (
            <p className="text-xs text-slate-400">Sem dados no período.</p>
          ) : (
            <div className="space-y-2.5">
              {dash.byTopic.map((t) => (
                <button
                  key={t.name}
                  onClick={() => onTopic(t.name)}
                  className={`w-full text-left rounded-lg p-1.5 -mx-1.5 transition-colors ${activeTopic === t.name ? 'bg-[#E9F1F4]' : 'hover:bg-slate-50'}`}
                  title={`${t.name}: ${t.bom} bom · ${t.neutro} neutro · ${t.ruim} ruim`}
                >
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-semibold text-slate-800 truncate pr-2">{t.name}</span>
                    <span className="font-mono tabular-nums text-slate-500">{t.total}</span>
                  </div>
                  <StackBar parts={ORDER.map((s) => ({ key: s, value: t[s] }))} total={t.total} height={8} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Principais fontes</h3>
          {dash.bySource.length === 0 ? (
            <p className="text-xs text-slate-400">Sem dados no período.</p>
          ) : (
            <div className="space-y-2">
              {dash.bySource.map((s) => {
                const max = dash.bySource[0]!.total;
                return (
                  <button key={s.name} onClick={() => onSource(s.name)} className="w-full text-left group" title={`${s.total} notícias · ${s.ruim} ruins`}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-slate-700 truncate pr-2 group-hover:text-[#176B80]">{s.name}</span>
                      <span className="font-mono tabular-nums text-slate-500 shrink-0">
                        {s.total}
                        {s.ruim > 0 && <span className="text-slate-400"> · {s.ruim} ruim</span>}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#176B80]" style={{ width: `${(s.total / max) * 100}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Assuntos detectados</h3>
          {dash.byTheme.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum assunto identificado no período.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {dash.byTheme.map((t) => (
                <button
                  key={t.name}
                  onClick={() => onTheme(t.name)}
                  aria-pressed={activeTheme === t.name}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    activeTheme === t.name ? 'bg-[#102C45] text-white border-[#102C45]' : 'bg-white text-slate-700 border-slate-200 hover:border-[#176B80]'
                  }`}
                >
                  {t.name}
                  <span className={`font-mono ${activeTheme === t.name ? 'text-white/70' : 'text-slate-400'}`}>{t.total}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, icon: Icon = Newspaper }: { label: string; value: React.ReactNode; sub: string; icon?: React.ElementType }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-[#176B80]" />
      </div>
      <div className="text-xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3" aria-label="Legenda">
      {ORDER.map((s) => {
        const Icon = SENT[s].icon;
        return (
          <span key={s} className="flex items-center gap-1 text-[11px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SENT[s].color }} />
            <Icon className="w-3 h-3 text-slate-400" />
            {SENT[s].label}
          </span>
        );
      })}
    </div>
  );
}

/** Horizontal 100% stack with 2px surface gaps between segments. */
function StackBar({ parts, total, height = 8 }: { parts: { key: Sentiment; value: number }[]; total: number; height?: number }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="flex w-full gap-[2px]" style={{ height }}>
      {total === 0 ? (
        <div className="flex-1 rounded-full bg-slate-100" />
      ) : (
        shown.map((p, i) => (
          <div
            key={p.key}
            style={{ flexGrow: p.value, background: SENT[p.key].color }}
            className={`${i === 0 ? 'rounded-l-full' : ''} ${i === shown.length - 1 ? 'rounded-r-full' : ''}`}
          />
        ))
      )}
    </div>
  );
}

function DailyChart({ daily, from, to, table }: { daily: Dashboard['daily']; from: string; to: string; table: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const out: { day: string; bom: number; neutro: number; ruim: number; total: number }[] = [];
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    const map = new Map<string, Record<Sentiment, number>>();
    daily.forEach((d) => {
      const m = map.get(d.day) ?? { bom: 0, neutro: 0, ruim: 0 };
      m[d.sentiment] += d.count;
      map.set(d.day, m);
    });
    for (let d = start; d <= end && out.length < 120; d.setDate(d.getDate() + 1)) {
      const k = iso(d);
      const m = map.get(k) ?? { bom: 0, neutro: 0, ruim: 0 };
      out.push({ day: k, ...m, total: m.bom + m.neutro + m.ruim });
    }
    return out;
  }, [daily, from, to]);

  const max = Math.max(1, ...days.map((d) => d.total));
  const niceMax = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const ticks = [0, niceMax / 2, niceMax];
  const fmtDay = (k: string) => k.slice(8, 10) + '/' + k.slice(5, 7);

  if (table) {
    return (
      <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-lg">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold">Dia</th>
              {ORDER.map((s) => (
                <th key={s} className="text-right px-3 py-1.5 font-semibold">
                  {SENT[s].label}
                </th>
              ))}
              <th className="text-right px-3 py-1.5 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-slate-700">
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <td className="px-3 py-1 font-sans">{fmtDay(d.day)}</td>
                <td className="text-right px-3 py-1">{d.bom}</td>
                <td className="text-right px-3 py-1">{d.neutro}</td>
                <td className="text-right px-3 py-1">{d.ruim}</td>
                <td className="text-right px-3 py-1 font-semibold">{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const labelEvery = Math.max(1, Math.ceil(days.length / 10));
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-slate-400 font-mono tabular-nums h-40 py-0 text-right w-6 shrink-0">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="leading-none -translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-40" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <div key={t} className="absolute left-0 right-0 border-t border-slate-100" style={{ bottom: `${(t / niceMax) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {days.map((d, i) => (
                <div
                  key={d.day}
                  className="relative flex-1 h-full flex flex-col justify-end cursor-default"
                  onMouseEnter={() => setHover(i)}
                  aria-label={`${fmtDay(d.day)}: ${d.bom} bom, ${d.neutro} neutro, ${d.ruim} ruim`}
                >
                  {hover === i && <div className="absolute inset-0 bg-slate-100/70 rounded-sm" />}
                  <div className="relative flex flex-col-reverse gap-[2px] w-full max-w-[22px] mx-auto">
                    {ORDER.map((s, si) => {
                      const v = d[s];
                      if (!v) return null;
                      const top = ORDER.slice(si + 1).every((x) => !d[x]);
                      return (
                        <div
                          key={s}
                          style={{ height: `${(v / niceMax) * 160 - 2}px`, background: SENT[s].color, minHeight: 2 }}
                          className={top ? 'rounded-t-[4px]' : ''}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {h && (
              <div
                className="absolute z-10 -top-2 pointer-events-none bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-[11px] min-w-[130px]"
                style={{ left: `clamp(0px, calc(${((hover! + 0.5) / days.length) * 100}% - 65px), calc(100% - 130px))` }}
              >
                <p className="font-semibold text-slate-900 mb-1">
                  {new Date(`${h.day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                </p>
                {ORDER.map((s) => (
                  <p key={s} className="flex items-center justify-between gap-3 text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm" style={{ background: SENT[s].color }} />
                      {SENT[s].label}
                    </span>
                    <span className="font-mono tabular-nums text-slate-900">{h[s]}</span>
                  </p>
                ))}
                <p className="flex justify-between border-t border-slate-100 mt-1 pt-1 font-semibold text-slate-900">
                  <span>Total</span>
                  <span className="font-mono">{h.total}</span>
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-[2px] mt-1.5">
            {days.map((d, i) => (
              <div key={d.day} className="flex-1 text-center text-[9px] text-slate-400 font-mono overflow-visible whitespace-nowrap">
                {i % labelEvery === 0 ? fmtDay(d.day) : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item list
// ---------------------------------------------------------------------------
function ItemList({
  items,
  total,
  page,
  loading,
  selected,
  canManage,
  archivedView,
  onPage,
  onToggle,
  onTogglePage,
  onRate,
  onArchive,
  onTopic,
  onTheme,
}: {
  items: Item[];
  total: number;
  page: number;
  loading: boolean;
  selected: Set<string>;
  canManage: boolean;
  archivedView: boolean;
  onPage: (p: number) => void;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onRate: (ids: string[], s: Sentiment | null) => void;
  onArchive: (ids: string[], v: boolean) => void;
  onTopic: (t: string) => void;
  onTheme: (t: string) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const ids = [...selected];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" className="rounded text-[#176B80]" checked={allSelected} onChange={onTogglePage} disabled={!items.length} aria-label="Selecionar notícias da página" />
          <span className="font-semibold">
            {selected.size ? `${selected.size} selecionada${selected.size === 1 ? '' : 's'}` : `${total} notícia${total === 1 ? '' : 's'}`}
          </span>
        </label>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 mr-1">Marcar como:</span>
            {ORDER.map((s) => {
              const Icon = SENT[s].icon;
              return (
                <button key={s} className={`${btnGhost} px-2 py-1`} onClick={() => onRate(ids, s)}>
                  <Icon className="w-3.5 h-3.5" style={{ color: SENT[s].color }} /> {SENT[s].label}
                </button>
              );
            })}
            <button className={`${btnGhost} px-2 py-1`} onClick={() => onRate(ids, null)} title="Volta à classificação automática">
              <Bot className="w-3.5 h-3.5" /> Automático
            </button>
            {canManage && (
              <button className={`${btnGhost} px-2 py-1`} onClick={() => onArchive(ids, !archivedView)}>
                {archivedView ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {archivedView ? 'Restaurar' : 'Arquivar'}
              </button>
            )}
          </div>
        )}
      </div>

      {!loading && items.length === 0 && <p className="px-4 py-10 text-center text-xs text-slate-500">Nenhuma notícia com esses filtros.</p>}

      <ul className="divide-y divide-slate-100">
        {items.map((it) => (
          <li key={it.id} className={`px-4 py-3.5 flex gap-3 ${selected.has(it.id) ? 'bg-[#E9F1F4]/50' : ''}`}>
            <input type="checkbox" className="mt-1 rounded text-[#176B80] shrink-0" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} aria-label={`Selecionar ${it.title}`} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <span className="font-semibold text-[#176B80]">{it.sourceName || it.sourceDomain}</span>
                <span>·</span>
                <span title={parseDb(it.publishedAt).toLocaleString('pt-BR')}>{relTime(it.publishedAt)}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  {it.origin === 'feed' ? <Globe className="w-3 h-3" /> : <Search className="w-3 h-3" />}
                  {ORIGIN[it.origin]}
                </span>
              </div>
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-0.5 text-sm font-bold text-slate-900 hover:text-[#176B80] inline-flex items-start gap-1.5 group"
              >
                <span>{it.title}</span>
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-300 group-hover:text-[#176B80]" />
              </a>
              {it.summary && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{it.summary}</p>}
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {it.topics.map((t) => (
                  <button key={t} onClick={() => onTopic(t)} title="Filtrar por este tema">
                    <Chip tone="navy">{t}</Chip>
                  </button>
                ))}
                {it.themes.map((t) => (
                  <button key={t} onClick={() => onTheme(t)} title="Filtrar por este assunto">
                    <Chip>{t}</Chip>
                  </button>
                ))}
              </div>
            </div>
            <SentimentControl item={it} onRate={(s) => onRate([it.id], s)} />
          </li>
        ))}
      </ul>

      {total > PAGE && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total}
          </span>
          <div className="flex gap-1">
            <button className={btnGhost} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Página anterior">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button className={btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => onPage(page + 1)} aria-label="Próxima página">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SentimentControl({ item, onRate }: { item: Item; onRate: (s: Sentiment | null) => void }) {
  const manual = item.sentimentManual !== null;
  return (
    <div className="shrink-0 w-[168px] space-y-1">
      <div className="flex rounded-lg border border-slate-200 overflow-hidden" role="group" aria-label="Classificar notícia">
        {ORDER.map((s) => {
          const Icon = SENT[s].icon;
          const on = item.sentiment === s;
          return (
            <button
              key={s}
              onClick={() => onRate(manual && on ? null : s)}
              aria-pressed={on}
              title={manual && on ? 'Clique para voltar ao automático' : `Marcar como ${SENT[s].label}`}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors ${
                on ? 'text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
              style={on ? { background: SENT[s].color } : undefined}
            >
              <Icon className="w-3.5 h-3.5" />
              {SENT[s].label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500 leading-tight" title={item.sentimentReason}>
        {manual ? (
          <span className="flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-[#176B80]" /> Por {item.sentimentBy ?? 'equipe'}
            {item.sentimentManual !== item.sentimentAuto && <span className="text-slate-400">(auto: {SENT[item.sentimentAuto].label.toLowerCase()})</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            {item.sentimentMethod === 'ia' ? <Sparkles className="w-3 h-3 text-[#176B80]" /> : <Bot className="w-3 h-3" />}
            Automático ({item.sentimentMethod === 'ia' ? 'IA' : 'palavras-chave'})
          </span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configuration: topics, sources, schedule
// ---------------------------------------------------------------------------
function ConfigView({ config, onChanged }: { config: Config; onChanged: () => void }) {
  const dialog = useDialog();
  const [editingTopic, setEditingTopic] = useState<Topic | 'new' | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [settings, setSettings] = useState(config.settings);
  const can = config.canManage;
  useEffect(() => setSettings(config.settings), [config.settings]);

  const saveSettings = async (next: typeof settings) => {
    setSettings(next);
    try {
      await api('/tenant/clipping/settings', { method: 'PUT', body: next });
      dialog.toast('Configuração salva.');
      onChanged();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível salvar', message: (e as Error).message, tone: 'warning' });
    }
  };
  const toggleTopic = async (t: Topic) => {
    await api(`/tenant/clipping/topics/${t.id}`, { method: 'PATCH', body: { active: !t.active } }).catch((e) =>
      dialog.alert({ title: 'Erro', message: (e as Error).message, tone: 'warning' })
    );
    onChanged();
  };
  const removeTopic = async (t: Topic) => {
    const ok = await dialog.confirm({
      title: 'Excluir tema',
      message: (
        <>
          Excluir o tema <strong>{t.name}</strong>? As notícias já coletadas continuam no clipping.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    await api(`/tenant/clipping/topics/${t.id}`, { method: 'DELETE' });
    dialog.toast('Tema excluído.');
    onChanged();
  };
  const toggleSource = async (s: Source, patch: Partial<Pick<Source, 'active' | 'captureAll'>>) => {
    await api(`/tenant/clipping/sources/${s.id}`, { method: 'PATCH', body: patch }).catch((e) =>
      dialog.alert({ title: 'Erro', message: (e as Error).message, tone: 'warning' })
    );
    onChanged();
  };
  const removeSource = async (s: Source) => {
    const ok = await dialog.confirm({
      title: 'Remover site',
      message: (
        <>
          Parar de monitorar <strong>{s.name}</strong>? As notícias já coletadas continuam no clipping.
        </>
      ),
      confirmLabel: 'Remover',
      tone: 'danger',
    });
    if (!ok) return;
    await api(`/tenant/clipping/sources/${s.id}`, { method: 'DELETE' });
    dialog.toast('Site removido.');
    onChanged();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Topics */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Temas monitorados</h3>
              <p className="text-[11px] text-slate-500">Cada tema vira uma busca de notícias e um filtro para os sites monitorados.</p>
            </div>
            {can && (
              <button className={btnPrimary} onClick={() => setEditingTopic('new')}>
                <Plus className="w-3.5 h-3.5" /> Novo tema
              </button>
            )}
          </div>
          {config.topics.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhum tema cadastrado. Ex.: o nome da parlamentar, “Hospital Regional de Rondonópolis”, “MT-249”.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {config.topics.map((t) => (
                <li key={t.id} className={`px-4 py-3 flex items-start gap-3 ${t.active ? '' : 'opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">
                      {t.name} {!t.active && <span className="text-[10px] font-semibold text-slate-400">(pausado)</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.terms.map((x) => (
                        <Chip key={x}>{x}</Chip>
                      ))}
                      {t.excludeTerms.map((x) => (
                        <Chip key={x} tone="slate">
                          sem “{x}”
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {can && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button className={`${btnGhost} px-2 py-1 text-[11px]`} onClick={() => toggleTopic(t)}>
                        {t.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className={`${btnGhost} px-2 py-1`} onClick={() => setEditingTopic(t)} aria-label="Editar tema">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button className={`${btnGhost} px-2 py-1`} onClick={() => removeTopic(t)} aria-label="Excluir tema">
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sources */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sites monitorados</h3>
              <p className="text-[11px] text-slate-500">Portais lidos diretamente pelo feed RSS/Atom (descoberto automaticamente a partir do endereço).</p>
            </div>
            {can && (
              <button className={btnPrimary} onClick={() => setAddingSource(true)}>
                <Plus className="w-3.5 h-3.5" /> Adicionar site
              </button>
            )}
          </div>
          {config.sources.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhum site cadastrado. Ex.: g1.globo.com/rss/g1/mato-grosso/, portais locais, site da ALMT.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {config.sources.map((s) => (
                <li key={s.id} className={`px-4 py-3 flex items-start gap-3 ${s.active ? '' : 'opacity-60'}`}>
                  <Globe className="w-4 h-4 text-[#176B80] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{s.name}</p>
                    <p className="text-[10px] text-slate-500 truncate font-mono">{s.feedUrl}</p>
                    <p className={`text-[10px] mt-0.5 ${s.lastError ? 'text-rose-600' : 'text-slate-500'}`}>
                      {s.lastError ? `Erro: ${s.lastError}` : s.lastStatus}
                      {s.lastFetchedAt && ` · ${relTime(s.lastFetchedAt)}`}
                    </p>
                    {can && (
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 mt-1 cursor-pointer">
                        <input type="checkbox" className="rounded text-[#176B80]" checked={s.captureAll} onChange={() => toggleSource(s, { captureAll: !s.captureAll })} />
                        Capturar todas as notícias deste site (não só as que citam os temas)
                      </label>
                    )}
                  </div>
                  {can && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button className={`${btnGhost} px-2 py-1 text-[11px]`} onClick={() => toggleSource(s, { active: !s.active })}>
                        {s.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className={`${btnGhost} px-2 py-1`} onClick={() => removeSource(s)} aria-label="Remover site">
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-4">
        {/* Settings */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Buscas e agendamento</h3>
          {(
            [
              ['googleNews', 'Google Notícias', 'Busca por tema em todo o noticiário indexado pelo Google.'],
              ['bingNews', 'Bing Notícias', 'Segunda fonte de busca; traz resumos das matérias.'],
            ] as const
          ).map(([k, l, d]) => (
            <label key={k} className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" disabled={!can} className="mt-0.5 rounded text-[#176B80]" checked={settings[k]} onChange={(e) => saveSettings({ ...settings, [k]: e.target.checked })} />
              <span className="text-xs">
                <strong className="text-slate-800">{l}</strong>
                <span className="block text-[10px] text-slate-500">{d}</span>
              </span>
            </label>
          ))}
          <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Os feeds de busca do Google e do Bing são oferecidos para uso pessoal. Para uso comercial em escala, avalie um provedor de notícias licenciado.
          </p>
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-800 font-semibold">
              <input type="checkbox" disabled={!can} className="rounded text-[#176B80]" checked={settings.autoCollect} onChange={(e) => saveSettings({ ...settings, autoCollect: e.target.checked })} />
              Coleta automática
            </label>
            <Field label="Intervalo entre coletas">
              <select
                className={inputCls}
                disabled={!can || !settings.autoCollect}
                value={settings.intervalMin}
                onChange={(e) => saveSettings({ ...settings, intervalMin: Number(e.target.value) })}
              >
                {[15, 30, 60, 120, 240, 720, 1440].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : m === 1440 ? '1 vez por dia' : `${m / 60} horas`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1">
            {config.aiAvailable ? (
              <>
                <Sparkles className="w-3 h-3 text-[#176B80]" /> Sentimento e assuntos classificados por IA.
              </>
            ) : (
              <>
                <Bot className="w-3 h-3" /> Sentimento por palavras-chave (configure a IA para mais precisão).
              </>
            )}
          </p>
        </section>

        {/* Runs */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Últimas coletas</h3>
          {config.runs.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhuma coleta ainda.</p>
          ) : (
            <ul className="space-y-2">
              {config.runs.map((r) => (
                <li key={r.id} className="text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {r.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#176B80] animate-spin" />
                    ) : r.status === 'done' && !r.errors.length ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span className="text-slate-800 font-semibold">{relTime(r.started_at)}</span>
                    <span className="text-slate-500">
                      · {r.trigger === 'manual' ? 'manual' : 'automática'} · {r.status === 'running' ? 'em andamento' : `${r.new_items} novas`}
                    </span>
                  </div>
                  {r.errors.length > 0 && (
                    <details className="ml-5 mt-0.5 text-[10px] text-amber-800">
                      <summary className="cursor-pointer">
                        {r.errors.length} aviso{r.errors.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="list-disc ml-4">
                        {r.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editingTopic && (
        <TopicModal
          topic={editingTopic === 'new' ? null : editingTopic}
          onClose={() => setEditingTopic(null)}
          onSaved={() => {
            setEditingTopic(null);
            onChanged();
          }}
        />
      )}
      {addingSource && (
        <SourceModal
          onClose={() => setAddingSource(false)}
          onSaved={() => {
            setAddingSource(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function TopicModal({ topic, onClose, onSaved }: { topic: Topic | null; onClose: () => void; onSaved: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(topic?.name ?? '');
  const [terms, setTerms] = useState<string[]>(topic?.terms ?? []);
  const [excludeTerms, setExcludeTerms] = useState<string[]>(topic?.excludeTerms ?? []);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const body = { name, terms, excludeTerms };
      if (topic) await api(`/tenant/clipping/topics/${topic.id}`, { method: 'PATCH', body });
      else await api('/tenant/clipping/topics', { method: 'POST', body });
      dialog.toast(topic ? 'Tema atualizado.' : 'Tema criado. Ele entra na próxima coleta.');
      onSaved();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível salvar', message: (e as Error).message, tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={topic ? 'Editar tema monitorado' : 'Novo tema monitorado'}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving || !name.trim() || !terms.length}>
            {saving ? 'Salvando…' : 'Salvar tema'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome do tema *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="Ex.: Saúde em Rondonópolis" />
        </Field>
        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-slate-700">Termos de busca *</span>
          <TagInput value={terms} onChange={setTerms} placeholder="Ex.: Hospital Regional de Rondonópolis; leitos pediátricos" />
          <span className="block text-[10px] text-slate-500">
            Enter ou ponto e vírgula para adicionar. A notícia entra se citar <strong>qualquer</strong> termo. Expressões com espaço são buscadas exatas.
          </span>
        </div>
        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-slate-700">Excluir notícias que contenham</span>
          <TagInput value={excludeTerms} onChange={setExcludeTerms} placeholder="Ex.: Mato Grosso do Sul" />
          <span className="block text-[10px] text-slate-500">Também vale para o nome da fonte. Use para eliminar homônimos e falsos positivos.</span>
        </div>
      </div>
    </Modal>
  );
}

function SourceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const dialog = useDialog();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [captureAll, setCaptureAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ name: string; items: number }>('/tenant/clipping/sources', { method: 'POST', body: { url, name, captureAll } });
      dialog.toast(`Feed encontrado em ${r.name} (${r.items} itens).`);
      onSaved();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível adicionar o site', message: (e as Error).message, tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Adicionar site monitorado"
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving || !url.trim()}>
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procurando feed…
              </>
            ) : (
              'Adicionar'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Endereço do site ou do feed *" hint="O sistema procura o feed RSS/Atom automaticamente a partir do endereço do site.">
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.al.mt.gov.br" autoFocus inputMode="url" />
        </Field>
        <Field label="Nome (opcional)" hint="Se vazio, usamos o nome do próprio feed.">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <label className="flex items-start gap-2 cursor-pointer text-xs">
          <input type="checkbox" className="mt-0.5 rounded text-[#176B80]" checked={captureAll} onChange={(e) => setCaptureAll(e.target.checked)} />
          <span>
            Capturar todas as notícias deste site
            <span className="block text-[10px] text-slate-500">Desmarcado: só entram notícias que citam algum tema monitorado.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
