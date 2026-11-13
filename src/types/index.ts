export type ModuleType =
  | 'dashboard'
  | 'atendimento'
  | 'crm'
  | 'protocolos'
  | 'flow'
  | 'agenda'
  | 'equipe'
  | 'territorial'
  | 'documentos'
  | 'newsletter'
  | 'imprensa'
  | 'site'
  | 'clipping'
  | 'legislativo'
  | 'legislativo_projetos'
  | 'legislativo_oficios'
  | 'legislativo_parlamento'
  | 'integracoes'
  | 'relatorios'
  | 'admin'
  | 'bd_contatos'
  | 'bd_categorias'
  | 'bd_discursos'
  | 'bd_importar'
  | 'bd_conhecimento';

export type UserRole =
  | 'deputado'
  | 'chefe_gabinete'
  | 'coordenador_atendimento'
  | 'assessor_parlamentar'
  | 'comunicacao';

export type ChannelType = 'whatsapp' | 'instagram' | 'messenger' | 'email' | 'telefone' | 'presencial' | 'web';

export type PriorityType = 'baixa' | 'media' | 'alta' | 'urgente';

export type ProtocolStatus =
  | 'novo'
  | 'em_analise'
  | 'em_execucao'
  | 'aguardando_orgao'
  | 'revisao_coordenador'
  | 'resolvido'
  | 'cancelado';

export type SLAStatus = 'normal' | 'alerta_48h' | 'atrasado';

export interface Cabinet {
  id: string;
  name: string;
  parliamentarian: string;
  sphere: 'estadual' | 'federal' | 'municipal';
  house: string; // Ex: ALMT, Câmara dos Deputados
  state: string; // MT, DF, etc.
  /** Município (esfera municipal). */
  city?: string;
  /** Cadeiras do plenário (0/undefined = padrão da esfera). */
  seats?: number;
  party: string;
  logoUrl?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  roleTitle: string;
  email: string;
  avatar: string;
  activeProtocols: number;
  completedProtocols: number;
  overdueProtocols: number;
  avgResolutionDays: number;
  status: 'disponivel' | 'em_campo' | 'ocupado';
}

export interface Citizen {
  id: string;
  name: string;
  documentMasked: string; // LGPD masked (e.g. ***.456.789-**)
  email: string;
  phone: string;
  city: string;
  neighborhood: string;
  category: 'Cidadão Geral' | 'Liderança Comunitária' | 'Representante de Entidade' | 'Prefeito/Vereador';
  interactionsCount: number;
}

export interface ChatMessage {
  id: string;
  sender: 'citizen' | 'cabinet' | 'system';
  content: string;
  timestamp: string;
  channel: ChannelType;
  attachments?: { name: string; size: string; type: string }[];
}

export interface Conversation {
  id: string;
  citizen: Citizen;
  channel: ChannelType;
  /** Nome do canal cadastrado em Categorias › Canais de Entrada (registros manuais). */
  channelLabel?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  tags: string[];
  suggestedProtocol?: {
    theme: string;
    city: string;
    priority: PriorityType;
    summary: string;
  };
  linkedProtocolId?: string;
  status: 'aberta' | 'triada' | 'fechada';
  messages: ChatMessage[];
}

export interface ProtocolTimelineEvent {
  id: string;
  timestamp: string;
  author: string;
  role: string;
  action: string;
  description: string;
  badge?: string;
}

export interface Protocol {
  id: string;
  number: string; // e.g., "PRT-2026-0042"
  citizenName: string;
  citizenCity: string;
  citizenPhone: string;
  citizenCategory: string;
  channel: ChannelType;
  /** Nome do canal cadastrado em Categorias › Canais de Entrada. */
  channelLabel?: string;
  /** Tema cadastrado em Categorias › Temas de Demanda. */
  theme: string;
  subject: string;
  description: string;
  priority: PriorityType;
  status: ProtocolStatus;
  assigneeId: string;
  assigneeName: string;
  coordinatorId: string;
  coordinatorName: string;
  createdAt: string;
  deadline: string;
  slaStatus: SLAStatus;
  hoursElapsedTotal: number;
  hoursElapsedWithAssignee: number;
  tags: string[];
  timeline: ProtocolTimelineEvent[];
  linkedTaskId?: string;
  attachments: { id: string; name: string; size: string; type: string }[];
  resolutionNotes?: string;
  citizenFeedbackStatus?: 'pendente' | 'enviada_sucesso' | 'falha_envio';
  citizenFeedbackText?: string;
  citizenFeedbackChannel?: ChannelType;
  citizenEmail?: string;
  /** true quando o protocolo está gravado no servidor (não é dado de demonstração). */
  persisted?: boolean;
  /** Origem: equipe do gabinete ou formulário do site do parlamentar. */
  source?: 'interno' | 'web';
}

