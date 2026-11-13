import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building,
  MapPin,
  Search,
  Filter,
  Copy,
  Download,
  Plus,
  Eye,
  Check,
  X,
  ShieldCheck,
  Printer,
  Pencil,
  Trash2,
  Maximize2,
  Loader2,
  Library,
} from 'lucide-react';
import { Cabinet, OfficialLetterModel } from '../../../types';
import { useDialog } from '../../common/Dialogs';
import { oficios, type LetterInput } from '../../../lib/oficios';
import { LetterSheet, printLetter, fmtLetterDate } from './oficioDocument';

interface OficiosModuleProps {
  cabinet: Cabinet;
  logoUrl?: string;
  /** Abre Banco de Dados › Base de Conhecimento. */
  onOpenKnowledge?: () => void;
  /** Ofício a selecionar ao abrir (ex.: vindo da Base de Conhecimento). */
  focusId?: string | null;
}

const STATUS_OPTIONS: [OfficialLetterModel['status'], string][] = [
  ['minuta', 'Minuta / Rascunho'],
  ['revisao_juridica', 'Revisão Jurídica'],
  ['assinado_deputado', 'Assinado pelo Parlamentar'],
  ['protocolado_orgao', 'Protocolado no Órgão'],
  ['respondido', 'Respondido pelo Órgão'],
];

