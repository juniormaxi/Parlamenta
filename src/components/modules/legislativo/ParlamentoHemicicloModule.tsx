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
import { DemoNoticeBanner } from '../../common/DemoNoticeBanner';

interface ParlamentoHemicicloModuleProps {
  parliamentarians: Parliamentarian[];
  votingSessions: VotingSession[];
  onAddParliamentarian: (p: Parliamentarian) => void;
  onUpdateParliamentarian: (p: Parliamentarian) => void;
  onSaveVotingSession: (session: VotingSession) => void;
}

type ChamberViewMode = 'partidos' | 'blocos' | 'alinhamento' | 'votacao';

export const ParlamentoHemicicloModule: React.FC<ParlamentoHemicicloModuleProps> = ({
  parliamentarians,
  votingSessions,
  onAddParliamentarian,
  onUpdateParliamentarian,
  onSaveVotingSession,
}) => {
  const [activeTab, setActiveTab] = useState<'composicao' | 'votacoes' | 'estrategia'>('composicao');
  const [selectedDeputy, setSelectedDeputy] = useState<Parliamentarian | null>(parliamentarians[0] || null);
  const [filterBloc, setFilterBloc] = useState<string>('todos');
  const [filterParty, setFilterParty] = useState<string>('todos');
  const [searchDeputy, setSearchDeputy] = useState<string>('');
  const [chamberViewMode, setChamberViewMode] = useState<ChamberViewMode>('partidos');

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newDeputyModalOpen, setNewDeputyModalOpen] = useState(false);
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
      const matchSearch =
        dep.name.toLowerCase().includes(searchDeputy.toLowerCase()) ||
        dep.popularName.toLowerCase().includes(searchDeputy.toLowerCase()) ||
        dep.electoralBase.toLowerCase().includes(searchDeputy.toLowerCase()) ||
        dep.party.toLowerCase().includes(searchDeputy.toLowerCase());
      return matchBloc && matchParty && matchSearch;
    });
  }, [parliamentarians, filterBloc, filterParty, searchDeputy]);

  // Executive Layout coordinates for 24 seats in 3 concentric rows
  // Center is (380, 310) in a 760 x 440 viewport
  // Row 1 (inner tier): radius 125, 6 seats (span 150 deg, 195 to 345)
  // Row 2 (middle tier): radius 190, 8 seats (span 160 deg, 190 to 350)
  // Row 3 (outer tier): radius 255, 10 seats (span 168 deg, 186 to 354)
  const seatCoordinates = useMemo(() => {
    const coords: Record<number, { x: number; y: number; angle: number; row: number }> = {};
    const centerX = 380;
    const centerY = 310;

    // Row 1 (inner): radius 125, 6 seats
    const r1 = 125;
    const n1 = 6;
    for (let i = 0; i < n1; i++) {
      const seatNum = i + 1;
      const angleDeg = 195 + (i * (150 / (n1 - 1)));
      const angleRad = (angleDeg * Math.PI) / 180;
      coords[seatNum] = {
        x: Math.round(centerX + r1 * Math.cos(angleRad)),
        y: Math.round(centerY + r1 * Math.sin(angleRad)),
        angle: angleDeg,
        row: 1,
      };
    }

    // Row 2 (middle): radius 190, 8 seats
    const r2 = 190;
    const n2 = 8;
    for (let i = 0; i < n2; i++) {
      const seatNum = 7 + i;
      const angleDeg = 190 + (i * (160 / (n2 - 1)));
      const angleRad = (angleDeg * Math.PI) / 180;
      coords[seatNum] = {
        x: Math.round(centerX + r2 * Math.cos(angleRad)),
        y: Math.round(centerY + r2 * Math.sin(angleRad)),
        angle: angleDeg,
        row: 2,
      };
    }

    // Row 3 (outer): radius 255, 10 seats
    const r3 = 255;
    const n3 = 10;
    for (let i = 0; i < n3; i++) {
      const seatNum = 15 + i;
      const angleDeg = 186 + (i * (168 / (n3 - 1)));
      const angleRad = (angleDeg * Math.PI) / 180;
      coords[seatNum] = {
        x: Math.round(centerX + r3 * Math.cos(angleRad)),
        y: Math.round(centerY + r3 * Math.sin(angleRad)),
        angle: angleDeg,
        row: 3,
      };
    }

    return coords;
  }, []);

  // Map deputy to their seat
  const seatToDeputyMap = useMemo(() => {
    const map = new Map<number, Parliamentarian>();
    parliamentarians.forEach((dep) => {
      map.set(dep.seatNumber, dep);
    });
    return map;
  }, [parliamentarians]);

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
      alert('Preencha o número e o título da matéria.');
      return;
    }

    const simCount = Object.values(newVoteForm.votes).filter((v) => v === 'sim').length;
    const isApproved = simCount >= 13;

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
      summary: `Votação concluída com ${simCount} votos favoráveis. Matéria ${isApproved ? 'aprovada' : 'rejeitada'}.`,
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
          color: dep.partyColor || '#102C45',
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
  }, [parliamentarians, selectedThemeStrategy]);

  // Helper for seat visual styles based on chamberViewMode
  const getSeatVisuals = (deputy: Parliamentarian | undefined) => {
    if (!deputy) {
      return {
        bg: '#F1F5F9',
        border: '#CBD5E1',
        text: '#94A3B8',
        tag: 'Vaga',
        glow: 'none',
        voteIcon: null,
      };
    }

    const isMandate = deputy.id === 'dep-01';

    if (chamberViewMode === 'partidos') {
      const pColor = deputy.partyColor || '#102C45';
      return {
        bg: isMandate ? '#102C45' : '#FFFFFF',
        border: pColor,
        text: isMandate ? '#FFFFFF' : '#0F172A',
        tag: deputy.party,
        glow: isMandate ? '#36B7A5' : pColor,
        voteIcon: null,
      };
    }

    if (chamberViewMode === 'blocos') {
      let bColor = '#10B981';
      if (deputy.bloc === 'Oposição') bColor = '#EF4444';
      else if (deputy.bloc === 'Independente') bColor = '#F59E0B';

      return {
        bg: isMandate ? '#102C45' : '#FFFFFF',
        border: bColor,
        text: isMandate ? '#FFFFFF' : '#0F172A',
        tag: deputy.bloc,
        glow: bColor,
        voteIcon: null,
      };
    }

    if (chamberViewMode === 'alinhamento') {
      const score = deputy.alignmentScore;
      let aColor = '#10B981';
      if (score < 50) aColor = '#EF4444';
      else if (score < 75) aColor = '#F59E0B';
      else if (score < 90) aColor = '#0EA5E9';

      return {
        bg: isMandate ? '#102C45' : '#FFFFFF',
        border: aColor,
        text: isMandate ? '#FFFFFF' : '#0F172A',
        tag: `${score}%`,
        glow: aColor,
        voteIcon: null,
      };
    }

    // chamberViewMode === 'votacao'
    const vote = inspectVoteSession?.votes[deputy.id] || 'ausente';
    if (vote === 'sim') {
      return {
        bg: '#ECFDF5',
        border: '#10B981',
        text: '#065F46',
        tag: 'SIM',
        glow: '#10B981',
        voteIcon: 'sim',
      };
    }
    if (vote === 'nao') {
      return {
        bg: '#FEF2F2',
        border: '#EF4444',
        text: '#991B1B',
        tag: 'NÃO',
        glow: '#EF4444',
        voteIcon: 'nao',
      };
    }
    if (vote === 'abstencao') {
      return {
        bg: '#FFFBEB',
        border: '#F59E0B',
        text: '#92400E',
        tag: 'ABS',
        glow: '#F59E0B',
        voteIcon: 'abs',
      };
    }
    return {
      bg: '#F8FAFC',
      border: '#94A3B8',
      text: '#475569',
      tag: 'AUS',
      glow: '#94A3B8',
      voteIcon: 'aus',
    };
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Composição do Plenário & Inteligência Parlamentar (ALMT)"
        contextText="Visualização da Composição do Plenário de 24 cadeiras da Assembleia Legislativa de Mato Grosso, gestão de bancadas e registro de votações nominais para traçar estratégias políticas."
      />

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
                  24 Cadeiras Titulares
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Ocupação das cadeiras por bancada, monitoramento nominal de votações e cálculo de fidelidade por tema
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
            onClick={() => setNewDeputyModalOpen(true)}
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
            {/* Plenary Chamber Card */}
            <div className="bg-gradient-to-b from-[#0F2942] to-[#102C45] border border-slate-800 rounded-2xl shadow-xl overflow-hidden relative text-white">
              {/* Plenary Top Info Bar & Electronic Header */}
              <div className="px-5 py-3.5 bg-black/30 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                  <div>
                    <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-400 font-mono flex items-center gap-2">
                      Plenário das Deliberações Renê Barbour · ALMT
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      Assembleia Legislativa do Estado de Mato Grosso · 20ª Legislatura
                    </p>
                  </div>
                </div>

                {/* Quorum Summary Pill */}
                <div className="flex items-center gap-2 font-mono text-[11px] bg-white/10 px-3 py-1 rounded-lg border border-white/10 self-start sm:self-auto">
                  <span className="text-slate-300">Presentes: <strong className="text-white">24/24</strong></span>
                  <span className="text-white/30">|</span>
                  <span className="text-slate-300">M. Simples: <strong className="text-amber-300">13</strong></span>
                  <span className="text-white/30">|</span>
                  <span className="text-slate-300">2/3: <strong className="text-emerald-300">16</strong></span>
                </div>
              </div>

              {/* View Mode Switcher Toolbar */}
              <div className="px-5 py-2.5 bg-white/5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-300 mr-1 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-[#36B7A5]" /> Modo de Visualização:
                  </span>
                  <div className="inline-flex rounded-lg bg-black/30 p-0.5 border border-white/10">
                    <button
                      onClick={() => setChamberViewMode('partidos')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        chamberViewMode === 'partidos'
                          ? 'bg-[#176B80] text-white shadow-xs font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Bancadas & Partidos
                    </button>
                    <button
                      onClick={() => setChamberViewMode('blocos')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        chamberViewMode === 'blocos'
                          ? 'bg-[#176B80] text-white shadow-xs font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Blocos Políticos
                    </button>
                    <button
                      onClick={() => setChamberViewMode('alinhamento')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        chamberViewMode === 'alinhamento'
                          ? 'bg-[#176B80] text-white shadow-xs font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Fidelidade ao Mandato
                    </button>
                    <button
                      onClick={() => setChamberViewMode('votacao')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        chamberViewMode === 'votacao'
                          ? 'bg-emerald-600 text-white shadow-xs font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Placar da Sessão ({inspectVoteSession?.matterCode || 'PL'})
                    </button>
                  </div>
                </div>

                {/* Quick Legend for Current Mode */}
                <div className="flex items-center gap-3 text-[11px] text-slate-300">
                  {chamberViewMode === 'partidos' && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#102C45] border border-white/40"></span> União (6)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1D4ED8]"></span> PL (4)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#059669]"></span> MDB (4)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#D97706]"></span> PSB (3)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#DC2626]"></span> PT (2)</span>
                    </div>
                  )}

                  {chamberViewMode === 'blocos' && (
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Base Governo (17)</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Independente (5)</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Oposição (2)</span>
                    </div>
                  )}

                  {chamberViewMode === 'alinhamento' && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> ≥80% Fiel</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400"></span> 60-79%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> 40-59%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> &lt;40% Oposição</span>
                    </div>
                  )}

                  {chamberViewMode === 'votacao' && inspectVoteSession && (
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-emerald-400 font-bold">
                        SIM: {Object.values(inspectVoteSession.votes).filter((v) => v === 'sim').length}
                      </span>
                      <span>·</span>
                      <span className="text-rose-400 font-bold">
                        NÃO: {Object.values(inspectVoteSession.votes).filter((v) => v === 'nao').length}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Main SVG Plenary Graphic */}
              <div className="relative py-4 px-2 flex flex-col items-center justify-center select-none overflow-x-auto">
                <svg
                  viewBox="0 0 760 440"
                  className="w-full max-w-[760px] select-none filter drop-shadow-md"
                  style={{ maxHeight: '420px' }}
                >
                  <defs>
                    {/* Chamber Wood Rostrum Gradient */}
                    <linearGradient id="rostrumWood" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2E1B0E" />
                      <stop offset="50%" stopColor="#4A2F1B" />
                      <stop offset="100%" stopColor="#1E1107" />
                    </linearGradient>

                    {/* Floor Carpet Radial Inlay */}
                    <radialGradient id="carpetFloor" cx="50%" cy="75%" r="75%">
                      <stop offset="0%" stopColor="#174163" stopOpacity="0.45" />
                      <stop offset="60%" stopColor="#0B1C2D" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#081420" stopOpacity="1" />
                    </radialGradient>

                    {/* Golden Mandate Glow Filter */}
                    <filter id="mandateGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Chamber Floor Backdrop */}
                  <rect x="0" y="0" width="760" height="440" rx="16" fill="url(#carpetFloor)" />

                  {/* Concentric Tier Carpeting Arcs (Floor Inlays) */}
                  <path
                    d="M 125 310 A 255 255 0 0 1 635 310"
                    fill="none"
                    stroke="#1E476B"
                    strokeWidth="48"
                    strokeOpacity="0.3"
                  />
                  <path
                    d="M 190 310 A 190 190 0 0 1 570 310"
                    fill="none"
                    stroke="#1E476B"
                    strokeWidth="44"
                    strokeOpacity="0.4"
                  />
                  <path
                    d="M 255 310 A 125 125 0 0 1 505 310"
                    fill="none"
                    stroke="#1E476B"
                    strokeWidth="40"
                    strokeOpacity="0.45"
                  />

                  {/* Decorative Radial Aisles (Corredores de Circulação) */}
                  <line x1="380" y1="310" x2="380" y2="40" stroke="#38BDF8" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                  <line x1="380" y1="310" x2="160" y2="120" stroke="#38BDF8" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />
                  <line x1="380" y1="310" x2="600" y2="120" stroke="#38BDF8" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />

                  {/* Sector Labels */}
                  <text x="210" y="45" fill="#94A3B8" fontSize="10" fontWeight="bold" letterSpacing="1" opacity="0.6">
                    ALA ESQUERDA
                  </text>
                  <text x="380" y="32" textAnchor="middle" fill="#38BDF8" fontSize="10" fontWeight="bold" letterSpacing="1" opacity="0.8">
                    CORREDOR CENTRAL
                  </text>
                  <text x="550" y="45" fill="#94A3B8" fontSize="10" fontWeight="bold" letterSpacing="1" opacity="0.6">
                    ALA DIREITA
                  </text>

                  {/* ========================================== */}
                  {/* MESA DIRETORA (ROSTRUM ELEVADO)            */}
                  {/* ========================================== */}
                  <g transform="translate(380, 345)">
                    {/* Shadow / Base */}
                    <rect x="-140" y="-12" width="280" height="60" rx="8" fill="#050B12" opacity="0.6" />

                    {/* Main Wood Podium */}
                    <rect
                      x="-135"
                      y="-15"
                      width="270"
                      height="56"
                      rx="8"
                      fill="url(#rostrumWood)"
                      stroke="#854D0E"
                      strokeWidth="1.5"
                    />

                    {/* Metallic Gold Accent Trim */}
                    <rect x="-125" y="-10" width="250" height="2" fill="#FACC15" opacity="0.7" />

                    {/* Coat of Arms ALMT Badge */}
                    <circle cx="0" cy="12" r="14" fill="#102C45" stroke="#FACC15" strokeWidth="1.5" />
                    <text x="0" y="15" textAnchor="middle" fill="#FACC15" fontSize="8" fontWeight="bold" fontFamily="monospace">
                      ALMT
                    </text>

                    {/* Presidency Seats on Rostrum */}
                    {/* 1º Secretário (Left) */}
                    <g transform="translate(-70, 10)">
                      <rect x="-24" y="-12" width="48" height="24" rx="4" fill="#102C45" stroke="#38BDF8" strokeWidth="1" />
                      <text x="0" y="3" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">
                        1ª SEC.
                      </text>
                    </g>

                    {/* Presidente da ALMT (Center) */}
                    <g transform="translate(0, -28)">
                      <rect x="-35" y="-12" width="70" height="24" rx="4" fill="#102C45" stroke="#FACC15" strokeWidth="1.5" />
                      <text x="0" y="3" textAnchor="middle" fill="#FACC15" fontSize="9" fontWeight="bold">
                        PRESIDENTE
                      </text>
                      {/* Microphone */}
                      <circle cx="0" cy="-14" r="2.5" fill="#EF4444" />
                      <line x1="0" y1="-12" x2="0" y2="-6" stroke="#94A3B8" strokeWidth="1" />
                    </g>

                    {/* 2º Secretário (Right) */}
                    <g transform="translate(70, 10)">
                      <rect x="-24" y="-12" width="48" height="24" rx="4" fill="#102C45" stroke="#38BDF8" strokeWidth="1" />
                      <text x="0" y="3" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">
                        2ª SEC.
                      </text>
                    </g>

                    <text x="0" y="36" textAnchor="middle" fill="#CBD5E1" fontSize="9" fontWeight="bold" letterSpacing="0.5">
                      MESA DIRETORA · PRESIDÊNCIA DA ASSEMBLEIA
                    </text>
                  </g>

                  {/* Tribuna dos Oradores (Speaker Podium on Right) */}
                  <g transform="translate(640, 340)">
                    <rect x="-25" y="-15" width="50" height="32" rx="4" fill="url(#rostrumWood)" stroke="#854D0E" strokeWidth="1" />
                    <text x="0" y="4" textAnchor="middle" fill="#F1F5F9" fontSize="8" fontWeight="bold">
                      TRIBUNA
                    </text>
                    <line x1="0" y1="-15" x2="0" y2="-22" stroke="#CBD5E1" strokeWidth="1.5" />
                    <circle cx="0" cy="-24" r="2.5" fill="#10B981" />
                  </g>

                  {/* ========================================== */}
                  {/* RENDER 24 PARLIAMENTARY SEAT DESKS        */}
                  {/* ========================================== */}
                  {Array.from({ length: 24 }).map((_, idx) => {
                    const seatNum = idx + 1;
                    const coord = seatCoordinates[seatNum];
                    if (!coord) return null;
                    const deputy = seatToDeputyMap.get(seatNum);
                    const isSelected = selectedDeputy?.seatNumber === seatNum;
                    const isMandate = deputy?.id === 'dep-01';
                    const visuals = getSeatVisuals(deputy);

                    return (
                      <g
                        key={seatNum}
                        onClick={() => deputy && setSelectedDeputy(deputy)}
                        className="cursor-pointer transition-transform duration-200 group"
                        transform={`translate(${coord.x}, ${coord.y})`}
                      >
                        {/* Outer Selection Pulse Ring */}
                        {isSelected && (
                          <rect
                            x="-26"
                            y="-24"
                            width="52"
                            height="48"
                            rx="12"
                            fill="none"
                            stroke="#36B7A5"
                            strokeWidth="3"
                            className="animate-pulse"
                          />
                        )}

                        {/* Mandate Golden Halo */}
                        {isMandate && (
                          <rect
                            x="-25"
                            y="-23"
                            width="50"
                            height="46"
                            rx="11"
                            fill="none"
                            stroke="#F59E0B"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                            filter="url(#mandateGlow)"
                          />
                        )}

                        {/* Desk Contour (Rounded Console) */}
                        <rect
                          x="-22"
                          y="-20"
                          width="44"
                          height="40"
                          rx="8"
                          fill={visuals.bg}
                          stroke={visuals.border}
                          strokeWidth={isSelected ? '2.5' : '1.8'}
                          className="drop-shadow-sm group-hover:scale-105 transition-all"
                        />

                        {/* Deputy Initials / Avatar Monogram */}
                        <text
                          x="0"
                          y="-3"
                          textAnchor="middle"
                          fill={visuals.text}
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          {deputy?.avatar || `#${seatNum}`}
                        </text>

                        {/* Bottom Tag Badge (Party / Bloc / Vote) */}
                        <rect
                          x="-18"
                          y="6"
                          width="36"
                          height="11"
                          rx="3"
                          fill={isMandate ? '#36B7A5' : visuals.border}
                        />
                        <text
                          x="0"
                          y="14.5"
                          textAnchor="middle"
                          fill={isMandate ? '#102C45' : '#FFFFFF'}
                          fontSize="7.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {visuals.tag}
                        </text>

                        {/* Seat Number Top Pin */}
                        <circle
                          cx="16"
                          cy="-16"
                          r="7"
                          fill="#0F2942"
                          stroke="#FFFFFF"
                          strokeWidth="1"
                        />
                        <text
                          x="16"
                          y="-13.5"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="7.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {seatNum}
                        </text>

                        {/* Mandate Crown/Star Icon */}
                        {isMandate && (
                          <circle cx="-16" cy="-16" r="6" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1" />
                        )}

                        {/* Tooltip for hover */}
                        <title>
                          {deputy
                            ? `Cadeira #${seatNum}: ${deputy.popularName}\nPartido: ${deputy.party} · Bloco: ${deputy.bloc}\nAlinhamento Mandato: ${deputy.alignmentScore}%\nBase: ${deputy.electoralBase}`
                            : `Cadeira #${seatNum} (Disponível)`}
                        </title>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Plenary Bottom Footer Bar */}
              <div className="px-5 py-2.5 bg-black/40 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Filtrar bancada:</span>
                  <select
                    value={filterBloc}
                    onChange={(e) => setFilterBloc(e.target.value)}
                    className="px-2 py-0.5 bg-white/10 border border-white/20 rounded text-[11px] text-white focus:outline-none"
                  >
                    <option value="todos" className="bg-[#102C45] text-white">Todos os Blocos</option>
                    <option value="Governo" className="bg-[#102C45] text-white">Base Governo</option>
                    <option value="Independente" className="bg-[#102C45] text-white">Independentes</option>
                    <option value="Oposição" className="bg-[#102C45] text-white">Oposição</option>
                  </select>

                  <select
                    value={filterParty}
                    onChange={(e) => setFilterParty(e.target.value)}
                    className="px-2 py-0.5 bg-white/10 border border-white/20 rounded text-[11px] text-white focus:outline-none"
                  >
                    <option value="todos" className="bg-[#102C45] text-white">Todos os Partidos</option>
                    {uniqueParties.map((pty) => (
                      <option key={pty} value={pty} className="bg-[#102C45] text-white">
                        {pty}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    ★ Seu Mandato: Cadeira #01
                  </span>
                  <span>·</span>
                  <span>24 Deputados Estaduais</span>
                </div>
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
                        borderColor: selectedDeputy.id === 'dep-01' ? '#36B7A5' : selectedDeputy.partyColor || '#CBD5E1',
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
                        style={{ backgroundColor: selectedDeputy.partyColor || '#102C45' }}
                      />
                      {selectedDeputy.party}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Base Regional
                    </span>
                    <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                      {selectedDeputy.electoralBase}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Função na Assembleia
                    </span>
                    <span className="font-medium text-slate-700 mt-0.5 block">
                      {selectedDeputy.role || 'Deputado Estadual Titular'}
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
                <p className="text-xs">Selecione uma cadeira no plenário para inspecionar o parlamentar.</p>
              </div>
            )}

            {/* Quick List of Parliamentarians */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-800">
                  Deputados no Plenário ({filteredDeputies.length})
                </h4>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar deputado..."
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
                      <span className="font-mono text-[10px] w-5 text-slate-400 font-bold">
                        #{dep.seatNumber}
                      </span>
                      <span className="truncate">{dep.popularName}</span>
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

                {/* Detailed Roll Call Grid of 24 Deputies */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Votação Nominal dos 24 Parlamentares
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
                Descubra como os deputados e partidos se posicionam por tema para antecipar quóruns e desenhar alianças
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
                  Para matérias de <strong>{selectedThemeStrategy}</strong>, a bancada do MDB (4 deputados) e o Bloco Independente são decisivos para atingir a maioria qualificada de 16 votos (2/3).
                </p>
              </div>
            </div>

            {/* Right: Deputies Ranking by Theme Alignment */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Ranking Individual de Alinhamento — {selectedThemeStrategy}
                </h4>
                <span className="text-xs text-slate-400 font-mono">24 parlamentares</span>
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
                    Cadastre o resultado da matéria e os votos individuais dos 24 parlamentares
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
                    <option value="Maioria Simples">Maioria Simples (13 votos)</option>
                    <option value="Maioria Absoluta">Maioria Absoluta (13 votos)</option>
                    <option value="Dois Terços (2/3)">Dois Terços (16 votos)</option>
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
                    Voto Nominal dos 24 Parlamentares:
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
                const newDep: Parliamentarian = {
                  id: `dep-${Date.now()}`,
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
                    placeholder="Ex: Dep. Carlos Oliveira"
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
                  <label className="font-semibold text-slate-700 block mb-1">Cadeira no Plenário (1 a 24)</label>
                  <input
                    name="seatNumber"
                    type="number"
                    min="1"
                    max="24"
                    defaultValue="1"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Base Eleitoral Principal</label>
                <input
                  name="base"
                  placeholder="Ex: Sinop, Rondonópolis, Cuiabá"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
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
                const updated: Parliamentarian = {
                  ...selectedDeputy,
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
                  <label className="font-semibold text-slate-700 block mb-1">Cadeira no Plenário</label>
                  <input
                    name="seatNumber"
                    type="number"
                    min="1"
                    max="24"
                    defaultValue={selectedDeputy.seatNumber}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Base Eleitoral</label>
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
