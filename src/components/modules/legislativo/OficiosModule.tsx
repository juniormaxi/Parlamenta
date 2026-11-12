import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
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
  RefreshCw,
  Eye,
  Check,
  X,
  ShieldCheck,
  Printer,
} from 'lucide-react';
import { OfficialLetterModel } from '../../../types';
import { useDialog } from '../../common/Dialogs';

interface OficiosModuleProps {
  letters: OfficialLetterModel[];
  onCreateLetter: (letter: OfficialLetterModel) => void;
  onUpdateLetter: (letter: OfficialLetterModel) => void;
}

export const OficiosModule: React.FC<OficiosModuleProps> = ({
  letters,
  onCreateLetter,
  onUpdateLetter,
}) => {
  const dialog = useDialog();
  const [selectedLetter, setSelectedLetter] = useState<OfficialLetterModel | null>(
    letters[0] || null
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [orgFilter, setOrgFilter] = useState('todos');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiVerifying, setIsAiVerifying] = useState(false);

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

  // Verification state
  const [verifyingLetter, setVerifyingLetter] = useState<OfficialLetterModel | null>(null);
  const [verificationResult, setVerificationResult] = useState<
    OfficialLetterModel['aiVerification'] | null
  >(null);

  // Filter letters
  const filteredLetters = letters.filter((l) => {
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
  const uniqueOrgs = Array.from(new Set(letters.map((l) => l.recipientOrg))).sort();

  // AI Generator Simulator
  const handleGenerateAiLetter = () => {
    if (!aiForm.subject || !aiForm.recipientName) {
      dialog.alert({ title: 'Campos obrigatórios', message: 'Preencha o destinatário e o assunto da solicitação.', tone: 'warning' });
      return;
    }

    setIsAiGenerating(true);
    setTimeout(() => {
      const year = new Date().getFullYear();
      const randNum = Math.floor(Math.random() * 200 + 150);
      const code = `OF-GAB-${year}/${randNum}`;

      const bodyText = `Excelentíssimo Senhor ${aiForm.recipientRole},

Cumprimentando-o cordialmente, sirvo-me do presente para solicitar a Vossa Excelência especial atenção e providências urgentes no sentido de viabilizar ${aiForm.subject.toLowerCase()} no município de ${aiForm.cityTarget}.

A presente demanda origina-se de solicitação formal protocolada junto a este Gabinete Parlamentar (Protocolo Parlamenta nº ${aiForm.linkedProtocolId || 'PRT-2026-GAB'}), subscrita por lideranças comunitárias e gestores locais, os quais relatam que ${aiForm.contextDemand}.

Ressalta-se que este Mandato Parlamentar acompanha com prioridade as ações voltadas ao fortalecimento das políticas públicas no interior de Mato Grosso, colocando-se à disposição para alocação de emenda parlamentar impositiva com vistas a cofinanciar a referida intervenção.

Diante do exposto e com espeque nas atribuições fiscalizatórias conferidas pelo Art. 47 da Constituição do Estado de Mato Grosso, solicito manifestação conclusiva desta pasta no prazo regimental de ${aiForm.deadlineDays} (quinze) dias.

Renovando protestos de estima e consideração.

Respeitosamente,

Mariana Ribeiro
Deputada Estadual — Assembleia Legislativa de Mato Grosso`;

      setGeneratedDraft({
        code,
        subject: aiForm.subject,
        body: bodyText,
      });
      setIsAiGenerating(false);
    }, 1100);
  };

  const handleSaveDraftAsLetter = () => {
    if (!generatedDraft) return;

    const newLetter: OfficialLetterModel = {
      id: `of-${Date.now()}`,
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
      aiVerification: {
        institutionalToneScore: 97,
        protocolaryCompliance: 'aprovado',
        formalityCheck: 'Tratamento vocativo e pronomes plenamente alinhados ao Manual de Redação da Presidência e ALMT.',
        clarityCheck: 'Solicitação delimitada com prazo regimental expresso e fundamentação fática.',
        missingReferences: [],
        recommendations: [
          'Ofício pronto para assinatura digital da Deputada e envio pelo sistema oficial de protocolo (SIGA-MT).',
        ],
        verifiedAt: new Date().toLocaleString('pt-BR'),
      },
    };

    onCreateLetter(newLetter);
    setSelectedLetter(newLetter);
    setCreateModalOpen(false);
    setGeneratedDraft(null);
  };

  // AI Verifier Simulator
  const handleRunAiVerification = (letter: OfficialLetterModel) => {
    setVerifyingLetter(letter);
    setVerifyModalOpen(true);
    setIsAiVerifying(true);
    setVerificationResult(null);

    setTimeout(() => {
      const result: OfficialLetterModel['aiVerification'] = {
        institutionalToneScore: 96,
        protocolaryCompliance: 'aprovado',
        formalityCheck: `Conformidade rigorosa com os padrões de correspondência oficial para órgãos públicos de Mato Grosso. Vocativo inicial "${letter.body.split('\n')[0]}" adequado ao destinatário ${letter.recipientRole}.`,
        clarityCheck: 'Delimitação clara do objeto, indicação de prazo e citação da prerrogativa fiscalizatória parlamentar.',
        missingReferences: letter.linkedProtocolId
          ? []
          : ['Sugestão: vincular expressamente a um protocolo de atendimento cidadão do Gabinete.'],
        recommendations: [
          'Tom institucional sóbrio, objetivo e respeitoso.',
          'Anexar eventuais fotos ou laudos da comunidade para acelerar o despacho no órgão.',
        ],
        verifiedAt: new Date().toLocaleString('pt-BR'),
      };

      setVerificationResult(result);
      setIsAiVerifying(false);

      const updated: OfficialLetterModel = {
        ...letter,
        aiVerification: result,
      };
      onUpdateLetter(updated);
      setSelectedLetter(updated);
    }, 1000);
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
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  IA Redação & Verificação
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Encaminhamento de demandas populares a órgãos do Poder Executivo, cobrança de prazos e respostas oficiais
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#36B7A5]" />
            <span>Criar Ofício com IA</span>
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
          {filteredLetters.map((letter) => {
            const isSelected = selectedLetter?.id === letter.id;
            return (
              <div
                key={letter.id}
                onClick={() => setSelectedLetter(letter)}
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
                    {letter.cityTarget || 'Mato Grosso'} · {letter.date}
                  </span>
                  {letter.aiVerification && (
                    <span className="flex items-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      {letter.aiVerification.institutionalToneScore}% Tom Oficial
                    </span>
                  )}
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
                    <span className="font-mono text-sm font-bold text-white bg-[#102C45] px-2.5 py-1 rounded">
                      {selectedLetter.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      Destino: {selectedLetter.recipientOrg}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-1">{selectedLetter.subject}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunAiVerification(selectedLetter)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#176B80] hover:bg-[#102C45] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verificar com IA</span>
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
                    onClick={() => window.print()}
                    className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Imprimir visualização"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* AI Verification Banner */}
              {selectedLetter.aiVerification && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Verificação de Conformidade Institucional (Manual de Redação Oficial)
                    </span>
                    <span className="font-mono font-bold text-emerald-900">
                      {selectedLetter.aiVerification.institutionalToneScore}/100
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {selectedLetter.aiVerification.formalityCheck}
                  </p>
                </div>
              )}

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
              <div className="p-6 bg-slate-50 border border-slate-300 rounded-xl space-y-4 font-serif text-slate-900 shadow-inner">
                {/* Official Letterhead Header */}
                <div className="text-center space-y-0.5 border-b border-slate-300 pb-3 font-sans">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Assembleia Legislativa do Estado de Mato Grosso
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    Gabinete Parlamentar da Deputada Mariana Ribeiro
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    {selectedLetter.code} · Cuiabá-MT, {selectedLetter.date}
                  </div>
                </div>

                {/* Body Text */}
                <div className="whitespace-pre-line text-sm leading-relaxed text-slate-800 px-2">
                  {selectedLetter.body}
                </div>
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
                  <Sparkles className="w-4 h-4 text-[#36B7A5]" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Criar Novo Ofício Oficial com IA
                  </h3>
                  <p className="text-xs text-slate-500">
                    Assistente para redação institucional com vocativo adequado e fundamentação regimental
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
                  disabled={isAiGenerating}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#102C45] hover:bg-[#176B80] rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isAiGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#36B7A5]" />
                      <span>Formatando Ofício com Padrão Oficial...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#36B7A5]" />
                      <span>Gerar Minuta do Ofício com IA</span>
                    </>
                  )}
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
                      Ofício Gerado
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

      {/* ============================================================ */}
      {/* MODAL: VERIFICADOR DE OFÍCIO COM IA                          */}
      {/* ============================================================ */}
      {verifyModalOpen && verifyingLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <ShieldCheck className="w-5 h-5 text-emerald-700" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Auditoria Institucional de Ofício — {verifyingLetter.code}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Avaliação de tom oficial, clareza do despacho e normas protocolares
                  </p>
                </div>
              </div>
              <button onClick={() => setVerifyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isAiVerifying ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-[#176B80]" />
                <p className="text-xs font-medium text-slate-600">
                  Auditando vocativo, enquadramento fático e prazos segundo o Manual de Redação Oficial...
                </p>
              </div>
            ) : verificationResult ? (
              <div className="space-y-4 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                    Conformidade Protocolar & Tom Institucional
                  </span>
                  <span className="text-2xl font-bold font-mono text-emerald-950">
                    {verificationResult.institutionalToneScore}%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="font-bold text-slate-800 block">Avaliação Técnica:</span>
                  <p className="text-slate-600 leading-relaxed">{verificationResult.formalityCheck}</p>
                </div>

                <div className="space-y-1.5">
                  <span className="font-bold text-slate-800 block">Recomendações Práticas:</span>
                  <ul className="space-y-1">
                    {verificationResult.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setVerifyModalOpen(false)}
                    className="px-4 py-2 font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg shadow-xs"
                  >
                    Concluir Auditoria
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
