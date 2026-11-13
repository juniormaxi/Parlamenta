/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { api, type Session, type ApiTenant } from './lib/api';
import { SuperAdminConsole } from './components/superadmin/SuperAdminConsole';
import {
  ModuleType,
  UserRole,
  Cabinet,
  Protocol,
  Conversation,
  FlowTask,
  CalendarEvent,
  DocumentModel,
  PressRelease,
  CMSPost,
  AuditLog,
  PriorityType,
  ChannelType,
  NewsletterSubscriber,
  NewsletterCampaign,
  LegislativeBill,
} from './types';
import {
  mockCabinets,
  mockTeamMembers,
  mockConversations,
  mockProtocols,
  mockFlowTasks,
  mockCalendarEvents,
  mockMunicipalitiesData,
  mockDocuments,
  mockPressReleases,
  mockCMSPosts,
  mockAuditLogs,
  mockNewsletterSubscribers,
  mockNewsletterCampaigns,
  mockLegislativeBills,
} from './data/mockData';

// Layout & Common Components
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { LogoUploaderModal } from './components/common/LogoUploaderModal';
import { NovoProtocoloModal } from './components/common/NovoProtocoloModal';
import { channelTypeFromName } from './lib/channels';
import { hydrateProtocol } from './lib/protocols';
import { useDialog } from './components/common/Dialogs';
import { FluxoGuiadoModal } from './components/modules/FluxoGuiadoModal';
import { LoginView } from './components/auth/LoginView';

// Modules
import { DashboardModule } from './components/modules/DashboardModule';
import { AtendimentoModule, MANUAL_ENTRY_TAG, type ManualEntryData } from './components/modules/AtendimentoModule';
import { ProtocolosModule } from './components/modules/ProtocolosModule';
import { ParlamenttaFlowModule } from './components/modules/ParlamenttaFlowModule';
import { AgendaTarefasModule } from './components/modules/AgendaTarefasModule';
import { EquipeModule } from './components/modules/EquipeModule';
import { InteligenciaTerritorialModule } from './components/modules/InteligenciaTerritorialModule';
import { DocumentosModule } from './components/modules/DocumentosModule';
import { NewsletterModule } from './components/modules/NewsletterModule';
import { ConhecimentoImprensaModule } from './components/modules/ConhecimentoImprensaModule';
import { SiteCmsModule } from './components/modules/SiteCmsModule';
import { ClippingModule } from './components/modules/ClippingModule';
import { CrmModule } from './components/modules/CrmModule';
import { GestaoLegislativaModule } from './components/modules/GestaoLegislativaModule';
import { ParlamentoHemicicloModule } from './components/modules/legislativo/ParlamentoHemicicloModule';
import { ProjetosLeiModule } from './components/modules/legislativo/ProjetosLeiModule';
import { OficiosModule } from './components/modules/legislativo/OficiosModule';
import { IntegracoesModule } from './components/modules/IntegracoesModule';
import type { ProtocolPrefill } from './components/modules/WhatsAppModule';
import { wa } from './lib/whatsapp';
import { RelatoriosModule } from './components/modules/RelatoriosModule';
import { AdministracaoModule } from './components/modules/AdministracaoModule';
import { ContatosModule } from './components/modules/banco/ContatosModule';
import { CategoriasModule } from './components/modules/banco/CategoriasModule';
import { DiscursosModule } from './components/modules/banco/DiscursosModule';
import { ImportarModule } from './components/modules/banco/ImportarModule';
import { ConhecimentoModule } from './components/modules/banco/ConhecimentoModule';
import { chamberConfig } from './lib/chamber';

function tenantToCabinet(t: ApiTenant): Cabinet {
  return {
    id: t.id,
    name: t.name,
    parliamentarian: t.parliamentarian,
    sphere: t.sphere,
    house: t.house,
    state: t.state,
    city: t.city,
    seats: t.seats,
    party: '',
  };
}

