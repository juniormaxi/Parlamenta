import React, { useState } from 'react';
import {
  Search,
  Bell,
  Building2,
  ChevronDown,
  PlayCircle,
  HelpCircle,
  Menu,
  Check,
  Shield,
  UserCheck,
  LogOut,
  Lock,
} from 'lucide-react';
import { Cabinet, UserRole, TeamMember } from '../../types';

interface TopbarProps {
  cabinets: Cabinet[];
  activeCabinet: Cabinet;
  onSelectCabinet: (cabinet: Cabinet) => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  teamMembers: TeamMember[];
  onOpenGuidedTour: () => void;
  onOpenDocs: () => void;
  onToggleMobileMenu: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  moduleTitle: string;
  onLogout?: () => void;
  /** Authenticated user from the API. When present, the RBAC role simulator is disabled. */
  sessionUser?: { name: string; email: string };
}

export const Topbar: React.FC<TopbarProps> = ({
  cabinets,
  activeCabinet,
  onSelectCabinet,
  currentRole,
  onChangeRole,
  teamMembers,
  onOpenGuidedTour,
  onOpenDocs,
  onToggleMobileMenu,
  searchQuery,
  onSearchChange,
  moduleTitle,
  onLogout,
  sessionUser,
}) => {
  const [cabinetMenuOpen, setCabinetMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const currentUser = sessionUser
    ? {
        name: sessionUser.name,
        avatar: sessionUser.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join(''),
      }
    : teamMembers.find((m) => m.role === currentRole) || teamMembers[0];

  const roleLabels: Record<UserRole, string> = {
    deputado: 'Deputada Titular',
    chefe_gabinete: 'Chefe de Gabinete',
    coordenador_atendimento: 'Coord. Atendimento',
    assessor_parlamentar: 'Assessor Temático',
    comunicacao: 'Comunicação',
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-4 z-20 shrink-0 sticky top-0">
      {/* Zone 1: Mobile hamburger, breadcrumbs, search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>Parlamenta</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold">{moduleTitle}</span>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar protocolos, cidadãos, temas..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80] focus:border-[#176B80] transition-all"
          />
        </div>
      </div>

      {/* Zone 2: Cabinet Switcher */}
      <div className="relative hidden lg:block">
        <button
          onClick={() => setCabinetMenuOpen(!cabinetMenuOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 text-xs font-medium text-slate-700 transition-colors"
        >
          <Building2 className="w-3.5 h-3.5 text-[#176B80]" />
          <span className="max-w-[200px] truncate">{activeCabinet.name}</span>
          <span className="text-[10px] uppercase font-mono px-1 rounded bg-slate-200 text-slate-600">
            {activeCabinet.sphere}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {cabinetMenuOpen && (
          <div className="absolute top-full mt-1.5 right-0 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Alternar Gabinete (Multi-Tenant)
            </div>
            {cabinets.map((cab) => (
              <button
                key={cab.id}
                onClick={() => {
                  onSelectCabinet(cab);
                  setCabinetMenuOpen(false);
                }}
                className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                  cab.id === activeCabinet.id
                    ? 'bg-[#E9F1F4] text-[#102C45] font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="truncate pr-2">
                  <p className="font-medium truncate">{cab.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{cab.house}</p>
                </div>
                {cab.id === activeCabinet.id && (
                  <Check className="w-3.5 h-3.5 text-[#176B80] shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zone 3: Actions & Profile */}
      <div className="flex items-center gap-2">
        {/* Guided Demo Flow CTA */}
        <button
          onClick={onOpenGuidedTour}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#36B7A5] hover:bg-[#2fa393] text-[#102C45] text-xs font-semibold shadow-xs transition-colors whitespace-nowrap"
          title="Executar simulação interativa dos 7 passos obrigatórios"
        >
          <PlayCircle className="w-3.5 h-3.5 text-[#102C45]" />
          <span className="hidden sm:inline">Fluxo Demonstrativo</span>
          <span className="sm:hidden">Demo</span>
        </button>

        {/* Technical Docs & Mock Matrix */}
        <button
          onClick={onOpenDocs}
          className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
          title="Documentação de Arquitetura & Matriz Mock"
          aria-label="Ver documentação"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors relative"
            aria-label="Notificações"
          >
            <Bell className="w-4 h-4" />
            <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1 right-1" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-40 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-900">Notificações do Gabinete</span>
                <span className="text-[10px] text-slate-400">3 novas</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="p-2.5 hover:bg-slate-50 transition-colors rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-rose-600 text-[11px]">SLA em Alerta</span>
                    <span className="text-[10px] text-slate-400">Há 15 min</span>
                  </div>
                  <p className="text-slate-700 mt-1">
                    Protocolo <strong className="font-mono">PRT-2026-0042</strong> (UTI Rondonópolis) vence em 32h.
                  </p>
                </div>
                <div className="p-2.5 hover:bg-slate-50 transition-colors rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#176B80] text-[11px]">Nova Demanda</span>
                    <span className="text-[10px] text-slate-400">Há 45 min</span>
                  </div>
                  <p className="text-slate-700 mt-1">
                    Marcos Vinicius enviou dossiê sobre MT-249 via E-mail.
                  </p>
                </div>
                <div className="p-2.5 hover:bg-slate-50 transition-colors rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-600 text-[11px]">Emenda Cadastrada</span>
                    <span className="text-[10px] text-slate-400">Ontem</span>
                  </div>
                  <p className="text-slate-700 mt-1">
                    Indicação para poços em Juína foi aceita no SIGA/MT.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Role Switcher & User Profile */}
        <div className="relative pl-1 border-l border-slate-200">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-[#102C45] text-white flex items-center justify-center font-bold text-xs shrink-0">
              {currentUser.avatar}
            </div>
            <div className="hidden xl:block leading-tight">
              <span className="text-xs font-semibold text-slate-900 block truncate max-w-[120px]">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-[#176B80] font-medium block">
                {roleLabels[currentRole]}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden xl:block" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-40 animate-in fade-in zoom-in-95 duration-100">
              {sessionUser ? (
                <div className="px-2 py-1.5 text-xs">
                  <p className="font-semibold text-slate-900 truncate">{sessionUser.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{sessionUser.email}</p>
                  <p className="text-[10px] text-[#176B80] font-medium mt-0.5 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {roleLabels[currentRole]} · perfil definido pelo servidor
                  </p>
                </div>
              ) : (
              <>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-3 h-3 text-[#176B80]" />
                Simular Papel / Perfil RBAC
              </div>
              <div className="space-y-1 mt-1">
                {(
                  [
                    'deputado',
                    'chefe_gabinete',
                    'coordenador_atendimento',
                    'assessor_parlamentar',
                    'comunicacao',
                  ] as UserRole[]
                ).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      onChangeRole(role);
                      setRoleMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      currentRole === role
                        ? 'bg-[#E9F1F4] text-[#102C45] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{roleLabels[role]}</span>
                    {currentRole === role && (
                      <Check className="w-3.5 h-3.5 text-[#176B80]" />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 px-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Shield className="w-3 h-3 text-slate-400" />
                  Isolamento por Gabinete & Perfis
                </span>
                Permite testar visualização de Coordenador vs. Assessor.
              </div>

              </>
              )}

              {onLogout && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setRoleMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 font-semibold flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <LogOut className="w-3.5 h-3.5" />
                      Bloquear Sessão / Sair
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Lock</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors hidden sm:flex items-center justify-center"
            title="Bloquear Sessão / Ir para a Tela de Login"
            aria-label="Bloquear Sessão"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
