import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Plus,
  Phone,
  User,
  MapPin,
  Tag,
  ShieldCheck,
  FileCheck,
  Building,
  Mail,
  Camera,
  Layers,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { Conversation, ChannelType, Protocol, PriorityType } from '../../types';
import { useDialog } from '../common/Dialogs';
import { api } from '../../lib/api';
import { MunicipioAutocomplete } from '../common/MunicipioAutocomplete';
import type { Taxonomy, EntryChannel } from './banco/ui';
import { WhatsAppModule, type ProtocolPrefill } from './WhatsAppModule';

/** Tag aplicada a todo atendimento criado em "Registrar Manual". */
export const MANUAL_ENTRY_TAG = 'Lançado Manualmente';

export interface ManualEntryData {
  name: string;
  city: string;
  phone: string;
  channelName: string;
  summary: string;
}

interface AtendimentoModuleProps {
  conversations: Conversation[];
  onSelectConversation?: (conv: Conversation) => void;
  onCreateProtocolFromConversation: (protocolData: {
    conversationId: string;
    citizenName: string;
    citizenCity: string;
    citizenPhone: string;
    citizenCategory: string;
    channel: ChannelType;
    theme: any;
    subject: string;
    description: string;
    priority: PriorityType;
  }) => void;
  onSendMessage: (conversationId: string, text: string) => void;
  onCreateManualEntry: (data: ManualEntryData) => void;
  canManageChannels?: boolean;
  onManageChannels?: () => void;
  /** Aba inicial (ex.: 'whatsapp' quando vem de Canais & Integrações). */
  initialChannelFilter?: string;
  /** Aba WhatsApp: conversas reais do número conectado em Canais & Integrações. */
  onOpenWhatsAppProtocol: (prefill: ProtocolPrefill) => void;
  onWhatsAppUnreadChange?: (n: number) => void;
  onOpenIntegracoes?: () => void;
}

