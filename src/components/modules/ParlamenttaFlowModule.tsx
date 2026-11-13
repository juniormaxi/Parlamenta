import React, { useState } from 'react';
import {
  Workflow,
  Clock,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
  Send,
  User,
  Calendar,
  Layers,
  ChevronRight,
  X,
  Check,
  Lock,
} from 'lucide-react';
import { Protocol, TeamMember, ProtocolStatus, PriorityType } from '../../types';

interface ParlamenttaFlowModuleProps {
  protocols: Protocol[];
  teamMembers: TeamMember[];
  onUpdateProtocol: (updated: Protocol) => void;
  currentUserId?: string;
}

export const ParlamenttaFlowModule: React.FC<ParlamenttaFlowModuleProps> = ({
  protocols,
  teamMembers,
  onUpdateProtocol,
  currentUserId = 'usr-4', // Lucas Mendes default
}) => {
  const [activeTab, setActiveTab] = useState<'triagem' | 'minha_fila' | 'revisao' | 'encerrados'>('triagem');
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

  // Modals
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);

  // Form states
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('usr-4');
  const [deadlineDays, setDeadlineDays] = useState<number>(2);
  const [dispatchNote, setDispatchNote] = useState<string>('');

  const [closeAuthorizationCode, setCloseAuthorizationCode] = useState<string>('AUTH-GAB-2026');
  const [closeFeedbackNote, setCloseFeedbackNote] = useState<string>('');
  const [feedbackDeliveryFailed, setFeedbackDeliveryFailed] = useState<boolean>(false);
  const [failureReason, setFailureReason] = useState<string>('');

  const [reopenReason, setReopenReason] = useState<string>('');

  // Filas
  const triageQueue = protocols.filter(
    (p) => p.status === 'novo' || !p.assigneeId
  );
  const myQueue = protocols.filter(
    (p) => p.assigneeId === currentUserId && p.status !== 'resolvido' && p.status !== 'cancelado'
  );
  const reviewQueue = protocols.filter(
    (p) => p.status === 'revisao_coordenador'
  );
  const closedQueue = protocols.filter(
    (p) => p.status === 'resolvido'
  );

  const handleOpenAssignModal = (proto: Protocol) => {
    setSelectedProtocol(proto);
    setSelectedAssigneeId(proto.assigneeId || 'usr-4');
    setDispatchNote('');
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = () => {
    if (!selectedProtocol) return;
    const assignee = teamMembers.find((m) => m.id === selectedAssigneeId);
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);

    const updated: Protocol = {
      ...selectedProtocol,
      status: 'em_execucao',
      assigneeId: selectedAssigneeId,
      assigneeName: assignee ? assignee.name : 'Lucas Mendes',
      deadline: deadlineDate.toISOString(),
      hoursElapsedWithAssignee: 0,
      timeline: [
        ...selectedProtocol.timeline,
        {
          id: `tl-assign-${Date.now()}`,
          timestamp: 'Agora',
          author: 'Letícia Prado',
          role: 'Coordenadora de Atendimento',
          action: 'Atribuição na Fila de Triagem',
          description: `Demanda atribuída a ${assignee?.name} com prazo de ${deadlineDays} dias úteis. Despacho: ${dispatchNote || 'Encaminhado para providências imediatas.'}`,
        },
      ],
    };

    onUpdateProtocol(updated);
    setAssignModalOpen(false);
  };

  const handleSubmitForReview = (proto: Protocol) => {
    const updated: Protocol = {
      ...proto,
      status: 'revisao_coordenador',
      timeline: [
        ...proto.timeline,
        {
          id: `tl-rev-${Date.now()}`,
          timestamp: 'Agora',
          author: proto.assigneeName,
          role: 'Assessor Temático',
          action: 'Submissão para Revisão e Homologação',
          description: 'Ações de execução concluídas. Submetido à coordenação de gabinete para aprovação e encerramento.',
        },
      ],
    };
    onUpdateProtocol(updated);
  };

  const handleOpenCloseModal = (proto: Protocol) => {
    setSelectedProtocol(proto);
    setCloseFeedbackNote(
      proto.citizenFeedbackText ||
        `Informamos que o Gabinete da Deputada Mariana Ribeiro atendeu a demanda referente a ${proto.subject}.`
    );
    setFeedbackDeliveryFailed(false);
    setFailureReason('');
    setCloseModalOpen(true);
  };

  const handleConfirmClose = () => {
    if (!selectedProtocol) return;

    const updated: Protocol = {
      ...selectedProtocol,
      status: 'resolvido',
      citizenFeedbackStatus: feedbackDeliveryFailed ? 'falha_envio' : 'enviada_sucesso',
      citizenFeedbackText: feedbackDeliveryFailed
        ? `Falha de devolutiva: ${failureReason}`
        : closeFeedbackNote,
      resolutionNotes: `Encerramento autorizado via ${closeAuthorizationCode}. Responsável pelo fechamento: Dr. Roberto Valente (Chefe de Gabinete).`,
      timeline: [
        ...selectedProtocol.timeline,
        {
          id: `tl-close-${Date.now()}`,
          timestamp: 'Agora',
          author: 'Dr. Roberto Valente',
          role: 'Chefe de Gabinete',
          action: 'Homologação e Encerramento Formal',
          description: feedbackDeliveryFailed
            ? `Protocolo encerrado administrativamente com registro de falha de contato: ${failureReason}`
            : `Protocolo encerrado com sucesso. Devolutiva entregue ao cidadão via ${selectedProtocol.channel.toUpperCase()}.`,
        },
      ],
    };

    onUpdateProtocol(updated);
    setCloseModalOpen(false);
  };

  const handleOpenReopenModal = (proto: Protocol) => {
    setSelectedProtocol(proto);
    setReopenReason('');
    setReopenModalOpen(true);
  };

  const handleConfirmReopen = () => {
    if (!selectedProtocol || !reopenReason.trim()) return;

    const updated: Protocol = {
      ...selectedProtocol,
      status: 'em_execucao',
      timeline: [
        ...selectedProtocol.timeline,
        {
          id: `tl-reopen-${Date.now()}`,
          timestamp: 'Agora',
          author: 'Letícia Prado',
          role: 'Coordenadora',
          action: 'Reabertura de Protocolo',
          description: `Demanda reaberta com a seguinte justificativa: ${reopenReason}`,
        },
      ],
    };

    onUpdateProtocol(updated);
    setReopenModalOpen(false);
  };

  return (
    <div className="space-y-4">

      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Workflow className="w-5 h-5 text-[#176B80]" />
            Parlamentta Flow · Gestão de Filas & SLA
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição controlada, cronometragem por assessor e governança de encerramento
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('triagem')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'triagem'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Fila de Triagem</span>
            {triageQueue.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-[#176B80] text-white">
                {triageQueue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('minha_fila')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'minha_fila'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Minha Fila (Assessor)</span>
            {myQueue.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-[#102C45] text-white">
                {myQueue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('revisao')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'revisao'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Revisão da Coordenação</span>
            {reviewQueue.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white">
                {reviewQueue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('encerrados')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
              activeTab === 'encerrados'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Concluídos & Auditoria
          </button>
        </div>
      </div>

      {/* Tab 1: Fila de Triagem (Coordenador) */}
      {activeTab === 'triagem' && (
        <div className="space-y-3">
          <div className="bg-[#E9F1F4]/60 border border-[#176B80]/20 rounded-xl p-3.5 text-xs text-[#102C45] flex items-center justify-between">
            <span className="font-semibold">
              Fila de Triagem da Coordenação: Demandas recém-chegadas aguardando despacho e definição de prazo SLA.
            </span>
            <span className="font-mono text-slate-500 font-semibold">
              {triageQueue.length} aguardando
            </span>
          </div>

          {triageQueue.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl text-xs text-slate-400">
              Nenhuma demanda pendente de triagem no momento. Todos os protocolos foram distribuídos!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {triageQueue.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-[#102C45]">
                        {p.number}
                      </span>
                      <span className="text-[10px] uppercase font-mono font-bold text-rose-600">
                        Prioridade: {p.priority}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-sm leading-snug">
                      {p.subject}
                    </h3>

                    <p className="text-xs text-slate-600 line-clamp-2">
                      {p.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <span>Cidadão: <strong className="text-slate-800">{p.citizenName}</strong></span>
                      <span>·</span>
                      <span>{p.citizenCity}</span>
                      <span>·</span>
                      <span className="capitalize">Canal: {p.channel}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Recebido há {p.hoursElapsedTotal}h
                    </span>
                    <button
                      onClick={() => handleOpenAssignModal(p)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#36B7A5]" />
                      <span>Atribuir Assessor & Prazo</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Minha Fila (Assessor) com cronômetros */}
      {activeTab === 'minha_fila' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-slate-900">
                Minha Fila de Trabalho · Lucas Mendes (Assessor Temático)
              </span>
              <p className="text-slate-500 text-[11px]">
                Acompanhe o tempo de posse em cada processo e respeite o limite de 48h úteis do SLA.
              </p>
            </div>
            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
              {myQueue.length} processos ativos
            </span>
          </div>

          <div className="space-y-3">
            {myQueue.map((p) => {
              const isWarning = p.slaStatus === 'alerta_48h';
              const isOverdue = p.slaStatus === 'atrasado';

              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-xl p-5 shadow-xs transition-all space-y-4 ${
                    isOverdue
                      ? 'border-rose-200'
                      : isWarning
                      ? 'border-amber-200'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#102C45] text-sm">
                        {p.number}
                      </span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs font-semibold text-[#176B80]">{p.theme}</span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs text-slate-700">{p.citizenCity}</span>
                    </div>

                    {/* Cronômetros Duplos (Requisito Explícito) */}
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                        <span className="text-[10px] text-slate-400 block leading-tight">
                          Tempo Total
                        </span>
                        <strong className="text-slate-800">{p.hoursElapsedTotal}h</strong>
                      </div>

                      <div
                        className={`p-1.5 rounded-lg border ${
                          isOverdue
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : isWarning
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                      >
                        <span className="text-[10px] opacity-75 block leading-tight">
                          Tempo com Assessor
                        </span>
                        <strong className="font-bold">{p.hoursElapsedWithAssignee}h</strong>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {p.subject}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">{p.description}</p>
                  </div>

                  {/* Actions for Assessor */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Cidadão: <strong>{p.citizenName}</strong></span>
                      <span>·</span>
                      <span>Vencimento: <strong className="font-mono">{new Date(p.deadline).toLocaleDateString('pt-BR')}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenAssignModal(p)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 font-medium"
                      >
                        Redistribuir
                      </button>

                      <button
                        onClick={() => handleSubmitForReview(p)}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-[#176B80] hover:bg-[#102C45] rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#36B7A5]" />
                        <span>Concluir Ações & Enviar para Revisão</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Revisão da Coordenação / Homologação */}
      {activeTab === 'revisao' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-center justify-between">
            <span className="font-semibold">
              Fila de Homologação da Chefia: Protocolos com ações finalizadas que aguardam verificação de devolutiva para encerramento formal.
            </span>
            <span className="font-mono font-bold">{reviewQueue.length} em revisão</span>
          </div>

          {reviewQueue.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl text-xs text-slate-400">
              Nenhum processo pendente de homologação no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {reviewQueue.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-[#102C45]">
                      {p.number}
                    </span>
                    <span className="text-[11px] font-semibold text-amber-700">
                      Executado por: {p.assigneeName}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm leading-snug">
                    {p.subject}
                  </h3>

                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <strong>Parecer Técnico:</strong> Encaminhamento realizado perante o órgão competente. Relatório e ofícios anexados. Pronto para homologação.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenReopenModal(p)}
                      className="px-3 py-1.5 text-xs text-rose-600 hover:text-rose-800 font-medium"
                    >
                      Devolver com Apontamentos
                    </button>
                    <button
                      onClick={() => handleOpenCloseModal(p)}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#36B7A5]" />
                      <span>Autorizar Encerramento & Devolutiva</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Concluídos & Auditoria */}
      {activeTab === 'encerrados' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">
              Histórico de Protocolos Concluídos com Sucesso
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Total: {closedQueue.length} arquivados
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {closedQueue.map((p) => (
              <div key={p.id} className="py-3 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#102C45]">{p.number}</span>
                    <span>·</span>
                    <span className="text-slate-800 font-semibold">{p.citizenCity}</span>
                    <span>·</span>
                    <span className="text-emerald-700 font-semibold">Resolvido</span>
                  </div>
                  <p className="text-slate-900 font-medium">{p.subject}</p>
                  <p className="text-slate-500 text-[11px] italic">
                    Devolutiva: "{p.citizenFeedbackText}"
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <button
                    onClick={() => handleOpenReopenModal(p)}
                    className="text-xs text-[#176B80] hover:underline font-medium flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reabrir Demanda</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Atribuição na Triagem */}
      {assignModalOpen && selectedProtocol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Despacho de Triagem</h3>
                <p className="text-xs text-slate-300 font-mono">{selectedProtocol.number}</p>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Assessor Responsável
                </label>
                <select
                  value={selectedAssigneeId}
                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {teamMembers
                    .filter((m) => m.role === 'assessor_parlamentar')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.activeProtocols} processos ativos)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Prazo Regulamentar SLA
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '24h (Urgente)', days: 1 },
                    { label: '48h (Padrão)', days: 2 },
                    { label: '5 dias úteis', days: 5 },
                  ].map((item) => (
                    <button
                      key={item.days}
                      type="button"
                      onClick={() => setDeadlineDays(item.days)}
                      className={`p-2 rounded-lg border text-xs font-semibold transition-colors ${
                        deadlineDays === item.days
                          ? 'border-[#176B80] bg-[#E9F1F4] text-[#102C45]'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Despacho / Instruções Iniciais da Chefia
                </label>
                <textarea
                  rows={2}
                  placeholder="Instruções para o assessor: oficiar secretaria, levantar documentação..."
                  value={dispatchNote}
                  onChange={(e) => setDispatchNote(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAssign}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Confirmar Despacho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Encerramento com Autorização & Devolutiva Obrigatória */}
      {closeModalOpen && selectedProtocol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Autorização de Encerramento</h3>
                <p className="text-xs text-slate-300 font-mono">{selectedProtocol.number}</p>
              </div>
              <button
                onClick={() => setCloseModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 leading-relaxed">
                <strong>Regra de Governança Estrita:</strong> O encerramento requer autorização expressa da chefia e confirmação da prestação de contas / devolutiva ao cidadão demandante.
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Código de Homologação do Gabinete
                </label>
                <input
                  type="text"
                  value={closeAuthorizationCode}
                  onChange={(e) => setCloseAuthorizationCode(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              {/* Checkbox de falha de devolutiva (Requisito Explícito do Prompt) */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={feedbackDeliveryFailed}
                    onChange={(e) => setFeedbackDeliveryFailed(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Registrar Falha / Impossibilidade de Contato com o Cidadão
                  </span>
                </label>
              </div>

              {!feedbackDeliveryFailed ? (
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">
                    Texto da Devolutiva Oficial
                  </label>
                  <textarea
                    rows={3}
                    value={closeFeedbackNote}
                    onChange={(e) => setCloseFeedbackNote(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="font-semibold text-rose-800 block">
                    Motivo Formal da Inviabilidade de Devolutiva
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Número não recebe chamadas/WhatsApp; sem resposta após 3 tentativas."
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    className="w-full p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs"
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setCloseModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-[#36B7A5]" />
                Homologar Encerramento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reabertura de Demanda */}
      {reopenModalOpen && selectedProtocol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Reabertura Justificada</h3>
                <p className="text-xs text-slate-300 font-mono">{selectedProtocol.number}</p>
              </div>
              <button
                onClick={() => setReopenModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs text-slate-700">
              <p className="text-slate-600">
                A reabertura exige justificativa formal que ficará gravada imutavelmente na timeline do protocolo para fins de auditoria interna.
              </p>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Justificativa da Reabertura
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Cidadão apresentou novos elementos fáticos ou o órgão público não cumpriu o prazo acordado..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setReopenModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReopen}
                disabled={!reopenReason.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Confirmar Reabertura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