export interface FlowTask {
  id: string;
  protocolId?: string;
  protocolNumber?: string;
  title: string;
  description: string;
  assigneeName: string;
  dueDate: string;
  priority: PriorityType;
  completed: boolean;
  type: 'visita' | 'oficio' | 'ligacao' | 'reuniao' | 'vistoria';
  location?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'plenario' | 'audiencia' | 'visita_municipio' | 'reuniao' | 'comissao';
  location: string;
  city: string;
  attendees: string[];
  protocolId?: string;
}

export interface MunicipalityData {
  id: string;
  name: string;
  region: 'Baixada Cuiabana' | 'Norte' | 'Médio-Norte' | 'Sul' | 'Araguaia' | 'Oeste';
  population: number;
  demandsCount: number;
  demandsResolved: number;
  demandsTopThemes: { theme: string; count: number }[];
  election2022: {
    votesCandidate: number;
    votesTotal: number;
    percentage: number;
    ranking: number;
    electorate: number;
  };
  election2018: {
    votesCandidate: number;
    percentage: number;
    ranking: number;
  };
  leadAssessor: string;
}

export interface DocumentModel {
  id: string;
  code: string;
  title: string;
  /** Name of a proposition type registered in Banco de Dados › Categorias › Tipos de Proposição. */
  category: string;
  recipient: string;
  author: string;
  createdAt: string;
  version: string;
  status: 'rascunho' | 'revisao' | 'assinado' | 'protocolado';
  contentPreview: string;
}

export interface PressRelease {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  tags: string[];
  author: string;
  status: 'rascunho' | 'revisao_chefia' | 'aprovado' | 'distribuido';
  targetMedia: string[];
  createdAt: string;
  aiAssisted: boolean;
}

export interface CMSPost {
  id: string;
  title: string;
  category: string;
  publishDate: string;
  status: 'rascunho' | 'em_revisao' | 'publicado';
  views: number;
  featured: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  resource: string;
  details: string;
  ip: string;
}

export interface NewsletterSubscriber {
  id: string;
  name: string;
  email: string;
  city: string;
  source: 'Site do Mandato' | 'Redes Sociais' | 'Atendimento Presencial' | 'QR Code Evento';
  subscribedAt: string;
  status: 'ativo' | 'pendente_confirmacao' | 'descadastrado';
  tags: string[]; // ex: 'Saúde', 'Infraestrutura', 'Educação', 'Agro Familiar', 'Cuiabá'
  emailsReceived: number;
  openRate: number; // percentage
}

export interface NewsletterCampaign {
  id: string;
  title: string;
  subject: string;
  targetType: 'all' | 'categories';
  targetTags: string[];
  targetCities: string[];
  sentAt?: string;
  scheduledFor?: string;
  status: 'rascunho' | 'agendado' | 'disparado';
  recipientsCount: number;
  openRate?: number;
  clickRate?: number;
  template: 'informativo_semanal' | 'prestacao_contas' | 'boletim_regional' | 'alerta_urgente';
  bodyPreview: string;
}

export type VoteChoice = 'sim' | 'nao' | 'abstencao' | 'ausente';

