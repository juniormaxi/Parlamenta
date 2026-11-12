import React, { useState } from 'react';
import {
  FileCode,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Search,
  Filter,
  Eye,
  Copy,
  Download,
  BookOpen,
  Scale,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Layers,
  Edit,
  X,
  Check,
} from 'lucide-react';
import { LegislativeBill } from '../../../types';
import { useDialog } from '../../common/Dialogs';

interface ProjetosLeiModuleProps {
  bills: LegislativeBill[];
  onCreateBill: (bill: LegislativeBill) => void;
  onUpdateBill: (bill: LegislativeBill) => void;
}

export const ProjetosLeiModule: React.FC<ProjetosLeiModuleProps> = ({
  bills,
  onCreateBill,
  onUpdateBill,
}) => {
  const dialog = useDialog();
  const [selectedBill, setSelectedBill] = useState<LegislativeBill | null>(bills[0] || null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [themeFilter, setThemeFilter] = useState('todos');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiVerifying, setIsAiVerifying] = useState(false);

  // AI Creator Form State
  const [aiForm, setAiForm] = useState({
    theme: 'Saúde' as LegislativeBill['theme'],
    type: 'Projeto de Lei Ordinária' as LegislativeBill['type'],
    objective: '',
    targetAudience: 'População usuária do SUS estadual em Mato Grosso',
    budgetConstraint: 'Sem criação de novo órgão; dotação orçamentária existente',
    notes: '',
  });

  // Generated draft in AI Creator
  const [generatedDraft, setGeneratedDraft] = useState<{
    code: string;
    title: string;
    ementa: string;
    fullText: string;
    justificativa: string;
    budgetImpactEstimate: string;
  } | null>(null);

  // Verification target bill
  const [verifyingBill, setVerifyingBill] = useState<LegislativeBill | null>(null);
  const [verificationResult, setVerificationResult] = useState<LegislativeBill['aiAnalysis'] | null>(null);

  // Filter bills
  const filteredBills = bills.filter((b) => {
    const matchSearch =
      b.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
      b.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      b.ementa.toLowerCase().includes(searchFilter.toLowerCase());
    const matchStatus = statusFilter === 'todos' || b.status === statusFilter;
    const matchTheme = themeFilter === 'todos' || b.theme === themeFilter;
    return matchSearch && matchStatus && matchTheme;
  });

  // AI Bill Generation Simulator
  const handleGenerateAiBill = () => {
    if (!aiForm.objective) {
      dialog.alert({ title: 'Campo obrigatório', message: 'Informe o objetivo principal da proposição.', tone: 'warning' });
      return;
    }

    setIsAiGenerating(true);
    setTimeout(() => {
      const year = new Date().getFullYear();
      const randNum = Math.floor(Math.random() * 300 + 150);
      const code = `PL ${randNum}/${year}`;

      let ementa = '';
      let title = '';
      let fullText = '';
      let justificativa = '';
      let budgetImpact = '';

      if (aiForm.theme === 'Saúde') {
        title = `Programa de Acolhimento e Teleconsultas Médicas de Alta Especialidade nas Regiões do Araguaia e Pantanal`;
        ementa = `Institui diretrizes para a ampliação de teleconsultas médicas e regulação emergencial integrada no Sistema Único de Saúde (SUS-MT), assegura pontuação de fixação para especialistas no interior e dá outras providências.`;
        fullText = `Art. 1º Fica instituído o Programa Estadual de Telessaúde e Apoio Clínico Integrado, com a finalidade de universalizar o acesso a consultas de alta complexidade nas regiões do Araguaia, Norte e Pantanal mato-grossense.
Art. 2º São diretrizes fundamentais:
I - Conectividade de alta velocidade garantida em unidades de pronto atendimento municipais conveniadas;
II - Implantação de centrais de laudos a distância para exames de tomografia, ressonância e ultrassonografia;
III - Prioridade para munícipes em tratamento oncológico e cardiopatas graves.
Art. 3º O Poder Executivo estadual poderá celebrar convênios com os consórcios intermunicipais de saúde para cofinanciamento dos equipamentos.
Art. 4º As despesas decorrentes da execução desta Lei correrão por conta do Fundo Estadual de Saúde (FES-MT).
Art. 5º Esta Lei entra em vigor após 60 (sessenta) dias de sua publicação oficial.`;
        justificativa = `As distâncias geográficas de Mato Grosso impõem barreiras desumanas aos pacientes que residem no interior, obrigando viagens de até 900 km até a Capital para consultas com especialistas. A telemedicina integrada com pontuação aos municípios garante equidade no atendimento.`;
        budgetImpact = `R$ 4.200.000,00 anuais via dotação orçamentária própria do FES-MT sem necessidade de aumento de quadro de servidores.`;
      } else if (aiForm.theme === 'Agricultura Familiar') {
        title = `Marco Estadual de Compras Públicas da Agricultura Familiar e Agroindústria Comunitária`;
        ementa = `Fixa cota mínima prioritária de 40% na aquisição de gêneros alimentícios provenientes da agricultura familiar e assentamentos rurais para o abastecimento da merenda escolar e hospitais da rede pública de Mato Grosso.`;
        fullText = `Art. 1º Fica estabelecido o percentual mínimo de 40% (quarenta por cento) dos recursos estaduais destinados à alimentação escolar e hospitalar para aquisição direta da agricultura familiar e empreendimentos familiares rurais.
Art. 2º Terão prioridade de fornecimento cooperativas que comprovem:
I - Produção sustentável com redução de defensivos agrícolas;
II - Participação de jovens e mulheres na gestão associativa.
Art. 3º Fica dispensada a exigência de certificações de difícil acesso quando suprida pelo Selo Agro MT Familiar da SEAF.
Art. 4º Esta Lei entra em vigor na data de sua publicação.`;
        justificativa = `A agricultura familiar é responsável pela maior parte da comida que chega à mesa dos cidadãos. Fixar percentual seguro nas compras governamentais gera emprego e renda nas cidades do interior de Mato Grosso e melhora a qualidade nutricional dos estudantes.`;
        budgetImpact = `Custo orçamentário neutro: substituição de fornecedores no âmbito dos contratos já existentes de merenda da SEDUC e refeições da SES-MT.`;
      } else {
        title = `Programa de Conectividade e Inclusão Digital Escolar em Comunidades Quilombolas e Indígenas de MT`;
        ementa = `Dispõe sobre a garantia de acesso à internet banda larga de alta performance e laboratórios de informática solares em todas as escolas estaduais rurais e de comunidades tradicionais.`;
        fullText = `Art. 1º É assegurada a implantação de infraestrutura digital com internet via satélite de alta velocidade em 100% das unidades escolares estaduais localizadas no meio rural e comunidades tradicionais.
Art. 2º O fornecimento de energia elétrica nas localidades isoladas será prioritariamente garantido por sistema fotovoltaico com baterias de lítio.
Art. 3º Esta Lei entra em vigor 90 (noventa) dias após sua publicação.`;
        justificativa = `Garantir o direito à conectividade é requisito inafastável de justiça pedagógica no século XXI. A ausência de sinal de internet nas comunidades mais distantes acentua desigualdades regionais em Mato Grosso.`;
        budgetImpact = `Recursos do Fundo de Universalização dos Serviços de Telecomunicações (FUST) e dotação suplementar da SEDUC-MT.`;
      }

      setGeneratedDraft({
        code,
        title,
        ementa,
        fullText,
        justificativa,
        budgetImpactEstimate: budgetImpact,
      });
      setIsAiGenerating(false);
    }, 1200);
  };

  const handleSaveDraftAsBill = () => {
    if (!generatedDraft) return;

    const newBill: LegislativeBill = {
      id: `pl-${Date.now()}`,
      code: generatedDraft.code,
      type: aiForm.type,
      title: generatedDraft.title,
      theme: aiForm.theme,
      status: 'redacao',
      author: 'Dep. Mariana Ribeiro (Mandato)',
      coAuthors: [],
      createdAt: new Date().toISOString().split('T')[0],
      ementa: generatedDraft.ementa,
      fullText: generatedDraft.fullText,
      justificativa: generatedDraft.justificativa,
      budgetImpactEstimate: generatedDraft.budgetImpactEstimate,
      aiAnalysis: {
        constitutionalStatus: 'conforme',
        constitutionalScore: 95,
        legislativeTechniqueScore: 94,
        budgetFeasibility: 'Em conformidade com a LRF e Art. 24 da CF/88.',
        strengths: [
          'Competência legislativa concorrente respeitada',
          'Ementa clara e de acordo com a LC 95/1998',
          'Não cria despesa com pessoal nem novos órgãos administrativos',
        ],
        risksAndWarnings: [],
        suggestedAmendments: [
          'Acrescentar cláusula prevendo avaliação anual de resultados pela respectiva Comissão Permanente da ALMT.',
        ],
        analyzedAt: new Date().toLocaleString('pt-BR'),
      },
    };

    onCreateBill(newBill);
    setSelectedBill(newBill);
    setCreateModalOpen(false);
    setGeneratedDraft(null);
  };

  // AI Verification Simulator
  const handleRunAiVerification = (bill: LegislativeBill) => {
    setVerifyingBill(bill);
    setVerifyModalOpen(true);
    setIsAiVerifying(true);
    setVerificationResult(null);

    setTimeout(() => {
      // Generate specialized verification
      const isHealth = bill.theme === 'Saúde';
      const result: LegislativeBill['aiAnalysis'] = {
        constitutionalStatus: 'conforme',
        constitutionalScore: 96,
        legislativeTechniqueScore: 93,
        budgetFeasibility: 'Respeita o Art. 113 do ADCT (estimativa de impacto) e reserva orçamentária existente.',
        strengths: [
          'Iniciativa parlamentar preservada: proposição de natureza geral e programática, sem usurpar competência privativa do Governador (Art. 61, §1º da CF e Art. 39 da CE-MT).',
          'Observância estrita da Lei Complementar Federal nº 95/1998 sobre a técnica de elaboração e redação dos artigos.',
          'Ementa alinhada ao Manual de Redação da Assembleia Legislativa de Mato Grosso.',
        ],
        risksAndWarnings: [
          isHealth
            ? 'Atenção aos prazos de regulamentação: evitar fixar termo perentório de dias para o Poder Executivo regulamentar, preferindo a fórmula autorizativa para afastar arguição de inconstitucionalidade material.'
            : 'Recomenda-se anexar parecer prévio da assessoria jurídica da Bancada antes do protocolo na CCJR.',
        ],
        suggestedAmendments: [
          'Emenda de Redação: Ajustar o Art. 2º, inciso I para substituir termos ambíguos por critérios técnicos mensuráveis.',
          'Emenda Aditiva: Incluir dispositivo garantindo transparência dos relatórios de execução no Portal de Dados Abertos da ALMT.',
        ],
        analyzedAt: new Date().toLocaleString('pt-BR'),
      };

      setVerificationResult(result);
      setIsAiVerifying(false);

      // Save analysis into bill
      const updated: LegislativeBill = {
        ...bill,
        aiAnalysis: result,
      };
      onUpdateBill(updated);
      setSelectedBill(updated);
    }, 1100);
  };

  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#102C45]/5 text-[#102C45]">
              <Scale className="w-5 h-5 text-[#176B80]" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Projetos de Lei do Mandato
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  IA Criação & Verificação
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Redação técnica de projetos, justificativas fáticas, estimativa de impacto orçamentário e blindagem jurídica na CCJR
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#36B7A5]" />
            <span>Criar PL com IA</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por código, ementa ou assunto..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
          >
            <option value="todos">Todos os Status</option>
            <option value="redacao">Em Redação</option>
            <option value="protocolado">Protocolado</option>
            <option value="ccjr">Na CCJR</option>
            <option value="comissao_tematica">Comissão Temática</option>
            <option value="plenario">Em Pauta no Plenário</option>
            <option value="sancionado">Sancionado</option>
          </select>

          <span className="font-semibold text-slate-600 ml-2">Tema:</span>
          <select
            value={themeFilter}
            onChange={(e) => setThemeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
          >
            <option value="todos">Todos os Temas</option>
            <option value="Saúde">Saúde</option>
            <option value="Agricultura Familiar">Agricultura Familiar</option>
            <option value="Educação">Educação</option>
            <option value="Infraestrutura">Infraestrutura</option>
            <option value="Segurança Pública">Segurança Pública</option>
          </select>
        </div>
      </div>

      {/* Main Grid: List of Bills + Detailed Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: List */}
        <div className="lg:col-span-5 space-y-2.5">
          {filteredBills.map((bill) => {
            const isSelected = selectedBill?.id === bill.id;
            return (
              <div
                key={bill.id}
                onClick={() => setSelectedBill(bill)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#176B80] bg-[#176B80]/5 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#102C45] bg-slate-100 px-2 py-0.5 rounded">
                      {bill.code}
                    </span>
                    <span className="text-[11px] font-semibold text-[#176B80]">{bill.type}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      bill.status === 'plenario'
                        ? 'bg-purple-100 text-purple-800'
                        : bill.status === 'ccjr'
                        ? 'bg-amber-100 text-amber-800'
                        : bill.status === 'comissao_tematica'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {bill.status === 'ccjr'
                      ? 'CCJR (Relatoria)'
                      : bill.status === 'plenario'
                      ? 'Ordem do Dia'
                      : bill.status === 'comissao_tematica'
                      ? 'Comissão Temática'
                      : bill.status}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 mb-1.5">
                  {bill.title}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2.5">
                  {bill.ementa}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  <span className="font-medium">{bill.theme} · {bill.createdAt}</span>
                  {bill.aiAnalysis && (
                    <span className="flex items-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      {bill.aiAnalysis.constitutionalScore}% CCJR
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Bill Preview & AI Analysis */}
        <div className="lg:col-span-7">
          {selectedBill ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              {/* Header actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white bg-[#102C45] px-2.5 py-1 rounded">
                      {selectedBill.code}
                    </span>
                    <span className="text-xs font-semibold text-[#176B80]">{selectedBill.type}</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-1">{selectedBill.title}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunAiVerification(selectedBill)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#176B80] hover:bg-[#102C45] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verificar com IA</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${selectedBill.code}\n\nEMENTA: ${selectedBill.ementa}\n\n${selectedBill.fullText}\n\nJUSTIFICATIVA:\n${selectedBill.justificativa}`);
                      dialog.toast('Texto completo copiado para a área de transferência.');
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Copiar texto completo"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* AI Verification Badge Card */}
              {selectedBill.aiAnalysis ? (
                <div className="p-3.5 bg-gradient-to-r from-emerald-50/60 to-slate-50 border border-emerald-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-emerald-100 text-emerald-800">
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                      <span className="font-bold text-emerald-950">
                        Auditoria de Constitucionalidade & Técnica (LC 95/98)
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-900 text-sm">
                      {selectedBill.aiAnalysis.constitutionalScore}/100
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    {selectedBill.aiAnalysis.budgetFeasibility}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="space-y-1">
                      <span className="font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Pontos Fortes na CCJR:
                      </span>
                      <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                        {selectedBill.aiAnalysis.strengths.slice(0, 2).map((st, i) => (
                          <li key={i}>{st}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1">
                      <span className="font-bold text-amber-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Sugestões de Aprimoramento:
                      </span>
                      <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                        {selectedBill.aiAnalysis.suggestedAmendments.slice(0, 2).map((am, i) => (
                          <li key={i}>{am}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs flex items-center justify-between">
                  <span className="text-amber-800">
                    Este projeto ainda não passou pela verificação de constitucionalidade por IA.
                  </span>
                  <button
                    onClick={() => handleRunAiVerification(selectedBill)}
                    className="font-bold text-[#176B80] hover:underline"
                  >
                    Executar agora
                  </button>
                </div>
              )}

              {/* Ementa Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 block">
                  Ementa Oficial
                </span>
                <p className="font-semibold text-slate-800 italic leading-relaxed">
                  "{selectedBill.ementa}"
                </p>
              </div>

              {/* Full Articulated Text */}
              <div className="space-y-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 block">
                  Texto Articulado da Proposição
                </span>
                <div className="p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto border border-slate-800">
                  {selectedBill.fullText}
                </div>
              </div>

              {/* Justificativa */}
              <div className="space-y-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 block">
                  Justificativa Técnica e Social
                </span>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-line">
                  {selectedBill.justificativa}
                </p>
              </div>

              {/* Budget Impact Estimate */}
              {selectedBill.budgetImpactEstimate && (
                <div className="text-xs text-slate-600 pt-2 border-t border-slate-100 flex items-center gap-2">
                  <span className="font-bold text-slate-800">Impacto Orçamentário / Custeio:</span>
                  <span>{selectedBill.budgetImpactEstimate}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
              Selecione um projeto à esquerda para visualizar os artigos e a análise técnica.
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: CRIADOR DE PROJETO DE LEI COM IA                      */}
      {/* ============================================================ */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-[#102C45] text-white">
                  <Sparkles className="w-4 h-4 text-[#36B7A5]" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Criador Inteligente de Projetos de Lei com IA
                  </h3>
                  <p className="text-xs text-slate-500">
                    Defina o objetivo político-social e a IA formulará a ementa, artigos e justificativa técnica
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Tema da Proposição *
                  </label>
                  <select
                    value={aiForm.theme}
                    onChange={(e) => setAiForm({ ...aiForm, theme: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Saúde">Saúde</option>
                    <option value="Agricultura Familiar">Agricultura Familiar & Meio Ambiente</option>
                    <option value="Educação">Educação</option>
                    <option value="Infraestrutura">Infraestrutura</option>
                    <option value="Segurança Pública">Segurança Pública</option>
                    <option value="Tributário & Orçamento">Tributário & Orçamento</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Tipo de Proposição
                  </label>
                  <select
                    value={aiForm.type}
                    onChange={(e) => setAiForm({ ...aiForm, type: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Projeto de Lei Ordinária">Projeto de Lei Ordinária (PL)</option>
                    <option value="Projeto de Lei Complementar">Projeto de Lei Complementar (PLC)</option>
                    <option value="PEC">Proposta de Emenda Constitucional (PEC)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">
                    Objetivo Principal / Problema que a Lei deve resolver *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={aiForm.objective}
                    onChange={(e) => setAiForm({ ...aiForm, objective: e.target.value })}
                    placeholder="Ex: Garantir teleconsultas especializadas em municípios do interior de MT para reduzir filas de espera e evitar deslocamentos desnecessários de pacientes."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Público-Alvo Beneficiado
                  </label>
                  <input
                    value={aiForm.targetAudience}
                    onChange={(e) => setAiForm({ ...aiForm, targetAudience: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Diretriz de Custeio / Restrição de Competência
                  </label>
                  <input
                    value={aiForm.budgetConstraint}
                    onChange={(e) => setAiForm({ ...aiForm, budgetConstraint: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              {/* Generate button */}
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleGenerateAiBill}
                  disabled={isAiGenerating}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#102C45] hover:bg-[#176B80] rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isAiGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#36B7A5]" />
                      <span>Elaborando Artigos e Justificativa com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#36B7A5]" />
                      <span>Gerar Minuta Completa do Projeto</span>
                    </>
                  )}
                </button>
              </div>

              {/* Generated Result Preview */}
              {generatedDraft && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-mono text-xs font-bold text-[#102C45] bg-white px-2 py-0.5 rounded border border-slate-200">
                      {generatedDraft.code}
                    </span>
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Minuta Gerada com Sucesso
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm">{generatedDraft.title}</h4>

                  <div className="p-2.5 bg-white rounded border border-slate-200 text-xs italic text-slate-700">
                    "{generatedDraft.ementa}"
                  </div>

                  <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs max-h-48 overflow-y-auto whitespace-pre-line leading-relaxed">
                    {generatedDraft.fullText}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setGeneratedDraft(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDraftAsBill}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar no Acervo do Mandato</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: AUDITORIA E VERIFICAÇÃO COM IA                        */}
      {/* ============================================================ */}
      {verifyModalOpen && verifyingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <ShieldCheck className="w-5 h-5 text-emerald-700" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Auditoria Legislativa por IA — {verifyingBill.code}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Análise de competência constitucional (CF/88 e CE-MT) e redação regimental
                  </p>
                </div>
              </div>
              <button onClick={() => setVerifyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isAiVerifying ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-[#176B80]" />
                <p className="text-xs font-medium text-slate-600">
                  Confrontando artigos com a jurisprudência do STF, Lei Complementar 95/98 e Art. 39 da CE-MT...
                </p>
              </div>
            ) : verificationResult ? (
              <div className="space-y-4 text-xs">
                {/* Scorecards */}
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                      Constitucionalidade Material & Formal
                    </span>
                    <span className="text-2xl font-bold font-mono text-emerald-950">
                      {verificationResult.constitutionalScore}%
                    </span>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-blue-800 block">
                      Técnica Legislativa (LC 95/98)
                    </span>
                    <span className="text-2xl font-bold font-mono text-blue-950">
                      {verificationResult.legislativeTechniqueScore}%
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="font-bold text-slate-800 block mb-1">
                    Parecer de Admissibilidade Prévia:
                  </span>
                  <p className="text-slate-600 leading-relaxed">
                    {verificationResult.budgetFeasibility}
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-emerald-900 block">
                    Pontos Fortes Identificados:
                  </span>
                  <ul className="space-y-1">
                    {verificationResult.strengths.map((s, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {verificationResult.risksAndWarnings.length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-amber-900 block">Alertas na CCJR:</span>
                    <ul className="space-y-1">
                      {verificationResult.risksAndWarnings.map((w, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setVerifyModalOpen(false)}
                    className="px-4 py-2 font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg shadow-xs"
                  >
                    Fechar e Aplicar no Projeto
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
