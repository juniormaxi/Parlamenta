/**
 * Legislativo › Plenário › Radar de Temas: o gabinete descreve um tema (ou a ideia de um projeto) e o
 * sistema cruza as votações nominais relacionadas para mostrar quem — parlamentar e partido — mais votou
 * a favor dessa pauta, quantos votos ela teria hoje e quem convidar como coautor.
 */
import React, { useMemo, useState } from 'react';
import {
  Radar,
  Search,
  Sparkles,
  Loader2,
  Users,
  ShieldCheck,
  Scale,
  ShieldAlert,
  ExternalLink,
  Lightbulb,
  Target,
  Info,
  RotateCcw,
  ChevronRight,
  FileText,
} from 'lucide-react';
import type { Parliamentarian } from '../../../types';
import type { ChamberConfig } from '../../../lib/chamber';
import { api } from '../../../lib/api';
import { HemicycleChart, type HemicycleGroup } from './HemicycleChart';

// Mesma escala divergente validada usada no Plenário (azul-petróleo = a favor, vermelho = contra).
const GOOD = '#0b8bb0';
const GOOD_LIGHT = '#7cc3d3';
const BAD = '#d64545';
const BAD_LIGHT = '#eb9a9a';
const NEUTRAL = '#a8a6a0';

type Direction = 'favor' | 'contra' | 'off';
type Tier = 'defensor' | 'favoravel' | 'dividido' | 'resistente' | 'opositor' | 'sem-dados';

interface RadarMemberResult {
  id: string;
  popularName: string;
  party: string;
  uf?: string;
  photoUrl?: string;
  bloc: string;
  support: number | null;
  votes: number;
  abstentions: number;
  tier: Tier;
}

interface RadarEvidence {
  id: string;
  date: string;
  matterCode: string;
  matterTitle: string;
  description: string;
  result: string;
  url?: string;
  source: 'oficial' | 'gabinete';
  relevance: number;
  direction: Direction;
  autoDirection: Direction;
  overridden: boolean;
  reason: string;
  sim: number;
  nao: number;
  mandateVote: string | null;
}

interface RadarResult {
  query: string;
  label: string;
  ai: { used: boolean; reviewed: boolean; keywords: string[]; error: string | null };
  relaxed: boolean;
  phrases: string[];
  terms: string[];
  sessionsTotal: number;
  totals: {
    candidates: number;
    used: number;
    membersWithData: number;
    defensor: number;
    favoravel: number;
    dividido: number;
    resistente: number;
    opositor: number;
    semDados: number;
    favorable: number;
    quorum: { absoluta: number; tresQuintos: number; doisTercos: number };
    seats: number;
    avgSupport: number | null;
  };
  mandate: { id: string; support: number | null; votes: number } | null;
  members: RadarMemberResult[];
  parties: { party: string; seats: number; withData: number; support: number | null; cohesion: number | null }[];
  coauthors: RadarMemberResult[];
  evidence: RadarEvidence[];
}

const TIERS: { key: Tier; label: string; short: string; color: string; hollow?: boolean; hint: string }[] = [
  { key: 'defensor', label: 'Defensores (75% ou mais)', short: 'Defensores', color: GOOD, hint: 'Votam a favor do tema com consistência' },
  { key: 'favoravel', label: 'Tendência favorável (55–74%)', short: 'Favoráveis', color: GOOD_LIGHT, hint: 'Mais a favor que contra' },
  { key: 'dividido', label: 'Divididos (36–54%)', short: 'Divididos', color: NEUTRAL, hint: 'Pêndulo: decidem caso a caso' },
  { key: 'resistente', label: 'Resistentes (16–35%)', short: 'Resistentes', color: BAD_LIGHT, hint: 'Mais contra que a favor' },
  { key: 'opositor', label: 'Opositores (15% ou menos)', short: 'Opositores', color: BAD, hint: 'Votam contra com consistência' },
  { key: 'sem-dados', label: 'Sem votos no tema', short: 'Sem dados', color: '#cbd5e1', hollow: true, hint: 'Não votaram nas matérias encontradas' },
];
const tierOf = (k: Tier) => TIERS.find((t) => t.key === k)!;