export const OficiosModule: React.FC<OficiosModuleProps> = ({ cabinet, logoUrl, onOpenKnowledge, focusId }) => {
  const dialog = useDialog();
  const [letters, setLetters] = useState<OfficialLetterModel[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OfficialLetterModel | 'new' | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await oficios.list();
      setLetters(rows);
      setSelectedId((cur) => {
        const want = cur ?? focusId;
        return want && rows.some((r) => r.id === want) ? want : rows[0]?.id ?? null;
      });
    } catch (e) {
      setLetters([]);
      dialog.alert({ title: 'Erro ao carregar ofícios', message: (e as Error).message, tone: 'danger' });
    }
  }, [dialog, focusId]);
  useEffect(() => {
    load();
  }, [load]);

  const saveLetter = async (id: string | null, data: LetterInput) => {
    const saved = id ? await oficios.update(id, data) : await oficios.create(data);
    setLetters((prev) => (id ? (prev ?? []).map((l) => (l.id === id ? saved : l)) : [saved, ...(prev ?? [])]));
    setSelectedId(saved.id);
    return saved;
  };

  const handleDelete = async (letter: OfficialLetterModel) => {
    const ok = await dialog.confirm({
      title: 'Excluir ofício?',
      message: (
        <>
          <strong>{letter.code}</strong> · {letter.subject}
          <br />O ofício também sai da Base de Conhecimento. Não é possível desfazer.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await oficios.remove(letter.id);
      setFullscreen(false);
      setLetters((prev) => {
        const next = (prev ?? []).filter((l) => l.id !== letter.id);
        setSelectedId((cur) => (cur === letter.id ? next[0]?.id ?? null : cur));
        return next;
      });
      dialog.toast(`Ofício ${letter.code} excluído.`);
    } catch (e) {
      dialog.alert({ title: 'Erro ao excluir', message: (e as Error).message, tone: 'danger' });
    }
  };
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [orgFilter, setOrgFilter] = useState('todos');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // AI Generator Form
  const [aiForm, setAiForm] = useState({
    recipientRole: 'Secretário de Estado de Saúde',
    recipientName: 'Dra. Clarice Mendes Fontana',
    recipientOrg: 'SES-MT',
    cityTarget: 'Cáceres',
    subject: 'Destinação de equipamentos e ampliação de leitos para a UPA 24h',
    contextDemand: 'Comunidade local enfrenta sobrecarga na unidade com mais de 300 atendimentos diários e carência de monitor multiparamétrico.',
    deadlineDays: 15,
    linkedProtocolId: 'PRT-2026-0038',
  });

  const [generatedDraft, setGeneratedDraft] = useState<{
    code: string;
    subject: string;
    body: string;
  } | null>(null);


  const all = letters ?? [];
  const selectedLetter = all.find((l) => l.id === selectedId) ?? null;

  // Filter letters
  const filteredLetters = all.filter((l) => {
    const matchSearch =
      l.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
      l.subject.toLowerCase().includes(searchFilter.toLowerCase()) ||
      l.recipientName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      l.recipientOrg.toLowerCase().includes(searchFilter.toLowerCase());
    const matchStatus = statusFilter === 'todos' || l.status === statusFilter;
    const matchOrg = orgFilter === 'todos' || l.recipientOrg === orgFilter;
    return matchSearch && matchStatus && matchOrg;
  });

  // Unique orgs
  const uniqueOrgs = Array.from(new Set(all.map((l) => l.recipientOrg).filter(Boolean))).sort();

  // Rascunho a partir de MODELO FIXO (não usa IA): preenche o texto-padrão com os dados do formulário.
  const nextLetterCode = () => {
    const year = new Date().getFullYear();
    const used = all
      .map((l) => new RegExp(`^OF-GAB-${year}/(\\d+)$`).exec(l.code)?.[1])
      .filter(Boolean)
      .map(Number);
    return `OF-GAB-${year}/${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
  };
  const handleGenerateAiLetter = () => {
    if (!aiForm.subject || !aiForm.recipientName) {
      dialog.alert({ title: 'Campos obrigatórios', message: 'Preencha o destinatário e o assunto da solicitação.', tone: 'warning' });
      return;
    }
    const origin = aiForm.linkedProtocolId
      ? `A presente demanda origina-se de solicitação formal protocolada junto a este Gabinete Parlamentar (Protocolo nº ${aiForm.linkedProtocolId})`
      : 'A presente demanda origina-se de solicitação recebida por este Gabinete Parlamentar';
    const bodyText = `Excelentíssimo Senhor ${aiForm.recipientRole},

Cumprimentando-o cordialmente, sirvo-me do presente para solicitar a Vossa Excelência especial atenção e providências no sentido de viabilizar ${aiForm.subject.toLowerCase()}${aiForm.cityTarget ? ` no município de ${aiForm.cityTarget}` : ''}.

${origin}${aiForm.contextDemand ? `, cujo relato informa que ${aiForm.contextDemand}` : ''}.

Diante do exposto, solicito manifestação desta pasta no prazo de ${aiForm.deadlineDays} dias.

Renovando protestos de estima e consideração.

Respeitosamente,

${cabinet.parliamentarian || cabinet.name}
${cabinet.house || 'Assembleia Legislativa'}`;
    setGeneratedDraft({ code: nextLetterCode(), subject: aiForm.subject, body: bodyText });
  };

  const handleSaveDraftAsLetter = async () => {
    if (!generatedDraft) return;

    const newLetter: LetterInput = {
      code: generatedDraft.code,
      subject: generatedDraft.subject,
      recipientName: aiForm.recipientName,
      recipientRole: aiForm.recipientRole,
      recipientOrg: aiForm.recipientOrg,
      cityTarget: aiForm.cityTarget,
      date: new Date().toISOString().split('T')[0],
      status: 'minuta',
      body: generatedDraft.body,
      deadlineResponseDays: aiForm.deadlineDays,
      linkedProtocolId: aiForm.linkedProtocolId,
    };

    try {
      await saveLetter(null, newLetter);
      setCreateModalOpen(false);
      setGeneratedDraft(null);
      dialog.toast('Ofício salvo e enviado para a Base de Conhecimento.');
    } catch (e) {
      dialog.alert({ title: 'Erro ao salvar o ofício', message: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#102C45]/5 text-[#102C45]">
              <Send className="w-5 h-5 text-[#176B80]" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Ofícios Expedidos do Mandato
              </h1>
              <p className="text-xs text-slate-500">
                Encaminhamento de demandas populares a órgãos do Poder Executivo, cobrança de prazos e respostas oficiais
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenKnowledge && (
            <button
              onClick={onOpenKnowledge}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
              title="Todos os ofícios ficam também em Banco de Dados › Base de Conhecimento"
            >
              <Library className="w-3.5 h-3.5 text-[#176B80]" />
              <span>Base de Conhecimento</span>
            </button>
          )}
          <button
            onClick={() => setEditing('new')}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo ofício</span>
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <FileText className="w-3.5 h-3.5 text-[#36B7A5]" />
            <span>Rascunho por modelo</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por código, assunto ou destinatário..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
          >
            <option value="todos">Todos os Status</option>
            <option value="minuta">Minuta / Rascunho</option>
            <option value="revisao_juridica">Revisão Jurídica</option>
            <option value="assinado_deputado">Assinado pela Deputada</option>
            <option value="protocolado_orgao">Protocolado no Órgão</option>
            <option value="respondido">Respondido pelo Órgão</option>
          </select>

          <span className="font-semibold text-slate-600 ml-2">Órgão Destino:</span>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
          >
            <option value="todos">Todos os Órgãos</option>
            {uniqueOrgs.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid: List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: List */}
        <div className="lg:col-span-5 space-y-2.5">
          {!letters && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          )}
          {letters && filteredLetters.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              {all.length ? 'Nenhum ofício com esses filtros.' : 'Nenhum ofício ainda. Use “Novo ofício” ou “Rascunho por modelo”.'}
            </div>
          )}
          {filteredLetters.map((letter) => {
            const isSelected = selectedLetter?.id === letter.id;
            return (
              <div
                key={letter.id}
                onClick={() => setSelectedId(letter.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#176B80] bg-[#176B80]/5 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-mono font-bold text-[#102C45] bg-slate-100 px-2 py-0.5 rounded">
                    {letter.code}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      letter.status === 'respondido'
                        ? 'bg-emerald-100 text-emerald-800'
                        : letter.status === 'protocolado_orgao'
                        ? 'bg-blue-100 text-blue-800'
                        : letter.status === 'revisao_juridica'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {letter.status === 'protocolado_orgao'
                      ? 'Protocolado no Órgão'
                      : letter.status === 'respondido'
                      ? 'Respondido com Sucesso'
                      : letter.status === 'revisao_juridica'
                      ? 'Em Revisão Jurídica'
                      : letter.status === 'assinado_deputado'
                      ? 'Assinado'
                      : 'Minuta'}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 mb-1">
                  {letter.subject}
                </h3>

                <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                  <Building className="w-3.5 h-3.5 text-[#176B80] shrink-0" />
                  <span className="font-semibold text-slate-800">{letter.recipientOrg}</span>
                  <span>·</span>
                  <span className="truncate">{letter.recipientName}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {letter.cityTarget || cabinet.state || '—'} · {fmtLetterDate(letter.date)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Letter Sheet Viewer */}
        <div className="lg:col-span-7">
          {selectedLetter ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              {/* Header actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white bg-[#102C45] px-2.5 py-1 rounded whitespace-nowrap">
                      {selectedLetter.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      Destino: {selectedLetter.recipientOrg}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-1">{selectedLetter.subject}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setEditing(selectedLetter)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                    title="Editar ofício"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                  <button
                    disabled
                    className="px-3 py-1.5 text-xs font-semibold text-slate-400 bg-slate-100 rounded-lg flex items-center gap-1.5 cursor-not-allowed"
                    title="Ainda não implementado: nenhuma análise por IA é feita sobre os ofícios."
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verificar com IA (não implementado)</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedLetter.body);
                      dialog.toast('Texto do ofício copiado para a área de transferência.');
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Copiar texto"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFullscreen(true)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Ver em tela cheia"
                    aria-label="Ver em tela cheia"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => printLetter(selectedLetter, cabinet, logoUrl)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Imprimir ofício"
                    aria-label="Imprimir ofício"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedLetter)}
                    className="p-1.5 text-slate-500 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Excluir ofício"
                    aria-label="Excluir ofício"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>


              {/* Recipient Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Destinatário
                  </span>
                  <span className="font-bold text-slate-800">{selectedLetter.recipientName}</span>
                  <span className="text-[11px] text-slate-500 block">{selectedLetter.recipientRole}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Órgão / Secretaria
                  </span>
                  <span className="font-bold text-slate-800">{selectedLetter.recipientOrg}</span>
                  <span className="text-[11px] text-slate-500 block">
                    {selectedLetter.cityTarget || 'Estado de Mato Grosso'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Prazo Regimental
                  </span>
                  <span className="font-bold text-slate-800">
                    {selectedLetter.deadlineResponseDays || 15} dias úteis
                  </span>
                  {selectedLetter.linkedProtocolId && (
                    <span className="text-[11px] text-[#176B80] font-mono block">
                      Ref: {selectedLetter.linkedProtocolId}
                    </span>
                  )}
                </div>
              </div>

              {/* Official Document Sheet */}
              <div className="p-3 bg-slate-100 rounded-xl">
                <LetterSheet letter={selectedLetter} cabinet={cabinet} logoUrl={logoUrl} />
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
              Selecione um ofício para visualizar os detalhes.
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: CRIADOR DE OFÍCIO COM IA                              */}
      {/* ============================================================ */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-[#102C45] text-white">
                  <FileText className="w-4 h-4 text-[#36B7A5]" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Rascunho de ofício a partir de modelo
                  </h3>
                  <p className="text-xs text-slate-500">
                    Preenche um texto-padrão fixo com os dados abaixo. Não usa inteligência artificial — revise o texto antes de enviar.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Cargo do Destinatário *
                  </label>
                  <input
                    value={aiForm.recipientRole}
                    onChange={(e) => setAiForm({ ...aiForm, recipientRole: e.target.value })}
                    placeholder="Ex: Secretário de Estado de Infraestrutura"
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Nome da Autoridade *
                  </label>
                  <input
                    value={aiForm.recipientName}
                    onChange={(e) => setAiForm({ ...aiForm, recipientName: e.target.value })}
                    placeholder="Ex: Eng. Marcelo Pires de Oliveira"
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Órgão Público / Secretaria *
                  </label>
                  <input
                    value={aiForm.recipientOrg}
                    onChange={(e) => setAiForm({ ...aiForm, recipientOrg: e.target.value })}
                    placeholder="Ex: SINFRA-MT, SES-MT, SEDUC-MT"
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Município de Referência
                  </label>
                  <input
                    value={aiForm.cityTarget}
                    onChange={(e) => setAiForm({ ...aiForm, cityTarget: e.target.value })}
                    placeholder="Ex: Nova Mutum, Cáceres, Sinop"
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">
                    Assunto Resumido / Solicitação Principal *
                  </label>
                  <input
                    value={aiForm.subject}
                    onChange={(e) => setAiForm({ ...aiForm, subject: e.target.value })}
                    placeholder="Ex: Solicitação de pavimentação asfáltica e sinalização no trecho urbano da MT-249"
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">
                    Contexto da Demanda Popular / Justificativa *
                  </label>
                  <textarea
                    rows={2}
                    value={aiForm.contextDemand}
                    onChange={(e) => setAiForm({ ...aiForm, contextDemand: e.target.value })}
                    placeholder="Ex: A degradação do pavimento tem causado constantes acidentes e prejudica o escoamento de grãos e transporte de pacientes."
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Prazo Solicitado de Resposta
                  </label>
                  <select
                    value={aiForm.deadlineDays}
                    onChange={(e) => setAiForm({ ...aiForm, deadlineDays: parseInt(e.target.value, 10) })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  >
                    <option value={10}>10 dias (Urgente)</option>
                    <option value={15}>15 dias (Padrão Regimental)</option>
                    <option value={20}>20 dias (Complexo)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Vínculo com Protocolo Cidadão (Opcional)
                  </label>
                  <input
                    value={aiForm.linkedProtocolId}
                    onChange={(e) => setAiForm({ ...aiForm, linkedProtocolId: e.target.value })}
                    placeholder="Ex: PRT-2026-0042"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleGenerateAiLetter}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#102C45] hover:bg-[#176B80] rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 text-[#36B7A5]" />
                  <span>Preencher modelo</span>
                </button>
              </div>

              {generatedDraft && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-mono text-xs font-bold text-[#102C45] bg-white px-2 py-0.5 rounded border border-slate-200">
                      {generatedDraft.code}
                    </span>
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Rascunho preenchido (revise antes de salvar)
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded border border-slate-200 text-xs whitespace-pre-line font-serif leading-relaxed max-h-48 overflow-y-auto">
                    {generatedDraft.body}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setGeneratedDraft(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDraftAsLetter}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar no Gabinete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <LetterFormModal
          letter={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await saveLetter(editing === 'new' ? null : editing.id, data);
            setEditing(null);
            dialog.toast(editing === 'new' ? 'Ofício criado e enviado para a Base de Conhecimento.' : 'Ofício atualizado.');
          }}
        />
      )}

      {fullscreen && selectedLetter && (
        <LetterFullscreen
          letter={selectedLetter}
          cabinet={cabinet}
          logoUrl={logoUrl}
          suspendEsc={editing !== null}
          onClose={() => setFullscreen(false)}
          onEdit={() => setEditing(selectedLetter)}
          onDelete={() => handleDelete(selectedLetter)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tela cheia: documento ocupando quase toda a tela, fundo desfocado
// ---------------------------------------------------------------------------
function LetterFullscreen({
  letter,
  cabinet,
  logoUrl,
  suspendEsc,
  onClose,
  onEdit,
  onDelete,
}: {
  letter: OfficialLetterModel;
  cabinet: Cabinet;
  logoUrl?: string;
  suspendEsc: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !suspendEsc) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, suspendEsc]);

  const btn = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5';
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Ofício ${letter.code} em tela cheia`}
      onMouseDown={onClose}
    >
      <div
        className="w-full h-full max-w-[1100px] bg-slate-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold text-[#176B80]">{letter.code}</p>
            <p className="text-sm font-semibold text-slate-900 truncate">{letter.subject}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onEdit} className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button onClick={() => printLetter(letter, cabinet, logoUrl)} className={`${btn} text-white bg-[#102C45] hover:bg-[#176B80]`}>
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onDelete} className={`${btn} text-rose-700 bg-rose-50 hover:bg-rose-100`} title="Excluir ofício">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100" title="Fechar (Esc)" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <LetterSheet letter={letter} cabinet={cabinet} logoUrl={logoUrl} large />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criar / editar ofício
// ---------------------------------------------------------------------------
function LetterFormModal({
  letter,
  onClose,
  onSave,
}: {
  letter: OfficialLetterModel | null;
  onClose: () => void;
  onSave: (data: LetterInput) => Promise<void>;
}) {
  const dialog = useDialog();
  const year = new Date().getFullYear();
  const [f, setF] = useState<LetterInput>(() =>
    letter
      ? { ...letter }
      : {
          code: `OF-GAB-${year}/`,
          subject: '',
          recipientName: '',
          recipientRole: '',
          recipientOrg: '',
          cityTarget: '',
          date: new Date().toISOString().slice(0, 10),
          status: 'minuta',
          body: '',
          deadlineResponseDays: 15,
          linkedProtocolId: '',
        }
  );
  const [saving, setSaving] = useState(false);
  const set = (k: keyof LetterInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === 'deadlineResponseDays' ? Number(e.target.value) : e.target.value });
  const field = 'w-full border border-slate-300 rounded-lg p-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-[#176B80]';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...f, code: f.code.trim(), subject: f.subject.trim() });
    } catch (err) {
      dialog.alert({ title: 'Erro ao salvar o ofício', message: (err as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-[#102C45] text-white rounded-t-2xl">
          <h3 className="font-bold text-sm">{letter ? `Editar ${letter.code}` : 'Novo ofício'}</h3>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-white" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700">
          <label className="space-y-1">
            <span className="font-semibold block">Número do ofício *</span>
            <input className={`${field} font-mono`} required value={f.code} onChange={set('code')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Data</span>
            <input type="date" className={field} value={f.date} onChange={set('date')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Situação</span>
            <select className={field} value={f.status} onChange={set('status')}>
              {STATUS_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-3">
            <span className="font-semibold block">Assunto *</span>
            <input className={field} required value={f.subject} onChange={set('subject')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Nome do destinatário</span>
            <input className={field} value={f.recipientName} onChange={set('recipientName')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Cargo</span>
            <input className={field} value={f.recipientRole} onChange={set('recipientRole')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Órgão / Secretaria</span>
            <input className={field} value={f.recipientOrg} onChange={set('recipientOrg')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Município</span>
            <input className={field} value={f.cityTarget ?? ''} onChange={set('cityTarget')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Prazo de resposta (dias)</span>
            <input type="number" min={0} max={365} className={field} value={f.deadlineResponseDays ?? 15} onChange={set('deadlineResponseDays')} />
          </label>
          <label className="space-y-1">
            <span className="font-semibold block">Protocolo vinculado</span>
            <input className={`${field} font-mono`} value={f.linkedProtocolId ?? ''} onChange={set('linkedProtocolId')} placeholder="PRT-2026-0042" />
          </label>
          <label className="space-y-1 sm:col-span-3">
            <span className="font-semibold block">Texto do ofício *</span>
            <textarea className={`${field} font-serif text-[13px] leading-relaxed`} rows={16} required value={f.body} onChange={set('body')} />
          </label>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 rounded-b-2xl flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">Ao salvar, o ofício é atualizado também na Base de Conhecimento (etiqueta “Ofícios”).</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg flex items-center gap-1.5 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {letter ? 'Salvar alterações' : 'Criar ofício'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
