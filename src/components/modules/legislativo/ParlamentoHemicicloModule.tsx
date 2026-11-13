import React, { useState, useMemo } from 'react';
import {
  Landmark,
  Vote,
  Users,
  Search,
  Filter,
  Plus,
  Edit3,
  CheckCircle2,
  XCircle,
  MinusCircle,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
  Award,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Calendar,
  Layers,
  FileText,
  PieChart as PieIcon,
  BarChart2,
  Check,
  X,
  Compass,
  Radio,
  Activity,
  Crown,
  Eye,
  Flame,
} from 'lucide-react';
import {
  Parliamentarian,
  VotingSession,
  VoteChoice,
} from '../../../types';
import { useDialog } from '../../common/Dialogs';
import { HemicycleChart, type HemicycleGroup } from './HemicycleChart';
import { UFS, type ChamberConfig } from '../../../lib/chamber';

interface ParlamentoHemicicloModuleProps {
  /** Casa legislativa do gabinete (esfera, nº de cadeiras, quóruns, nomenclatura). */
  chamber: ChamberConfig;
  parliamentarians: Parliamentarian[];
  votingSessions: VotingSession[];
  onAddParliamentarian: (p: Parliamentarian) => void;
  onUpdateParliamentarian: (p: Parliamentarian) => void;
  onSaveVotingSession: (session: VotingSession) => void;
}

type ChamberViewMode = 'partidos' | 'blocos' | 'alinhamento' | 'votacao';

// Categorical slots (validated: adjacent CVD ΔE ≥ 9, normal-vision ΔE ≥ 19); "Outros" is neutral gray.
const PARTY_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
// Diverging pair (validated) + light steps + gray midpoint for polarity views.
const GOOD = '#0b8bb0';
const GOOD_LIGHT = '#7cc3d3';
const BAD = '#d64545';
const BAD_LIGHT = '#eb9a9a';
const NEUTRAL_GRAY = '#a8a6a0';

const VACANT_PREFIX = 'vaga-';
const isVacant = (p: Parliamentarian) => p.id.startsWith(VACANT_PREFIX);

/** Resultado da votação conforme o quórum, sobre o total de cadeiras da casa. */
export function voteOutcome(votes: Record<string, VoteChoice>, quorumType: VotingSession['quorumType'], chamber: ChamberConfig) {
  const vals = Object.values(votes);
  const sim = vals.filter((v) => v === 'sim').length;
  const nao = vals.filter((v) => v === 'nao').length;
  const abst = vals.filter((v) => v === 'abstencao').length;
  const present = sim + nao + abst;
  const { absoluta, tresQuintos, doisTercos } = chamber.quorum;
  let approved: boolean;
  let rule: string;
  if (quorumType === 'Maioria Absoluta') {
    approved = sim >= absoluta;
    rule = `${absoluta} votos SIM (maioria absoluta de ${chamber.seats})`;
  } else if (quorumType === 'Três Quintos (3/5)') {
    approved = sim >= tresQuintos;
    rule = `${tresQuintos} votos SIM (3/5 de ${chamber.seats})`;
  } else if (quorumType === 'Dois Terços (2/3)') {
    approved = sim >= doisTercos;
    rule = `${doisTercos} votos SIM (2/3 de ${chamber.seats})`;
  } else {
    approved = present >= absoluta && sim > nao;
    rule = `mais SIM que NÃO, com presença mínima de ${absoluta}`;
  }
  return { sim, nao, abst, present, approved, rule };
}