export interface Parliamentarian {
  id: string;
  name: string;
  popularName: string;
  party: string;
  partyColor: string;
  bloc: 'Governo' | 'Oposição' | 'Independente';
  seatNumber: number; // 1..N (N = cadeiras da casa do gabinete)
  /** UF de origem (Câmara dos Deputados: bancada estadual). */
  uf?: string;
  role?: string;
  electoralBase: string;
  avatar?: string;
  phone?: string;
  email?: string;
  alignmentScore: number; // 0 to 100%
  themeAlignments?: Record<string, number>;
  /** Foto oficial (Câmara, assembleia, SAPL ou TSE). */
  photoUrl?: string;
  /** Nº de votações nominais usadas no cálculo do alinhamento (0 = sem dados). */
  alignmentSample?: number;
  /** % de votos alinhados à orientação do Governo (Câmara dos Deputados). */
  govAlignment?: number | null;
  /** Origem do bloco: definido pelo gabinete, calculado pela orientação do Governo ou padrão. */
  blocSource?: 'gabinete' | 'governo' | 'padrao';
  /** Situação na fonte oficial (ex.: "Eleito por QP", "Em exercício"). */
  status?: string;
  /** oficial = importado da fonte pública; gabinete = cadastrado à mão. */
  source?: 'oficial' | 'gabinete';
  /** Dados oficiais com ajustes do gabinete. */
  adjusted?: boolean;
}

export interface VotingSession {
  id: string;
  matterCode: string;
  matterTitle: string;
  theme: 'Saúde' | 'Infraestrutura' | 'Agricultura & Meio Ambiente' | 'Educação' | 'Tributário & Orçamento' | 'Segurança Pública' | 'Servidores Públicos' | 'Outros';
  date: string;
  sessionNumber: string;
  quorumType: 'Maioria Simples' | 'Maioria Absoluta' | 'Três Quintos (3/5)' | 'Dois Terços (2/3)';
  mandateVote: VoteChoice;
  result: 'Aprovado' | 'Rejeitado';
  votes: Record<string, VoteChoice>; // parliamentarianId -> choice (votações oficiais: carregado ao abrir)
  summary: string;
  strategicNote?: string;
  /** oficial = importada da fonte pública; gabinete = registrada à mão. */
  source?: 'oficial' | 'gabinete';
  /** Placar entre os parlamentares em exercício (obstrução: Câmara dos Deputados). */
  tally?: { sim: number; nao: number; abstencao: number; obstrucao: number; ausente: number };
  /** Orientação do Governo (Câmara dos Deputados). */
  gov?: 'sim' | 'nao' | 'abstencao' | 'obstrucao' | 'liberado';
  url?: string;
}

export interface LegislativeBill {
  id: string;
  code: string;
  type: 'Projeto de Lei Ordinária' | 'Projeto de Lei Complementar' | 'PEC' | 'Projeto de Resolução';
  title: string;
  theme: 'Saúde' | 'Educação' | 'Infraestrutura' | 'Agricultura Familiar' | 'Segurança Pública' | 'Tributário & Orçamento' | 'Meio Ambiente';
  status: 'redacao' | 'protocolado' | 'ccjr' | 'comissao_tematica' | 'plenario' | 'sancionado';
  author: string;
  coAuthors: string[];
  createdAt: string;
  ementa: string;
  fullText: string;
  justificativa: string;
  budgetImpactEstimate?: string;
  aiAnalysis?: {
    constitutionalStatus: 'conforme' | 'atencao' | 'inconstitucional_parcial';
    constitutionalScore: number;
    legislativeTechniqueScore: number;
    budgetFeasibility: string;
    strengths: string[];
    risksAndWarnings: string[];
    suggestedAmendments: string[];
    analyzedAt: string;
  };
}

export interface OfficialLetterModel {
  id: string;
  code: string;
  subject: string;
  recipientName: string;
  recipientRole: string;
  recipientOrg: string;
  cityTarget?: string;
  date: string;
  status: 'minuta' | 'revisao_juridica' | 'assinado_deputado' | 'protocolado_orgao' | 'respondido';
  body: string;
  deadlineResponseDays?: number;
  linkedProtocolId?: string;
  aiVerification?: {
    institutionalToneScore: number;
    protocolaryCompliance: 'aprovado' | 'ajustes_sugeridos' | 'inconforme';
    formalityCheck: string;
    clarityCheck: string;
    missingReferences: string[];
    recommendations: string[];
    verifiedAt: string;
  };
}

