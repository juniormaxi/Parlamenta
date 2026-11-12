import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Users,
  Plus,
  PlayCircle,
  FileText,
  MapPin,
  ArrowUpRight,
  TrendingUp,
  ChevronRight,
  Send,
  MessageSquare,
  Mail,
} from 'lucide-react';
import { KpiCard } from '../common/KpiCard';
import { Protocol, FlowTask, CalendarEvent, TeamMember, ModuleType } from '../../types';

interface DashboardModuleProps {
  protocols: Protocol[];
  tasks: FlowTask[];
  events: CalendarEvent[];
  teamMembers: TeamMember[];
  onNavigate: (module: ModuleType) => void;
  onOpenGuidedTour: () => void;
  onOpenNewProtocol: () => void;
  onToggleTask: (taskId: string) => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  protocols,
  tasks,
  events,
  teamMembers,
  onNavigate,
  onOpenGuidedTour,
  onOpenNewProtocol,
  onToggleTask,
}) => {
  const [timeframe, setTimeframe] = useState<'semana' | 'mes' | 'ano'>('mes');

  const openCount = protocols.filter(
    (p) => p.status !== 'resolvido' && p.status !== 'cancelado'
  ).length;
  const overdueCount = protocols.filter((p) => p.slaStatus === 'atrasado').length;
  const warningCount = protocols.filter((p) => p.slaStatus === 'alerta_48h').length;
  const resolvedCount = protocols.filter((p) => p.status === 'resolvido').length;

  // Channels distribution stats
  const channelCounts = protocols.reduce((acc, p) => {
    acc[p.channel] = (acc[p.channel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const weeklyData = [
    { day: 'Seg', recebidos: 14, resolvidos: 11 },
    { day: 'Ter', recebidos: 19, resolvidos: 15 },
    { day: 'Qua', recebidos: 16, resolvidos: 12 },
    { day: 'Qui', recebidos: 22, resolvidos: 18 },
    { day: 'Sex', recebidos: 15, resolvidos: 14 },
    { day: 'Sáb', recebidos: 5, resolvidos: 4 },
  ];

  return (
    <div className="space-y-6 pb-12">

      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Painel Executivo do Gabinete
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gabinete Conectado · Gestão de demandas cidadãs, prazos e fluxo parlamentar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Timeframe Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setTimeframe('semana')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeframe === 'semana'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setTimeframe('mes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeframe === 'mes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => setTimeframe('ano')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeframe === 'ano'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ano
            </button>
          </div>

          <button
            onClick={onOpenNewProtocol}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Protocolo</span>
          </button>

          <button
            onClick={onOpenGuidedTour}
            className="px-3.5 py-2 text-xs font-semibold text-[#102C45] bg-[#36B7A5] hover:bg-[#2fa393] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Simular Fluxo Completo</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="Demandas Abertas"
          value={openCount}
          subtext="Em tramitação ativa"
          icon={FileSpreadsheet}
          trend={{ value: '+8%', isPositive: true, label: 'vs. mês ant.' }}
          onClick={() => onNavigate('protocolos')}
        />
        <KpiCard
          label="Alerta SLA 48h"
          value={warningCount}
          subtext="Exigem despacho rápido"
          icon={Clock}
          variant={warningCount > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('flow')}
        />
        <KpiCard
          label="Atrasados"
          value={overdueCount}
          subtext="Prazo regulamentar expirado"
          icon={AlertTriangle}
          variant={overdueCount > 0 ? 'alert' : 'default'}
          onClick={() => onNavigate('protocolos')}
        />
        <KpiCard
          label="Resolvidos no Mês"
          value={resolvedCount + 42}
          subtext="Com devolutiva entregue"
          icon={CheckCircle2}
          variant="success"
          trend={{ value: '94.2%', isPositive: true, label: 'Taxa resolução' }}
          onClick={() => onNavigate('protocolos')}
        />
        <KpiCard
          label="Tempo Médio Resolução"
          value="3,2 dias"
          subtext="Meta: < 5 dias úteis"
          icon={TrendingUp}
          trend={{ value: '-0.8 d', isPositive: true, label: 'Melhoria' }}
        />
      </div>

      {/* Grid: Charts & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Inbound Flow & Distribution */}
        <div className="lg:col-span-2 space-y-6">
          {/* Inbound & Resolution Weekly Bar Chart */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Fluxo de Atendimento Semanal
                </h3>
                <p className="text-xs text-slate-500">
                  Comparativo entre demandas recebidas e devolutivas concluídas
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#102C45]" />
                  Recebidas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#36B7A5]" />
                  Resolvidas
                </span>
              </div>
            </div>

            {/* SVG Custom Bar Chart */}
            <div className="h-44 w-full flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-slate-100">
              {weeklyData.map((d) => {
                const max = 25;
                const recHeight = (d.recebidos / max) * 100;
                const resHeight = (d.resolvidos / max) * 100;
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full flex items-end justify-center gap-1 h-32">
                      <div
                        style={{ height: `${recHeight}%` }}
                        className="w-1/2 max-w-[18px] bg-[#102C45] rounded-t transition-all group-hover:opacity-90 relative"
                        title={`Recebidos: ${d.recebidos}`}
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-slate-700 bg-white px-1 rounded shadow-xs transition-opacity">
                          {d.recebidos}
                        </span>
                      </div>
                      <div
                        style={{ height: `${resHeight}%` }}
                        className="w-1/2 max-w-[18px] bg-[#36B7A5] rounded-t transition-all group-hover:opacity-90 relative"
                        title={`Resolvidos: ${d.resolvidos}`}
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-slate-700 bg-white px-1 rounded shadow-xs transition-opacity">
                          {d.resolvidos}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Channels & Themes Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Canais de Entrada */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <h4 className="font-semibold text-slate-900 text-xs mb-3 flex items-center justify-between">
                <span>Canais de Entrada de Demandas</span>
                <button
                  onClick={() => onNavigate('atendimento')}
                  className="text-[#176B80] hover:underline text-[11px]"
                >
                  Abrir Central
                </button>
              </h4>
              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      WhatsApp Oficial
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 font-semibold">54% (132)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#25D366] h-full rounded-full" style={{ width: '54%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      Instagram Direct
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 font-semibold">22% (54)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#E4405F] h-full rounded-full" style={{ width: '22%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      E-mail Institucional
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 font-semibold">12% (29)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#176B80] h-full rounded-full" style={{ width: '12%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      Presencial no Gabinete (ALMT)
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 font-semibold">8% (20)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#102C45] h-full rounded-full" style={{ width: '8%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Temas Mais Recorrentes */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <h4 className="font-semibold text-slate-900 text-xs mb-3 flex items-center justify-between">
                <span>Temas Mais Demandados</span>
                <button
                  onClick={() => onNavigate('territorial')}
                  className="text-[#176B80] hover:underline text-[11px]"
                >
                  Mapa por Região
                </button>
              </h4>
              <div className="space-y-2 text-xs">
                {[
                  { theme: 'Saúde (Leitos & Cirurgias)', pct: 36, color: 'bg-rose-500' },
                  { theme: 'Infraestrutura (Rodovias MT)', pct: 26, color: 'bg-amber-500' },
                  { theme: 'Educação (Climatização e Reformas)', pct: 18, color: 'bg-blue-500' },
                  { theme: 'Agricultura Familiar (Poços & Pontes)', pct: 12, color: 'bg-emerald-500' },
                  { theme: 'Segurança & Cidadania', pct: 8, color: 'bg-purple-500' },
                ].map((item) => (
                  <div key={item.theme} className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span className="text-slate-800 font-medium">{item.theme}</span>
                    </div>
                    <span className="font-mono font-semibold text-slate-600 tabular-nums">
                      {item.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Prioritized Daily Tasks */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Tarefas Prioritárias da Equipe (Hoje)
                </h3>
                <p className="text-xs text-slate-500">
                  Vinculadas diretamente aos protocolos de cidadãos
                </p>
              </div>
              <button
                onClick={() => onNavigate('agenda')}
                className="text-xs text-[#176B80] hover:underline font-medium"
              >
                Ver Todas as Tarefas
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {tasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  className="py-3 flex items-start justify-between gap-3 group"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => onToggleTask(task.id)}
                      className="mt-1 rounded text-[#176B80] focus:ring-[#176B80] cursor-pointer"
                    />
                    <div>
                      <p
                        className={`text-xs font-semibold ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {task.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                        {task.protocolNumber && (
                          <span className="text-[#102C45] font-semibold">
                            {task.protocolNumber}
                          </span>
                        )}
                        <span>·</span>
                        <span>{task.assigneeName}</span>
                        <span>·</span>
                        <span>Vence {task.dueDate}</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded font-mono ${
                      task.priority === 'urgente'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : task.priority === 'alta'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (1 span): Agenda, Team Status & Quick Links */}
        <div className="space-y-6">
          {/* Official Calendar Next Events */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#176B80]" />
                Agenda do Gabinete
              </h3>
              <button
                onClick={() => onNavigate('agenda')}
                className="text-xs text-[#176B80] hover:underline font-medium"
              >
                Calendário
              </button>
            </div>

            <div className="space-y-3">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
                    <span className="font-semibold text-[#102C45]">
                      {new Date(evt.start).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <span>
                      {new Date(evt.start).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <h5 className="font-semibold text-slate-900 text-xs leading-snug">
                    {evt.title}
                  </h5>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{evt.location} ({evt.city})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Team Workload Live Overview */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-[#176B80]" />
                Carga da Equipe
              </h3>
              <button
                onClick={() => onNavigate('equipe')}
                className="text-xs text-[#176B80] hover:underline font-medium"
              >
                Gerenciar
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {teamMembers
                .filter((m) => m.role === 'assessor_parlamentar' || m.role === 'coordenador_atendimento')
                .map((member) => (
                  <div key={member.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{member.name}</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {member.activeProtocols} protocolos
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          member.overdueProtocols > 0 ? 'bg-amber-500' : 'bg-[#36B7A5]'
                        }`}
                        style={{
                          width: `${Math.min(100, member.activeProtocols * 7)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="p-4 bg-[#102C45] text-white rounded-xl shadow-xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#36B7A5]">
              Atalhos Rápidos
            </h4>
            <div className="space-y-1 text-xs">
              <button
                onClick={() => onNavigate('atendimento')}
                className="w-full p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-[#36B7A5]" />
                  Central de Atendimento
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </button>
              <button
                onClick={() => onNavigate('territorial')}
                className="w-full p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-[#36B7A5]" />
                  Inteligência Territorial MT
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </button>
              <button
                onClick={() => onNavigate('documentos')}
                className="w-full p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[#36B7A5]" />
                  Redigir Novo Ofício
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </button>
              <button
                onClick={() => onNavigate('newsletter')}
                className="w-full p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#36B7A5]" />
                  Newsletter & Disparos
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
