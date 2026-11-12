import React, { useState } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRightLeft,
  ShieldCheck,
  TrendingUp,
  FileSpreadsheet,
  X,
  Check,
} from 'lucide-react';
import { TeamMember, Protocol } from '../../types';
import { KpiCard } from '../common/KpiCard';

interface EquipeModuleProps {
  teamMembers: TeamMember[];
  protocols: Protocol[];
  onRedistributeProtocols: (fromId: string, toId: string, count: number) => void;
}

export const EquipeModule: React.FC<EquipeModuleProps> = ({
  teamMembers,
  protocols,
  onRedistributeProtocols,
}) => {
  const [redistributeModalOpen, setRedistributeModalOpen] = useState(false);
  const [sourceMemberId, setSourceMemberId] = useState('usr-4'); // Lucas Mendes
  const [targetMemberId, setTargetMemberId] = useState('usr-5'); // Camila Barreto
  const [protocolCount, setProtocolCount] = useState(2);
  const [justification, setJustification] = useState('');

  const assessors = teamMembers.filter(
    (m) => m.role === 'assessor_parlamentar' || m.role === 'coordenador_atendimento'
  );

  const handleConfirmRedistribute = () => {
    if (!justification.trim()) return;
    onRedistributeProtocols(sourceMemberId, targetMemberId, protocolCount);
    setRedistributeModalOpen(false);
    setJustification('');
  };

  return (
    <div className="space-y-4">

      {/* Header & Quick Action */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-[#176B80]" />
            Equipe do Gabinete & Distribuição de Carga
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Equilíbrio de demandas, controle de SLA individual e tempo de permanência em cada etapa
          </p>
        </div>

        <button
          onClick={() => setRedistributeModalOpen(true)}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-[#36B7A5]" />
          <span>Redistribuir Demandas em Lote</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Membros Ativos"
          value={teamMembers.length}
          subtext="Deputada + Chefia + Assessores"
          icon={Users}
        />
        <KpiCard
          label="Média de Processos / Assessor"
          value="11,5"
          subtext="Capacidade ideal: até 15"
          variant="default"
        />
        <KpiCard
          label="Processos com SLA Vencendo"
          value="3"
          subtext="Exigem atenção da chefia"
          variant="warning"
        />
        <KpiCard
          label="Tempo Médio de Atendimento"
          value="2,8 dias"
          subtext="Cumprimento regulamentar"
          variant="success"
        />
      </div>

      {/* Cards de Desempenho por Assessor */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assessors.map((member) => {
          const memberProtocols = protocols.filter(
            (p) => p.assigneeId === member.id && p.status !== 'resolvido'
          );
          const hasOverdue = member.overdueProtocols > 0;

          return (
            <div
              key={member.id}
              className={`bg-white border rounded-xl p-5 shadow-xs space-y-4 transition-all ${
                hasOverdue ? 'border-amber-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#102C45] text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {member.avatar}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">
                      {member.name}
                    </h3>
                    <p className="text-[11px] text-slate-500">{member.roleTitle}</p>
                    <span className="text-[10px] font-mono text-[#176B80]">
                      {member.email}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded font-mono ${
                    member.status === 'em_campo'
                      ? 'bg-blue-50 text-blue-700'
                      : member.status === 'ocupado'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {member.status === 'em_campo'
                    ? 'Em Campo (MT)'
                    : member.status === 'ocupado'
                    ? 'Em Reunião'
                    : 'Disponível'}
                </span>
              </div>

              {/* Progress and workload metrics */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span className="font-medium">Carga de Processos Ativos</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {member.activeProtocols} demandas
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      member.activeProtocols > 12 ? 'bg-amber-500' : 'bg-[#176B80]'
                    }`}
                    style={{
                      width: `${Math.min(100, (member.activeProtocols / 18) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Detailed Numbers */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center font-mono text-xs">
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-[10px] text-slate-400 block">Resolvidos</span>
                  <strong className="text-emerald-700 font-bold">
                    {member.completedProtocols}
                  </strong>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-[10px] text-slate-400 block">Atrasados</span>
                  <strong
                    className={
                      member.overdueProtocols > 0
                        ? 'text-rose-600 font-bold'
                        : 'text-slate-600'
                    }
                  >
                    {member.overdueProtocols}
                  </strong>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-[10px] text-slate-400 block">Tempo Médio</span>
                  <strong className="text-slate-800 font-bold">
                    {member.avgResolutionDays}d
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Redistribuição em Lote */}
      {redistributeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Redistribuição de Demandas</h3>
                <p className="text-xs text-slate-300">
                  Equilíbrio da carga operacional entre assessores
                </p>
              </div>
              <button
                onClick={() => setRedistributeModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Transferir Demandas De:
                </label>
                <select
                  value={sourceMemberId}
                  onChange={(e) => setSourceMemberId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {assessors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.activeProtocols} processos ativos)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Para o Assessor:
                </label>
                <select
                  value={targetMemberId}
                  onChange={(e) => setTargetMemberId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {assessors
                    .filter((m) => m.id !== sourceMemberId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.activeProtocols} processos ativos)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Quantidade de Processos a Transferir
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={protocolCount}
                  onChange={(e) => setProtocolCount(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Justificativa Formal (Gravada no Log de Auditoria)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Assessor destacado para missão em campo em Rondonópolis/Juína..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setRedistributeModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRedistribute}
                disabled={!justification.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Confirmar Redistribuição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
