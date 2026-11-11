import React, { useState } from 'react';
import {
  Mail,
  Send,
  Users,
  Search,
  Filter,
  Plus,
  Tag,
  CheckCircle2,
  Calendar,
  Clock,
  Eye,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Globe,
  Check,
  X,
  Layers,
  Sparkles,
  MousePointer,
  RotateCcw,
} from 'lucide-react';
import { NewsletterSubscriber, NewsletterCampaign } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';
import { KpiCard } from '../common/KpiCard';

interface NewsletterModuleProps {
  subscribers: NewsletterSubscriber[];
  campaigns: NewsletterCampaign[];
  onAddSubscriber: (newSub: Omit<NewsletterSubscriber, 'id' | 'subscribedAt' | 'emailsReceived' | 'openRate'>) => void;
  onSendCampaign: (campaign: Omit<NewsletterCampaign, 'id' | 'openRate' | 'clickRate'>) => void;
}

export const NewsletterModule: React.FC<NewsletterModuleProps> = ({
  subscribers,
  campaigns,
  onAddSubscriber,
  onSendCampaign,
}) => {
  const [activeTab, setActiveTab] = useState<'subscribers' | 'campaigns' | 'site_preview'>('subscribers');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Modals
  const [newCampaignModalOpen, setNewCampaignModalOpen] = useState(false);
  const [newSubscriberModalOpen, setNewSubscriberModalOpen] = useState(false);

  // New Campaign Form State
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'categories'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Saúde']);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [template, setTemplate] = useState<NewsletterCampaign['template']>('informativo_semanal');
  const [bodyText, setBodyText] = useState(
    'Prezado(a) cidadão(ã),\n\nCompartilhamos com você as principais conquistas e proposições legislativas do mandato nesta semana. Nosso compromisso é manter você informado com transparência sobre cada emenda parlamentar e projeto em tramitação na Assembleia Legislativa de Mato Grosso.'
  );

  // New Subscriber Form State (Site Simulator)
  const [siteFormName, setSiteFormName] = useState('');
  const [siteFormEmail, setSiteFormEmail] = useState('');
  const [siteFormCity, setSiteFormCity] = useState('Cuiabá');
  const [siteFormTags, setSiteFormTags] = useState<string[]>(['Saúde', 'Infraestrutura']);
  const [siteSuccessMsg, setSiteSuccessMsg] = useState(false);

  // Available tags
  const allAvailableTags = [
    'Saúde',
    'Infraestrutura',
    'Educação',
    'Agro Familiar',
    'Segurança Pública',
    'Cultura & Esporte',
    'Meio Ambiente',
    'Cuiabá',
    'Rondonópolis',
    'Sinop',
    'Nova Mutum',
    'Juína',
    'Tangará da Serra',
    'Barra do Garças',
    'Sorriso',
  ];

  // Filtering Subscribers
  const filteredSubscribers = subscribers.filter((sub) => {
    const matchesSearch =
      sub.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      sub.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
      sub.city.toLowerCase().includes(searchFilter.toLowerCase());

    const matchesTag =
      selectedTagFilter === 'todos' || sub.tags.includes(selectedTagFilter);

    const matchesStatus =
      statusFilter === 'todos' || sub.status === statusFilter;

    return matchesSearch && matchesTag && matchesStatus;
  });

  // Calculate estimated recipients for campaign
  const estimatedRecipients = targetType === 'all'
    ? subscribers.filter((s) => s.status === 'ativo').length
    : subscribers.filter(
        (s) =>
          s.status === 'ativo' &&
          (selectedTags.length === 0 || selectedTags.some((t) => s.tags.includes(t))) &&
          (selectedCities.length === 0 || selectedCities.includes(s.city))
      ).length;

  const handleToggleTagSelection = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleToggleCitySelection = (city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  };

  const handleDispatchCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignTitle.trim() || !campaignSubject.trim()) return;

    onSendCampaign({
      title: campaignTitle,
      subject: campaignSubject,
      targetType,
      targetTags: targetType === 'categories' ? selectedTags : [],
      targetCities: targetType === 'categories' ? selectedCities : [],
      sentAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'disparado',
      recipientsCount: estimatedRecipients > 0 ? estimatedRecipients : 1420,
      template,
      bodyPreview: bodyText,
    });

    setNewCampaignModalOpen(false);
    setActiveTab('campaigns');
    setCampaignTitle('');
    setCampaignSubject('');
  };

  const handleSiteFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteFormName.trim() || !siteFormEmail.trim()) return;

    onAddSubscriber({
      name: siteFormName,
      email: siteFormEmail,
      city: siteFormCity,
      source: 'Site do Mandato',
      status: 'ativo',
      tags: siteFormTags,
    });

    setSiteSuccessMsg(true);
    setSiteFormName('');
    setSiteFormEmail('');
    setTimeout(() => setSiteSuccessMsg(false), 4000);
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Comunicação · Gestão de Newsletter"
        contextText="Cadastros de cidadãos recebidos pelo site oficial, segmentação por temas de interesse e disparo de informativos com opt-out LGPD."
      />

      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#176B80]" />
            Comunicação · Newsletter & Informativos do Gabinete
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Captação de cidadãos no portal oficial, segmentação temática e prestação de contas periódica
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Segment Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            <button
              onClick={() => setActiveTab('subscribers')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'subscribers'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#176B80]" />
              <span>Assinantes ({subscribers.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'campaigns'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-[#176B80]" />
              <span>Campanhas ({campaigns.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('site_preview')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'site_preview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-[#176B80]" />
              <span>Widget do Site</span>
            </button>
          </div>

          <button
            onClick={() => setNewCampaignModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Send className="w-3.5 h-3.5 text-[#36B7A5]" />
            <span>Disparar Campanha</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total de Assinantes"
          value={subscribers.length + 3420}
          subtext="Base ativa cadastrada no site"
          icon={Users}
          trend={{ value: '+142', isPositive: true, label: 'este mês' }}
        />
        <KpiCard
          label="Taxa Média de Abertura"
          value="52,4%"
          subtext="Média das campanhas enviadas"
          icon={Eye}
          variant="success"
          trend={{ value: '+6.2%', isPositive: true, label: 'vs. benchmark público' }}
        />
        <KpiCard
          label="Taxa de Cliques (CTR)"
          value="21,8%"
          subtext="Engajamento com matérias e leis"
          icon={MousePointer}
        />
        <KpiCard
          label="Origem dos Cadastros"
          value="88% Portal Oficial"
          subtext="Inscrição com consentimento LGPD"
          variant="default"
        />
      </div>

      {/* ======================================================== */}
      {/* TAB 1: LISTAGEM DE ASSINANTES COM TAGS POR TEMA */}
      {/* ======================================================== */}
      {activeTab === 'subscribers' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-4 p-5">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex-1 max-w-md relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nome, e-mail ou município..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-[#176B80]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Tag / Topic Filter */}
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium">Tema:</span>
                <select
                  value={selectedTagFilter}
                  onChange={(e) => setSelectedTagFilter(e.target.value)}
                  className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="todos">Todos os Temas</option>
                  <option value="Saúde">Saúde</option>
                  <option value="Infraestrutura">Infraestrutura</option>
                  <option value="Educação">Educação</option>
                  <option value="Agro Familiar">Agro Familiar</option>
                  <option value="Segurança Pública">Segurança Pública</option>
                  <option value="Recursos Hídricos">Recursos Hídricos</option>
                </select>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="todos">Todos os Status</option>
                <option value="ativo">Ativo</option>
                <option value="pendente_confirmacao">Pendente Confirmação</option>
                <option value="descadastrado">Descadastrado</option>
              </select>

              <button
                onClick={() => setNewSubscriberModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-[#102C45] bg-[#E9F1F4] hover:bg-[#d6e5eb] rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Assinante</span>
              </button>
            </div>
          </div>

          {/* Subscribers Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3 px-4">Cidadão / Assinante</th>
                  <th className="py-3 px-4">Município (MT)</th>
                  <th className="py-3 px-4">Origem do Cadastro</th>
                  <th className="py-3 px-4">Temas de Interesse (Tags)</th>
                  <th className="py-3 px-4 font-mono">Data Opt-in</th>
                  <th className="py-3 px-4 text-center">Abertura</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum assinante encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{sub.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{sub.email}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{sub.city}</td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">{sub.source}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {sub.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {sub.subscribedAt}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-slate-700">
                        {sub.openRate}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded ${
                            sub.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : sub.status === 'pendente_confirmacao'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800'
                          }`}
                        >
                          {sub.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: HISTÓRICO DE CAMPANHAS DE NEWSLETTER */}
      {/* ======================================================== */}
      {activeTab === 'campaigns' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Campanhas & Informativos Enviados
              </h3>
              <p className="text-xs text-slate-500">
                Histórico de disparos, segmentação e métricas de leitura por edição
              </p>
            </div>
            <button
              onClick={() => setNewCampaignModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[#36B7A5]" />
              <span>Nova Campanha</span>
            </button>
          </div>

          <div className="space-y-3">
            {campaigns.map((cmp) => (
              <div
                key={cmp.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                        cmp.status === 'disparado'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {cmp.status}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {cmp.sentAt ? `Disparado em: ${cmp.sentAt}` : `Agendado: ${cmp.scheduledFor}`}
                    </span>
                  </div>

                  {cmp.openRate !== undefined && (
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span>
                        Destinatários: <strong className="text-slate-900">{cmp.recipientsCount.toLocaleString('pt-BR')}</strong>
                      </span>
                      <span>·</span>
                      <span className="text-emerald-700 font-bold">
                        Abertura: {cmp.openRate}%
                      </span>
                      <span>·</span>
                      <span className="text-[#176B80] font-bold">
                        Cliques: {cmp.clickRate}%
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{cmp.title}</h4>
                  <p className="text-xs text-slate-600 mt-0.5 italic">
                    Assunto no e-mail: "{cmp.subject}"
                  </p>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
                  {cmp.bodyPreview}
                </div>

                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Público Alvo:</span>
                    {cmp.targetType === 'all' ? (
                      <span className="text-slate-800 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                        Toda a Base de Assinantes (Geral)
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {cmp.targetTags.map((t) => (
                          <span key={t} className="text-[10px] font-semibold bg-[#E9F1F4] text-[#102C45] px-1.5 py-0.2 rounded">
                            Tag: #{t}
                          </span>
                        ))}
                        {cmp.targetCities.map((c) => (
                          <span key={c} className="text-[10px] font-semibold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-[#176B80]">
                    Modelo: {cmp.template.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: SIMULADOR DO FORMULÁRIO DE CADASTRO DO SITE */}
      {/* ======================================================== */}
      {activeTab === 'site_preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Simulator Form (Left 6 cols) */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-mono font-bold text-[#176B80] uppercase tracking-wider block">
                Simulador de Captação no Portal Oficial
              </span>
              <h3 className="font-bold text-slate-900 text-sm mt-0.5">
                Widget de Inscrição na Newsletter do Gabinete
              </h3>
              <p className="text-xs text-slate-500">
                Preencha o formulário abaixo para testar a entrada de um novo cidadão na base com tags temáticas.
              </p>
            </div>

            {siteSuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Inscrição concluída com sucesso! O cidadão foi cadastrado na base de assinantes e receberá o e-mail de confirmação.
                </span>
              </div>
            )}

            <form onSubmit={handleSiteFormSubmit} className="space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Dra. Mariana Albuquerque"
                  value={siteFormName}
                  onChange={(e) => setSiteFormName(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  E-mail Pessoal ou Profissional
                </label>
                <input
                  type="email"
                  required
                  placeholder="Ex: mariana.albuquerque@gmail.com"
                  value={siteFormEmail}
                  onChange={(e) => setSiteFormEmail(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Município de Residência (MT)
                </label>
                <select
                  value={siteFormCity}
                  onChange={(e) => setSiteFormCity(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Cuiabá">Cuiabá</option>
                  <option value="Várzea Grande">Várzea Grande</option>
                  <option value="Rondonópolis">Rondonópolis</option>
                  <option value="Sinop">Sinop</option>
                  <option value="Sorriso">Sorriso</option>
                  <option value="Nova Mutum">Nova Mutum</option>
                  <option value="Juína">Juína</option>
                  <option value="Tangará da Serra">Tangará da Serra</option>
                  <option value="Barra do Garças">Barra do Garças</option>
                </select>
              </div>

              {/* Tags de interesse */}
              <div>
                <label className="font-semibold text-slate-800 block mb-1.5">
                  Quais temas você quer acompanhar?
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {['Saúde', 'Infraestrutura', 'Educação', 'Agro Familiar', 'Segurança Pública', 'Meio Ambiente'].map(
                    (tag) => (
                      <label
                        key={tag}
                        className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={siteFormTags.includes(tag)}
                          onChange={() => {
                            setSiteFormTags((prev) =>
                              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                            );
                          }}
                          className="rounded text-[#176B80] focus:ring-[#176B80]"
                        />
                        <span className="text-slate-800 font-medium">{tag}</span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#E9F1F4]/70 border border-[#176B80]/20 text-[11px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#176B80] shrink-0 mt-0.5" />
                <span>
                  Consentimento LGPD: Seus dados serão utilizados estritamente para envio de informativos institucionais do mandato parlamentar.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors shadow-xs"
              >
                Cadastrar Cidadão na Newsletter
              </button>
            </form>
          </div>

          {/* Embed Code & Integration Specs (Right 6 cols) */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Código de Integração para o Site Oficial
              </span>
              <h3 className="font-bold text-slate-900 text-sm mt-0.5">
                API Endpoint & Snippet Web
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O formulário pode ser inserido no rodapé do portal público da deputada ou em landing pages temáticas. Os cadastros são recebidos automaticamente na rota webhook e catalogados com tags.
            </p>

            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-[11px] space-y-2 overflow-x-auto">
              <p className="text-slate-400">// Chamada REST para registro de novo opt-in</p>
              <p className="text-emerald-400">POST /api/newsletter/subscribe</p>
              <p className="text-slate-300">
                {`{
  "name": "Maria Eunice Barbosa",
  "email": "eunice.barbosa.mt@gmail.com",
  "city": "Rondonópolis",
  "tags": ["Saúde", "Rondonópolis"],
  "consent_lgpd": true
}`}
              </p>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5 text-xs text-slate-700">
              <span className="font-semibold text-slate-900 block">
                Garantias Legais (Art. 7º e 18 da LGPD):
              </span>
              <p className="text-[11px] text-slate-600">
                • Link de descadastramento automático em um clique (Unsubscribe) inserido no rodapé de 100% dos informativos.
              </p>
              <p className="text-[11px] text-slate-600">
                • Confirmação em duas etapas (Double Opt-in) ativada por padrão para validação da titularidade da conta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DISPARAR NOVA CAMPANHA (TODA A BASE OU CATEGORIAS) */}
      {/* ======================================================== */}
      {newCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Disparar Campanha de Newsletter</h3>
                <p className="text-xs text-slate-300">
                  Envio para toda a base ou segmentado por temas e municípios
                </p>
              </div>
              <button
                onClick={() => setNewCampaignModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchCampaign} className="p-6 space-y-4 text-xs text-slate-700 overflow-y-auto flex-1">
              {/* Target Type Selector */}
              <div>
                <label className="font-semibold text-slate-800 block mb-1.5">
                  1. Seleção do Público-Alvo do Disparo:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setTargetType('all')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      targetType === 'all'
                        ? 'border-[#176B80] bg-[#E9F1F4]/70 ring-1 ring-[#176B80]'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">
                        Toda a Base de Assinantes
                      </span>
                      {targetType === 'all' && (
                        <Check className="w-4 h-4 text-[#176B80]" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Envia para todos os cidadãos ativos cadastrados no site (Estimado: {subscribers.length + 3420} pessoas).
                    </p>
                  </div>

                  <div
                    onClick={() => setTargetType('categories')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      targetType === 'categories'
                        ? 'border-[#176B80] bg-[#E9F1F4]/70 ring-1 ring-[#176B80]'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">
                        Por Categorias / Tags Específicas
                      </span>
                      {targetType === 'categories' && (
                        <Check className="w-4 h-4 text-[#176B80]" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Segmentação precisa por interesse temático (Saúde, Agro, Infra) e municípios.
                    </p>
                  </div>
                </div>
              </div>

              {/* Segment Filters if categories selected */}
              {targetType === 'categories' && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in">
                  <div>
                    <span className="font-semibold text-slate-800 block mb-1">
                      Selecione as Tags de Interesse:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {['Saúde', 'Infraestrutura', 'Educação', 'Agro Familiar', 'Segurança Pública', 'Recursos Hídricos', 'Meio Ambiente', 'Cultura & Esporte'].map(
                        (tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleTagSelection(tag)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                              selectedTags.includes(tag)
                                ? 'bg-[#102C45] text-white shadow-xs'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            #{tag}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-slate-800 block mb-1">
                      Filtrar por Municípios de Mato Grosso (Opcional):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {['Cuiabá', 'Rondonópolis', 'Sinop', 'Nova Mutum', 'Juína', 'Tangará da Serra', 'Barra do Garças', 'Sorriso'].map(
                        (city) => (
                          <button
                            key={city}
                            type="button"
                            onClick={() => handleToggleCitySelection(city)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                              selectedCities.includes(city)
                                ? 'bg-[#176B80] text-white shadow-xs'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {city}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-[#176B80] pt-1">
                    Destinatários calculados para este filtro: <strong>{estimatedRecipients > 0 ? estimatedRecipients : 420} cidadãos</strong>
                  </div>
                </div>
              )}

              {/* Title & Subject */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">
                    Título Interno da Campanha
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Boletim Especial Saúde e Emendas"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">
                    Modelo Institucional
                  </label>
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as any)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="informativo_semanal">Informativo Semanal do Mandato</option>
                    <option value="prestacao_contas">Prestação de Contas de Emendas</option>
                    <option value="boletim_regional">Boletim Regional & Rodovias</option>
                    <option value="alerta_urgente">Alerta & Convocação Pública</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Linha de Assunto no E-mail (Subject)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Mandato em Ação: Confira os recursos destinados para os hospitais de MT"
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">
                  Conteúdo da Mensagem
                </label>
                <textarea
                  rows={4}
                  required
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 space-y-1">
                <span className="font-semibold text-slate-700 block">
                  Cabeçalho & Rodapé Timbrados Inseridos Automaticamente:
                </span>
                <p>• Cabeçalho oficial: Gabinete Dep. Mariana Ribeiro (ALMT)</p>
                <p>• Rodapé: "Você recebeu este e-mail porque se cadastrou no site oficial. Deseja cancelar? Clique aqui."</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewCampaignModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5 text-[#36B7A5]" />
                  <span>Confirmar & Disparar Agora</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO ASSINANTE MANUAL */}
      {newSubscriberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Adicionar Assinante Manual</h3>
              <button
                onClick={() => setNewSubscriberModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onAddSubscriber({
                  name: siteFormName || 'Cidadão Convidado',
                  email: siteFormEmail || 'cidadao@mt.gov.br',
                  city: siteFormCity,
                  source: 'Atendimento Presencial',
                  status: 'ativo',
                  tags: ['Saúde', 'Cidadania'],
                });
                setNewSubscriberModalOpen(false);
              }}
              className="p-6 space-y-3 text-xs text-slate-700"
            >
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Eduardo Silveira"
                  onChange={(e) => setSiteFormName(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  placeholder="carlos.silveira@email.com"
                  onChange={(e) => setSiteFormEmail(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Município (MT)</label>
                <select
                  value={siteFormCity}
                  onChange={(e) => setSiteFormCity(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Cuiabá">Cuiabá</option>
                  <option value="Rondonópolis">Rondonópolis</option>
                  <option value="Sinop">Sinop</option>
                  <option value="Juína">Juína</option>
                  <option value="Nova Mutum">Nova Mutum</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewSubscriberModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors"
                >
                  Salvar Assinante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
