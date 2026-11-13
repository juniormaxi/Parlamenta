import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  MessageSquare,
  Workflow,
  Calendar,
  Send,
  FileCheck,
  Building,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { Protocol } from '../../types';

interface FluxoGuiadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocol: Protocol;
  onUpdateProtocol: (updated: Protocol) => void;
  onNavigateToModule: (moduleName: any) => void;
}

interface StepInfo {
  step: number;
  title: string;
  role: string;
  module: string;
  description: string;
  actionLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const FluxoGuiadoModal: React.FC<FluxoGuiadoModalProps> = ({
  isOpen,
  onClose,
  protocol,
  onUpdateProtocol,
  onNavigateToModule,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [executionDone, setExecutionDone] = useState(false);

  if (!isOpen) return null;

  const steps: StepInfo[] = [
    {
      step: 1,
      title: 'Entrada da Demanda pelo Cidadão',
      role: 'Cidadão (Maria Eunice Barbosa · Rondonópolis)',
      module: 'Central de Atendimento (Omnichannel)',
      description:
        'A cidadã envia mensagem pelo WhatsApp oficial relatando a necessidade urgente de regulação e ampliação de leitos de UTI Pediátrica no Hospital Regional de Rondonópolis.',
      actionLabel: 'Ver Conversa & Iniciar Triagem',
      icon: MessageSquare,
    },
    {
      step: 2,
      title: 'Triagem e Criação do Protocolo',
      role: 'Coordenadora de Atendimento (Letícia Prado)',
      module: 'Central de Atendimento -> Protocolos',
      description:
        'A equipe recebe a mensagem, analisa o resumo e assunto sugeridos e confirma a criação com número oficial (PRT-2026-0042) com tema Saúde e Prioridade Alta.',
      actionLabel: 'Confirmar e Encaminhar para o Flow',
      icon: FileCheck,
    },
    {
      step: 3,
      title: 'Atribuição ao Assessor Temático com Prazo SLA',
      role: 'Coordenadora de Atendimento',
      module: 'Parlamentta Flow (Fila de Triagem)',
      description:
        'A coordenadora avalia a carga da equipe e atribui a demanda ao assessor temático de saúde Lucas Mendes, estipulando prazo regulamentar de 48 horas úteis.',
      actionLabel: 'Atribuir a Lucas Mendes',
      icon: Workflow,
    },
    {
      step: 4,
      title: 'Notificação e Assunção na "Minha Fila"',
      role: 'Assessor Temático (Lucas Mendes)',
      module: 'Parlamentta Flow -> Minha Fila',
      description:
        'Lucas Mendes recebe o alerta no sistema, assume o protocolo. O cronômetro passa a registrar o tempo em posse do responsável.',
      actionLabel: 'Assumir e Planejar Ações',
      icon: Workflow,
    },
    {
      step: 5,
      title: 'Criação de Tarefa & Agendamento de Visita',
      role: 'Assessor Parlamentar & Deputada',
      module: 'Agenda & Minhas Tarefas',
      description:
        'Lucas cria uma tarefa de redação de ofício emergencial e agenda audiência técnica com o Secretário de Saúde (SES-MT) na pauta oficial da Deputada.',
      actionLabel: 'Registrar Execução das Ações',
      icon: Calendar,
    },
    {
      step: 6,
      title: 'Registro de Execução & Anexo de Expediente',
      role: 'Assessor Parlamentar',
      module: 'Documentos & Protocolos',
      description:
        'Lucas anexa o Ofício nº 142/2026 protocolado na SES-MT e registra no histórico que a secretaria ativou 4 novos leitos de retaguarda.',
      actionLabel: 'Submeter para Revisão do Coordenador',
      icon: Building,
    },
    {
      step: 7,
      title: 'Revisão, Encerramento e Devolutiva Auditável',
      role: 'Chefe de Gabinete / Coordenadora',
      module: 'Parlamentta Flow -> Fechamento Auditado',
      description:
        'O coordenador confere o cumprimento do pedido, autoriza o encerramento do protocolo e o sistema envia a devolutiva formal ao WhatsApp da cidadã com log de auditoria LGPD.',
      actionLabel: 'Homologar & Enviar Devolutiva ao Cidadão',
      icon: Send,
    },
  ];

  const currentStepData = steps[currentStep - 1];

  const handleAdvance = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      onUpdateProtocol({
        ...protocol,
        status: 'em_analise',
      });
      setCurrentStep(3);
    } else if (currentStep === 3) {
      onUpdateProtocol({
        ...protocol,
        status: 'em_execucao',
        assigneeName: 'Lucas Mendes',
        assigneeId: 'usr-4',
      });
      setCurrentStep(4);
    } else if (currentStep === 4) {
      setCurrentStep(5);
    } else if (currentStep === 5) {
      setCurrentStep(6);
    } else if (currentStep === 6) {
      onUpdateProtocol({
        ...protocol,
        status: 'revisao_coordenador',
      });
      setCurrentStep(7);
    } else if (currentStep === 7) {
      onUpdateProtocol({
        ...protocol,
        status: 'resolvido',
        citizenFeedbackStatus: 'enviada_sucesso',
        citizenFeedbackText:
          'Prezada Dona Maria Eunice, informamos que o Gabinete da Dep. Mariana Ribeiro obteve resposta positiva da SES-MT via Ofício nº 142/2026: foram abertos 4 novos leitos pediátricos no Hospital Regional de Rondonópolis.',
      });
      setExecutionDone(true);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setExecutionDone(false);
  };

  const IconComponent = currentStepData.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#36B7A5] text-[#102C45]">
                Fluxo Demonstrativo Obrigatório
              </span>
              <span className="text-xs text-slate-300">
                Passo {currentStep} de {steps.length}
              </span>
            </div>
            <h2 className="text-base font-bold text-white mt-1">
              Jornada Ponta a Ponta do Atendimento Parlamentar
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

        {/* Step Progress Bar */}
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-1">
            {steps.map((s) => (
              <div
                key={s.step}
                className="flex-1 flex flex-col items-center cursor-pointer group"
                onClick={() => setCurrentStep(s.step)}
              >
                <div
                  className={`w-full h-1.5 rounded-full transition-all ${
                    s.step < currentStep || executionDone
                      ? 'bg-[#36B7A5]'
                      : s.step === currentStep
                      ? 'bg-[#102C45]'
                      : 'bg-slate-300'
                  }`}
                />
                <span
                  className={`text-[9px] mt-1 font-mono hidden sm:inline ${
                    s.step === currentStep
                      ? 'font-bold text-[#102C45]'
                      : 'text-slate-400'
                  }`}
                >
                  0{s.step}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {!executionDone ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-[#E9F1F4] text-[#102C45] shrink-0">
                  <IconComponent className="w-6 h-6 text-[#176B80]" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-[#176B80] uppercase tracking-wider block">
                    Etapa {currentStepData.step} · {currentStepData.module}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {currentStepData.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Responsável simulado:</span>
                    <span>{currentStepData.role}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
                {currentStepData.description}
              </div>

              {/* Case Study Card */}
              <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">Protocolo Vinculado</span>
                  <span className="font-mono text-[#102C45] font-semibold">{protocol.number}</span>
                </div>
                <p className="text-xs text-slate-600">
                  <strong>Assunto:</strong> {protocol.subject}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <span>Município: <strong className="text-slate-700">{protocol.citizenCity}</strong></span>
                  <span>·</span>
                  <span>Canal: <strong className="text-slate-700 capitalize">{protocol.channel}</strong></span>
                  <span>·</span>
                  <span>Prioridade: <strong className="text-rose-600 capitalize">{protocol.priority}</strong></span>
                  <span>·</span>
                  <span>Status atual: <strong className="text-[#176B80] uppercase font-mono">{protocol.status}</strong></span>
                </div>
              </div>

              {/* Governance note */}
              <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-[#E9F1F4]/70 p-3 rounded-lg">
                <ShieldAlert className="w-4 h-4 text-[#176B80] shrink-0 mt-0.5" />
                <span>
                  <strong>Garantia de Não-Falsificação:</strong> O encerramento somente é permitido com comprovação de documento formal e envio de devolutiva real ao cidadão. Cada etapa é registrada na timeline auditável com carimbo de data, hora e IP.
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Fluxo Demonstrativo Concluído com Sucesso!
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto mt-1 leading-relaxed">
                  Todos os 7 passos da exigência foram simulados: entrada pelo cidadão, triagem, atribuição com prazo SLA, execução com tarefa e ofício, revisão da coordenação e devolutiva formal entregue ao cidadão com auditoria.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-lg mx-auto text-left text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-800 font-semibold border-b border-slate-200 pb-1.5">
                  <span>Extrato de Devolutiva ao Cidadão</span>
                  <span className="font-mono text-emerald-700">Entregue via WhatsApp</span>
                </div>
                <p className="text-slate-600 italic">
                  "{protocol.citizenFeedbackText}"
                </p>
                <div className="text-[11px] text-slate-400 pt-1">
                  ID de Auditoria: <code>AUD-2026-99214 · Rastreabilidade LGPD Ativa</code>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentStep > 1 && !executionDone && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Anterior
              </button>
            )}
            {executionDone && (
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reiniciar Fluxo
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!executionDone ? (
              <button
                onClick={handleAdvance}
                className="px-4 py-2 text-xs font-semibold text-[#102C45] bg-[#36B7A5] hover:bg-[#2fa393] rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>{currentStepData.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  onNavigateToModule('protocolos');
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Visualizar Protocolo Concluído
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
