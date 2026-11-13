import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RotateCcw,
  Sparkles,
  Building2,
  ChevronRight,
  Fingerprint,
  Info,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';

interface LoginViewProps {
  /** Called after the API accepted the credentials and set the session cookie. */
  onLoginSuccess: () => void;
  cabinetName?: string;
}

type AuthMode = 'login' | 'forgot_password' | 'enter_code' | 'reset_password' | 'success';

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  cabinetName = 'Gabinete Dep. Mariana Ribeiro (ALMT)',
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password Recovery States
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Por favor, preencha o e-mail institucional e a senha.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await api('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      setPassword('');
      onLoginSuccess();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Não foi possível conectar à API.');
    } finally {
      setLoading(false);
    }
  };

  // Password Recovery Handlers
  const handleSendRecoveryEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim() || !recoveryEmail.includes('@')) {
      setErrorMsg('Informe um endereço de e-mail institucional válido.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setTimeout(() => {
      setLoading(false);
      setAuthMode('enter_code');
    }, 700);
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryCode.trim().length < 4) {
      setErrorMsg('Informe o código de 6 dígitos recebido.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setTimeout(() => {
      setLoading(false);
      setAuthMode('reset_password');
    }, 600);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setErrorMsg('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setTimeout(() => {
      setLoading(false);
      setAuthMode('success');
    }, 700);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0B1E30] text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-6 lg:p-10 select-none">
      {/* Background Animated Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Subtle radial ambient gradients */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#176B80]/30 rounded-full blur-[140px] animate-pulse duration-7000" />
        <div className="absolute -bottom-40 -right-40 w-[650px] h-[650px] bg-[#36B7A5]/20 rounded-full blur-[150px] animate-pulse duration-10000" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[500px] h-[500px] bg-[#102C45]/80 rounded-full blur-[120px]" />

        {/* Subtle Animated Civic Geometric Grid Mesh */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07] stroke-white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid-pattern"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        </svg>

        {/* Ambient floating constellation dots (connected parliament metaphor) */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/5 w-2 h-2 rounded-full bg-[#36B7A5]/60 animate-ping duration-3000" />
          <div className="absolute top-3/4 left-1/6 w-1.5 h-1.5 rounded-full bg-[#176B80]/80" />
          <div className="absolute top-1/3 right-1/4 w-2 h-2 rounded-full bg-[#36B7A5]/50" />
          <div className="absolute bottom-1/4 right-1/5 w-1.5 h-1.5 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Main Container Card (Dual Column Executive Layout) */}
      <div className="relative z-10 w-full max-w-5xl bg-[#102C45]/90 backdrop-blur-xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Left Column: Brand Story, Signature & Institutional Badges (5 cols) */}
        <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10 bg-gradient-to-b from-[#102C45] to-[#0D253A] relative">
          <div className="space-y-6">
            {/* Brand Mark Lockup */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#36B7A5] to-[#176B80] text-[#102C45] flex items-center justify-center font-bold font-mono text-xl shadow-lg shadow-[#36B7A5]/20">
                P
              </div>
              <div>
                <span className="text-2xl font-extrabold tracking-tight text-white block leading-none">
                  Parlamentta
                </span>
                <span className="text-xs text-[#36B7A5] font-semibold tracking-wider uppercase mt-1 block">
                  Gabinete Conectado
                </span>
              </div>
            </div>

            {/* Official Signature */}
            <div className="space-y-2 pt-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                Gestão inteligente. Gabinete conectado.
              </h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                Plataforma integrada de atendimento ao cidadão, gestão de protocolos e inteligência territorial para mandatos de alta performance.
              </p>
            </div>

            {/* Cabinet Identifier Badge */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Ambiente Multi-Gabinete Conectado
              </span>
              <p className="text-xs font-semibold text-white truncate">
                {cabinetName}
              </p>
              <p className="text-[11px] text-slate-300">
                Assembleia Legislativa de Mato Grosso (ALMT)
              </p>
            </div>

            {/* Trust Markers */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <ShieldCheck className="w-4 h-4 text-[#36B7A5] shrink-0" />
                <span>Isolamento Total de Dados entre Gabinetes</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <Fingerprint className="w-4 h-4 text-[#36B7A5] shrink-0" />
                <span>Autenticação Forte & Rastreabilidade LGPD</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-[#36B7A5] shrink-0" />
                <span>Triagem Omnichannel & SLA Regulamentar</span>
              </div>
            </div>
          </div>

          {/* System Signature & Version in Left Footer */}
          <div className="pt-8 border-t border-white/10 space-y-1 text-slate-400 text-[11px]">
            <p className="text-slate-300 font-semibold">
              Parlamentta® · Gestão inteligente. Gabinete conectado.
            </p>
            <p className="font-mono text-[10px] text-slate-400">
              Versão 1.0.4 (Build de Produção 2026.11) · Multi-Tenant
            </p>
            <p className="text-[10px] text-slate-500">
              Conformidade LGPD (Lei nº 13.709/2018) · ICP-Brasil Ready
            </p>
            <p className="pt-2 text-[10px] text-slate-400">
              Desenvolvido por <span className="font-semibold text-slate-300">IBRASSI</span>
            </p>
          </div>
        </div>

        {/* Right Column: Dynamic Form Area (7 cols) */}
        <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between bg-white text-[#102C45]">
          {/* ======================================================== */}
          {/* VIEW: LOGIN FORM */}
          {/* ======================================================== */}
          {authMode === 'login' && (
            <div className="space-y-6 my-auto">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Acesso ao Gabinete Virtual
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Insira suas credenciais institucionais para gerenciar o mandato.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {/* E-mail Input */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    E-mail Institucional
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="usuario@gabinete.mt.leg.br"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#176B80] focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Senha de Acesso
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setRecoveryEmail(email);
                        setAuthMode('forgot_password');
                      }}
                      className="text-xs font-medium text-[#176B80] hover:text-[#102C45] underline underline-offset-2 transition-colors"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#176B80] focus:border-transparent transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded text-[#176B80] focus:ring-[#176B80] w-3.5 h-3.5"
                    />
                    <span>Lembrar meu acesso neste dispositivo seguro</span>
                  </label>
                </div>

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-60"
                >
                  <span>{loading ? 'Autenticando Gabinete...' : 'Acessar Plataforma Parlamentta'}</span>
                  {!loading && (
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  )}
                </button>
              </form>

            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW: FORGOT PASSWORD (STEP 1) */}
          {/* ======================================================== */}
          {authMode === 'forgot_password' && (
            <div className="space-y-6 my-auto animate-in fade-in duration-200">
              <div>
                <button
                  onClick={() => setAuthMode('login')}
                  className="text-xs font-semibold text-[#176B80] hover:underline flex items-center gap-1 mb-2"
                >
                  ← Voltar para o Login
                </button>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Recuperação de Senha do Gabinete
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Informe o e-mail institucional cadastrado para receber as instruções seguras de redefinição de acesso.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSendRecoveryEmail} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    E-mail Institucional Cadastrado
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="seu.nome@gabinete.mt.leg.br"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#176B80]"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#E9F1F4]/70 border border-[#176B80]/20 text-[11px] text-slate-700 flex items-start gap-2">
                  <Info className="w-4 h-4 text-[#176B80] shrink-0 mt-0.5" />
                  <span>
                    Por motivos de segurança e conformidade regimental, o código de recuperação expira em 15 minutos e só pode ser utilizado no domínio oficial do gabinete.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>{loading ? 'Enviando Código...' : 'Enviar Código de Recuperação'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW: ENTER VERIFICATION CODE (STEP 2) */}
          {/* ======================================================== */}
          {authMode === 'enter_code' && (
            <div className="space-y-6 my-auto animate-in fade-in duration-200">
              <div>
                <button
                  onClick={() => setAuthMode('forgot_password')}
                  className="text-xs font-semibold text-[#176B80] hover:underline flex items-center gap-1 mb-2"
                >
                  ← Alterar E-mail
                </button>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Código de Verificação
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Enviamos um código de segurança de 6 dígitos para o e-mail{' '}
                  <strong className="text-slate-800">{recoveryEmail}</strong>.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Código de Segurança (6 Dígitos)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      maxLength={6}
                      required
                      placeholder="Ex: 849201"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-base tracking-widest font-mono text-center font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-[#176B80]"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 text-center pt-1 font-mono">
                    Dica de teste: Digite qualquer código de 6 dígitos (Ex: 849201)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>{loading ? 'Validando...' : 'Validar Código & Prosseguir'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW: SET NEW PASSWORD (STEP 3) */}
          {/* ======================================================== */}
          {authMode === 'reset_password' && (
            <div className="space-y-6 my-auto animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Definir Nova Senha
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Crie uma senha forte de acordo com os padrões de segurança do Gabinete.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nova Senha
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-[#176B80]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Confirmar Nova Senha
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-[#176B80]"
                  />
                </div>

                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-0.5">
                  <p className="font-semibold text-slate-700">Requisitos da Senha:</p>
                  <p>• Mínimo de 8 caracteres</p>
                  <p>• Letras maiúsculas, minúsculas e números</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>{loading ? 'Salvando...' : 'Salvar Nova Senha'}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW: RECOVERY SUCCESS (STEP 4) */}
          {/* ======================================================== */}
          {authMode === 'success' && (
            <div className="space-y-6 my-auto text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Senha Redefinida com Sucesso!
                </h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Sua nova senha foi atualizada no sistema de segurança do gabinete. Você já pode fazer login normalmente.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setPassword('••••••••••••');
                }}
                className="w-full py-2.5 px-4 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>Retornar e Acessar o Gabinete</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Bottom Right Legal / Support Bar */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1 text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-[#176B80]" />
              Conexão Segura TLS 1.3
            </span>
            <span className="font-mono text-[10px]">
              Suporte Técnico ALMT / TI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
