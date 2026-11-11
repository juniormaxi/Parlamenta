import React, { useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Plus,
  Clock,
  MapPin,
  Users,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Check,
} from 'lucide-react';
import { CalendarEvent, FlowTask, PriorityType } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';

interface AgendaTarefasModuleProps {
  events: CalendarEvent[];
  tasks: FlowTask[];
  onToggleTask: (taskId: string) => void;
  onAddTask: (newTask: Omit<FlowTask, 'id'>) => void;
  onAddEvent: (newEvent: Omit<CalendarEvent, 'id'>) => void;
}

export const AgendaTarefasModule: React.FC<AgendaTarefasModuleProps> = ({
  events,
  tasks,
  onToggleTask,
  onAddTask,
  onAddEvent,
}) => {
  const [viewMode, setViewMode] = useState<'mes' | 'semana' | 'dia' | 'lista'>('semana');
  const [activeTab, setActiveTab] = useState<'agenda' | 'tarefas'>('agenda');

  // Modals
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Form states
  const [eventForm, setEventForm] = useState({
    title: '',
    type: 'reuniao' as any,
    city: 'Cuiabá',
    location: '',
    start: '2026-11-12T10:00',
    end: '2026-11-12T11:30',
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigneeName: 'Lucas Mendes',
    dueDate: '2026-11-12',
    priority: 'alta' as PriorityType,
    type: 'oficio' as any,
    protocolNumber: '',
  });

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim()) return;
    onAddEvent({
      ...eventForm,
      attendees: ['Dep. Mariana Ribeiro'],
    });
    setEventModalOpen(false);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    onAddTask({
      ...taskForm,
      completed: false,
    });
    setTaskModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Agenda & Gestão de Tarefas"
        contextText="Compromissos oficiais da Deputada e tarefas da equipe vinculadas a protocolos de atendimento."
      />

      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#176B80]" />
            Agenda Oficial & Minhas Tarefas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sessões legislativas, audiências públicas, viagens pelo interior e cumprimento de prazos
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Segment Switch: Agenda vs Tarefas */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setActiveTab('agenda')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'agenda'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda de Compromissos
            </button>
            <button
              onClick={() => setActiveTab('tarefas')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'tarefas'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tarefas da Equipe
            </button>
          </div>

          {activeTab === 'agenda' ? (
            <button
              onClick={() => setEventModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Compromisso</span>
            </button>
          ) : (
            <button
              onClick={() => setTaskModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Tarefa</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab: Agenda */}
      {activeTab === 'agenda' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="p-1 rounded hover:bg-slate-100 text-slate-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-900 text-sm">
                Novembro de 2026 · Semana 46
              </span>
              <button className="p-1 rounded hover:bg-slate-100 text-slate-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs">
              {(['mes', 'semana', 'dia', 'lista'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`px-2.5 py-1 rounded capitalize font-medium ${
                    viewMode === m
                      ? 'bg-[#102C45] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[#102C45]">
                    {new Date(evt.start).toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                  <span className="text-slate-500">
                    {new Date(evt.start).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    -{' '}
                    {new Date(evt.end).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug">
                  {evt.title}
                </h3>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{evt.location} ({evt.city})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{evt.attendees.join(', ')}</span>
                  </div>
                </div>

                {evt.protocolId && (
                  <div className="text-[11px] font-mono text-[#176B80] bg-[#E9F1F4] p-1.5 rounded flex items-center justify-between">
                    <span>Protocolo Vinculado:</span>
                    <strong className="font-bold">{evt.protocolId}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Tarefas */}
      {activeTab === 'tarefas' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Tarefas Operacionais do Gabinete
              </h3>
              <p className="text-xs text-slate-500">
                Atribuídas por assessor temático com vínculo direto aos protocolos
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 font-semibold">
              {tasks.filter((t) => !t.completed).length} pendentes
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => onToggleTask(task.id)}
                    className="mt-1 rounded text-[#176B80] focus:ring-[#176B80] cursor-pointer"
                  />
                  <div>
                    <h4
                      className={`font-bold text-sm ${
                        task.completed
                          ? 'line-through text-slate-400'
                          : 'text-slate-900'
                      }`}
                    >
                      {task.title}
                    </h4>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">
                      {task.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2 font-mono">
                      <span>Responsável: <strong className="text-slate-800">{task.assigneeName}</strong></span>
                      <span>·</span>
                      <span>Vence: <strong className="text-slate-800">{task.dueDate}</strong></span>
                      {task.protocolNumber && (
                        <>
                          <span>·</span>
                          <span className="text-[#102C45] font-semibold">
                            Protocolo: {task.protocolNumber}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded font-mono shrink-0 ${
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
      )}

      {/* Modal: Novo Compromisso */}
      {eventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateEvent}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Agendar Compromisso Oficial</h3>
              <button
                type="button"
                onClick={() => setEventModalOpen(false)}
                className="text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Título</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Audiência com Prefeito e Vereadores"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Município</label>
                  <input
                    type="text"
                    value={eventForm.city}
                    onChange={(e) => setEventForm({ ...eventForm, city: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Tipo</label>
                  <select
                    value={eventForm.type}
                    onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="plenario">Sessão Plenária</option>
                    <option value="audiencia">Audiência Técnica</option>
                    <option value="visita_municipio">Visita ao Município</option>
                    <option value="reuniao">Reunião Interna</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Local</label>
                <input
                  type="text"
                  placeholder="Ex: Palácio Paiaguás / Gabinete SES"
                  value={eventForm.location}
                  onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEventModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] rounded-lg"
              >
                Salvar Compromisso
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Nova Tarefa */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Criar Tarefa para a Equipe</h3>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Título da Tarefa</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Elaborar relatório de vistoria"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Responsável</label>
                <select
                  value={taskForm.assigneeName}
                  onChange={(e) => setTaskForm({ ...taskForm, assigneeName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Lucas Mendes">Lucas Mendes (Saúde/Infra)</option>
                  <option value="Camila Barreto">Camila Barreto (Municípios)</option>
                  <option value="Felipe Rezende">Felipe Rezende (Comunicação)</option>
                  <option value="Dr. Roberto Valente">Dr. Roberto Valente (Chefia)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Prazo</label>
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Prioridade</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, priority: e.target.value as PriorityType })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Vínculo com Protocolo (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: PRT-2026-0042"
                  value={taskForm.protocolNumber}
                  onChange={(e) => setTaskForm({ ...taskForm, protocolNumber: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] rounded-lg"
              >
                Salvar Tarefa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
