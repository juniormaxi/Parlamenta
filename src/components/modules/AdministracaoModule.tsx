import React, { useState } from 'react';
import {
  Shield,
  Key,
  Users,
  Clock,
  Sliders,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  FileSpreadsheet,
  AlertCircle,
  Database,
  History,
  Bot,
  Sparkles,
  Cpu,
  Zap,
  Check,
  RefreshCw,
  Send,
  Terminal,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { AuditLog, TeamMember } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';

interface AdministracaoModuleProps {
  auditLogs: AuditLog[];
  teamMembers: TeamMember[];
}

export const AdministracaoModule: React.FC<AdministracaoModuleProps> = ({
  auditLogs,
  teamMembers,
}) => {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'sla' | 'seguranca' | 'auditoria' | 'ia'>('ia');

  // SLA rules
  const [slaRules, setSlaRules] = useState([
    { theme: 'Saúde (Leitos, Cirurgias e Regulação)', hours: 24, priority: 'Urgente' },
    { theme: 'Segurança Pública & Defesa Social', hours: 48, priority: 'Alta' },
    { theme: 'Infraestrutura (Rodovias e Pontes)', hours: 120, priority: 'Média' },
    { theme: 'Agricultura Familiar & Poços', hours: 72, priority: 'Alta' },
    { theme: 'Educação & Climatização Escolar', hours: 72, priority: 'Média' },
    { theme: 'Cultura, Esporte e Juventude', hours: 168, priority: 'Baixa' },
  ]);

  const [mfaEnforced, setMfaEnforced] = useState(true);
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState(8);

  // AI Configuration State
  const [activeAiProvider, setActiveAiProvider] = useState<'claude' | 'chatgpt' | 'gemini'>('claude');
  const [aiTokens, setAiTokens] = useState({
    claude: 'sk-ant-api03-P9aLx48K...[Ativo]',
    chatgpt: 'sk-proj-91aKx882...[Ativo]',
    gemini: 'AIzaSyA89vLm4...[Injetado automaticamente]',
  });
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({
    claude: false,
    chatgpt: false,
    gemini: false,
  });
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    provider: string;
    success: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  // Assisted AI features in mandate
  const [aiFeatures, setAiFeatures] = useState({
    documentCreation: true, // Criação de Projetos de Lei e Ofícios
    documentAnalysis: true, // Análise e Verificação de Documentos (LC 95/98)
    atendimentoTriage: true, // Triagem e Tagueamento em Central de Atendimentos
  });

  const [aiModels, setAiModels] = useState<Record<string, string>>({
    claude: 'claude-3-5-sonnet-20241022',
    chatgpt: 'gpt-4o',
    gemini: 'gemini-2.5-flash',
  });

  const [aiTemperature, setAiTemperature] = useState(0.3);
  const [systemPrompt, setSystemPrompt] = useState(
    'Você é o assistente de inteligência parlamentar oficial do Gabinete Conectado da Deputada Estadual Mariana Ribeiro (ALMT). Adote tom institucional solene, fundamentação legal técnica (observando a LC 95/98 e a Constituição Estadual de MT) e rigor na triagem de mensagens cidadãs.'
  );

  const [savedSuccessAlert, setSavedSuccessAlert] = useState(false);

  // Live triage simulation test
  const [testMessage, setTestMessage] = useState(
    'Olá deputada, a ponte de madeira sobre o córrego Água Branca na estrada vicinal de Nova Mutum cedeu com o temporal de ontem e os produtores de leite não conseguem escoar a produção nem os alunos irem à escola.'
  );
  const [simulatedResult, setSimulatedResult] = useState<{
    tema: string;
    prioridade: string;
    encaminhamento: string;
    sentimento: string;
    municipio: string;
    acaoSugerida: string;
    confianca: number;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleTestToken = (provider: 'claude' | 'chatgpt' | 'gemini') => {
    setTestingProvider(provider);
    setTestResult(null);
    setTimeout(() => {
      const providerNames = {
        claude: 'Anthropic Claude (3.5 Sonnet)',
        chatgpt: 'OpenAI ChatGPT (GPT-4o)',
        gemini: 'Google Gemini (2.5 Flash)',
      };
      setTestResult({
        provider,
        success: true,
        latencyMs: Math.floor(Math.random() * 80 + 140),
        message: `Conexão autenticada com sucesso no endpoint oficial do ${providerNames[provider]}. Quota ativa e pronta para uso.`,
      });
      setTestingProvider(null);
    }, 1100);
  };

  const handleSimulateTriage = () => {
    setIsSimulating(true);
    setSimulatedResult(null);
    setTimeout(() => {
      setSimulatedResult({
        tema: 'Infraestrutura (Pontes & Estradas Vicinais)',
        prioridade: 'Urgente (SLA 24h)',
        encaminhamento: 'Assessor Lucas Mendes · Comissão de Infraestrutura',
        sentimento: 'Apreensivo / Crítico',
        municipio: 'Nova Mutum (Médio-Norte)',
        acaoSugerida: 'Gerar Ofício à SINFRA-MT e abrir Protocolo Cidadão PRT-2026',
        confianca: 98.4,
      });
      setIsSimulating(false);
    }, 900);
  };

  const handleSaveAiSettings = () => {
    setSavedSuccessAlert(true);
    setTimeout(() => setSavedSuccessAlert(false), 4000);
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Administração & Governança de Gabinete"
        contextText="Configurações de perfis de acesso RBAC, políticas de segurança MFA, prazos de SLA, integração de Inteligência Artificial e trilha imutável de auditoria (LGPD)."
      />

      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#176B80]" />
            Administração, Segurança & Configuração de IA
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão de provedores de IA (Claude, ChatGPT, Gemini), permissões de equipe e governança de dados
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('ia')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'ia'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#36B7A5]" />
            <span>Inteligência Artificial (IA)</span>
          </button>
          <button
            onClick={() => setActiveTab('auditoria')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'auditoria'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5 text-[#176B80]" />
            <span>Logs de Auditoria</span>
          </button>
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'usuarios'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#176B80]" />
            <span>Equipe & RBAC</span>
          </button>
          <button
            onClick={() => setActiveTab('sla')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'sla'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-[#176B80]" />
            <span>Prazos de SLA</span>
          </button>
          <button
            onClick={() => setActiveTab('seguranca')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'seguranca'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-[#176B80]" />
            <span>MFA & Segurança</span>
          </button>
        </div>
      </div>

      {/* Tab: Inteligência Artificial (IA) */}
      {activeTab === 'ia' && (
        <div className="space-y-4">
          {savedSuccessAlert && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center justify-between shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Configurações de IA salvas com sucesso!</strong> Os módulos de Criação de Documentos, Verificação Constitucional e Triagem da Central de Atendimento estão sincronizados com o provedor <strong>{activeAiProvider.toUpperCase()}</strong>.
                </span>
              </div>
              <button
                onClick={() => setSavedSuccessAlert(false)}
                className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-0.5"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Top Banner: Status da IA no Gabinete */}
          <div className="bg-gradient-to-r from-[#102C45] to-[#176B80] text-white rounded-xl p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-white/10 rounded-lg text-[#36B7A5]">
                    <Sparkles className="w-5 h-5" />
                  </span>
                  <h2 className="text-base font-bold">Motor de Inteligência Artificial do Gabinete</h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#36B7A5] text-[#102C45]">
                    Ativo & Conectado
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-1.5 max-w-2xl leading-relaxed">
                  Configure tokens de acesso de APIs de ponta (<strong>Anthropic Claude</strong>, <strong>OpenAI ChatGPT</strong> ou <strong>Google Gemini</strong>). O sistema utiliza os modelos para redigir peças legislativas, auditar normas jurídicas e classificar mensagens de cidadãos em tempo real.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 bg-white/10 p-3 rounded-lg border border-white/10">
                <div className="text-right">
                  <div className="text-[11px] text-slate-300 font-medium">Provedor Ativo</div>
                  <div className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-end gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#36B7A5] animate-ping" />
                    {activeAiProvider === 'claude' && 'Anthropic Claude'}
                    {activeAiProvider === 'chatgpt' && 'OpenAI ChatGPT'}
                    {activeAiProvider === 'gemini' && 'Google Gemini'}
                  </div>
                </div>
                <button
                  onClick={handleSaveAiSettings}
                  className="px-3.5 py-2 bg-[#36B7A5] hover:bg-[#2fa393] text-[#102C45] text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </div>
          </div>

          {/* Test connection alert result if available */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-xs ${
                testResult.success
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>Validação de API Concluída (HTTP 200 OK)</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-mono font-semibold">
                      Latência: {testResult.latencyMs}ms
                    </span>
                  </div>
                  <p className="mt-0.5 text-slate-700">{testResult.message}</p>
                </div>
              </div>
              <button
                onClick={() => setTestResult(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Seção 1: Configuração dos 3 Provedores (Tokens e Modelos) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Anthropic Claude */}
            <div
              className={`bg-white rounded-xl border p-4 shadow-xs transition-all relative flex flex-col justify-between ${
                activeAiProvider === 'claude'
                  ? 'border-[#176B80] ring-2 ring-[#176B80]/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-xs">
                      CL
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">Anthropic Claude</h3>
                      <p className="text-[10px] text-slate-500">Claude 3.5 Sonnet / Haiku</p>
                    </div>
                  </div>
                  {activeAiProvider === 'claude' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Ativo no Gabinete
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveAiProvider('claude')}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer"
                    >
                      Tornar Ativo
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Modelo Padrão
                    </label>
                    <select
                      value={aiModels.claude}
                      onChange={(e) => setAiModels({ ...aiModels, claude: e.target.value })}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden font-medium"
                    >
                      <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet (Ideal p/ Leis)</option>
                      <option value="claude-3-5-haiku-20241022">claude-3-5-haiku (Ágil p/ Triagem)</option>
                      <option value="claude-3-opus-20240229">claude-3-opus (Análise Complexa)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Token / API Key da Anthropic
                    </label>
                    <div className="relative">
                      <input
                        type={showTokens.claude ? 'text' : 'password'}
                        value={aiTokens.claude}
                        onChange={(e) => setAiTokens({ ...aiTokens, claude: e.target.value })}
                        placeholder="sk-ant-api03-..."
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg py-2 pl-2.5 pr-8 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, claude: !showTokens.claude })}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                        title={showTokens.claude ? 'Ocultar' : 'Exibir'}
                      >
                        {showTokens.claude ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Chave do console console.anthropic.com</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Status: Válido</span>
                <button
                  onClick={() => handleTestToken('claude')}
                  disabled={testingProvider === 'claude'}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${testingProvider === 'claude' ? 'animate-spin' : ''}`} />
                  <span>{testingProvider === 'claude' ? 'Testando...' : 'Testar Conexão'}</span>
                </button>
              </div>
            </div>

            {/* 2. OpenAI ChatGPT */}
            <div
              className={`bg-white rounded-xl border p-4 shadow-xs transition-all relative flex flex-col justify-between ${
                activeAiProvider === 'chatgpt'
                  ? 'border-[#176B80] ring-2 ring-[#176B80]/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-xs">
                      OA
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">OpenAI ChatGPT</h3>
                      <p className="text-[10px] text-slate-500">GPT-4o / GPT-4o-mini</p>
                    </div>
                  </div>
                  {activeAiProvider === 'chatgpt' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Ativo no Gabinete
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveAiProvider('chatgpt')}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer"
                    >
                      Tornar Ativo
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Modelo Padrão
                    </label>
                    <select
                      value={aiModels.chatgpt}
                      onChange={(e) => setAiModels({ ...aiModels, chatgpt: e.target.value })}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden font-medium"
                    >
                      <option value="gpt-4o">gpt-4o (Modelo principal multimodal)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (Baixa latência)</option>
                      <option value="o1-preview">o1-preview (Raciocínio lógico estendido)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Token / API Key da OpenAI
                    </label>
                    <div className="relative">
                      <input
                        type={showTokens.chatgpt ? 'text' : 'password'}
                        value={aiTokens.chatgpt}
                        onChange={(e) => setAiTokens({ ...aiTokens, chatgpt: e.target.value })}
                        placeholder="sk-proj-..."
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg py-2 pl-2.5 pr-8 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, chatgpt: !showTokens.chatgpt })}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                        title={showTokens.chatgpt ? 'Ocultar' : 'Exibir'}
                      >
                        {showTokens.chatgpt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Chave do portal platform.openai.com</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Status: Válido</span>
                <button
                  onClick={() => handleTestToken('chatgpt')}
                  disabled={testingProvider === 'chatgpt'}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${testingProvider === 'chatgpt' ? 'animate-spin' : ''}`} />
                  <span>{testingProvider === 'chatgpt' ? 'Testando...' : 'Testar Conexão'}</span>
                </button>
              </div>
            </div>

            {/* 3. Google Gemini */}
            <div
              className={`bg-white rounded-xl border p-4 shadow-xs transition-all relative flex flex-col justify-between ${
                activeAiProvider === 'gemini'
                  ? 'border-[#176B80] ring-2 ring-[#176B80]/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs">
                      GE
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">Google Gemini</h3>
                      <p className="text-[10px] text-slate-500">Gemini 2.5 Flash / 2.5 Pro</p>
                    </div>
                  </div>
                  {activeAiProvider === 'gemini' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Ativo no Gabinete
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveAiProvider('gemini')}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer"
                    >
                      Tornar Ativo
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Modelo Padrão
                    </label>
                    <select
                      value={aiModels.gemini}
                      onChange={(e) => setAiModels({ ...aiModels, gemini: e.target.value })}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden font-medium"
                    >
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Alta velocidade & precisão)</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro (Raciocínio jurídico avançado)</option>
                      <option value="gemini-2.0-flash">gemini-2.0-flash (Econômico)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Token / API Key do Gemini
                    </label>
                    <div className="relative">
                      <input
                        type={showTokens.gemini ? 'text' : 'password'}
                        value={aiTokens.gemini}
                        onChange={(e) => setAiTokens({ ...aiTokens, gemini: e.target.value })}
                        placeholder="AIzaSy..."
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg py-2 pl-2.5 pr-8 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, gemini: !showTokens.gemini })}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                        title={showTokens.gemini ? 'Ocultar' : 'Exibir'}
                      >
                        {showTokens.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Google AI Studio / GCP Secret Manager</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Status: Válido</span>
                <button
                  onClick={() => handleTestToken('gemini')}
                  disabled={testingProvider === 'gemini'}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${testingProvider === 'gemini' ? 'animate-spin' : ''}`} />
                  <span>{testingProvider === 'gemini' ? 'Testando...' : 'Testar Conexão'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Seção 2: Módulos Assistidos por IA no Gabinete (Criação, Análise e Triagem) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#36B7A5]" />
                  Módulos do Gabinete com Assistência de Inteligência Artificial
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ative ou desative os recursos de inteligência generativa integrados às rotinas legislativas e de atendimento
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                3 de 3 Módulos Habilitados
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Recurso 1: Criação de Documentos */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-[#176B80]" />
                      Criação de Documentos
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiFeatures.documentCreation}
                        onChange={(e) =>
                          setAiFeatures({ ...aiFeatures, documentCreation: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#176B80]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Minutagem automática de <strong>Projetos de Lei (PL)</strong>, <strong>Ofícios</strong> e Requerimentos de Informação. Formata ementas, justificativas e artigos respeitando a <strong>LC 95/1998</strong>.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Módulo:</span>
                  <span className="font-semibold text-[#176B80]">Legislativo & Documentos</span>
                </div>
              </div>

              {/* Recurso 2: Análise de Documentos */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-[#176B80]" />
                      Análise e Auditoria de Leis
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiFeatures.documentAnalysis}
                        onChange={(e) =>
                          setAiFeatures({ ...aiFeatures, documentAnalysis: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#176B80]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Verificador constitucional automático (admissibilidade da CCJR da ALMT, verificação de vício de iniciativa do Executivo Estadual e análise de impacto financeiro/orçamentário).
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Módulo:</span>
                  <span className="font-semibold text-[#176B80]">Verificador Constitucional</span>
                </div>
              </div>

              {/* Recurso 3: Triagem e Tagueamento em Central de Atendimentos */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-[#36B7A5]" />
                      Triagem na Central de Atendimento
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiFeatures.atendimentoTriage}
                        onChange={(e) =>
                          setAiFeatures({ ...aiFeatures, atendimentoTriage: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#176B80]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Leitura inteligente de mensagens (WhatsApp, Instagram, e-mail). Classifica automaticamente por <strong>Tema</strong>, detecta município de MT, prioridade de SLA e sugere abertura de protocolo.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Módulo:</span>
                  <span className="font-semibold text-[#176B80]">Central & Parlamenta Flow</span>
                </div>
              </div>
            </div>
          </div>

          {/* Seção 3: Parâmetros de Inferência e Diretrizes do Gabinete */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Temperatura e Rigor */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-[#176B80]" />
                  Temperatura do Modelo (Criatividade vs. Rigor Jurídico)
                </h4>
                <span className="text-xs font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                  {aiTemperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={aiTemperature}
                onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                className="w-full accent-[#176B80] cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>0.0 (Rigor Máximo / LC 95/98)</span>
                <span>0.3 (Recomendado p/ Gabinete)</span>
                <span>1.0 (Criativo / Discursos)</span>
              </div>
              <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                Recomendamos manter entre <strong>0.20 e 0.35</strong> para garantir que a IA não invente artigos de leis, precedentes jurisprudenciais do STF ou dados orçamentários do Estado de Mato Grosso.
              </p>
            </div>

            {/* Prompt do Sistema do Gabinete */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-[#176B80]" />
                Prompt do Sistema Institucional (Diretriz do Mandato)
              </h4>
              <textarea
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden leading-relaxed"
                placeholder="Instruções institucionais globais para o assistente do gabinete..."
              />
              <span className="text-[10px] text-slate-400 block text-right">
                Injetado em todas as chamadas de API do gabinete
              </span>
            </div>
          </div>

          {/* Seção 4: Simulador Interativo de Triagem e Tagueamento com IA */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#176B80]" />
                  Simulador de Triagem & Tagueamento Inteligente (Central de Atendimento)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Teste em tempo real como o modelo configurado ({activeAiProvider.toUpperCase()}) processa demandas de cidadãos de Mato Grosso
                </p>
              </div>
              <button
                onClick={handleSimulateTriage}
                disabled={isSimulating}
                className="px-3.5 py-1.5 bg-[#176B80] hover:bg-[#102C45] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                <span>{isSimulating ? 'Processando com IA...' : 'Executar Triagem com IA'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Mensagem de Entrada */}
              <div className="lg:col-span-6 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Mensagem Cidadã de Teste (Ex: WhatsApp / Instagram):
                </label>
                <textarea
                  rows={4}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-3 text-slate-800 focus:ring-1 focus:ring-[#176B80] focus:outline-hidden leading-relaxed"
                />
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>Exemplos rápidos:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setTestMessage(
                        'A fila da tomografia no Hospital Regional de Cáceres está com espera de 9 meses e idosos estão piorando sem o laudo.'
                      )
                    }
                    className="text-xs text-[#176B80] hover:underline cursor-pointer"
                  >
                    Saúde (Cáceres)
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() =>
                      setTestMessage(
                        'Gostaria de parabenizar a deputada pelo projeto sobre incentivo à agricultura familiar e cooperativas do Vale do Araguaia.'
                      )
                    }
                    className="text-xs text-[#176B80] hover:underline cursor-pointer"
                  >
                    Apoio (Araguaia)
                  </button>
                </div>
              </div>

              {/* Resultado do Tagueamento da IA */}
              <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200/80 pb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#36B7A5]" />
                      Classificação & Extração Estruturada
                    </span>
                    {simulatedResult && (
                      <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                        Confiança: {simulatedResult.confianca}%
                      </span>
                    )}
                  </div>

                  {simulatedResult ? (
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Tema / Área:</span>
                        <span className="font-bold text-slate-900">{simulatedResult.tema}</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Prioridade SLA:</span>
                        <span className="font-bold text-rose-700">{simulatedResult.prioridade}</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Município Identificado:</span>
                        <span className="font-bold text-slate-900">{simulatedResult.municipio}</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Sentimento:</span>
                        <span className="font-bold text-amber-700">{simulatedResult.sentimento}</span>
                      </div>
                      <div className="col-span-2 p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Ação Sugerida pela IA:</span>
                        <span className="font-bold text-[#176B80]">{simulatedResult.acaoSugerida}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      Clique em <strong>Executar Triagem com IA</strong> para visualizar a classificação de tema, sentimento e sugestão de protocolo.
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-200/60">
                  <span>Validação humana obrigatória</span>
                  <span className="font-mono text-[10px] text-slate-400">Modelo: {aiModels[activeAiProvider]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-600">
              As alterações nos tokens e parâmetros têm efeito imediato em todos os módulos de gabinete.
            </div>
            <button
              onClick={handleSaveAiSettings}
              className="px-5 py-2.5 bg-[#176B80] hover:bg-[#102C45] text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Salvar Configurações de IA</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab: Auditoria LGPD */}
      {activeTab === 'auditoria' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-3">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Trilha Imutável de Auditoria (Rastreabilidade LGPD Art. 6º)
              </h3>
              <p className="text-xs text-slate-500">
                Registro de acessos a dados de cidadãos, alterações de status e emissão de expedientes
              </p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
              ✓ Log Criptografado & Ativo
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Ação</th>
                  <th className="py-3 px-4">Recurso</th>
                  <th className="py-3 px-4">Detalhes da Operação</th>
                  <th className="py-3 px-4 font-mono">IP Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold text-slate-900">{log.userName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{log.userRole}</div>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="font-semibold text-[#176B80]">{log.action}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#102C45]">{log.resource}</td>
                    <td className="py-3 px-4 font-sans text-slate-600 max-w-md">
                      {log.details}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Equipe & Perfis RBAC */}
      {activeTab === 'usuarios' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Perfis de Acesso & Matriz RBAC
              </h3>
              <p className="text-xs text-slate-500">
                Controle granular de privilégios para assegurar o isolamento do gabinete
              </p>
            </div>
            <button
              onClick={() => alert('Convite de novo membro enviado para e-mail institucional.')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#102C45] rounded-lg"
            >
              Convidar Membro
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-2.5 px-4">Nome</th>
                  <th className="py-2.5 px-4">Papel no Sistema</th>
                  <th className="py-2.5 px-4">E-mail Institucional</th>
                  <th className="py-2.5 px-4">Acesso a Protocolos</th>
                  <th className="py-2.5 px-4">Permissão de Encerramento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">{m.name}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#176B80]">
                      {m.role}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono">{m.email}</td>
                    <td className="py-3 px-4 text-slate-700">Total (Gabinete ALMT)</td>
                    <td className="py-3 px-4">
                      {m.role === 'chefe_gabinete' || m.role === 'deputado' ? (
                        <span className="text-emerald-700 font-semibold font-mono">
                          ✓ Autorizado
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">Requer Homologação</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: SLA Rules */}
      {activeTab === 'sla' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">
              Tabela de Prazos de Atendimento (SLA por Tema)
            </h3>
            <p className="text-xs text-slate-500">
              O sistema dispara alertas automáticos aos coordenadores quando restarem 48h para o vencimento
            </p>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {slaRules.map((r) => (
              <div key={r.theme} className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{r.theme}</h4>
                  <span className="text-[11px] text-slate-500">
                    Prioridade recomendada: <strong className="text-slate-700">{r.priority}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-[#102C45]">
                    {r.hours} horas ({Math.round(r.hours / 24)} dias)
                  </span>
                  <button
                    onClick={() => alert(`Ajustar prazo de SLA para o tema: ${r.theme}`)}
                    className="text-xs text-[#176B80] hover:underline font-semibold"
                  >
                    Editar Regra
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Segurança & MFA */}
      {activeTab === 'seguranca' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5 max-w-2xl">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">
              Políticas de Segurança do Gabinete
            </h3>
            <p className="text-xs text-slate-500">
              Autenticação forte para proteção de informações de cidadãos e sigilo de documentos
            </p>
          </div>

          <div className="space-y-4 text-xs text-slate-700">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 block text-sm">
                  Autenticação de Dois Fatores (MFA / 2FA Obrigatório)
                </span>
                <p className="text-slate-500 mt-0.5">
                  Exigir código OTP por aplicativo autenticador para todos os colaboradores do gabinete.
                </p>
              </div>
              <input
                type="checkbox"
                checked={mfaEnforced}
                onChange={(e) => setMfaEnforced(e.target.checked)}
                className="w-4 h-4 rounded text-[#176B80] focus:ring-[#176B80]"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 block text-sm">
                  Expiração de Sessão por Inatividade
                </span>
                <p className="text-slate-500 mt-0.5">
                  Bloquear tela automaticamente após tempo ocioso para proteção de dados em gabinetes compartilhados.
                </p>
              </div>
              <select
                value={sessionTimeoutHours}
                onChange={(e) => setSessionTimeoutHours(Number(e.target.value))}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
              >
                <option value={2}>2 horas</option>
                <option value={4}>4 horas</option>
                <option value={8}>8 horas (Expediente)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