const EXAMPLES = ['Reforma tributária', 'Porte de armas', 'Agrotóxicos', 'Saúde mental', 'Renegociação de dívidas', 'Educação básica', 'Violência contra a mulher', 'Licenciamento ambiental'];

function supportColor(v: number | null) {
  if (v === null) return '#cbd5e1';
  return v >= 75 ? GOOD : v >= 55 ? GOOD_LIGHT : v > 35 ? NEUTRAL : v > 15 ? BAD_LIGHT : BAD;
}

function Avatar({ m, size = 36 }: { m: { popularName: string; photoUrl?: string }; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = m.popularName
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className="rounded-full overflow-hidden bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 ring-1 ring-slate-200"
      style={{ width: size, height: size, fontSize: size / 2.8 }}
    >
      {m.photoUrl && !failed ? (
        <img src={m.photoUrl} alt="" loading="lazy" className="w-full h-full object-cover object-top" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}

/** Barra de apoio 0–100% com marca dos 50%. */
function SupportBar({ value, height = 8 }: { value: number | null; height?: number }) {
  return (
    <div className="relative w-full bg-slate-100 rounded-full overflow-hidden" style={{ height }}>
      {value !== null && <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, value)}%`, background: supportColor(value) }} />}
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/90" />
    </div>
  );
}

const fmtDate = (d: string) => d.split('-').reverse().join('/');

export function RadarTemas({
  chamber,
  members,
  mandateId,
  onOpenMember,
}: {
  chamber: ChamberConfig;
  members: Parliamentarian[];
  mandateId: string | null;
  onOpenMember: (id: string) => void;
}) {
  const [mode, setMode] = useState<'tema' | 'projeto'>('tema');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RadarResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Direction>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listTier, setListTier] = useState<'todos' | 'apoio' | 'pendulo' | 'contra'>('apoio');
  const [listSearch, setListSearch] = useState('');
  const [showAllEvidence, setShowAllEvidence] = useState(false);

  const analyze = async (q: string, ov: Record<string, Direction>) => {
    if (q.trim().length < 3) {
      setError('Descreva o tema ou o projeto com pelo menos 3 letras.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api<RadarResult>('/tenant/plenario/radar', { method: 'POST', body: { query: q, overrides: ov } });
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Falha na análise.');
    } finally {
      setLoading(false);
    }
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setOverrides({});
    setShowAllEvidence(false);
    void analyze(query, {});
  };

  const setDirection = (id: string, auto: Direction, d: Direction) => {
    const next = { ...overrides };
    if (d === auto) delete next[id];
    else next[id] = d;
    setOverrides(next);
    void analyze(result?.query ?? query, next);
  };

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const groups = useMemo((): HemicycleGroup[] => {
    if (!result) return [];
    return TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      color: t.color,
      hollow: t.hollow,
      members: result.members
        .filter((m) => m.tier === t.key)
        .map((m) => byId.get(m.id))
        .filter((m): m is Parliamentarian => !!m)
        .sort((a, b) => a.seatNumber - b.seatNumber),
    })).filter((g) => g.members.length);
  }, [result, byId]);

  const list = useMemo(() => {
    if (!result) return [];
    const q = listSearch.trim().toLowerCase();
    return result.members.filter((m) => {
      const okTier =
        listTier === 'todos'
          ? true
          : listTier === 'apoio'
            ? m.tier === 'defensor' || m.tier === 'favoravel'
            : listTier === 'pendulo'
              ? m.tier === 'dividido'
              : m.tier === 'resistente' || m.tier === 'opositor';
      return okTier && (!q || `${m.popularName} ${m.party} ${m.uf ?? ''}`.toLowerCase().includes(q));
    });
  }, [result, listTier, listSearch]);
  const ordered = listTier === 'contra' ? [...list].reverse() : list;

  const t = result?.totals;
  const smallSample = !!t && t.used > 0 && t.used < 3;
  const target = t?.quorum.absoluta ?? chamber.quorum.absoluta;
  const evidenceShown = result ? (showAllEvidence ? result.evidence : result.evidence.slice(0, 12)) : [];

  return (
    <div className="space-y-4">
      {/* ===== Busca ===== */}
      <div className="rounded-2xl overflow-hidden border border-[#176B80]/30 shadow-sm bg-gradient-to-br from-[#102C45] via-[#123751] to-[#176B80] text-white">
        <div className="p-5 md:p-6 grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-white/10 border border-white/15">
                <Radar className="w-5 h-5 text-[#36B7A5]" />
              </span>
              <h2 className="text-lg font-bold tracking-tight">Radar de Temas</h2>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">
              Diga em que pauta o mandato quer atuar. O Radar cruza as votações nominais da {chamber.houseShort} e mostra quem — parlamentar e partido — mais vota a favor desse tema.
            </p>
            <ul className="text-xs text-white/70 space-y-1 pt-1">
              <li className="flex gap-2">
                <Target className="w-3.5 h-3.5 text-[#36B7A5] shrink-0 mt-0.5" /> Projeção de votos frente à maioria absoluta ({chamber.quorum.absoluta})
              </li>
              <li className="flex gap-2">
                <Users className="w-3.5 h-3.5 text-[#36B7A5] shrink-0 mt-0.5" /> Coautores e articuladores sugeridos
              </li>
              <li className="flex gap-2">
                <Scale className="w-3.5 h-3.5 text-[#36B7A5] shrink-0 mt-0.5" /> Pêndulo: quem ainda dá para convencer
              </li>
            </ul>
          </div>

          <form onSubmit={submit} className="lg:col-span-8 space-y-3">
            <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold" role="tablist">
              {(
                [
                  ['tema', 'Tema de atuação'],
                  ['projeto', 'Ideia de projeto'],
                ] as const
              ).map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  role="tab"
                  aria-selected={mode === k}
                  onClick={() => setMode(k)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${mode === k ? 'bg-white text-[#102C45]' : 'text-white/80 hover:text-white'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {mode === 'tema' ? (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex.: saúde mental de adolescentes, agrotóxicos, renegociação de dívidas rurais…"
                  className="w-full pl-9 pr-3 py-3 rounded-xl bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#36B7A5]"
                  maxLength={300}
                />
              </div>
            ) : (
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={4}
                maxLength={3000}
                placeholder="Descreva o projeto que o mandato quer apresentar: o problema, o que a proposta muda e quem é beneficiado. Ex.: “Cria um programa de renegociação de dívidas de pequenos produtores rurais atingidos pela seca, com desconto de juros e prazo de 10 anos.”"
                className="w-full px-3 py-3 rounded-xl bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#36B7A5] leading-relaxed"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-[#36B7A5] hover:bg-[#2fa293] text-[#0b2235] text-sm font-bold flex items-center gap-2 disabled:opacity-60 shadow-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
                {loading ? 'Analisando votações…' : 'Analisar alinhamento'}
              </button>
              <span className="text-[11px] text-white/60">Sugestões:</span>
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => {
                    setMode('tema');
                    setQuery(ex);
                    setOverrides({});
                    void analyze(ex, {});
                  }}
                  className="px-2 py-1 rounded-full text-[11px] bg-white/10 hover:bg-white/20 border border-white/15"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-rose-200 bg-rose-900/30 border border-rose-300/30 rounded-lg px-3 py-2">{error}</p>}
          </form>
        </div>
      </div>

      {/* ===== Estado inicial ===== */}
      {!result && !loading && (
        <div className="grid md:grid-cols-3 gap-3">
          {[
            [Search, '1. Descreva a pauta', 'Um tema curto ou a ideia completa do projeto. Quanto mais específico, mais certeira a análise.'],
            [FileText, '2. O Radar encontra as votações', `Busca nas ementas e descrições das votações nominais da ${chamber.houseShort} e identifica o sentido de cada voto.`],
            [Target, '3. Veja aliados e resistências', 'Ranking de parlamentares e partidos, projeção de votos e sugestões de coautores para o projeto.'],
          ].map(([Icon, title, text]) => {
            const I = Icon as React.ElementType;
            return (
              <div key={title as string} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <I className="w-5 h-5 text-[#176B80] mb-2" />
                <p className="text-sm font-bold text-slate-900">{title as string}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{text as string}</p>
              </div>
            );
          })}
        </div>
      )}

      {loading && !result && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cruzando as votações nominais…
        </div>
      )}

      {result && t && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Cabeçalho do resultado */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Resultado para</p>
              <h3 className="text-base font-bold text-slate-900 truncate">{result.label}</h3>
              <p className="text-xs text-slate-500">
                {t.used} de {t.candidates} votações relacionadas entram no cálculo · {result.sessionsTotal} votações nominais na base ·{' '}
                {result.ai.used ? (result.ai.reviewed ? 'termos e sentido dos votos revisados por IA' : 'termos ampliados por IA') : 'busca por termos nas ementas'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {result.ai.used && (
                <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> IA
                </span>
              )}
              {result.relaxed && <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Busca ampliada</span>}
              {smallSample && <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Amostra pequena</span>}
              {Object.keys(overrides).length > 0 && (
                <button
                  onClick={() => {
                    setOverrides({});
                    void analyze(result.query, {});
                  }}
                  className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 hover:bg-slate-200"
                >
                  <RotateCcw className="w-3 h-3" /> Desfazer {Object.keys(overrides).length} ajuste(s)
                </button>
              )}
            </div>
          </div>

          {t.used === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
              <Info className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">
                {t.candidates === 0 ? 'Nenhuma votação nominal desta legislatura trata desse tema.' : 'As votações encontradas são só de procedimento ou de sentido incerto.'}
              </p>
              <p className="text-xs text-slate-500 max-w-xl mx-auto">
                {t.candidates === 0
                  ? 'Tente outros termos (sinônimos, nome da lei, sigla) ou descreva a ideia do projeto com mais detalhes.'
                  : 'Confira a lista abaixo e marque como “A favor” ou “Contra” as votações que expressam posição sobre o tema.'}
                {chamber.sphere !== 'federal' && ' Nesta casa, as votações nominais vêm do SAPL ou do registro feito pelo gabinete.'}
              </p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Projeção de votos favoráveis</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t.favorable >= target ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                      {t.favorable >= target ? 'Maioria absoluta' : `Faltam ${target - t.favorable}`}
                    </span>
                  </div>
                  <p className="mt-1">
                    <span className="text-3xl font-bold font-mono text-slate-900">{t.favorable}</span>
                    <span className="text-sm text-slate-500"> de {t.seats} · maioria absoluta {target}</span>
                  </p>
                  <div className="relative h-3 bg-slate-100 rounded-full mt-2 overflow-hidden flex">
                    <div style={{ width: `${(100 * t.defensor) / t.seats}%`, background: GOOD }} />
                    <div style={{ width: `${(100 * t.favoravel) / t.seats}%`, background: GOOD_LIGHT }} />
                    <div style={{ width: `${(100 * t.dividido) / t.seats}%`, background: NEUTRAL }} />
                    <span className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-slate-900" style={{ left: `${(100 * target) / t.seats}%` }} title="Maioria absoluta" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Defensores + favoráveis. Com os {t.dividido} divididos, o teto chega a {t.favorable + t.dividido}
                    {t.favorable + t.dividido >= t.quorum.tresQuintos ? ` (acima dos 3/5: ${t.quorum.tresQuintos})` : ''}.
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Apoio médio</span>
                  <p className="text-3xl font-bold font-mono mt-1" style={{ color: supportColor(t.avgSupport) }}>
                    {t.avgSupport ?? '—'}
                    {t.avgSupport !== null && <span className="text-base">%</span>}
                  </p>
                  <p className="text-[11px] text-slate-500">entre {t.membersWithData} {chamber.memberPlural} com voto no tema</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seu mandato</span>
                  {result.mandate ? (
                    <>
                      <p className="text-3xl font-bold font-mono mt-1" style={{ color: supportColor(result.mandate.support) }}>
                        {result.mandate.support ?? '—'}
                        {result.mandate.support !== null && <span className="text-base">%</span>}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {result.mandate.votes ? `a favor em ${result.mandate.votes} votação(ões) do tema` : 'sem voto nas votações do tema'}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">Defina o “Mandato do gabinete” no topo para comparar o histórico do seu parlamentar.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Hemiciclo */}
                <div className="xl:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <div className="px-5 pt-4 pb-2 border-b border-slate-100">
                    <h4 className="text-sm font-bold text-slate-900">Mapa do plenário · apoio ao tema</h4>
                    <p className="text-[11px] text-slate-500">Cada cadeira é um parlamentar, colorido pelo % de votos a favor do tema. Clique para abrir o perfil.</p>
                  </div>
                  <div className="px-5 py-4">
                    <HemicycleChart groups={groups} groupHeading="Posição no tema" mandateId={mandateId ?? undefined} onSelect={(p) => onOpenMember(p.id)} />
                  </div>
                </div>

                {/* Partidos */}
                <div className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-xs p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Partidos mais alinhados</h4>
                    <span className="text-[10px] text-slate-400">apoio médio · coesão</span>
                  </div>
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {result.parties
                      .filter((p) => p.support !== null)
                      .map((p, i) => (
                        <div key={p.party} className="grid grid-cols-[22px_1fr_44px] items-center gap-2 text-xs">
                          <span className="font-mono text-[10px] text-slate-400 text-right">{i + 1}º</span>
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-800 truncate">
                                {p.party} <span className="font-normal text-slate-400">· {p.seats} cad.</span>
                              </span>
                              {p.cohesion !== null && p.withData > 1 && (
                                <span className={`text-[10px] ${p.cohesion >= 70 ? 'text-slate-500' : 'text-amber-700'}`} title="Coesão: quanto os membros votam parecido entre si">
                                  coesão {p.cohesion}%
                                </span>
                              )}
                            </div>
                            <SupportBar value={p.support} />
                          </div>
                          <span className="font-mono font-bold text-right" style={{ color: supportColor(p.support) }}>
                            {p.support}%
                          </span>
                        </div>
                      ))}
                    {result.parties.some((p) => p.support === null) && (
                      <p className="text-[10px] text-slate-400 pt-1">
                        Sem votos no tema: {result.parties.filter((p) => p.support === null).map((p) => p.party).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Coautores sugeridos */}
              {result.coauthors.length > 0 && (
                <div className="bg-gradient-to-r from-emerald-50/80 to-cyan-50/60 border border-emerald-200/70 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-emerald-700" />
                    <h4 className="text-sm font-bold text-slate-900">Coautores e articuladores sugeridos</h4>
                    <span className="text-[11px] text-slate-500">defensores com mais votos no tema, de partidos diferentes</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {result.coauthors.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onOpenMember(m.id)}
                        className="text-left bg-white/90 hover:bg-white border border-emerald-100 rounded-xl p-2.5 flex items-center gap-2.5 transition-colors"
                      >
                        <Avatar m={m} size={40} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{m.popularName}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {m.party}
                            {chamber.groupsByUf && m.uf ? `/${m.uf}` : ''} · {m.votes} votos
                          </p>
                          <p className="text-[11px] font-bold font-mono" style={{ color: GOOD }}>
                            {m.support}% a favor
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ranking individual */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs">
                <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Parlamentares por alinhamento ao tema</h4>
                    <p className="text-[11px] text-slate-500">% de votos a favor do tema nas votações consideradas (ponderado pela relevância)</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
                      {(
                        [
                          ['apoio', 'A favor', <ShieldCheck key="a" className="w-3 h-3" />, t.defensor + t.favoravel],
                          ['pendulo', 'Pêndulo', <Scale key="p" className="w-3 h-3" />, t.dividido],
                          ['contra', 'Contra', <ShieldAlert key="c" className="w-3 h-3" />, t.resistente + t.opositor],
                          ['todos', 'Todos', null, result.members.length],
                        ] as const
                      ).map(([k, l, icon, n]) => (
                        <button
                          key={k}
                          onClick={() => setListTier(k)}
                          className={`px-2.5 py-1 rounded-md flex items-center gap-1 ${listTier === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          {icon}
                          {l} <span className="font-mono text-slate-400">{n}</span>
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <input
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                        placeholder="Buscar nome ou partido"
                        className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 pl-6 w-44 text-slate-800 focus:outline-none"
                      />
                      <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-4 max-h-[460px] overflow-y-auto px-4 py-2">
                  {ordered.length === 0 && <p className="text-xs text-slate-500 py-6 col-span-full text-center">Ninguém nesta faixa.</p>}
                  {ordered.map((m) => {
                    const tier = tierOf(m.tier);
                    return (
                      <button
                        key={m.id}
                        onClick={() => onOpenMember(m.id)}
                        className={`text-left py-2 border-b border-slate-100 flex items-center gap-2.5 hover:bg-slate-50 rounded-md px-1 ${m.id === mandateId ? 'bg-[#36B7A5]/10' : ''}`}
                      >
                        <Avatar m={m} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {m.popularName}
                              {m.id === mandateId && <span className="ml-1 text-[10px] text-[#176B80]">· mandato</span>}
                            </span>
                            <span className="text-xs font-mono font-bold shrink-0" style={{ color: m.support === null ? '#94a3b8' : supportColor(m.support) }}>
                              {m.support === null || m.tier === 'sem-dados' ? '—' : `${m.support}%`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500 shrink-0 w-28 truncate">
                              {m.party}
                              {chamber.groupsByUf && m.uf ? `/${m.uf}` : ''} · {m.votes} voto{m.votes === 1 ? '' : 's'}
                            </span>
                            <SupportBar value={m.tier === 'sem-dados' ? null : m.support} height={5} />
                          </div>
                          <span className="text-[9px] uppercase font-semibold tracking-wide" style={{ color: tier.key === 'sem-dados' ? '#94a3b8' : tier.color }}>
                            {tier.short}
                          </span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Votações consideradas */}
          {result.evidence.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">Votações nominais consideradas ({result.evidence.length})</h4>
                <p className="text-[11px] text-slate-500">
                  Confira o sentido de cada votação: <strong>A favor</strong> = votar Sim ajuda o tema; <strong>Contra</strong> = votar Sim prejudica o tema; <strong>Fora</strong> = não entra no cálculo. Ao mudar, o
                  Radar recalcula na hora.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {evidenceShown.map((e) => (
                  <div key={e.id} className={`px-4 py-3 grid md:grid-cols-[1fr_auto] gap-3 ${e.direction === 'off' ? 'bg-slate-50/60' : ''}`}>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-mono font-bold text-[#102C45] bg-slate-100 px-1.5 py-0.5 rounded">{e.matterCode}</span>
                        <span className="text-slate-500">{fmtDate(e.date)}</span>
                        <span className={`font-bold ${e.result === 'Aprovado' ? 'text-emerald-700' : 'text-rose-700'}`}>{e.result}</span>
                        <span className="font-mono text-slate-500">
                          {e.sim} Sim · {e.nao} Não
                        </span>
                        {e.mandateVote && e.mandateVote !== 'ausente' && (
                          <span className="text-slate-500">
                            Mandato: <strong className="text-slate-700">{e.mandateVote === 'sim' ? 'Sim' : e.mandateVote === 'abstencao' ? 'Abst.' : 'Não'}</strong>
                          </span>
                        )}
                        <span className="text-slate-400" title="Relevância para o tema">
                          relevância {e.relevance}%
                        </span>
                        {e.url && (
                          <a href={e.url} target="_blank" rel="noreferrer" className="text-[#176B80] hover:underline flex items-center gap-0.5">
                            <ExternalLink className="w-3 h-3" /> fonte
                          </a>
                        )}
                      </div>
                      <p className={`text-xs font-semibold leading-snug ${e.direction === 'off' ? 'text-slate-500' : 'text-slate-800'}`}>{e.matterTitle}</p>
                      {e.description && e.description !== e.matterTitle && <p className="text-[11px] text-slate-500 line-clamp-1">{e.description}</p>}
                      <p className="text-[10px] text-slate-400">
                        {e.overridden ? 'Ajustado pelo gabinete' : e.reason}
                      </p>
                    </div>
                    <div className="inline-flex self-start rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="Sentido do voto Sim">
                      {(
                        [
                          ['favor', 'A favor', 'text-[#0b8bb0]'],
                          ['contra', 'Contra', 'text-[#d64545]'],
                          ['off', 'Fora', 'text-slate-600'],
                        ] as const
                      ).map(([d, l, cls]) => (
                        <button
                          key={d}
                          role="radio"
                          aria-checked={e.direction === d}
                          disabled={loading}
                          onClick={() => setDirection(e.id, e.autoDirection, d)}
                          className={`px-2.5 py-1 rounded-md ${e.direction === d ? `bg-white shadow-xs ${cls}` : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {result.evidence.length > 12 && (
                <button
                  onClick={() => setShowAllEvidence((v) => !v)}
                  className="w-full py-2 text-xs font-medium text-[#176B80] bg-slate-50 hover:bg-slate-100 border-t border-slate-200 rounded-b-2xl"
                >
                  {showAllEvidence ? 'Mostrar menos' : `Mostrar todas (${result.evidence.length})`}
                </button>
              )}
            </div>
          )}

          {/* Metodologia */}
          <details className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
            <summary className="font-semibold text-slate-800 cursor-pointer flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#176B80]" /> Como o Radar calcula
            </summary>
            <ul className="list-disc pl-5 mt-2 space-y-1 leading-relaxed">
              <li>
                Encontra as votações nominais da legislatura cuja ementa ou descrição contém os termos do tema
                {result.phrases.length > 0 && ` (e expressões relacionadas: ${result.phrases.slice(0, 6).join(', ')})`}
                {result.ai.used && result.ai.keywords.length > 0 && `; a IA sugeriu: ${result.ai.keywords.slice(0, 8).join(', ')}`}.
              </li>
              <li>Votação do texto principal, “mantido o texto” e urgência contam com “Sim” a favor da matéria. Procedimentos (retirada de pauta, adiamento…) ficam fora; destaques e requerimentos genéricos ficam fora até o gabinete indicar o sentido.</li>
              <li>Apoio = votos a favor ÷ (a favor + contra), ponderado pela relevância de cada votação. Obstrução conta como contra; ausência e abstenção não entram. Votações de uma mesma matéria dividem o peso entre si.</li>
              <li>Faixas: defensor ≥ 75%, favorável 55–74%, dividido 36–54%, resistente 16–35%, opositor ≤ 15%. É preciso ter votado em pelo menos {t.used >= 6 ? 2 : 1} votação(ões) do tema.</li>
              <li>O resultado mede o histórico de votos sobre as matérias encontradas — não a opinião declarada. Confira o sentido das votações acima antes de usar a análise.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
