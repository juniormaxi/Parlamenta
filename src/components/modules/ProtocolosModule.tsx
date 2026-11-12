import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Columns,
  List,
  Search,
  Filter,
  Plus,
  Eye,
  Clock,
  Calendar,
  User,
  MapPin,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  X,
  ShieldCheck,
  Check,
  Workflow,
} from 'lucide-react';
import {
  Protocol,
  ProtocolStatus,
  PriorityType,
  ChannelType,
  TeamMember,
} from '../../types';

interface ProtocolosModuleProps {
  protocols: Protocol[];
  teamMembers: TeamMember[];
  onOpenNewProtocol: () => void;
  onUpdateProtocol: (updated: Protocol) => void;
  onNavigateToFlow?: () => void;
}

export const ProtocolosModule: React.FC<ProtocolosModuleProps> = ({
  protocols,
  teamMembers,
  onOpenNewProtocol,
  onUpdateProtocol,
  onNavigateToFlow,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchFilter, setSearchFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('todos');
  const [themeFilter, setThemeFilter] = useState<string>('todos');
  const [cityFilter, setCityFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(
    protocols[0] || null
  );

  // Devolutiva form state
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);

  // Filter logic
  const filteredProtocols = protocols.filter((p) => {
    const matchesSearch =
      p.number.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.citizenName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.subject.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.citizenCity.toLowerCase().includes(searchFilter.toLowerCase());

    const matchesChannel =
      channelFilter === 'todos' || p.channel === channelFilter;
    const matchesTheme = themeFilter === 'todos' || p.theme === themeFilter;
    const matchesCity = cityFilter === 'todos' || p.citizenCity === cityFilter;
    const matchesPriority =
      priorityFilter === 'todos' || p.priority === priorityFilter;
    const matchesStatus =
      statusFilter === 'todos' || p.status === statusFilter;

    return (
      matchesSearch &&
      matchesChannel &&
      matchesTheme &&
      matchesCity &&
      matchesPriority &&
      matchesStatus
    );
  });

  const getPriorityBadge = (pr: PriorityType) => {
    switch (pr) {
      case 'urgente':
        return <span className="font-mono text-rose-700 font-bold uppercase text-[11px]">Urgente</span>;
      case 'alta':
        return <span className="font-mono text-amber-700 font-bold uppercase text-[11px]">Alta</span>;
      case 'media':
        return <span className="font-mono text-blue-700 font-semibold uppercase text-[11px]">Média</span>;
      case 'baixa':
        return <span className="font-mono text-slate-500 uppercase text-[11px]">Baixa</span>;
    }
  };

  const getStatusBadge = (st: ProtocolStatus) => {
    switch (st) {
      case 'novo':
        return <span className="text-cyan-700 font-medium text-xs">Novo</span>;
      case 'em_analise':
        return <span className="text-amber-700 font-medium text-xs">Em Análise</span>;
      case 'em_execucao':
        return <span className="text-[#176B80] font-medium text-xs">Em Execução</span>;
      case 'aguardando_orgao':
        return <span className="text-purple-700 font-medium text-xs">Aguardando Órgão</span>;
      case 'revisao_coordenador':
        return <span className="text-orange-700 font-medium text-xs">Revisão Coord.</span>;
      case 'resolvido':
        return <span className="text-emerald-700 font-semibold text-xs">Resolvido</span>;
      case 'cancelado':
        return <span className="text-slate-400 font-medium text-xs">Cancelado</span>;
    }
  };

  const handleSendFeedback = () => {
    if (!selectedProtocol || !feedbackText.trim()) return;
    setFeedbackSending(true);
    setTimeout(() => {
      const updated: Protocol = {
        ...selectedProtocol,
        citizenFeedbackStatus: 'enviada_sucesso',
        citizenFeedbackText: feedbackText,
        citizenFeedbackChannel: selectedProtocol.channel,
        timeline: [
          ...selectedProtocol.timeline,
          {
            id: `tl-fb-${Date.now()}`,
            timestamp: 'Agora',
            author: 'Equipe de Atendimento',
            role: 'Devolutiva',
            action: 'Devolutiva Auditada Enviada',
            description: `Resposta formal encaminhada ao cidadão via ${selectedProtocol.channel.toUpperCase()}.`,
          },
        ],
      };
      onUpdateProtocol(updated);
      setSelectedProtocol(updated);
      setFeedbackText('');
      setFeedbackSending(false);
    }, 400);
  };

  const kanbanColumns: { id: ProtocolStatus; label: string }[] = [
    { id: 'novo', label: 'Fila de Triagem' },
    { id: 'em_analise', label: 'Em Análise' },
    { id: 'em_execucao', label: 'Em Execução' },
    { id: 'aguardando_orgao', label: 'Aguardando Órgão' },
    { id: 'revisao_coordenador', label: 'Em Revisão' },
    { id: 'resolvido', label: 'Concluído' },
  ];

  return (
    <div className="space-y-4">

      {/* Top Controls & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Protocolos de Atendimento
            </h1>
            <span className="text-xs text-slate-400 font-mono">
              ({filteredProtocols.length} registros)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher (Segmented buttons) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Tabela</span>
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'kanban'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
            </div>

            <button
              onClick={onOpenNewProtocol}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Protocolo</span>
            </button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="md:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nº, cidadão, município ou assunto..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80]"
            />
          </div>

          <div>
            <select
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="todos">Todos os Temas</option>
              <option value="Saúde">Saúde</option>
              <option value="Educação">Educação</option>
              <option value="Infraestrutura">Infraestrutura</option>
              <option value="Agricultura Familiar">Agricultura Familiar</option>
              <option value="Segurança Pública">Segurança Pública</option>
            </select>
          </div>

          <div>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="todos">Todos os Municípios</option>
              <option value="Rondonópolis">Rondonópolis</option>
              <option value="Cuiabá">Cuiabá</option>
              <option value="Sinop">Sinop</option>
              <option value="Nova Mutum">Nova Mutum</option>
              <option value="Juína">Juína</option>
              <option value="Tangará da Serra">Tangará da Serra</option>
              <option value="Barra do Garças">Barra do Garças</option>
            </select>
          </div>

          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="todos">Todas as Prioridades</option>
              <option value="urgente">Urgente</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>

          <div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="todos">Todos os Canais</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="instagram">Instagram</option>
              <option value="presencial">Presencial</option>
              <option value="telefone">Telefone</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Kanban */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3 px-4">Número</th>
                  <th className="py-3 px-4">Cidadão / Município</th>
                  <th className="py-3 px-4">Tema / Assunto</th>
                  <th className="py-3 px-4">Prioridade</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4">SLA / Prazo</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProtocols.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProtocol(p)}
                    className={`cursor-pointer transition-colors ${
                      selectedProtocol?.id === p.id
                        ? 'bg-[#E9F1F4]/50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[#102C45]">
                      {p.number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.citizenName}</div>
                      <div className="text-[11px] text-slate-500">{p.citizenCity}</div>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{p.subject}</div>
                      <div className="text-[11px] text-[#176B80]">{p.theme}</div>
                    </td>
                    <td className="py-3 px-4">{getPriorityBadge(p.priority)}</td>
                    <td className="py-3 px-4">{getStatusBadge(p.status)}</td>
                    <td className="py-3 px-4 text-slate-700">
                      {p.assigneeName || (
                        <span className="text-slate-400 italic">Pendente triagem</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <span
                        className={
                          p.slaStatus === 'atrasado'
                            ? 'text-rose-600 font-bold'
                            : p.slaStatus === 'alerta_48h'
                            ? 'text-amber-600 font-semibold'
                            : 'text-slate-600'
                        }
                      >
                        {new Date(p.deadline).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProtocol(p);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-700"
                        title="Ver detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Kanban View */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kanbanColumns.map((col) => {
            const colProtocols = filteredProtocols.filter(
              (p) => p.status === col.id
            );
            return (
              <div
                key={col.id}
                className="bg-slate-100/70 border border-slate-200 rounded-xl p-2.5 flex flex-col min-h-[500px]"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                  <span className="font-semibold text-slate-800 text-xs">
                    {col.label}
                  </span>
                  <span className="font-mono text-[11px] px-1.5 py-0.2 bg-white rounded text-slate-600 font-bold">
                    {colProtocols.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {colProtocols.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProtocol(p)}
                      className={`p-3 bg-white rounded-lg border transition-all cursor-pointer shadow-2xs hover:shadow-xs space-y-1.5 ${
                        selectedProtocol?.id === p.id
                          ? 'border-[#176B80] ring-1 ring-[#176B80]'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold text-[#102C45]">{p.number}</span>
                        {getPriorityBadge(p.priority)}
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900 leading-snug line-clamp-2">
                        {p.subject}
                      </h4>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="truncate max-w-[90px]">{p.citizenCity}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {p.assigneeName.split(' ')[0]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Protocol Drawer / Detailed Inspector */}
      {selectedProtocol && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-bold text-[#102C45]">
                  {selectedProtocol.number}
                </span>
                {getStatusBadge(selectedProtocol.status)}
                {getPriorityBadge(selectedProtocol.priority)}
                <span className="text-xs text-slate-400 font-mono">
                  Canal: {selectedProtocol.channel.toUpperCase()}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-1">
                {selectedProtocol.subject}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span>Cidadão: <strong className="text-slate-800">{selectedProtocol.citizenName}</strong></span>
                <span>·</span>
                <span>Município: <strong className="text-slate-800">{selectedProtocol.citizenCity}</strong></span>
                <span>·</span>
                <span>Telefone: {selectedProtocol.citizenPhone}</span>
                <span>·</span>
                <span>Categoria: {selectedProtocol.citizenCategory}</span>
              </div>
            </div>

            {onNavigateToFlow && (
              <button
                onClick={onNavigateToFlow}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#176B80] hover:bg-[#102C45] rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Workflow className="w-3.5 h-3.5 text-[#36B7A5]" />
                <span>Abrir no Flow (Gestão de Fila)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 spans: Timeline & Formal Response */}
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              <div>
                <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider mb-2">
                  Descrição dos Fatos & Demanda
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  {selectedProtocol.description}
                </p>
              </div>

              {/* Audit Timeline */}
              <div>
                <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Linha do Tempo Auditável (Histórico de Movimentações)</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    LGPD Imutável
                  </span>
                </h4>

                <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 py-1 text-xs">
                  {selectedProtocol.timeline.map((evt) => (
                    <div key={evt.id} className="relative pl-6">
                      <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-[#176B80]" />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{evt.action}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {evt.timestamp}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{evt.description}</p>
                      <span className="text-[10px] text-[#176B80] font-medium block mt-0.5">
                        Por: {evt.author} ({evt.role})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Citizen Formal Feedback (Devolutiva Auditada) */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-[#176B80]" />
                    Devolutiva ao Cidadão (Prestação de Contas Obrigatória)
                  </h4>
                  {selectedProtocol.citizenFeedbackStatus === 'enviada_sucesso' ? (
                    <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Entregue via {selectedProtocol.citizenFeedbackChannel?.toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-amber-700 font-medium text-xs">
                      Pendente de envio
                    </span>
                  )}
                </div>

                {selectedProtocol.citizenFeedbackText ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 italic">
                    "{selectedProtocol.citizenFeedbackText}"
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500">
                      Redija a resposta oficial com o resultado dos encaminhamentos legislativos feitos pelo gabinete. O envio gerará comprovação auditável.
                    </p>
                    <textarea
                      rows={2}
                      placeholder="Prezado(a) cidadão(ã), informamos que o Gabinete da Dep. Mariana Ribeiro..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#176B80]"
                    />
                    <button
                      onClick={handleSendFeedback}
                      disabled={feedbackSending || !feedbackText.trim()}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{feedbackSending ? 'Enviando...' : 'Registrar e Enviar Devolutiva'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right 1 span: Responsável, SLA e Anexos */}
            <div className="space-y-4">
              {/* Card de Gestão Operacional */}
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3 text-xs">
                <span className="font-semibold text-slate-800 uppercase tracking-wider text-[10px] block">
                  Informações de SLA & Posse
                </span>

                <div>
                  <span className="text-slate-500 block">Assessor Responsável:</span>
                  <span className="font-bold text-slate-900">
                    {selectedProtocol.assigneeName || 'Aguardando atribuição'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Coordenadora de Triagem:</span>
                  <span className="font-medium text-slate-800">
                    {selectedProtocol.coordinatorName}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tempo Total Tramitação:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedProtocol.hoursElapsedTotal} horas
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tempo com o Responsável:</span>
                    <span className="font-mono font-bold text-[#176B80]">
                      {selectedProtocol.hoursElapsedWithAssignee} horas
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Prazo Final Regulamentar:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {new Date(selectedProtocol.deadline).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Anexos e Dossiês */}
              <div className="p-4 border border-slate-200 rounded-xl bg-white space-y-2 text-xs">
                <span className="font-semibold text-slate-800 uppercase tracking-wider text-[10px] block">
                  Documentos & Anexos ({selectedProtocol.attachments.length})
                </span>
                {selectedProtocol.attachments.length === 0 ? (
                  <p className="text-slate-400 text-xs italic">Nenhum documento anexado.</p>
                ) : (
                  selectedProtocol.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2 border border-slate-200 rounded-lg flex items-center justify-between hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Paperclip className="w-3.5 h-3.5 text-[#176B80] shrink-0" />
                        <span className="truncate text-slate-800 font-medium">
                          {att.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {att.size}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