export const AtendimentoModule: React.FC<AtendimentoModuleProps> = ({
  conversations,
  onCreateProtocolFromConversation,
  onSendMessage,
  onCreateManualEntry,
  canManageChannels = false,
  onManageChannels,
  initialChannelFilter = 'todos',
  onOpenWhatsAppProtocol,
  onWhatsAppUnreadChange,
  onOpenIntegracoes,
}) => {
  const dialog = useDialog();
  const [activeChannelFilter, setActiveChannelFilter] = useState<string>(initialChannelFilter);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedConvId, setSelectedConvId] = useState<string>(
    conversations[0]?.id || ''
  );
  const [replyInput, setReplyInput] = useState<string>('');
  const [protocolModalOpen, setProtocolModalOpen] = useState(false);
  const [newManualContactOpen, setNewManualContactOpen] = useState(false);
  const emptyManual: ManualEntryData = { name: '', city: '', phone: '', channelName: '', summary: '' };
  const [manualForm, setManualForm] = useState<ManualEntryData>(emptyManual);
  const [entryChannels, setEntryChannels] = useState<EntryChannel[] | null>(null);

  // Opções do "Canal de Entrada" vêm de Banco de Dados › Categorias › Canais de Entrada.
  useEffect(() => {
    if (!newManualContactOpen) return;
    let alive = true;
    api<Taxonomy>('/tenant/db/taxonomy')
      .then((tx) => {
        if (!alive) return;
        setEntryChannels(tx.entryChannels);
        setManualForm((f) => (f.channelName ? f : { ...f, channelName: tx.entryChannels[0]?.name ?? '' }));
      })
      .catch((e) => {
        if (alive) {
          setEntryChannels([]);
          dialog.alert({ title: 'Erro ao carregar canais de entrada', message: (e as Error).message, tone: 'danger' });
        }
      });
    return () => {
      alive = false;
    };
  }, [newManualContactOpen, dialog]);

  const closeManual = () => {
    setNewManualContactOpen(false);
    setManualForm(emptyManual);
  };

  const saveManual = () => {
    if (!manualForm.name.trim() || !manualForm.channelName || !manualForm.summary.trim()) {
      dialog.alert({ title: 'Campos obrigatórios', message: 'Informe o nome, o canal de entrada e o resumo da demanda.', tone: 'warning' });
      return;
    }
    onCreateManualEntry({
      name: manualForm.name.trim(),
      city: manualForm.city.trim(),
      phone: manualForm.phone.trim(),
      channelName: manualForm.channelName,
      summary: manualForm.summary.trim(),
    });
    dialog.toast('Atendimento manual registrado na Caixa de Entrada.');
    closeManual();
  };

  // Form state for protocol confirmation
  const [protocolForm, setProtocolForm] = useState({
    theme: 'Saúde',
    subject: '',
    priority: 'alta' as PriorityType,
    description: '',
  });

  const selectedConversation =
    conversations.find((c) => c.id === selectedConvId) || conversations[0];

  const filteredConversations = conversations.filter((c) => {
    const matchesChannel =
      activeChannelFilter === 'todos' || c.channel === activeChannelFilter;
    const matchesSearch =
      c.citizen.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.citizen.city.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesChannel && matchesSearch;
  });

  const handleOpenProtocolModal = () => {
    if (!selectedConversation) return;
    const sug = selectedConversation.suggestedProtocol;
    setProtocolForm({
      theme: sug?.theme || 'Saúde',
      subject: sug?.summary || `Demanda encaminhada por ${selectedConversation.citizen.name}`,
      priority: sug?.priority || 'alta',
      description: selectedConversation.lastMessage,
    });
    setProtocolModalOpen(true);
  };

  const handleConfirmProtocol = () => {
    if (!selectedConversation) return;
    onCreateProtocolFromConversation({
      conversationId: selectedConversation.id,
      citizenName: selectedConversation.citizen.name,
      citizenCity: selectedConversation.citizen.city,
      citizenPhone: selectedConversation.citizen.phone,
      citizenCategory: selectedConversation.citizen.category,
      channel: selectedConversation.channel,
      theme: protocolForm.theme,
      subject: protocolForm.subject,
      description: protocolForm.description,
      priority: protocolForm.priority,
    });
    setProtocolModalOpen(false);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !selectedConversation) return;
    onSendMessage(selectedConversation.id, replyInput);
    setReplyInput('');
  };

  const getChannelBadge = (ch: ChannelType, label?: string) => {
    if (label) return <span className="text-[#102C45] font-semibold text-[11px]">{label}</span>;
    switch (ch) {
      case 'whatsapp':
        return <span className="text-emerald-700 font-semibold text-[11px]">WhatsApp</span>;
      case 'instagram':
        return <span className="text-rose-700 font-semibold text-[11px]">Instagram</span>;
      case 'messenger':
        return <span className="text-blue-700 font-semibold text-[11px]">Messenger</span>;
      case 'email':
        return <span className="text-cyan-700 font-semibold text-[11px]">E-mail</span>;
      case 'telefone':
        return <span className="text-amber-700 font-semibold text-[11px]">Telefone</span>;
      case 'presencial':
        return <span className="text-[#102C45] font-semibold text-[11px]">Presencial ALMT</span>;
      case 'web':
        return <span className="text-violet-700 font-semibold text-[11px]">Site</span>;
    }
  };

  const channelTabs = [
    { id: 'todos', label: 'Todos' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'email', label: 'E-mail' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'presencial', label: 'Presencial' },
  ];

  return (
    <div className="space-y-4">
      {/* Abas de canal */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto max-w-full">
        {channelTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveChannelFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeChannelFilter === tab.id
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeChannelFilter === 'whatsapp' ? (
        <WhatsAppModule
          onOpenProtocol={onOpenWhatsAppProtocol}
          onUnreadChange={onWhatsAppUnreadChange}
          onOpenIntegracoes={onOpenIntegracoes}
        />
      ) : (
      <>
      {/* Main Inbox Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col md:flex-row h-[720px]">
        {/* Left List Pane: Channels, search and conversations list */}
        <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
          {/* Header & New Manual Entry */}
          <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#176B80]" />
              Caixa de Entrada
            </h2>
            <button
              onClick={() => setNewManualContactOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold text-[#102C45] bg-[#E9F1F4] hover:bg-[#d6e5eb] rounded-lg transition-colors flex items-center gap-1"
              title="Registrar atendimento por telefone ou presencial no gabinete"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Registrar Manual</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 bg-white border-b border-slate-200">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por cidadão, município, texto..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80]"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhuma conversa encontrada neste filtro.
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = selectedConvId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConvId(c.id)}
                    className={`w-full text-left p-3.5 transition-colors relative flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-white border-l-4 border-l-[#176B80] shadow-2xs'
                        : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 truncate pr-2">
                        {c.citizen.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {c.lastMessageTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {getChannelBadge(c.channel, c.channelLabel)}
                      <span>·</span>
                      <span className="truncate">{c.citizen.city}</span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                      {c.lastMessage}
                    </p>

                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100 text-[10px]">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        {c.tags.map((t) =>
                          t === MANUAL_ENTRY_TAG ? (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                              {t}
                            </span>
                          ) : (
                            <span key={t} className="font-medium text-slate-600">
                              #{t}
                            </span>
                          )
                        )}
                      </div>

                      {c.linkedProtocolId ? (
                        <span className="font-mono text-[#102C45] font-semibold">
                          {c.linkedProtocolId}
                        </span>
                      ) : (
                        <span className="text-[#176B80] font-medium">
                          Triagem pendente
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane: Message History, Citizen Metadata & Action */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-white">
            {/* Topbar of Selected Conversation */}
            <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#102C45] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedConversation.citizen.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm">
                      {selectedConversation.citizen.name}
                    </h3>
                    <span className="text-[11px] text-slate-500 font-mono">
                      (CPF: {selectedConversation.citizen.documentMasked})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-[#176B80]">
                      {selectedConversation.citizen.category}
                    </span>
                    <span>·</span>
                    <span>{selectedConversation.citizen.city}</span>
                    <span>·</span>
                    <span>{selectedConversation.citizen.phone}</span>
                  </div>
                </div>
              </div>

              {/* Action: Protocol Creation or Linked indicator */}
              <div className="flex items-center gap-2">
                {selectedConversation.linkedProtocolId ? (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Protocolado ({selectedConversation.linkedProtocolId})</span>
                  </div>
                ) : (
                  <button
                    onClick={handleOpenProtocolModal}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                    title="Abre modal para confirmação humana do protocolo sugerido"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-[#36B7A5]" />
                    <span>Gerar Protocolo Sugerido</span>
                  </button>
                )}
              </div>
            </div>

            {/* Suggested Protocol Summary Card (AI-Assisted Triagem) */}
            {selectedConversation.suggestedProtocol && !selectedConversation.linkedProtocolId && (
              <div className="mx-6 mt-3 p-3 rounded-xl bg-[#E9F1F4]/70 border border-[#176B80]/20 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#102C45] uppercase tracking-wider text-[10px]">
                      Sugestão de Protocolo Identificada
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-rose-600 capitalize">
                      Prioridade: {selectedConversation.suggestedProtocol.priority}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-slate-700">
                      Tema: {selectedConversation.suggestedProtocol.theme}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {selectedConversation.suggestedProtocol.summary}
                  </p>
                </div>
                <button
                  onClick={handleOpenProtocolModal}
                  className="px-3 py-1 bg-[#176B80] hover:bg-[#102C45] text-white text-[11px] font-medium rounded-lg shrink-0 transition-colors"
                >
                  Confirmar Abertura
                </button>
              </div>
            )}

            {/* Chat Message History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/20">
              {selectedConversation.messages.map((m) => {
                const isCitizen = m.sender === 'citizen';
                const isSystem = m.sender === 'system';

                if (isSystem) {
                  return (
                    <div key={m.id} className="text-center my-3">
                      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-mono">
                        {m.content} ({m.timestamp})
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-lg ${
                      isCitizen ? 'mr-auto items-start' : 'ml-auto items-end'
                    }`}
                  >
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                        isCitizen
                          ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                          : 'bg-[#102C45] text-white rounded-tr-xs'
                      }`}
                    >
                      <p>{m.content}</p>
                      {m.attachments && (
                        <div className="mt-2 pt-2 border-t border-slate-200/40 space-y-1">
                          {m.attachments.map((att) => (
                            <div
                              key={att.name}
                              className="text-[11px] font-mono text-[#176B80] bg-white/20 p-1 rounded flex items-center justify-between"
                            >
                              <span>{att.name}</span>
                              <span className="text-slate-400">{att.size}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 font-mono px-1">
                      {isCitizen ? selectedConversation.citizen.name : 'Gabinete Parlamentar'} ·{' '}
                      {m.timestamp}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={handleSend}
              className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
            >
              <input
                type="text"
                placeholder={`Responder a ${selectedConversation.citizen.name} via ${selectedConversation.channelLabel ?? selectedConversation.channel}...`}
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                className="flex-1 px-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <span>Enviar</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-xs">
            Selecione uma conversa para visualizar o atendimento.
          </div>
        )}
      </div>
      </>
      )}

      {/* Modal: Confirmação Humana de Criação de Protocolo */}
      {protocolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Criar Protocolo Oficial</h3>
                <p className="text-xs text-slate-300">
                  Validação humana da demanda de {selectedConversation?.citizen.name}
                </p>
              </div>
              <button
                onClick={() => setProtocolModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">
                    Tema Parlamentar
                  </label>
                  <select
                    value={protocolForm.theme}
                    onChange={(e) =>
                      setProtocolForm({ ...protocolForm, theme: e.target.value })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Saúde">Saúde</option>
                    <option value="Educação">Educação</option>
                    <option value="Infraestrutura">Infraestrutura</option>
                    <option value="Agricultura Familiar">Agricultura Familiar</option>
                    <option value="Segurança Pública">Segurança Pública</option>
                    <option value="Cultura & Esporte">Cultura & Esporte</option>
                    <option value="Meio Ambiente">Meio Ambiente</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-800 block mb-1">
                    Classificação de Prioridade
                  </label>
                  <select
                    value={protocolForm.priority}
                    onChange={(e) =>
                      setProtocolForm({
                        ...protocolForm,
                        priority: e.target.value as PriorityType,
                      })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="baixa">Baixa (Rotina)</option>
                    <option value="media">Média (SLA 5 dias)</option>
                    <option value="alta">Alta (SLA 48h)</option>
                    <option value="urgente">Urgente (SLA 24h)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Assunto da Demanda
                </label>
                <input
                  type="text"
                  value={protocolForm.subject}
                  onChange={(e) =>
                    setProtocolForm({ ...protocolForm, subject: e.target.value })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Descrição & Encaminhamentos Necessários
                </label>
                <textarea
                  rows={3}
                  value={protocolForm.description}
                  onChange={(e) =>
                    setProtocolForm({ ...protocolForm, description: e.target.value })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="bg-[#E9F1F4] p-3 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#176B80] shrink-0 mt-0.5" />
                <span>
                  Ao confirmar, o protocolo entrará na <strong>Fila de Triagem do Coordenador</strong> no Parlamentta Flow para atribuição a um assessor parlamentar com fixação de prazo SLA.
                </span>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setProtocolModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmProtocol}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Gerar Protocolo Oficial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo Atendimento Manual */}
      {newManualContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Registrar Atendimento Manual</h3>
              <button onClick={closeManual} className="text-slate-300" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs text-slate-700">
              <p className="text-slate-500">
                Utilize para registrar cidadãos atendidos fora dos canais digitais. O registro entra na Caixa de Entrada com a tag{' '}
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">{MANUAL_ENTRY_TAG}</span>.
              </p>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  placeholder="Ex: João da Silva"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Município</label>
                  <MunicipioAutocomplete
                    value={manualForm.city}
                    onChange={(city) => setManualForm({ ...manualForm, city })}
                    placeholder="Digite: Sinop, Cuiabá…"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Telefone</label>
                  <input
                    type="text"
                    value={manualForm.phone}
                    onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                    placeholder="(65) 99999-9999"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-800">Canal de Entrada *</label>
                  {canManageChannels && onManageChannels && (
                    <button
                      type="button"
                      onClick={() => {
                        closeManual();
                        onManageChannels();
                      }}
                      className="text-[11px] text-[#176B80] font-semibold hover:underline"
                    >
                      Gerenciar canais
                    </button>
                  )}
                </div>
                <select
                  value={manualForm.channelName}
                  onChange={(e) => setManualForm({ ...manualForm, channelName: e.target.value })}
                  disabled={!entryChannels || entryChannels.length === 0}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs disabled:opacity-60"
                >
                  {!entryChannels && <option value="">Carregando…</option>}
                  {entryChannels?.length === 0 && <option value="">Nenhum canal cadastrado</option>}
                  {entryChannels?.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {entryChannels?.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">Cadastre os canais em Banco de Dados › Categorias › Canais de Entrada.</p>
                )}
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Resumo da Demanda *</label>
                <textarea
                  rows={8}
                  value={manualForm.summary}
                  onChange={(e) => setManualForm({ ...manualForm, summary: e.target.value })}
                  placeholder="Relato trazido pelo cidadão..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs min-h-[160px] resize-y leading-relaxed"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={closeManual} className="px-3 py-1.5 text-xs text-slate-600">
                Cancelar
              </button>
              <button onClick={saveManual} className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] rounded-lg">
                Salvar Atendimento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
