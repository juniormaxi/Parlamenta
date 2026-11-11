/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  Parliamentarian,
  VotingSession,
  LegislativeBill,
  OfficialLetterModel,
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
  mockParliamentarians,
  mockVotingSessions,
  mockLegislativeBills,
  mockOfficialLetters,
} from './data/mockData';

// Layout & Common Components
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { LogoUploaderModal } from './components/common/LogoUploaderModal';
import { NovoProtocoloModal } from './components/common/NovoProtocoloModal';
import { FluxoGuiadoModal } from './components/modules/FluxoGuiadoModal';
import { GuiaDocumentacaoModal } from './components/modules/GuiaDocumentacaoModal';
import { LoginView } from './components/auth/LoginView';

// Modules
import { DashboardModule } from './components/modules/DashboardModule';
import { AtendimentoModule } from './components/modules/AtendimentoModule';
import { ProtocolosModule } from './components/modules/ProtocolosModule';
import { ParlamentaFlowModule } from './components/modules/ParlamentaFlowModule';
import { AgendaTarefasModule } from './components/modules/AgendaTarefasModule';
import { EquipeModule } from './components/modules/EquipeModule';
import { InteligenciaTerritorialModule } from './components/modules/InteligenciaTerritorialModule';
import { DocumentosModule } from './components/modules/DocumentosModule';
import { NewsletterModule } from './components/modules/NewsletterModule';
import { ConhecimentoImprensaModule } from './components/modules/ConhecimentoImprensaModule';
import { SiteCmsModule } from './components/modules/SiteCmsModule';
import { GestaoLegislativaModule } from './components/modules/GestaoLegislativaModule';
import { ParlamentoHemicicloModule } from './components/modules/legislativo/ParlamentoHemicicloModule';
import { ProjetosLeiModule } from './components/modules/legislativo/ProjetosLeiModule';
import { OficiosModule } from './components/modules/legislativo/OficiosModule';
import { IntegracoesModule } from './components/modules/IntegracoesModule';
import { RelatoriosModule } from './components/modules/RelatoriosModule';
import { AdministracaoModule } from './components/modules/AdministracaoModule';

