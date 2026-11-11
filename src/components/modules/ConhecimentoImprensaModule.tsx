import React, { useState } from 'react';
import {
  Newspaper,
  Sparkles,
  Search,
  Plus,
  Send,
  CheckCircle2,
  Share2,
  ExternalLink,
  BookOpen,
  Check,
  X,
  FileCheck,
} from 'lucide-react';
import { PressRelease } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';

interface ConhecimentoImprensaModuleProps {
  releases: PressRelease[];
  onUpdateRelease: (updated: PressRelease) => void;
  onCreateRelease: (newRel: Omit<PressRelease, 'id'>) => void;
}

export const ConhecimentoImprensaModule: React.FC<ConhecimentoImprensaModuleProps> = ({
  releases,
  onUpdateRelease,
  onCreateRelease,
}) => {
  const [selectedRelease, setSelectedRelease] = useState<PressRelease>(releases[0]);
  const [activeTab, setActiveTab] = useState<'releases' | 'clipping'>('releases');
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [newReleaseModalOpen, setNewReleaseModalOpen] = useState(false);

  // New form
  const [form, setForm] = useState({
    title: '',
    summary: '',
    body: '',
    tags: 'Saúde, MT, Assembleia',
  });

  const handleAiTonePolish = () => {
    if (!selectedRelease) return;
    setAiEnhancing(true);
    setAiNote('');
    setTimeout(() => {
      const polished: PressRelease = {
        ...selectedRelease,
        aiAssisted: true,
        summary: `[Polido com IA Assistiva]: ${selectedRelease.summary}`,
        body: `${selectedRelease.body}\n\n*Nota da Assessoria de Imprensa: A presente matéria foi revisada com apoio de IA assistiva para estrita observância do Regimento Interno da ALMT e princípios constitucionais de impessoalidade.*`,
      };
      onUpdateRelease(polished);
      setSelectedRelease(polished);
      setAiEnhancing(false);
      setAiNote('Tom institucional e citação da parlamentar padronizados com sucesso!');
    }, 700);
  };

  const handleApprove = () => {
    if (!selectedRelease) return;
    const updated: PressRelease = {
      ...selectedRelease,
      status: 'aprovado',
    };
    onUpdateRelease(updated);
    setSelectedRelease(updated);
  };

  const handleDistribute = () => {
    if (!selectedRelease) return;
    const updated: PressRelease = {
      ...selectedRelease,
      status: 'distribuido',
    };
    onUpdateRelease(updated);
    setSelectedRelease(updated);
  };

  const clippingNews = [
    {
      id: 'cl-1',
      title: 'ALMT aprova orçamento de Mato Grosso para 2027 com foco em saúde e rodovias',
      source: 'Diário Oficial de MT / Agência AL',
      date: 'Hoje às 10:30',
      category: 'Legislativo',
      summary: 'Deputados estaduais aprovaram em primeira votação o texto-base da LOA com inclusão de emendas impositivas.',
    },
    {
      id: 'cl-2',
      title: 'SES-MT anuncia plano emergencial para desafogar leitos pediátricos no interior',
      source: 'G1 Mato Grosso',
      date: 'Hoje às 08:45',
      category: 'Saúde',
      summary: 'Governo do Estado atende solicitações de parlamentares e abrirá vagas em consórcios municipais.',
    },
    {
      id: 'cl-3',
      title: 'Produtores cobram recuperação de trechos vicinais e estaduais no Médio-Norte',
      source: 'Canal Rural Mato Grosso',
      date: 'Ontem',
      category: 'Agronegócio',
      summary: 'Escoamento da safra requer intervenções na malha viária em Nova Mutum e Sorriso.',
    },
  ];

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Conhecimento & Assessoria de Imprensa"
        contextText="Monitoramento de fontes oficiais, editor de releases com assistência de IA para tom institucional e aprovação editorial."
      />

      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-[#176B80]" />
            Imprensa, Releases & Clipping do Mandato
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Divulgação oficial das ações legislativas, fiscalizatórias e emendas nos municípios
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setActiveTab('releases')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'releases'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Releases & Notas
            </button>
            <button
              onClick={() => setActiveTab('clipping')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'clipping'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Clipping de Fontes
            </button>
          </div>

          <button
            onClick={() => setNewReleaseModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Release</span>
          </button>
        </div>
      </div>

      {activeTab === 'releases' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Release List (1 span) */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-700">
                Pautas & Releases em Elaboração
              </span>
            </div>

            <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
              {releases.map((rel) => {
                const isSelected = selectedRelease?.id === rel.id;
                return (
                  <div
                    key={rel.id}
                    onClick={() => setSelectedRelease(rel)}
                    className={`p-3.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#E9F1F4]/70 border-l-4 border-l-[#176B80]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#176B80] font-semibold uppercase">
                        {rel.status.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400">{rel.createdAt}</span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-xs mt-1 line-clamp-2">
                      {rel.title}
                    </h4>

                    {rel.aiAssisted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#176B80] mt-1.5">
                        <Sparkles className="w-3 h-3" />
                        Assistido por IA
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Release Editor & Inspector (2 spans) */}
          {selectedRelease && (
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-mono font-bold text-slate-400">
                    Autor: {selectedRelease.author}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded font-mono ${
                        selectedRelease.status === 'distribuido'
                          ? 'bg-emerald-50 text-emerald-800'
                          : selectedRelease.status === 'aprovado'
                          ? 'bg-blue-50 text-blue-800'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      Status: {selectedRelease.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAiTonePolish}
                    disabled={aiEnhancing}
                    className="px-3 py-1.5 text-xs font-semibold text-[#102C45] bg-[#36B7A5]/20 hover:bg-[#36B7A5]/30 rounded-lg transition-colors flex items-center gap-1.5"
                    title="Revisa tom institucional, adiciona declaração da parlamentar e verifica adequação legal"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#176B80]" />
                    <span>{aiEnhancing ? 'Aprimorando...' : 'Aprimorar Tom com IA'}</span>
                  </button>

                  {selectedRelease.status !== 'aprovado' &&
                    selectedRelease.status !== 'distribuido' && (
                      <button
                        onClick={handleApprove}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#176B80] hover:bg-[#102C45] rounded-lg transition-colors"
                      >
                        Aprovar Pauta
                      </button>
                    )}

                  {selectedRelease.status === 'aprovado' && (
                    <button
                      onClick={handleDistribute}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#36B7A5]" />
                      <span>Distribuir à Imprensa</span>
                    </button>
                  )}
                </div>
              </div>

              {aiNote && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{aiNote}</span>
                </div>
              )}

              {/* Release Title and Content */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900 leading-snug">
                  {selectedRelease.title}
                </h2>
                <p className="text-xs text-slate-600 font-medium italic border-l-2 border-[#176B80] pl-3 py-0.5">
                  {selectedRelease.summary}
                </p>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-line font-sans">
                  {selectedRelease.body}
                </div>
              </div>

              {/* Target Media Vehicles */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Veículos Alvo:</span>
                  <span>{selectedRelease.targetMedia.join(', ')}</span>
                </div>
                <div className="flex items-center gap-1">
                  {selectedRelease.tags.map((t) => (
                    <span key={t} className="text-slate-400 font-mono text-[10px]">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Clipping de Fontes */
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Clipping de Fontes Autorizadas de Mato Grosso
              </h3>
              <p className="text-xs text-slate-500">
                Monitoramento de Diários Oficiais, Assembleia Legislativa e portais jornalísticos regionais
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Atualizado a cada 30 min</span>
          </div>

          <div className="space-y-3">
            {clippingNews.map((news) => (
              <div
                key={news.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span className="font-semibold text-[#176B80]">{news.source}</span>
                  <span>{news.date}</span>
                </div>
                <h4 className="font-bold text-slate-900 text-xs">{news.title}</h4>
                <p className="text-xs text-slate-600">{news.summary}</p>
                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-200 rounded text-slate-700">
                    {news.category}
                  </span>
                  <button
                    onClick={() =>
                      alert('Abertura de matéria oficial na fonte autorizada')
                    }
                    className="text-xs text-[#176B80] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Ver no Diário Oficial / Fonte</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Novo Release */}
      {newReleaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Cadastrar Nova Pauta / Release</h3>
              <button
                onClick={() => setNewReleaseModalOpen(false)}
                className="text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Título da Matéria</label>
                <input
                  type="text"
                  placeholder="Ex: Deputada vistoria obras da MT-251 em Chapada dos Guimarães"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Linha Fina / Resumo</label>
                <input
                  type="text"
                  placeholder="Síntese para envio a redações jornalísticas"
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Corpo da Matéria</label>
                <textarea
                  rows={4}
                  placeholder="Texto do release com citações do parlamentar e dados técnicos..."
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setNewReleaseModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onCreateRelease({
                    title: form.title,
                    slug: form.title.toLowerCase().replace(/\s+/g, '-'),
                    summary: form.summary,
                    body: form.body,
                    tags: ['Mandato', 'Assembleia Legislativa'],
                    author: 'Felipe Rezende',
                    status: 'rascunho',
                    targetMedia: ['G1 MT', 'FolhaMax'],
                    createdAt: 'Hoje',
                    aiAssisted: false,
                  });
                  setNewReleaseModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] rounded-lg"
              >
                Salvar Rascunho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
