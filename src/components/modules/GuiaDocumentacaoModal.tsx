import React, { useState } from 'react';
import {
  X,
  FileText,
  Server,
  Shield,
  Layers,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Code2,
} from 'lucide-react';

interface GuiaDocumentacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuiaDocumentacaoModal: React.FC<GuiaDocumentacaoModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'matriz' | 'arquitetura' | 'lgpd' | 'execucao'>('matriz');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#36B7A5] text-[#102C45]">
                Documentação Técnica do Protótipo
              </span>
              <span className="text-xs text-slate-300">
                Parlamenta v1.0
              </span>
            </div>
            <h2 className="text-base font-bold text-white mt-1">
              Matriz de Mock, Arquitetura & Especificações Técnicas
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-md"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 px-6 py-2 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('matriz')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'matriz'
                ? 'bg-white text-[#102C45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-[#176B80]" />
            Matriz: Mock vs. Backend / API
          </button>
          <button
            onClick={() => setActiveTab('arquitetura')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'arquitetura'
                ? 'bg-white text-[#102C45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#176B80]" />
            Mapa de Navegação & Multi-Tenant
          </button>
          <button
            onClick={() => setActiveTab('lgpd')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'lgpd'
                ? 'bg-white text-[#102C45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#176B80]" />
            LGPD & Separação Eleitoral
          </button>
          <button
            onClick={() => setActiveTab('execucao')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'execucao'
                ? 'bg-white text-[#102C45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-[#176B80]" />
            Instruções de Execução
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs text-slate-700">
          {activeTab === 'matriz' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Transparência Operacional:</strong> Este protótipo utiliza dados demonstrativos locais claramente identificados. Nenhuma chave secreta ou API de produção foi simulada como conectada sem a infraestrutura backend real correspondente.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-4">Componente / Módulo</th>
                      <th className="py-2.5 px-4">Estado no Protótipo (Mock)</th>
                      <th className="py-2.5 px-4">Requisito em Produção (Backend / API)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">Central de Atendimento</td>
                      <td className="py-3 px-4 text-slate-600">Simulação de conversas locais com formulário interativo de resposta.</td>
                      <td className="py-3 px-4 text-slate-800">Meta Cloud API (WhatsApp Business Platform), Instagram Graph API, IMAP/SMTP Gateway.</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">Parlamenta Flow & SLA</td>
                      <td className="py-3 px-4 text-slate-600">Cronômetros simulados no cliente, transição de estados e auditoria local.</td>
                      <td className="py-3 px-4 text-slate-800">Motor de workflow BPMN / State Machine (ex: Temporal/BullMQ), Webhooks de notificação e filas Redis.</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">Inteligência Territorial (Eleições)</td>
                      <td className="py-3 px-4 text-slate-600">Dados eleitorais de Mato Grosso (2018/2022) com aviso de dados demonstrativos.</td>
                      <td className="py-3 px-4 text-slate-800">API de Dados Abertos do TSE (DivulgaCandContas / Repositório de Dados Eleitorais).</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">Documentos Oficiais & Devolutivas</td>
                      <td className="py-3 px-4 text-slate-600">Prévia timbrada no navegador, download de PDF simulado, versionamento local.</td>
                      <td className="py-3 px-4 text-slate-800">Serviço de geração headless PDF/ODF, assinatura digital ICP-Brasil e integração com SEI/SIGA ALMT.</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">Autenticação & Multi-Tenant</td>
                      <td className="py-3 px-4 text-slate-600">Comutador de perfis RBAC e seletor de gabinete em memória.</td>
                      <td className="py-3 px-4 text-slate-800">OAuth 2.0 / OIDC, MFA (TOTP/WebAuthn), isolamento por Schema PostgreSQL / Row Level Security (RLS).</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">Redação com IA Assistiva</td>
                      <td className="py-3 px-4 text-slate-600">Ajustes inteligentes de tom institucional e síntese legislativa.</td>
                      <td className="py-3 px-4 text-slate-800">Endpoint seguro com Gemini 2.5 Flash / Pro via server-side proxy route.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'arquitetura' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Arquitetura Multi-Gabinete & Modelo de Dados</h3>
              <p className="leading-relaxed">
                A plataforma foi desenhada sob o conceito de <strong>Multi-Tenant Lógico</strong> com isolamento total de dados entre gabinetes parlamentares. Cada registro (contatos de cidadãos, mensagens, tarefas, documentos e métricas de desempenho) é vinculado obrigatoriamente a um <code>cabinet_id</code>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-1.5">
                  <span className="font-semibold text-slate-900 block text-xs">Piloto Estadual (Mato Grosso)</span>
                  <p className="text-slate-600 text-xs">
                    Gabinete Dep. Mariana Ribeiro (ALMT). 141 municípios integrados à divisão regional (Baixada Cuiabana, Norte, Médio-Norte, Sul, Araguaia, Oeste).
                  </p>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-1.5">
                  <span className="font-semibold text-slate-900 block text-xs">Gabinete Federal (Câmara dos Deputados)</span>
                  <p className="text-slate-600 text-xs">
                    Gabinete Dep. Carlos Silveira (Brasília / Base MT). Estrutura pronta para recepção de emendas federais OGU e proposições legislativas de âmbito nacional.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                <span className="font-semibold text-slate-900 block text-xs">Perfis de Acesso (RBAC):</span>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li><strong>• Parlamentar Titular:</strong> Visão macro, aprovação final de projetos e documentos de alta relevância, agenda executiva.</li>
                  <li><strong>• Chefe de Gabinete:</strong> Homologação de arquivamentos, autorização de encerramento de protocolos, gestão de equipe e relatórios de SLA.</li>
                  <li><strong>• Coordenador de Atendimento:</strong> Fila de triagem, distribuição de protocolos, supervisão de prazos e auditoria de respostas ao cidadão.</li>
                  <li><strong>• Assessor Temático:</strong> Operação da "Minha Fila", execução de tarefas, elaboração de ofícios e visitas técnicas.</li>
                  <li><strong>• Comunicação:</strong> Redação de releases, clipping de imprensa, CMS do portal e moderação de publicações.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'lgpd' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-emerald-900 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Conformidade Estrita com a LGPD (Lei nº 13.709/2018):</strong> O módulo de Inteligência Territorial e a Central de Atendimento cumprem os princípios de finalidade, necessidade e segurança da informação pública.
                </p>
              </div>

              <div className="space-y-3">
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1">
                  <span className="font-semibold text-slate-900 block">1. Separação Absoluta entre Ação Institucional e Atividade Eleitoral</span>
                  <p className="text-slate-600">
                    Os dados eleitorais no módulo Territorial são exclusivamente agregados (votos por zona/município extraídos de fontes públicas oficiais do TSE). Em nenhuma hipótese dados de atendimentos ou dados cadastrais de cidadãos são cruzados com votos ou usados para inferir preferência partidária.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1">
                  <span className="font-semibold text-slate-900 block">2. Mascaramento e Anonimização de Dados Pessoais</span>
                  <p className="text-slate-600">
                    CPFs e documentos de identidade de cidadãos demandantes são mascarados na visualização operacional (ex: <code>***.312.890-**</code>). O acesso aos dados completos exige justificativa e gera registro no log de auditoria.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1">
                  <span className="font-semibold text-slate-900 block">3. Trilha de Auditoria e Não-Repúdio</span>
                  <p className="text-slate-600">
                    Cada atribuição, movimentação, alteração de status, expedição de ofício e devolutiva ao cidadão é imutavelmente carimbada com identificador do usuário, perfil, data/hora e IP de origem.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'execucao' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Instruções de Execução e Stack Tecnológica</h3>
              <p className="leading-relaxed">
                O aplicativo é construído em <strong>React 19 + TypeScript + Tailwind CSS v4</strong> com empacotamento ultrarrápido via Vite 8.
              </p>

              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs space-y-2">
                <p className="text-slate-400"># Instalar dependências</p>
                <p>npm install</p>
                <p className="text-slate-400 pt-2"># Executar em modo desenvolvimento (Porta 3000)</p>
                <p>npm run dev</p>
                <p className="text-slate-400 pt-2"># Compilar para produção</p>
                <p>npm run build</p>
                <p className="text-slate-400 pt-2"># Validação de tipos TypeScript</p>
                <p>npm run lint</p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                <span className="font-semibold text-slate-900 block">Componentes e Bibliotecas Utilizadas:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><strong>lucide-react:</strong> Ícones consistentes e semânticos para órgãos públicos e ações do parlamento.</li>
                  <li><strong>motion:</strong> Transições fluidas para abas, modais e feedback sem layout shifts.</li>
                  <li><strong>Tailwind CSS v4:</strong> Design system com paleta institucional (#102C45, #176B80, #36B7A5, #E9F1F4).</li>
                  <li><strong>SVG Territorial Engine:</strong> Mapas interativos e gráficos customizados de distribuição de demandas e histórico do TSE.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors"
          >
            Fechar Documentação
          </button>
        </div>
      </div>
    </div>
  );
};