export default function App() {
  // Authentication State (Session lock & login screen)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  // Navigation & Cabinet State
  const [currentModule, setCurrentModule] = useState<ModuleType>('dashboard');
  const [activeCabinet, setActiveCabinet] = useState<Cabinet>(mockCabinets[0]);
  const [currentRole, setCurrentRole] = useState<UserRole>('coordenador_atendimento');
  const [customLogoUrl, setCustomLogoUrl] = useState<string>('');

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchFilter] = useState('');

  // Modals state
  const [guidedTourOpen, setGuidedTourOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
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
  const [parliamentarians, setParliamentarians] = useState<Parliamentarian[]>(mockParliamentarians);
  const [votingSessions, setVotingSessions] = useState<VotingSession[]>(mockVotingSessions);
  const [bills, setBills] = useState<LegislativeBill[]>(mockLegislativeBills);
  const [officialLetters, setOfficialLetters] = useState<OfficialLetterModel[]>(mockOfficialLetters);

  // Handlers for Protocol & Workflow operations
  const handleUpdateProtocol = (updated: Protocol) => {
    setProtocols((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
  };

  const handleCreateProtocol = (data: {
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
    const nextNum = protocols.length + 43;
    const protocolId = `PRT-2026-00${nextNum}`;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + (data.priority === 'urgente' ? 1 : 2));

    const newProto: Protocol = {
      id: protocolId,
      number: protocolId,
      citizenName: data.citizenName,
      citizenCity: data.citizenCity,
      citizenPhone: data.citizenPhone,
      citizenCategory: data.citizenCategory,
      channel: data.channel,
      theme: data.theme,
      subject: data.subject,
      description: data.description,
      priority: data.priority,
      status: 'novo',
      assigneeId: '',
      assigneeName: 'Pendente de atribuição',
      coordinatorId: 'usr-3',
      coordinatorName: 'Letícia Prado',
      createdAt: new Date().toISOString(),
      deadline: deadline.toISOString(),
      slaStatus: 'normal',
      hoursElapsedTotal: 0,
      hoursElapsedWithAssignee: 0,
      tags: [data.theme, data.citizenCity],
      attachments: [],
      timeline: [
        {
          id: `tl-${Date.now()}`,
          timestamp: 'Agora',
          author: 'Letícia Prado',
          role: 'Coordenadora de Atendimento',
          action: 'Abertura de Protocolo Oficial',
          description: `Protocolo registrado via canal ${data.channel.toUpperCase()}.`,
        },
      ],
      citizenFeedbackStatus: 'pendente',
    };

    setProtocols((prev) => [newProto, ...prev]);

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
  };

  const handleCreateProtocolFromConversation = (data: {
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
    handleCreateProtocol(data);

    // Link conversation
    const nextNum = protocols.length + 43;
    const protocolId = `PRT-2026-00${nextNum}`;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === data.conversationId
          ? { ...c, linkedProtocolId: protocolId, status: 'triada' }
          : c
      )
    );
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

    setProtocols((prev) =>
      prev.map((p) => {
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
      })
    );
  };

  const handleCreateDocument = (newDoc: Omit<DocumentModel, 'id'>) => {
    const doc: DocumentModel = {
      ...newDoc,
      id: `doc-${Date.now()}`,
    };
    setDocuments((prev) => [doc, ...prev]);
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

  const handleAddParliamentarian = (p: Parliamentarian) => {
    setParliamentarians((prev) => [...prev, p]);
  };

  const handleUpdateParliamentarian = (p: Parliamentarian) => {
    setParliamentarians((prev) =>
      prev.map((dep) => (dep.id === p.id ? p : dep))
    );
  };

  const handleSaveVotingSession = (session: VotingSession) => {
    setVotingSessions((prev) => [session, ...prev]);
  };

  const handleCreateBill = (bill: LegislativeBill) => {
    setBills((prev) => [bill, ...prev]);
  };

  const handleUpdateBill = (bill: LegislativeBill) => {
    setBills((prev) => prev.map((b) => (b.id === bill.id ? bill : b)));
  };

  const handleCreateLetter = (letter: OfficialLetterModel) => {
    setOfficialLetters((prev) => [letter, ...prev]);
  };

  const handleUpdateLetter = (letter: OfficialLetterModel) => {
    setOfficialLetters((prev) =>
      prev.map((l) => (l.id === letter.id ? letter : l))
    );
  };

  // Module Title Lookup
  const moduleTitles: Record<ModuleType, string> = {
    dashboard: 'Visão Geral & Métricas',
    atendimento: 'Central de Atendimento Omnichannel',
    protocolos: 'Protocolos & Demandas',
    flow: 'Parlamenta Flow (Workflow)',
    agenda: 'Agenda & Minhas Tarefas',
    equipe: 'Gestão da Equipe',
    territorial: 'Inteligência Territorial (MT)',
    documentos: 'Documentos do Gabinete',
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
  };

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

  if (!isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={(role, email) => {
          setCurrentRole(role);
          setIsAuthenticated(true);
        }}
        cabinetName={activeCabinet.name}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={(mod) => {
          setCurrentModule(mod);
          setMobileMenuOpen(false);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeCabinet={activeCabinet}
        onOpenLogoModal={() => setLogoModalOpen(true)}
        customLogoUrl={customLogoUrl}
        badgeCounts={{
          atendimento: unreadMessagesCount,
          protocolosAtrasados: overdueProtocolsCount,
          flowAlertas: flowAlertsCount,
        }}
        onLogout={() => setIsAuthenticated(false)}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Topbar */}
        <Topbar
          cabinets={mockCabinets}
          activeCabinet={activeCabinet}
          onSelectCabinet={setActiveCabinet}
          currentRole={currentRole}
          onChangeRole={setCurrentRole}
          teamMembers={mockTeamMembers}
          onOpenGuidedTour={() => setGuidedTourOpen(true)}
          onOpenDocs={() => setDocsModalOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          searchQuery={searchQuery}
          onSearchChange={setSearchFilter}
          moduleTitle={moduleTitles[currentModule]}
          onLogout={() => setIsAuthenticated(false)}
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
            />
          )}

          {currentModule === 'protocolos' && (
            <ProtocolosModule
              protocols={protocols}
              teamMembers={mockTeamMembers}
              onOpenNewProtocol={() => setNewProtocolModalOpen(true)}
              onUpdateProtocol={handleUpdateProtocol}
              onNavigateToFlow={() => setCurrentModule('flow')}
            />
          )}

          {currentModule === 'flow' && (
            <ParlamentaFlowModule
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
              letters={officialLetters}
              onCreateLetter={handleCreateLetter}
              onUpdateLetter={handleUpdateLetter}
            />
          )}

          {(currentModule === 'legislativo_parlamento' || currentModule === 'legislativo') && (
            <ParlamentoHemicicloModule
              parliamentarians={parliamentarians}
              votingSessions={votingSessions}
              onAddParliamentarian={handleAddParliamentarian}
              onUpdateParliamentarian={handleUpdateParliamentarian}
              onSaveVotingSession={handleSaveVotingSession}
            />
          )}

          {currentModule === 'integracoes' && <IntegracoesModule />}

          {currentModule === 'relatorios' && <RelatoriosModule />}

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
        onClose={() => setNewProtocolModalOpen(false)}
        onCreateProtocol={handleCreateProtocol}
      />

      <FluxoGuiadoModal
        isOpen={guidedTourOpen}
        onClose={() => setGuidedTourOpen(false)}
        protocol={protocols[0]}
        onUpdateProtocol={handleUpdateProtocol}
        onNavigateToModule={(mod) => setCurrentModule(mod)}
      />

      <GuiaDocumentacaoModal
        isOpen={docsModalOpen}
        onClose={() => setDocsModalOpen(false)}
      />
    </div>
  );
}