export const ParlamentoHemicicloModule: React.FC<ParlamentoHemicicloModuleProps> = ({
  chamber,
  parliamentarians,
  votingSessions,
  onAddParliamentarian,
  onUpdateParliamentarian,
  onSaveVotingSession,
}) => {
  const dialog = useDialog();
  const [activeTab, setActiveTab] = useState<'composicao' | 'votacoes' | 'estrategia'>('composicao');
  const [selectedDeputy, setSelectedDeputy] = useState<Parliamentarian | null>(parliamentarians[0] || null);
  const [filterBloc, setFilterBloc] = useState<string>('todos');
  const [filterParty, setFilterParty] = useState<string>('todos');
  const [searchDeputy, setSearchDeputy] = useState<string>('');
  const [filterUf, setFilterUf] = useState<string>('todos');
  const registered = parliamentarians.length;
  const vacantCount = Math.max(0, chamber.seats - registered);
  const seatTaken = (seat: number, exceptId?: string) => parliamentarians.find((p) => p.seatNumber === seat && p.id !== exceptId);
  /** Valida a cadeira informada no cadastro/edição. Retorna mensagem de erro ou null. */
  const seatError = (seat: number, exceptId?: string) => {
    if (!Number.isInteger(seat) || seat < 1 || seat > chamber.seats) return `A cadeira deve ficar entre 1 e ${chamber.seats} (${chamber.houseShort}).`;
    const other = seatTaken(seat, exceptId);
    return other ? `A cadeira ${seat} já está ocupada por ${other.popularName}.` : null;
  };
  const firstFreeSeat = () => {
    for (let i = 1; i <= chamber.seats; i++) if (!seatTaken(i)) return i;
    return chamber.seats;
  };
  const [chamberViewMode, setChamberViewMode] = useState<ChamberViewMode>('partidos');

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newDeputyModalOpen, setNewDeputyModalOpen] = useState(false);
  /** Cadeira sugerida ao cadastrar (clique numa cadeira vazia do plenário). */
  const [newSeatDefault, setNewSeatDefault] = useState<number | null>(null);
  const [newVoteModalOpen, setNewVoteModalOpen] = useState(false);
  const [inspectVoteSession, setInspectVoteSession] = useState<VotingSession | null>(votingSessions[0] || null);

  // Strategy theme selector
  const [selectedThemeStrategy, setSelectedThemeStrategy] = useState<string>('Todos os Temas');

  // New Voting Session Form State
  const [newVoteForm, setNewVoteForm] = useState<{
    matterCode: string;
    matterTitle: string;
    theme: VotingSession['theme'];
    quorumType: VotingSession['quorumType'];
    date: string;
    mandateVote: VoteChoice;
    votes: Record<string, VoteChoice>;
    summary: string;
    strategicNote: string;
  }>({
    matterCode: '',
    matterTitle: '',
    theme: 'Saúde',
    quorumType: 'Maioria Simples',
    date: new Date().toISOString().split('T')[0],
    mandateVote: 'sim',
    votes: {},
    summary: '',
    strategicNote: '',
  });

  // Unique parties list
  const uniqueParties = useMemo(() => {
    return Array.from(new Set(parliamentarians.map((p) => p.party))).sort();
  }, [parliamentarians]);

  // Filtered deputies
  const filteredDeputies = useMemo(() => {
    return parliamentarians.filter((dep) => {
      const matchBloc = filterBloc === 'todos' || dep.bloc === filterBloc;
      const matchParty = filterParty === 'todos' || dep.party === filterParty;
      const matchUf = filterUf === 'todos' || dep.uf === filterUf;
      const matchSearch =
        dep.name.toLowerCase().includes(searchDeputy.toLowerCase()) ||
        dep.popularName.toLowerCase().includes(searchDeputy.toLowerCase()) ||
        dep.electoralBase.toLowerCase().includes(searchDeputy.toLowerCase()) ||
        dep.party.toLowerCase().includes(searchDeputy.toLowerCase());
      return matchBloc && matchParty && matchUf && matchSearch;
    });
  }, [parliamentarians, filterBloc, filterParty, filterUf, searchDeputy]);
  const ufsInChamber = useMemo(() => Array.from(new Set(parliamentarians.map((p) => p.uf).filter(Boolean) as string[])).sort(), [parliamentarians]);

  // Party order + display colors, shared by the diagram, the profile card and the cohesion ranking.
  // Max 8 distinguishable hues: with more than 8 parties the 7 largest get their own color, the rest fold into "Outros".
  const partyLayout = useMemo(() => {
    const bySeat = (a: Parliamentarian, b: Parliamentarian) => a.seatNumber - b.seatNumber;
    const BLOC_ORDER: Record<string, number> = { Governo: 0, Independente: 1, Oposição: 2 };
    const map = new Map<string, Parliamentarian[]>();
    parliamentarians.forEach((p) => map.set(p.party, [...(map.get(p.party) ?? []), p]));
    const parties = [...map].map(([party, members]) => {
      const counts: Record<string, number> = {};
      members.forEach((m) => (counts[m.bloc] = (counts[m.bloc] ?? 0) + 1));
      const bloc = Object.keys(counts).sort((a, b) => counts[b]! - counts[a]! || BLOC_ORDER[a]! - BLOC_ORDER[b]!)[0]!;
      return { party, members: members.sort(bySeat), bloc };
    });
    // Max 8 distinguishable hues: the 7 largest parties get their own color, the rest fold into "Outros".
    const bySize = [...parties].sort((a, b) => b.members.length - a.members.length || a.party.localeCompare(b.party));
    const own = new Set(bySize.slice(0, parties.length > 8 ? 7 : 8).map((p) => p.party));
    const main = parties
      .filter((p) => own.has(p.party))
      .sort((a, b) => BLOC_ORDER[a.bloc]! - BLOC_ORDER[b.bloc]! || b.members.length - a.members.length || a.party.localeCompare(b.party));
    const rest = parties.filter((p) => !own.has(p.party));
    const colors = new Map<string, string>();
    main.forEach((p, i) => colors.set(p.party, PARTY_PALETTE[i]!));
    rest.forEach((p) => colors.set(p.party, NEUTRAL_GRAY));
    return { main, rest, colors };
  }, [parliamentarians]);
  const partyColor = (party: string) => partyLayout.colors.get(party) ?? NEUTRAL_GRAY;



  // Initialize new vote form with current deputies
  const handleOpenNewVote = () => {
    const initialVotes: Record<string, VoteChoice> = {};
    parliamentarians.forEach((dep) => {
      if (dep.bloc === 'Governo') {
        initialVotes[dep.id] = 'sim';
      } else if (dep.bloc === 'Oposição') {
        initialVotes[dep.id] = 'nao';
      } else {
        initialVotes[dep.id] = 'sim';
      }
    });

    setNewVoteForm({
      matterCode: `PL ${Math.floor(Math.random() * 400 + 100)}/2026`,
      matterTitle: '',
      theme: 'Saúde',
      quorumType: 'Maioria Simples',
      date: new Date().toISOString().split('T')[0],
      mandateVote: 'sim',
      votes: initialVotes,
      summary: '',
      strategicNote: '',
    });
    setNewVoteModalOpen(true);
  };

  const handleVoteToggle = (depId: string, choice: VoteChoice) => {
    setNewVoteForm((prev) => ({
      ...prev,
      votes: {
        ...prev.votes,
        [depId]: choice,
      },
    }));
  };

  const handleBatchVoteByBloc = (bloc: 'Governo' | 'Oposição' | 'Independente', choice: VoteChoice) => {
    setNewVoteForm((prev) => {
      const updated = { ...prev.votes };
      parliamentarians.forEach((p) => {
        if (p.bloc === bloc) {
          updated[p.id] = choice;
        }
      });
      return { ...prev, votes: updated };
    });
  };

  const handleBatchVoteAll = (choice: VoteChoice) => {
    setNewVoteForm((prev) => {
      const updated: Record<string, VoteChoice> = {};
      parliamentarians.forEach((p) => {
        updated[p.id] = choice;
      });
      return { ...prev, votes: updated };
    });
  };

  const handleSaveVotingSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoteForm.matterCode || !newVoteForm.matterTitle) {
      dialog.alert({ title: 'Campos obrigatórios', message: 'Preencha o número e o título da matéria.', tone: 'warning' });
      return;
    }

    const outcome = voteOutcome(newVoteForm.votes, newVoteForm.quorumType, chamber);
    const simCount = outcome.sim;
    const isApproved = outcome.approved;

    const newSession: VotingSession = {
      id: `vot-${Date.now()}`,
      matterCode: newVoteForm.matterCode,
      matterTitle: newVoteForm.matterTitle,
      theme: newVoteForm.theme,
      date: newVoteForm.date,
      sessionNumber: `${Math.floor(Math.random() * 20 + 35)}ª Sessão Ordinária`,
      quorumType: newVoteForm.quorumType,
      mandateVote: newVoteForm.mandateVote,
      result: isApproved ? 'Aprovado' : 'Rejeitado',
      votes: newVoteForm.votes,
      summary: `Votação concluída com ${simCount} votos favoráveis, ${outcome.nao} contrários e ${outcome.abst} abstenções (${newVoteForm.quorumType}: ${outcome.rule}). Matéria ${isApproved ? 'aprovada' : 'rejeitada'}.`,
      strategicNote: newVoteForm.strategicNote || 'Registro nominal efetuado pelo Gabinete Conectado.',
    };

    onSaveVotingSession(newSession);
    setInspectVoteSession(newSession);
    setNewVoteModalOpen(false);
  };

  // Strategic Stats calculation
  const themesList = [
    'Todos os Temas',
    'Saúde',
    'Infraestrutura',
    'Agricultura & Meio Ambiente',
    'Educação',
    'Tributário & Orçamento',
    'Segurança Pública',
    'Servidores Públicos',
  ];

  const strategicThemeData = useMemo(() => {
    return parliamentarians.map((dep) => {
      let score = dep.alignmentScore;
      if (selectedThemeStrategy !== 'Todos os Temas' && dep.themeAlignments) {
        score = dep.themeAlignments[selectedThemeStrategy] ?? dep.alignmentScore;
      }
      return {
        ...dep,
        effectiveScore: score,
      };
    }).sort((a, b) => b.effectiveScore - a.effectiveScore);
  }, [parliamentarians, selectedThemeStrategy]);

  // Cohesion by party
  const partyCohesion = useMemo(() => {
    const groups: Record<string, { totalScore: number; count: number; color: string; deputies: string[] }> = {};
    parliamentarians.forEach((dep) => {
      let score = dep.alignmentScore;
      if (selectedThemeStrategy !== 'Todos os Temas' && dep.themeAlignments) {
        score = dep.themeAlignments[selectedThemeStrategy] ?? dep.alignmentScore;
      }
      if (!groups[dep.party]) {
        groups[dep.party] = {
          totalScore: 0,
          count: 0,
          color: partyColor(dep.party),
          deputies: [],
        };
      }
      groups[dep.party].totalScore += score;
      groups[dep.party].count += 1;
      groups[dep.party].deputies.push(dep.popularName);
    });

    return Object.entries(groups).map(([party, data]) => ({
      party,
      count: data.count,
      avgAlignment: Math.round(data.totalScore / data.count),
      color: data.color,
      deputies: data.deputies,
    })).sort((a, b) => b.avgAlignment - a.avgAlignment);
  }, [parliamentarians, selectedThemeStrategy, partyLayout]);

  // ---- Hemicycle groups per view mode (colors validated with the dataviz palette checker) ----
  const filteredIds = useMemo(() => new Set(filteredDeputies.map((d) => d.id)), [filteredDeputies]);
  const vacantGroup = useMemo((): HemicycleGroup | null => {
    if (!vacantCount) return null;
    const members: Parliamentarian[] = [];
    let seat = 1;
    for (let i = 0; i < vacantCount; i++) {
      while (seatTaken(seat)) seat++;
      members.push({
        id: `${VACANT_PREFIX}${seat}`,
        name: `Cadeira ${seat} sem parlamentar cadastrado`,
        popularName: `Cadeira ${seat} · não cadastrada`,
        party: '—',
        partyColor: NEUTRAL_GRAY,
        bloc: 'Independente',
        seatNumber: seat,
        electoralBase: '',
        alignmentScore: 0,
      });
      seat++;
    }
    return { key: '__vagas', label: 'Cadeiras não cadastradas', color: '#cbd5e1', hollow: true, members, note: 'Cadastre o parlamentar' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacantCount, parliamentarians]);

  const chamberGroups = useMemo((): { heading: string; note?: string; groups: HemicycleGroup[] } => {
    const r = chamberGroupsBase();
    return vacantGroup ? { ...r, groups: [...r.groups, vacantGroup] } : r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamberViewMode, parliamentarians, inspectVoteSession, partyLayout, vacantGroup]);

  function chamberGroupsBase(): { heading: string; note?: string; groups: HemicycleGroup[] } {
    const bySeat = (a: Parliamentarian, b: Parliamentarian) => a.seatNumber - b.seatNumber;
    if (chamberViewMode === 'partidos') {
      const { main, rest } = partyLayout;
      const groups: HemicycleGroup[] = main.map((p) => ({
        key: p.party,
        label: p.party,
        color: partyLayout.colors.get(p.party)!,
        members: p.members,
        note: p.bloc === 'Governo' ? 'Base do Governo' : p.bloc,
      }));
      if (rest.length) {
        const others: HemicycleGroup = {
          key: '__outros',
          label: 'Outros partidos',
          color: NEUTRAL_GRAY,
          members: rest.flatMap((p) => p.members).sort(bySeat),
          detail: rest.map((p) => `${p.party} (${p.members.length})`).join(' · '),
          note: 'Diversos',
        };
        const firstOpp = groups.findIndex((g) => main.find((m) => m.party === g.key)?.bloc === 'Oposição');
        groups.splice(firstOpp === -1 ? groups.length : firstOpp, 0, others);
      }
      return { heading: 'Partido', note: 'Bloco', groups };
    }
    if (chamberViewMode === 'blocos') {
      const def: [Parliamentarian['bloc'], string, string][] = [
        ['Governo', 'Base do Governo', GOOD],
        ['Independente', 'Independentes', NEUTRAL_GRAY],
        ['Oposição', 'Oposição', BAD],
      ];
      return {
        heading: 'Bloco',
        groups: def.map(([bloc, label, color]) => ({ key: bloc, label, color, members: parliamentarians.filter((p) => p.bloc === bloc).sort(bySeat) })),
      };
    }
    if (chamberViewMode === 'alinhamento') {
      const def: [string, string, string, (s: number) => boolean][] = [
        ['a', 'Alto (90% ou mais)', GOOD, (s) => s >= 90],
        ['b', 'Moderado (75–89%)', GOOD_LIGHT, (s) => s >= 75 && s < 90],
        ['c', 'Baixo (50–74%)', BAD_LIGHT, (s) => s >= 50 && s < 75],
        ['d', 'Divergente (abaixo de 50%)', BAD, (s) => s < 50],
      ];
      return {
        heading: 'Fidelidade ao mandato',
        groups: def.map(([key, label, color, test]) => ({
          key,
          label,
          color,
          members: parliamentarians.filter((p) => test(p.alignmentScore)).sort((a, b) => b.alignmentScore - a.alignmentScore),
        })),
      };
    }
    const vote = (p: Parliamentarian) => inspectVoteSession?.votes[p.id] ?? 'ausente';
    const def: [string, string, string, boolean][] = [
      ['sim', 'Sim', GOOD, false],
      ['abstencao', 'Abstenção', NEUTRAL_GRAY, false],
      ['ausente', 'Ausente', NEUTRAL_GRAY, true],
      ['nao', 'Não', BAD, false],
    ];
    return {
      heading: 'Voto',
      groups: def.map(([key, label, color, hollow]) => ({
        key,
        label,
        color,
        hollow,
        members: parliamentarians.filter((p) => vote(p) === key).sort(bySeat),
      })),
    };
  }

  return (
    <div className="space-y-4">

      {/* Top Header & Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#102C45] text-white shadow-xs border border-[#176B80]">
              <Landmark className="w-5 h-5 text-[#36B7A5]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Composição do Plenário & Inteligência de Bancadas
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  {chamber.seats} cadeiras
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                {chamber.house} · {chamber.seats} {chamber.memberPlural} · ocupação por bancada, votações nominais e fidelidade por tema
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Main Navigation Tabs */}
          <div className="bg-slate-100 p-0.5 rounded-lg flex items-center text-xs font-medium border border-slate-200">
            <button
              onClick={() => setActiveTab('composicao')}
              className={`px-3.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'composicao'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Landmark className="w-3.5 h-3.5 text-[#176B80]" />
              <span>Composição Plenário</span>
            </button>
            <button
              onClick={() => setActiveTab('votacoes')}
              className={`px-3.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'votacoes'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Vote className="w-3.5 h-3.5 text-[#36B7A5]" />
              <span>Votações Nominais ({votingSessions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('estrategia')}
              className={`px-3.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'estrategia'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-indigo-600" />
              <span>Inteligência Estratégica</span>
            </button>
          </div>

          <button
            onClick={handleOpenNewVote}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#36B7A5]" />
            <span>Registrar Votação</span>
          </button>

          <button
            onClick={() => {
              setNewSeatDefault(null);
              setNewDeputyModalOpen(true);
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Cadastrar Parlamentar</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: COMPOSIÇÃO PLENÁRIO (LAYOUT ELEVADO & EXECUTIVO)      */}
      {/* ============================================================ */}
      {activeTab === 'composicao' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Plenary Chamber View */}
          <div className="lg:col-span-8 space-y-3">
            {/* Plenary composition: classic parliament diagram + results table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Composição do Plenário · {chamber.houseShort}</h2>
                    <p className="text-[11px] text-slate-500">
                      {chamber.house} · {chamber.seats} cadeiras · {registered} {registered === 1 ? 'parlamentar cadastrado' : 'parlamentares cadastrados'}
                      {vacantCount > 0 && <span className="text-amber-700"> · {vacantCount} a cadastrar</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                    <span title="Maioria absoluta do total de cadeiras">
                      Maioria absoluta <strong className="text-slate-900">{chamber.quorum.absoluta}</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span title="Três quintos (ex.: emenda constitucional)">
                      3/5 <strong className="text-slate-900">{chamber.quorum.tresQuintos}</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>
                      2/3 <strong className="text-slate-900">{chamber.quorum.doisTercos}</strong>
                    </span>
                  </div>
                </div>
                <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5 self-start" role="tablist" aria-label="Modo de visualização">
                  {(
                    [
                      ['partidos', 'Partidos'],
                      ['blocos', 'Blocos Políticos'],
                      ['alinhamento', 'Fidelidade ao Mandato'],
                      ['votacao', `Placar ${inspectVoteSession?.matterCode ?? 'da Sessão'}`],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      role="tab"
                      aria-selected={chamberViewMode === mode}
                      onClick={() => setChamberViewMode(mode)}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                        chamberViewMode === mode ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {chamberViewMode === 'votacao' && inspectVoteSession && (
                  <p className="text-[11px] text-slate-600">
                    <strong className="text-slate-900">{inspectVoteSession.matterCode}</strong> · {inspectVoteSession.matterTitle}
                  </p>
                )}
              </div>

              <div className="px-5 py-4">
                <HemicycleChart
                  groups={chamberGroups.groups}
                  groupHeading={chamberGroups.heading}
                  showNote={chamberGroups.note}
                  selectedId={selectedDeputy?.id}
                  mandateId="dep-01"
                  isDimmed={(p) => (isVacant(p) ? filterBloc !== 'todos' || filterParty !== 'todos' || filterUf !== 'todos' : !filteredIds.has(p.id))}
                  onSelect={(p) => {
                    if (isVacant(p)) {
                      setNewSeatDefault(p.seatNumber);
                      setNewDeputyModalOpen(true);
                    } else setSelectedDeputy(p);
                  }}
                />
              </div>

              <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500">Destacar:</span>
                  <select
                    value={filterBloc}
                    onChange={(e) => setFilterBloc(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#176B80]"
                  >
                    <option value="todos">Todos os blocos</option>
                    <option value="Governo">Base do Governo</option>
                    <option value="Independente">Independentes</option>
                    <option value="Oposição">Oposição</option>
                  </select>
                  <select
                    value={filterParty}
                    onChange={(e) => setFilterParty(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#176B80]"
                  >
                    <option value="todos">Todos os partidos</option>
                    {uniqueParties.map((pty) => (
                      <option key={pty} value={pty}>
                        {pty}
                      </option>
                    ))}
                  </select>
                  {chamber.groupsByUf && (
                    <select
                      value={filterUf}
                      onChange={(e) => setFilterUf(e.target.value)}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#176B80]"
                      aria-label="Bancada estadual"
                    >
                      <option value="todos">Todas as bancadas (UF)</option>
                      {ufsInChamber.map((uf) => (
                        <option key={uf} value={uf}>
                          Bancada {uf} ({parliamentarians.filter((p) => p.uf === uf).length})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <span className="flex items-center gap-3 text-[11px]">
                  {vacantCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full border-2 border-slate-300" />
                      Clique numa cadeira vazia para cadastrar
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#36B7A5]" />
                    Seu mandato
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Selected Deputy Executive Profile Card */}
          <div className="lg:col-span-4 space-y-4">
            {selectedDeputy ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                {/* Header Profile Ribbon */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold font-mono text-xl shrink-0 shadow-md border-2"
                      style={{
                        backgroundColor: selectedDeputy.id === 'dep-01' ? '#102C45' : '#F8FAFC',
                        color: selectedDeputy.id === 'dep-01' ? '#36B7A5' : '#102C45',
                        borderColor: selectedDeputy.id === 'dep-01' ? '#36B7A5' : partyColor(selectedDeputy.party),
                      }}
                    >
                      {selectedDeputy.avatar || selectedDeputy.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          Cadeira #{selectedDeputy.seatNumber}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            selectedDeputy.bloc === 'Governo'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : selectedDeputy.bloc === 'Oposição'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {selectedDeputy.bloc}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1 leading-snug">
                        {selectedDeputy.popularName}
                      </h3>
                      <p className="text-xs text-slate-500">{selectedDeputy.name}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setEditModalOpen(true)}
                    className="p-1.5 text-slate-400 hover:text-[#176B80] hover:bg-slate-50 rounded-lg transition-colors"
                    title="Editar dados deste parlamentar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                {/* Key Attributes Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Partido / Bancada
                    </span>
                    <span className="font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: partyColor(selectedDeputy.party) }}
                      />
                      {selectedDeputy.party}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Base Regional
                    </span>
                    <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                      {[chamber.groupsByUf && selectedDeputy.uf ? selectedDeputy.uf : '', selectedDeputy.electoralBase].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Função na {chamber.sphere === 'municipal' ? 'Câmara' : chamber.sphere === 'federal' ? 'Câmara' : 'Assembleia'}
                    </span>
                    <span className="font-medium text-slate-700 mt-0.5 block">
                      {selectedDeputy.role || `${chamber.memberTitle} titular`}
                    </span>
                  </div>
                </div>

                {/* Mandate Alignment Gauge */}
                <div className="space-y-1.5 p-3.5 rounded-xl bg-gradient-to-r from-slate-50 to-emerald-50/50 border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-[#176B80]" />
                      Alinhamento Global com nosso Mandato
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {selectedDeputy.alignmentScore}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedDeputy.alignmentScore >= 80
                          ? 'bg-emerald-500'
                          : selectedDeputy.alignmentScore >= 60
                          ? 'bg-[#176B80]'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${selectedDeputy.alignmentScore}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 leading-relaxed">
                    {selectedDeputy.alignmentScore >= 80
                      ? 'Aliado consistente em matérias de infraestrutura, saúde e desenvolvimento regional.'
                      : selectedDeputy.alignmentScore >= 60
                      ? 'Parlamentar de centro: decide caso a caso conforme a articulação política e emendas.'
                      : 'Posicionamento oposicionista sistemático, exceto em pautas de consenso ético e servidores.'}
                  </p>
                </div>

                {/* Thematic Fidelity Breakdown */}
                {selectedDeputy.themeAlignments && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Fidelidade por Assunto</span>
                      <span className="text-[10px] text-slate-400 font-normal">7 temas</span>
                    </h4>
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(selectedDeputy.themeAlignments).map(([theme, score]) => (
                        <div key={theme} className="flex items-center justify-between">
                          <span className="text-slate-600 truncate max-w-[150px]">{theme}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  score >= 80
                                    ? 'bg-emerald-500'
                                    : score >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[11px] text-slate-700 w-8 text-right">
                              {score}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={handleOpenNewVote}
                    className="flex-1 py-1.5 px-3 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Vote className="w-3.5 h-3.5 text-[#36B7A5]" />
                    <span>Registrar Voto</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('votacoes')}
                    className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                  >
                    Ver Votações
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">
                  {registered === 0
                    ? `Nenhum parlamentar cadastrado ainda. Clique numa cadeira do plenário ou em “Cadastrar Parlamentar” para montar a composição da ${chamber.houseShort}.`
                    : 'Selecione uma cadeira no plenário para inspecionar o parlamentar.'}
                </p>
              </div>
            )}

            {/* Quick List of Parliamentarians */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-800">
                  Parlamentares cadastrados ({filteredDeputies.length}/{chamber.seats})
                </h4>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar parlamentar..."
                    value={searchDeputy}
                    onChange={(e) => setSearchDeputy(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 pl-6 w-36 text-slate-800 focus:outline-none"
                  />
                  <Search className="w-3 h-3 text-slate-400 absolute left-1.5 top-2" />
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 text-xs pr-1">
                {filteredDeputies.map((dep) => (
                  <div
                    key={dep.id}
                    onClick={() => setSelectedDeputy(dep)}
                    className={`p-2 flex items-center justify-between cursor-pointer rounded-lg transition-colors ${
                      selectedDeputy?.id === dep.id
                        ? 'bg-[#176B80]/10 font-bold text-[#102C45]'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-mono text-[10px] w-7 text-slate-400 font-bold">
                        #{dep.seatNumber}
                      </span>
                      <span className="truncate">{dep.popularName}</span>
                      {chamber.groupsByUf && dep.uf && <span className="text-[10px] text-slate-400">{dep.uf}</span>}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-slate-700">
                      {dep.party}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: VOTAÇÕES NOMINAIS HISTÓRICAS                           */}
      {/* ============================================================ */}
      {activeTab === 'votacoes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Voting Sessions List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Histórico de Votações Nominais ({votingSessions.length})
                </h3>
                <button
                  onClick={handleOpenNewVote}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nova Votação</span>
                </button>
              </div>

              <div className="space-y-2">
                {votingSessions.map((session) => {
                  const isSelected = inspectVoteSession?.id === session.id;
                  const simVotes = Object.values(session.votes).filter((v) => v === 'sim').length;
                  const naoVotes = Object.values(session.votes).filter((v) => v === 'nao').length;

                  return (
                    <div
                      key={session.id}
                      onClick={() => setInspectVoteSession(session)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#176B80] bg-[#176B80]/5 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono font-bold text-[#102C45] bg-slate-100 px-1.5 py-0.5 rounded">
                          {session.matterCode}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">{session.date}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              session.result === 'Aprovado'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {session.result}
                          </span>
                        </div>
                      </div>

                      <h4 className="text-xs font-bold text-slate-800 line-clamp-2 mb-1.5">
                        {session.matterTitle}
                      </h4>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-medium">
                          {session.theme}
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-emerald-700 font-bold">{simVotes} SIM</span>
                          <span>·</span>
                          <span className="text-rose-700 font-bold">{naoVotes} NÃO</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Roll-call detail of selected voting session */}
          <div className="lg:col-span-7 space-y-4">
            {inspectVoteSession ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                {/* Header info */}
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white bg-[#102C45] px-2.5 py-1 rounded-md">
                        {inspectVoteSession.matterCode}
                      </span>
                      <span className="text-slate-500 font-medium">{inspectVoteSession.sessionNumber}</span>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${
                        inspectVoteSession.result === 'Aprovado'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {inspectVoteSession.result}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {inspectVoteSession.matterTitle}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                    <span>Tema: <strong className="text-slate-700">{inspectVoteSession.theme}</strong></span>
                    <span>·</span>
                    <span>Quórum Exigido: <strong className="text-slate-700">{inspectVoteSession.quorumType}</strong></span>
                    <span>·</span>
                    <span>Data: <strong className="text-slate-700">{inspectVoteSession.date}</strong></span>
                  </div>
                </div>

                {/* Scorecards */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">SIM</span>
                    <span className="text-xl font-bold font-mono text-emerald-900">
                      {Object.values(inspectVoteSession.votes).filter((v) => v === 'sim').length}
                    </span>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-rose-700 block">NÃO</span>
                    <span className="text-xl font-bold font-mono text-rose-900">
                      {Object.values(inspectVoteSession.votes).filter((v) => v === 'nao').length}
                    </span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">ABSTENÇÃO</span>
                    <span className="text-xl font-bold font-mono text-amber-900">
                      {Object.values(inspectVoteSession.votes).filter((v) => v === 'abstencao').length}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-slate-600 block">AUSENTE</span>
                    <span className="text-xl font-bold font-mono text-slate-800">
                      {Object.values(inspectVoteSession.votes).filter((v) => v === 'ausente').length}
                    </span>
                  </div>
                </div>

                {/* Strategic note */}
                {inspectVoteSession.strategicNote && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-200/60 rounded-lg text-xs space-y-1">
                    <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      Análise Estratégica do Gabinete:
                    </span>
                    <p className="text-indigo-950/80 leading-relaxed">
                      {inspectVoteSession.strategicNote}
                    </p>
                  </div>
                )}

                {/* Detailed Roll Call Grid */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Votação Nominal · {registered} parlamentares cadastrados de {chamber.seats}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                    {parliamentarians.map((dep) => {
                      const vote = inspectVoteSession.votes[dep.id] || 'ausente';
                      let badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-slate-600">
                          <MinusCircle className="w-3 h-3 text-slate-400" /> AUS
                        </span>
                      );

                      if (vote === 'sim') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> SIM
                          </span>
                        );
                      } else if (vote === 'nao') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3 text-rose-600" /> NÃO
                          </span>
                        );
                      } else if (vote === 'abstencao') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> ABS
                          </span>
                        );
                      }

                      return (
                        <div
                          key={dep.id}
                          className="p-2 border border-slate-100 rounded-lg flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                        >
                          <div className="truncate mr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-400">#{dep.seatNumber}</span>
                              <span className="font-semibold text-slate-800 truncate">
                                {dep.popularName}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {dep.party} · Bloco {dep.bloc}
                            </span>
                          </div>
                          <div className="shrink-0">{badge}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                Selecione uma votação nominal à esquerda.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: INTELIGÊNCIA ESTRATÉGICA & TENDÊNCIA POR TEMA         */}
      {/* ============================================================ */}
      {activeTab === 'estrategia' && (
        <div className="space-y-4">
          {/* Theme Filter Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" />
                Matriz Estratégica de Tendência de Votos
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Descubra como os parlamentares e partidos se posicionam por tema para antecipar quóruns e desenhar alianças
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Selecione o Tema:</span>
              <select
                value={selectedThemeStrategy}
                onChange={(e) => setSelectedThemeStrategy(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
              >
                {themesList.map((thm) => (
                  <option key={thm} value={thm}>
                    {thm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Cohesion by Party */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Fidelidade da Bancada por Partido
                  </h4>
                  <p className="text-[11px] text-slate-500">Tema atual: {selectedThemeStrategy}</p>
                </div>
                <BarChart2 className="w-4 h-4 text-[#176B80]" />
              </div>

              <div className="space-y-3">
                {partyCohesion.map((item) => (
                  <div key={item.party} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-bold text-slate-800">{item.party}</span>
                        <span className="text-[10px] text-slate-500">({item.count} cadeiras)</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {item.avgAlignment}% de alinhamento
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.avgAlignment >= 85
                            ? 'bg-emerald-500'
                            : item.avgAlignment >= 65
                            ? 'bg-[#176B80]'
                            : item.avgAlignment >= 45
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${item.avgAlignment}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1">
                <span className="font-bold text-amber-900 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  Alerta Tático do Gabinete:
                </span>
                <p className="text-amber-950/80 leading-relaxed">
                  Para matérias de <strong>{selectedThemeStrategy}</strong>, o Bloco Independente (
                  {parliamentarians.filter((p) => p.bloc === 'Independente').length} cadeiras) é decisivo para atingir a maioria absoluta de{' '}
                  {chamber.quorum.absoluta} votos e a maioria qualificada de {chamber.quorum.doisTercos} votos (2/3) na {chamber.houseShort}.
                </p>
              </div>
            </div>

            {/* Right: Deputies Ranking by Theme Alignment */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Ranking Individual de Alinhamento — {selectedThemeStrategy}
                </h4>
                <span className="text-xs text-slate-400 font-mono">{registered} parlamentares</span>
              </div>

              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 text-xs">
                {strategicThemeData.map((dep, rank) => (
                  <div
                    key={dep.id}
                    onClick={() => {
                      setSelectedDeputy(dep);
                      setActiveTab('composicao');
                    }}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-50 rounded cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center font-mono font-bold text-slate-400">
                        {rank + 1}º
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{dep.popularName}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-100 text-slate-700">
                            {dep.party}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Base: {dep.electoralBase} · Bloco {dep.bloc}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-mono font-bold text-sm block leading-none">
                          {dep.effectiveScore}%
                        </span>
                        <span className="text-[9px] uppercase font-semibold text-slate-400">
                          {dep.effectiveScore >= 80
                            ? 'Aliado Fiel'
                            : dep.effectiveScore >= 60
                            ? 'Articulável'
                            : 'Oposição'}
                        </span>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: REGISTRAR NOVA VOTAÇÃO NOMINAL                      */}
      {/* ============================================================ */}
      {newVoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-[#102C45] text-white">
                  <Vote className="w-4 h-4 text-[#36B7A5]" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Registrar Nova Votação Nominal em Plenário</h3>
                  <p className="text-xs text-slate-500">
                    Cadastre o resultado da matéria e os votos individuais dos {registered} parlamentares cadastrados ({chamber.houseShort} · {chamber.seats} cadeiras)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setNewVoteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveVotingSessionSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Código / Número da Matéria *
                  </label>
                  <input
                    type="text"
                    required
                    value={newVoteForm.matterCode}
                    onChange={(e) => setNewVoteForm({ ...newVoteForm, matterCode: e.target.value })}
                    placeholder="Ex: PL 312/2026 ou PEC 08/2026"
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tema / Assunto Principal *
                  </label>
                  <select
                    value={newVoteForm.theme}
                    onChange={(e) =>
                      setNewVoteForm({ ...newVoteForm, theme: e.target.value as VotingSession['theme'] })
                    }
                    className="w-full text-xs border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Saúde">Saúde</option>
                    <option value="Infraestrutura">Infraestrutura</option>
                    <option value="Agricultura & Meio Ambiente">Agricultura & Meio Ambiente</option>
                    <option value="Educação">Educação</option>
                    <option value="Tributário & Orçamento">Tributário & Orçamento</option>
                    <option value="Segurança Pública">Segurança Pública</option>
                    <option value="Servidores Públicos">Servidores Públicos</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Quórum Exigido
                  </label>
                  <select
                    value={newVoteForm.quorumType}
                    onChange={(e) =>
                      setNewVoteForm({
                        ...newVoteForm,
                        quorumType: e.target.value as VotingSession['quorumType'],
                      })
                    }
                    className="w-full text-xs border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Maioria Simples">Maioria Simples (maioria dos presentes · quórum {chamber.quorum.absoluta})</option>
                    <option value="Maioria Absoluta">Maioria Absoluta ({chamber.quorum.absoluta} votos)</option>
                    <option value="Três Quintos (3/5)">Três Quintos ({chamber.quorum.tresQuintos} votos)</option>
                    <option value="Dois Terços (2/3)">Dois Terços ({chamber.quorum.doisTercos} votos)</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Título / Ementa Resumida da Proposição *
                  </label>
                  <input
                    type="text"
                    required
                    value={newVoteForm.matterTitle}
                    onChange={(e) => setNewVoteForm({ ...newVoteForm, matterTitle: e.target.value })}
                    placeholder="Ex: Institui o Fundo Estadual para o Fortalecimento da Agricultura Familiar"
                    className="w-full text-xs border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              {/* Quick Batch Voting Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Marcação Rápida em Bloco:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBatchVoteAll('sim')}
                      className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold"
                    >
                      Todos SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchVoteByBloc('Governo', 'sim')}
                      className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold"
                    >
                      Base Governo SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchVoteByBloc('Oposição', 'nao')}
                      className="px-2 py-0.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 font-semibold"
                    >
                      Oposição NÃO
                    </button>
                  </div>
                </div>
              </div>

              {/* Roll Call Deputy Voting Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Voto Nominal ({registered} parlamentares):
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-600">
                    SIM:{' '}
                    <span className="text-emerald-700">
                      {Object.values(newVoteForm.votes).filter((v) => v === 'sim').length}
                    </span>{' '}
                    | NÃO:{' '}
                    <span className="text-rose-700">
                      {Object.values(newVoteForm.votes).filter((v) => v === 'nao').length}
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1 border border-slate-200 rounded-lg">
                  {parliamentarians.map((dep) => {
                    const currentVote = newVoteForm.votes[dep.id] || 'ausente';

                    return (
                      <div
                        key={dep.id}
                        className="p-2 border border-slate-200 rounded-lg text-xs space-y-1.5 bg-white"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 truncate max-w-[140px]">
                            {dep.popularName}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">#{dep.seatNumber}</span>
                        </div>

                        <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => handleVoteToggle(dep.id, 'sim')}
                            className={`py-1 rounded text-center transition-colors ${
                              currentVote === 'sim'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            SIM
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoteToggle(dep.id, 'nao')}
                            className={`py-1 rounded text-center transition-colors ${
                              currentVote === 'nao'
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            NÃO
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoteToggle(dep.id, 'abstencao')}
                            className={`py-1 rounded text-center transition-colors ${
                              currentVote === 'abstencao'
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            ABS
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoteToggle(dep.id, 'ausente')}
                            className={`py-1 rounded text-center transition-colors ${
                              currentVote === 'ausente'
                                ? 'bg-slate-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            AUS
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strategic note */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nota Estratégica / Justificativa Política
                </label>
                <textarea
                  rows={2}
                  value={newVoteForm.strategicNote}
                  onChange={(e) => setNewVoteForm({ ...newVoteForm, strategicNote: e.target.value })}
                  placeholder="Ex: Matéria articulada com o líder do governo; MDB fechou questão a favor da proposta."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewVoteModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg shadow-xs"
                >
                  Salvar e Registrar Votação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: CADASTRAR NOVO PARLAMENTAR                          */}
      {/* ============================================================ */}
      {newDeputyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-[#176B80]" />
                Cadastrar Novo Parlamentar
              </h3>
              <button onClick={() => setNewDeputyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const seat = parseInt((form.elements.namedItem('seatNumber') as HTMLInputElement).value, 10);
                const err = seatError(seat);
                if (err) {
                  dialog.alert({ title: 'Cadeira inválida', message: err, tone: 'warning' });
                  return;
                }
                const newDep: Parliamentarian = {
                  id: `dep-${Date.now()}`,
                  uf: chamber.groupsByUf ? (form.elements.namedItem('uf') as HTMLSelectElement).value : undefined,
                  name: (form.elements.namedItem('fullName') as HTMLInputElement).value,
                  popularName: (form.elements.namedItem('popularName') as HTMLInputElement).value,
                  party: (form.elements.namedItem('party') as HTMLInputElement).value,
                  partyColor: '#102C45',
                  bloc: (form.elements.namedItem('bloc') as HTMLSelectElement).value as any,
                  seatNumber: parseInt((form.elements.namedItem('seatNumber') as HTMLInputElement).value, 10),
                  electoralBase: (form.elements.namedItem('base') as HTMLInputElement).value,
                  role: (form.elements.namedItem('role') as HTMLInputElement).value,
                  avatar: (form.elements.namedItem('popularName') as HTMLInputElement).value.slice(0, 2).toUpperCase(),
                  alignmentScore: 75,
                };
                onAddParliamentarian(newDep);
                setSelectedDeputy(newDep);
                setNewDeputyModalOpen(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nome Completo *</label>
                <input
                  name="fullName"
                  required
                  placeholder="Ex: Carlos Eduardo de Oliveira"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nome Parlamentar (Urna) *</label>
                  <input
                    name="popularName"
                    required
                    placeholder={chamber.sphere === 'municipal' ? 'Ex: Ver. Carlos Oliveira' : 'Ex: Dep. Carlos Oliveira'}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Partido *</label>
                  <input
                    name="party"
                    required
                    placeholder="Ex: União Brasil, PL, MDB"
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Bloco Político</label>
                  <select name="bloc" className="w-full border border-slate-300 rounded-lg p-2">
                    <option value="Governo">Base Governo</option>
                    <option value="Independente">Independente</option>
                    <option value="Oposição">Oposição</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Cadeira no Plenário (1 a {chamber.seats})</label>
                  <input
                    name="seatNumber"
                    type="number"
                    min="1"
                    max={chamber.seats}
                    defaultValue={newSeatDefault ?? firstFreeSeat()}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className={chamber.groupsByUf ? 'grid grid-cols-3 gap-2' : ''}>
                {chamber.groupsByUf && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">UF (bancada)</label>
                    <select name="uf" defaultValue={chamber.uf} className="w-full border border-slate-300 rounded-lg p-2">
                      {UFS.map((u) => (
                        <option key={u.uf} value={u.uf}>
                          {u.uf}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={chamber.groupsByUf ? 'col-span-2' : ''}>
                  <label className="font-semibold text-slate-700 block mb-1">{chamber.electoralBaseLabel}</label>
                  <input
                    name="base"
                    placeholder={chamber.sphere === 'municipal' ? 'Ex: Centro, CPA, Coxipó' : 'Ex: Sinop, Rondonópolis, Cuiabá'}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Função / Comissão</label>
                <input
                  name="role"
                  placeholder="Ex: Membro da CCJR ou Vice-Presidente de Saúde"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewDeputyModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg shadow-xs"
                >
                  Salvar Parlamentar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: EDITAR PARLAMENTAR SELECIONADO                     */}
      {/* ============================================================ */}
      {editModalOpen && selectedDeputy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#176B80]" />
                Editar Dados do Parlamentar
              </h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const seat = parseInt((form.elements.namedItem('seatNumber') as HTMLInputElement).value, 10);
                const err = seatError(seat, selectedDeputy.id);
                if (err) {
                  dialog.alert({ title: 'Cadeira inválida', message: err, tone: 'warning' });
                  return;
                }
                const updated: Parliamentarian = {
                  ...selectedDeputy,
                  ...(chamber.groupsByUf ? { uf: (form.elements.namedItem('uf') as HTMLSelectElement).value } : {}),
                  popularName: (form.elements.namedItem('popularName') as HTMLInputElement).value,
                  party: (form.elements.namedItem('party') as HTMLInputElement).value,
                  bloc: (form.elements.namedItem('bloc') as HTMLSelectElement).value as any,
                  seatNumber: parseInt((form.elements.namedItem('seatNumber') as HTMLInputElement).value, 10),
                  electoralBase: (form.elements.namedItem('base') as HTMLInputElement).value,
                  role: (form.elements.namedItem('role') as HTMLInputElement).value,
                  phone: (form.elements.namedItem('phone') as HTMLInputElement).value,
                  email: (form.elements.namedItem('email') as HTMLInputElement).value,
                };
                onUpdateParliamentarian(updated);
                setSelectedDeputy(updated);
                setEditModalOpen(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nome Parlamentar</label>
                <input
                  name="popularName"
                  defaultValue={selectedDeputy.popularName}
                  required
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Partido</label>
                  <input
                    name="party"
                    defaultValue={selectedDeputy.party}
                    required
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Bloco Político</label>
                  <select
                    name="bloc"
                    defaultValue={selectedDeputy.bloc}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Governo">Base Governo</option>
                    <option value="Independente">Independente</option>
                    <option value="Oposição">Oposição</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Cadeira no Plenário (1 a {chamber.seats})</label>
                  <input
                    name="seatNumber"
                    type="number"
                    min="1"
                    max={chamber.seats}
                    defaultValue={selectedDeputy.seatNumber}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                {chamber.groupsByUf && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">UF (bancada)</label>
                    <select name="uf" defaultValue={selectedDeputy.uf ?? chamber.uf} className="w-full border border-slate-300 rounded-lg p-2">
                      {UFS.map((u) => (
                        <option key={u.uf} value={u.uf}>
                          {u.uf}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">{chamber.electoralBaseLabel}</label>
                  <input
                    name="base"
                    defaultValue={selectedDeputy.electoralBase}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cargo / Comissões</label>
                <input
                  name="role"
                  defaultValue={selectedDeputy.role}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Telefone do Gabinete</label>
                  <input
                    name="phone"
                    defaultValue={selectedDeputy.phone}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">E-mail Institucional</label>
                  <input
                    name="email"
                    defaultValue={selectedDeputy.email}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg shadow-xs"
                >
                  Atualizar Dados
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