/**
 * Session gate. The server decides who the user is, their role and their tenant;
 * the client never chooses a tenant. Each login mounts a fresh workspace so no
 * in-memory state survives from a previous user.
 */
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSession(await api<Session>('/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
  }, []);

  if (!checked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F8FAFC] text-xs text-slate-500">
        Verificando sessão…
      </div>
    );
  }

  if (!session) return <LoginView onLoginSuccess={refresh} cabinetName="Parlamentta" />;

  if (session.user.role === 'super_admin') {
    return <SuperAdminConsole user={session.user} onLogout={logout} />;
  }

  return <CabinetWorkspace key={session.user.id} session={session} onLogout={logout} />;
}

function CabinetWorkspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const tenantCabinet = tenantToCabinet(session.tenant!);

  // Navigation & Cabinet State
  const [currentModule, setCurrentModule] = useState<ModuleType>('dashboard');
  const [activeCabinet, setActiveCabinet] = useState<Cabinet>(tenantCabinet);
  const [currentRole, setCurrentRole] = useState<UserRole>(session.user.role as UserRole);
  const [customLogoUrl, setCustomLogoUrl] = useState<string>('');
  // Filter pre-selected when jumping to the contacts list (from an import or a category/tag).
  const [contactsFilter, setContactsFilter] = useState<{ tag?: string; category?: string }>({});
  const [categoriasTab, setCategoriasTab] = useState<'categorias' | 'etiquetas' | 'tipos' | 'canais' | 'temas'>('categorias');
  const openContacts = (filter: { tag?: string; category?: string }) => {
    setContactsFilter(filter);
    setCurrentModule('bd_contatos');
  };
  const openCategorias = (tab: 'categorias' | 'etiquetas' | 'tipos' | 'canais' | 'temas') => {
    setCategoriasTab(tab);
    setCurrentModule('bd_categorias');
  };
  // Server enforces these too; the flag only hides buttons the user cannot use.
  const canManageDb = ['deputado', 'chefe_gabinete', 'coordenador_atendimento'].includes(session.user.role);

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchFilter] = useState('');

  // Modals state
  const [guidedTourOpen, setGuidedTourOpen] = useState(false);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [newProtocolModalOpen, setNewProtocolModalOpen] = useState(false);

  // Core Data State
  const [protocols, setProtocols] = useState<Protocol[]>(mockProtocols);
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [tasks, setTasks] = useState<FlowTask[]>(mockFlowTasks);
  const [events, setEvents] = useState<CalendarEvent[]>(mockCalendarEvents);
  const [documents, setDocuments] = useState<DocumentModel[]>(mockDocuments);
  const [pressReleases, setPressReleases] = useState<PressRelease[]>(mockPressReleases);
  const [cmsPosts, setCmsPosts] = useState<CMSPost[]>(mockCMSPosts);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(mockAuditLogs);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>(mockNewsletterSubscribers);
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>(mockNewsletterCampaigns);
  // Casa legislativa do gabinete (esfera, cadeiras, quóruns). A composição e as votações do plenário vêm
  // das fontes oficiais da casa (server/plenario), carregadas pelo próprio módulo.
  const chamber = chamberConfig({ sphere: tenantCabinet.sphere, state: tenantCabinet.state, city: tenantCabinet.city, house: tenantCabinet.house, seats: tenantCabinet.seats });
  const [bills, setBills] = useState<LegislativeBill[]>(mockLegislativeBills);
  // Ofício a destacar ao abrir Legislativo › Ofícios a partir da Base de Conhecimento.
  const [focusLetterId, setFocusLetterId] = useState<string | null>(null);

  // Protocolos gravados no servidor (equipe + site do parlamentar) aparecem antes dos de demonstração.
  const dialog = useDialog();
  const loadProtocols = useCallback(async () => {
    try {
      const rows = await api<Protocol[]>('/tenant/protocols');
      const server = rows.map(hydrateProtocol);
      setProtocols((prev) => {
        const ids = new Set(server.map((p) => p.id));
        return [...server, ...prev.filter((p) => !p.persisted && !ids.has(p.id))];
      });
    } catch {
      /* mantém os dados atuais; nova tentativa no próximo ciclo */
    }
  }, []);
  useEffect(() => {
    loadProtocols();
    // Novas demandas do site chegam sem recarregar a página.
    const t = window.setInterval(loadProtocols, 60_000);
    return () => window.clearInterval(t);
  }, [loadProtocols]);
  useEffect(() => {
    if (currentModule === 'protocolos' || currentModule === 'flow') loadProtocols();
  }, [currentModule, loadProtocols]);

  const persistProtocol = async (p: Protocol) => {
    if (!p.persisted) return;
    try {
      const saved = hydrateProtocol(await api<Protocol>(`/tenant/protocols/${p.id}`, { method: 'PATCH', body: p }));
      setProtocols((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      dialog.alert({ title: 'Não foi possível salvar o protocolo', message: (e as Error).message, tone: 'danger' });
    }
  };

  // Handlers for Protocol & Workflow operations
  const handleUpdateProtocol = (updated: Protocol) => {
    setProtocols((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    persistProtocol(updated);
  };

  const handleCreateProtocol = async (data: {
    citizenName: string;
    citizenCity: string;
    citizenPhone: string;
    citizenEmail?: string;
    citizenCategory: string;
    channel: ChannelType;
    channelLabel?: string;
    theme: any;
    subject: string;
    description: string;
    priority: PriorityType;
  }): Promise<Protocol | null> => {
    let saved: Protocol;
    try {
      saved = hydrateProtocol(
        await api<Protocol>('/tenant/protocols', {
          method: 'POST',
          body: {
            ...data,
            status: 'novo',
            assigneeId: '',
            assigneeName: 'Pendente de atribuição',
            coordinatorId: session.user.id,
            coordinatorName: session.user.name,
            slaStatus: 'normal',
            hoursElapsedTotal: 0,
            hoursElapsedWithAssignee: 0,
            tags: [data.theme, data.citizenCity].filter(Boolean),
            attachments: [],
            citizenFeedbackStatus: 'pendente',
            authorName: session.user.name,
            authorRole: session.user.role,
          },
        })
      );
    } catch (e) {
      dialog.alert({ title: 'Não foi possível criar o protocolo', message: (e as Error).message, tone: 'danger' });
      return null;
    }
    const protocolId = saved.number;
    setProtocols((prev) => [saved, ...prev]);
    dialog.toast(`Protocolo ${protocolId} criado.`);

    // Log in Audit
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        userName: 'Letícia Prado',
        userRole: 'Coordenadora',
        action: 'Criação de Protocolo',
        resource: protocolId,
        details: `Criado protocolo referente a ${data.subject} em ${data.citizenCity}.`,
        ip: '177.142.18.90',
      },
      ...prev,
    ]);
    return saved;
  };

  const handleCreateProtocolFromConversation = async (data: {
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
  }) => {
    const saved = await handleCreateProtocol(data);
    if (!saved) return;

    // Link conversation
    const protocolId = saved.number;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === data.conversationId
          ? { ...c, linkedProtocolId: protocolId, status: 'triada' }
          : c
      )
    );
  };

  const handleCreateManualEntry = (data: ManualEntryData) => {
    const id = `conv-manual-${Date.now()}`;
    const channel = channelTypeFromName(data.channelName);
    setConversations((prev) => [
      {
        id,
        citizen: {
          id: `cit-${Date.now()}`,
          name: data.name,
          documentMasked: '',
          email: '',
          phone: data.phone,
          city: data.city,
          neighborhood: '',
          category: 'Cidadão Geral',
          interactionsCount: 1,
        },
        channel,
        channelLabel: data.channelName,
        lastMessage: data.summary,
        lastMessageTime: 'Agora',
        unreadCount: 0,
        tags: [MANUAL_ENTRY_TAG],
        status: 'aberta',
        messages: [
          {
            id: `msg-${Date.now()}`,
            sender: 'system',
            content: `Atendimento registrado manualmente por ${session.user.name} · Canal: ${data.channelName}`,
            timestamp: 'Agora',
            channel,
          },
          { id: `msg-${Date.now()}-1`, sender: 'citizen', content: data.summary, timestamp: 'Agora', channel },
        ],
      },
      ...prev,
    ]);
  };

  const handleSendMessage = (conversationId: string, text: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === conversationId) {
          return {
            ...c,
            lastMessage: text,
            lastMessageTime: 'Agora',
            messages: [
              ...c.messages,
              {
                id: `msg-${Date.now()}`,
                sender: 'cabinet',
                content: text,
                timestamp: 'Agora',
                channel: c.channel,
              },
            ],
          };
        }
        return c;
      })
    );
  };

  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleAddTask = (newTask: Omit<FlowTask, 'id'>) => {
    const task: FlowTask = {
      ...newTask,
      id: `tsk-${Date.now()}`,
    };
    setTasks((prev) => [task, ...prev]);
  };

  const handleAddEvent = (newEvent: Omit<CalendarEvent, 'id'>) => {
    const event: CalendarEvent = {
      ...newEvent,
      id: `evt-${Date.now()}`,
    };
    setEvents((prev) => [event, ...prev]);
  };

  const handleRedistributeProtocols = (
    fromId: string,
    toId: string,
    count: number
  ) => {
    const targetMember = mockTeamMembers.find((m) => m.id === toId);
    let reassigned = 0;

    const next = protocols.map((p) => {
        if (p.assigneeId === fromId && reassigned < count && p.status !== 'resolvido') {
          reassigned++;
          return {
            ...p,
            assigneeId: toId,
            assigneeName: targetMember ? targetMember.name : 'Camila Barreto',
            hoursElapsedWithAssignee: 0,
            timeline: [
              ...p.timeline,
              {
                id: `tl-redist-${Date.now()}-${reassigned}`,
                timestamp: 'Agora',
                author: 'Dr. Roberto Valente',
                role: 'Chefe de Gabinete',
                action: 'Redistribuição de Carga Operacional',
                description: `Protocolo redistribuído para ${targetMember?.name} para equilibrar as demandas ativas.`,
              },
            ],
          };
        }
        return p;
      });
    setProtocols(next);
    next.forEach((p, i) => {
      if (p !== protocols[i]) persistProtocol(p);
    });
  };

  const handleCreateDocument = (newDoc: Omit<DocumentModel, 'id'>) => {
    const doc: DocumentModel = {
      ...newDoc,
      id: `doc-${Date.now()}`,
    };
    setDocuments((prev) => [doc, ...prev]);
  };

  const handleUpdateDocument = (updated: DocumentModel) => {
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleDeleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleUpdateRelease = (updated: PressRelease) => {
    setPressReleases((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
  };

  const handleCreateRelease = (newRel: Omit<PressRelease, 'id'>) => {
    const rel: PressRelease = {
      ...newRel,
      id: `rel-${Date.now()}`,
    };
    setPressReleases((prev) => [rel, ...prev]);
  };

  const handleToggleCMSFeatured = (postId: string) => {
    setCmsPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, featured: !p.featured } : p))
    );
  };

  const handleAddSubscriber = (
    newSub: Omit<NewsletterSubscriber, 'id' | 'subscribedAt' | 'emailsReceived' | 'openRate'>
  ) => {
    const sub: NewsletterSubscriber = {
      ...newSub,
      id: `sub-${Date.now()}`,
      subscribedAt: new Date().toISOString().split('T')[0],
      emailsReceived: 0,
      openRate: 0,
    };
    setSubscribers((prev) => [sub, ...prev]);
  };

  const handleSendCampaign = (
    newCmp: Omit<NewsletterCampaign, 'id' | 'openRate' | 'clickRate'>
  ) => {
    const cmp: NewsletterCampaign = {
      ...newCmp,
      id: `cmp-${Date.now()}`,
      openRate: 54.2,
      clickRate: 22.0,
    };
    setCampaigns((prev) => [cmp, ...prev]);
  };

  const handleCreateBill = (bill: LegislativeBill) => {
    setBills((prev) => [bill, ...prev]);
  };

  const handleUpdateBill = (bill: LegislativeBill) => {
    setBills((prev) => prev.map((b) => (b.id === bill.id ? bill : b)));
  };

  // Module Title Lookup
  const moduleTitles: Record<ModuleType, string> = {
    dashboard: 'Visão Geral & Métricas',
    atendimento: 'Central de Atendimento Omnichannel',
    protocolos: 'Protocolos & Demandas',
    flow: 'Parlamentta Flow (Workflow)',
    agenda: 'Agenda & Minhas Tarefas',
    equipe: 'Gestão da Equipe',
    territorial: 'Inteligência Territorial (MT)',
    documentos: 'Documentos do Gabinete',
    crm: 'Comunicação · CRM',
    newsletter: 'Comunicação · Newsletter & Campanhas',
    imprensa: 'Comunicação · Conhecimento & Imprensa',
    site: 'Comunicação · Site & Publicações CMS',
    legislativo: 'Legislativo · Composição Plenário',
    legislativo_projetos: 'Legislativo · Projetos de Lei',
    legislativo_oficios: 'Legislativo · Ofícios',
    legislativo_parlamento: 'Legislativo · Composição Plenário',
    integracoes: 'Canais & Integrações',
    relatorios: 'Relatórios Executivos',
    admin: 'Administração & LGPD',
    bd_contatos: 'Banco de Dados · Contatos',
    bd_categorias: 'Banco de Dados · Categorias',
    bd_discursos: 'Comunicação · Discursos',
    clipping: 'Comunicação · Clipping',
    bd_importar: 'Banco de Dados · Importação',
    bd_conhecimento: 'Banco de Dados · Base de Conhecimento',
  };

  // WhatsApp: conversas não lidas no menu (o módulo atualiza mais rápido enquanto aberto).
  const [whatsappUnread, setWhatsappUnread] = useState(0);
  const [protocolPrefill, setProtocolPrefill] = useState<ProtocolPrefill | undefined>(undefined);
  // Aba aberta na Central de Atendimento ('whatsapp' quando vem de Canais & Integrações).
  const [atendimentoTab, setAtendimentoTab] = useState('todos');
  const openAtendimentoWhatsApp = () => {
    setAtendimentoTab('whatsapp');
    setCurrentModule('atendimento');
  };
  useEffect(() => {
    const load = () =>
      wa
        .status()
        .then((s) => setWhatsappUnread(s.unread))
        .catch(() => undefined);
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Badges calculation
  const unreadMessagesCount = conversations.reduce(
    (acc, c) => acc + c.unreadCount,
    0
  );
  const overdueProtocolsCount = protocols.filter(
    (p) => p.slaStatus === 'atrasado'
  ).length;
  const flowAlertsCount = protocols.filter(
    (p) => p.status === 'novo' || p.slaStatus === 'alerta_48h'
  ).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={(mod) => {
          setContactsFilter({});
          setCategoriasTab('categorias');
          setAtendimentoTab('todos');
          setFocusLetterId(null);
          setCurrentModule(mod);
          setMobileMenuOpen(false);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeCabinet={activeCabinet}
        onOpenLogoModal={() => setLogoModalOpen(true)}
        customLogoUrl={customLogoUrl}
        badgeCounts={{
          atendimento: unreadMessagesCount + whatsappUnread,
          protocolosAtrasados: overdueProtocolsCount,
          flowAlertas: flowAlertsCount,
        }}
        onLogout={onLogout}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Topbar */}
        <Topbar
          cabinets={[tenantCabinet]}
          activeCabinet={activeCabinet}
          sessionUser={{ name: session.user.name, email: session.user.email }}
          onSelectCabinet={setActiveCabinet}
          currentRole={currentRole}
          onChangeRole={setCurrentRole}
          teamMembers={mockTeamMembers}
          onOpenGuidedTour={() => setGuidedTourOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          searchQuery={searchQuery}
          onSearchChange={setSearchFilter}
          moduleTitle={moduleTitles[currentModule]}
          onLogout={onLogout}
        />

        {/* Dynamic Content Viewport */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {currentModule === 'dashboard' && (
            <DashboardModule
              protocols={protocols}
              tasks={tasks}
              events={events}
              teamMembers={mockTeamMembers}
              onNavigate={(mod) => setCurrentModule(mod)}
              onOpenGuidedTour={() => setGuidedTourOpen(true)}
              onOpenNewProtocol={() => setNewProtocolModalOpen(true)}
              onToggleTask={handleToggleTask}
            />
          )}

          {currentModule === 'atendimento' && (
            <AtendimentoModule
              conversations={conversations}
              onCreateProtocolFromConversation={handleCreateProtocolFromConversation}
              onSendMessage={handleSendMessage}
              onCreateManualEntry={handleCreateManualEntry}
              canManageChannels={canManageDb}
              onManageChannels={() => openCategorias('canais')}
              key={atendimentoTab}
              initialChannelFilter={atendimentoTab}
              onOpenWhatsAppProtocol={(prefill) => {
                setProtocolPrefill(prefill);
                setNewProtocolModalOpen(true);
              }}
              onWhatsAppUnreadChange={setWhatsappUnread}
              onOpenIntegracoes={() => setCurrentModule('integracoes')}
            />
          )}

          {currentModule === 'protocolos' && (
            <ProtocolosModule
              protocols={protocols}
              siteUrl={`${window.location.origin}/site/${session.tenant!.slug}`}
              teamMembers={mockTeamMembers}
              onOpenNewProtocol={() => setNewProtocolModalOpen(true)}
              onUpdateProtocol={handleUpdateProtocol}
              onNavigateToFlow={() => setCurrentModule('flow')}
            />
          )}

          {currentModule === 'flow' && (
            <ParlamenttaFlowModule
              protocols={protocols}
              teamMembers={mockTeamMembers}
              onUpdateProtocol={handleUpdateProtocol}
              currentUserId="usr-4"
            />
          )}

          {currentModule === 'agenda' && (
            <AgendaTarefasModule
              events={events}
              tasks={tasks}
              onToggleTask={handleToggleTask}
              onAddTask={handleAddTask}
              onAddEvent={handleAddEvent}
            />
          )}

          {currentModule === 'equipe' && (
            <EquipeModule
              teamMembers={mockTeamMembers}
              protocols={protocols}
              onRedistributeProtocols={handleRedistributeProtocols}
            />
          )}

          {currentModule === 'territorial' && (
            <InteligenciaTerritorialModule
              municipalities={mockMunicipalitiesData}
            />
          )}

          {currentModule === 'documentos' && (
            <DocumentosModule
              documents={documents}
              activeCabinet={activeCabinet}
              customLogoUrl={customLogoUrl}
              onOpenLogoModal={() => setLogoModalOpen(true)}
              onCreateDocument={handleCreateDocument}
              onUpdateDocument={handleUpdateDocument}
              onDeleteDocument={handleDeleteDocument}
              onManageTypes={() => openCategorias('tipos')}
            />
          )}

          {currentModule === 'newsletter' && (
            <NewsletterModule
              subscribers={subscribers}
              campaigns={campaigns}
              onAddSubscriber={handleAddSubscriber}
              onSendCampaign={handleSendCampaign}
            />
          )}

          {currentModule === 'imprensa' && (
            <ConhecimentoImprensaModule
              releases={pressReleases}
              onUpdateRelease={handleUpdateRelease}
              onCreateRelease={handleCreateRelease}
            />
          )}

          {currentModule === 'clipping' && <ClippingModule />}

          {currentModule === 'crm' && <CrmModule onOpenIntegracoes={() => setCurrentModule('integracoes')} />}

          {currentModule === 'site' && (
            <SiteCmsModule
              posts={cmsPosts}
              onToggleFeatured={handleToggleCMSFeatured}
            />
          )}

          {currentModule === 'legislativo_projetos' && (
            <ProjetosLeiModule
              bills={bills}
              onCreateBill={handleCreateBill}
              onUpdateBill={handleUpdateBill}
            />
          )}

          {currentModule === 'legislativo_oficios' && (
            <OficiosModule
              cabinet={activeCabinet}
              logoUrl={customLogoUrl}
              focusId={focusLetterId}
              onOpenKnowledge={() => setCurrentModule('bd_conhecimento')}
            />
          )}

          {(currentModule === 'legislativo_parlamento' || currentModule === 'legislativo') && (
            <ParlamentoHemicicloModule key={chamber.sphere + chamber.uf + chamber.city} chamber={chamber} />
          )}

          {currentModule === 'integracoes' && <IntegracoesModule onOpenWhatsApp={openAtendimentoWhatsApp} />}

          {currentModule === 'relatorios' && <RelatoriosModule />}

          {currentModule === 'bd_contatos' && (
            <ContatosModule
              key={JSON.stringify(contactsFilter)}
              canManage={canManageDb}
              initialTag={contactsFilter.tag}
              initialCategory={contactsFilter.category}
              onOpenImport={() => setCurrentModule('bd_importar')}
              onOpenCategories={openCategorias}
            />
          )}

          {currentModule === 'bd_categorias' && (
            <CategoriasModule key={categoriasTab} canManage={canManageDb} initialTab={categoriasTab} onOpenContacts={openContacts} />
          )}

          {currentModule === 'bd_discursos' && <DiscursosModule canManage={canManageDb} />}

          {currentModule === 'bd_conhecimento' && (
            <ConhecimentoModule
              onOpenSource={(source, id) => {
                if (source === 'oficio') {
                  setFocusLetterId(id);
                  setCurrentModule('legislativo_oficios');
                }
              }}
            />
          )}

          {currentModule === 'bd_importar' && (
            <ImportarModule
              canCommit={canManageDb}
              onOpenContacts={(tag) => openContacts({ tag })}
              onOpenCategories={openCategorias}
            />
          )}

          {currentModule === 'admin' && (
            <AdministracaoModule
              auditLogs={auditLogs}
              teamMembers={mockTeamMembers}
            />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <LogoUploaderModal
        isOpen={logoModalOpen}
        onClose={() => setLogoModalOpen(false)}
        currentLogoUrl={customLogoUrl}
        onSaveLogo={setCustomLogoUrl}
        cabinetName={activeCabinet.name}
      />

      <NovoProtocoloModal
        isOpen={newProtocolModalOpen}
        onClose={() => {
          setNewProtocolModalOpen(false);
          setProtocolPrefill(undefined);
        }}
        initial={protocolPrefill}
        onCreateProtocol={handleCreateProtocol}
        canManageLists={canManageDb}
        onManageList={(tab) => {
          setNewProtocolModalOpen(false);
          openCategorias(tab);
        }}
      />

      <FluxoGuiadoModal
        isOpen={guidedTourOpen}
        onClose={() => setGuidedTourOpen(false)}
        protocol={protocols[0]}
        onUpdateProtocol={handleUpdateProtocol}
        onNavigateToModule={(mod) => setCurrentModule(mod)}
      />

    </div>
  );
}
