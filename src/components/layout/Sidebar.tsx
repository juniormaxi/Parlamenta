import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  FileSpreadsheet,
  Workflow,
  CalendarCheck,
  Users,
  MapPin,
  FileText,
  Newspaper,
  Globe,
  Gavel,
  Sliders,
  BarChart3,
  Shield,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Layers,
  LogOut,
  Mail,
  Scale,
  Landmark,
  Send,
  BookUser,
  FolderTree,
  Mic,
  Rss,
  MessageCircle,
} from 'lucide-react';
import { ModuleType, Cabinet } from '../../types';

interface SidebarProps {
  currentModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeCabinet: Cabinet;
  onOpenLogoModal: () => void;
  customLogoUrl?: string;
  badgeCounts: {
    atendimento: number;
    whatsapp?: number;
    protocolosAtrasados: number;
    flowAlertas: number;
  };
  onLogout?: () => void;
}

interface NavItem {
  id: ModuleType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeVariant?: 'alert' | 'neutral';
  group?: 'principal' | 'legislativo' | 'comunicacao' | 'estrategico' | 'dados' | 'sistema';
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
  activeCabinet,
  onOpenLogoModal,
  customLogoUrl,
  badgeCounts,
  onLogout,
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard, group: 'principal' },
    {
      id: 'atendimento',
      label: 'Central de Atendimento',
      icon: MessageSquare,
      badge: badgeCounts.atendimento,
      group: 'principal',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: MessageCircle,
      badge: badgeCounts.whatsapp,
      group: 'principal',
    },
    {
      id: 'protocolos',
      label: 'Protocolos & Demandas',
      icon: FileSpreadsheet,
      badge: badgeCounts.protocolosAtrasados,
      badgeVariant: 'alert',
      group: 'principal',
    },
    {
      id: 'flow',
      label: 'Parlamenta Flow',
      icon: Workflow,
      badge: badgeCounts.flowAlertas,
      badgeVariant: 'alert',
      group: 'principal',
    },
    { id: 'agenda', label: 'Agenda & Tarefas', icon: CalendarCheck, group: 'principal' },
    { id: 'equipe', label: 'Gestão da Equipe', icon: Users, group: 'principal' },

    // Seção Legislativo
    { id: 'legislativo_projetos', label: 'Projetos de Lei', icon: Scale, group: 'legislativo' },
    { id: 'legislativo_oficios', label: 'Ofícios', icon: Send, group: 'legislativo' },
    { id: 'legislativo_parlamento', label: 'Composição Plenário', icon: Landmark, group: 'legislativo' },

    { id: 'newsletter', label: 'Newsletter', icon: Mail, group: 'comunicacao' },
    { id: 'imprensa', label: 'Conhecimento & Imprensa', icon: Newspaper, group: 'comunicacao' },
    { id: 'clipping', label: 'Clipping', icon: Rss, group: 'comunicacao' },
    { id: 'site', label: 'Site & Publicações', icon: Globe, group: 'comunicacao' },
    { id: 'bd_discursos', label: 'Discursos', icon: Mic, group: 'comunicacao' },

    { id: 'territorial', label: 'Inteligência Territorial', icon: MapPin, group: 'estrategico' },
    { id: 'documentos', label: 'Documentos do Gabinete', icon: FileText, group: 'estrategico' },

    { id: 'bd_contatos', label: 'Contatos', icon: BookUser, group: 'dados' },
    { id: 'bd_categorias', label: 'Categorias', icon: FolderTree, group: 'dados' },
    { id: 'bd_importar', label: 'Importar Bancos de Dados', icon: FileSpreadsheet, group: 'dados' },
    { id: 'relatorios', label: 'Relatórios & Métricas', icon: BarChart3, group: 'sistema' },
    { id: 'integracoes', label: 'Canais & Integrações', icon: Sliders, group: 'sistema' },
    { id: 'admin', label: 'Administração & LGPD', icon: Shield, group: 'sistema' },
  ];

  return (
    <aside
      className={`bg-[#102C45] text-white flex flex-col transition-all duration-200 border-r border-[#176B80]/30 select-none z-30 shrink-0 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#176B80]/40">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#36B7A5] text-[#102C45] flex items-center justify-center font-bold font-mono text-base shrink-0 shadow-xs">
              P
            </div>
            <div className="truncate">
              <span className="text-base font-bold tracking-tight text-white block leading-none">
                Parlamenta
              </span>
              <span className="text-[10px] text-slate-300 font-medium tracking-wide">
                Gabinete Conectado
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-8 h-8 rounded-lg bg-[#36B7A5] text-[#102C45] flex items-center justify-center font-bold font-mono text-base shadow-xs">
            P
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="text-slate-300 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors hidden md:flex items-center justify-center"
          aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Cabinet Logo / Identity Badge */}
      {!collapsed ? (
        <div className="p-3 mx-2 my-2 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
              {customLogoUrl ? (
                <img src={customLogoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <Layers className="w-4 h-4 text-[#36B7A5]" />
              )}
            </div>
            <div className="truncate">
              <p className="text-[11px] font-semibold text-white truncate leading-tight">
                {activeCabinet.name}
              </p>
              <p className="text-[10px] text-slate-300 truncate">
                {activeCabinet.house}
              </p>
            </div>
          </div>
          <button
            onClick={onOpenLogoModal}
            title="Importar logo ou brasão oficial"
            className="text-slate-400 hover:text-[#36B7A5] p-1 rounded hover:bg-white/10 shrink-0 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="py-2 flex justify-center">
          <button
            onClick={onOpenLogoModal}
            title="Importar logo oficial do gabinete"
            className="w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {!collapsed && (
          <div className="px-2 pt-1 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Operação
          </div>
        )}
        {navItems
          .filter((i) => i.group === 'principal')
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left group relative ${
                  isActive
                    ? 'bg-[#176B80] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#36B7A5]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && (
                  <span className="truncate flex-1">{item.label}</span>
                )}
                {!collapsed && item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      item.badgeVariant === 'alert'
                        ? 'bg-rose-500/80 text-white'
                        : 'bg-white/20 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

        {!collapsed && (
          <div className="px-2 pt-4 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Legislativo
          </div>
        )}
        {navItems
          .filter((i) => i.group === 'legislativo')
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left group ${
                  isActive
                    ? 'bg-[#176B80] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#36B7A5]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
              </button>
            );
          })}

        {!collapsed && (
          <div className="px-2 pt-4 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Comunicação
          </div>
        )}
        {navItems
          .filter((i) => i.group === 'comunicacao')
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left group ${
                  isActive
                    ? 'bg-[#176B80] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#36B7A5]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
              </button>
            );
          })}

        {!collapsed && (
          <div className="px-2 pt-4 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Estratégico
          </div>
        )}
        {navItems
          .filter((i) => i.group === 'estrategico')
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left group ${
                  isActive
                    ? 'bg-[#176B80] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#36B7A5]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
              </button>
            );
          })}

        {!collapsed && (
          <div className="px-2 pt-4 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Banco de Dados
          </div>
        )}
        {navItems
          .filter((i) => i.group === 'dados')
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left group ${
                  isActive
                    ? 'bg-[#176B80] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#36B7A5]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
              </button>
            );
          })}

        {!collapsed && (
          <div className="px-2 pt-4 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Gestão & Controle
          </div>
        )}
        {navItems
          .filter((i) => i.group === 'sistema')
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left group ${
                  isActive
                    ? 'bg-[#176B80] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#36B7A5]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
              </button>
            );
          })}
      </nav>

      {/* Session Lock / Logout Action */}
      {onLogout && (
        <div className="p-2 border-t border-[#176B80]/40">
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors ${
              collapsed ? 'justify-center px-1' : ''
            }`}
            title="Bloquear Sessão / Ir para a Tela de Login"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span className="truncate">Bloquear Sessão</span>}
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-3 border-t border-[#176B80]/40 text-center">
        {!collapsed ? (
          <div className="text-[10px] text-slate-300">
            <p className="font-semibold text-slate-200">Parlamenta v1.0.4</p>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-slate-400">v1.0.4</span>
        )}
      </div>
    </aside>
  );
};
