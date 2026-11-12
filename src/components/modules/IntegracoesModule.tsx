import React from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  ShieldAlert,
  Server,
  Share2,
  MessageSquare,
  Mail,
  Camera,
  Database,
} from 'lucide-react';
import { useDialog } from '../common/Dialogs';

export const IntegracoesModule: React.FC = () => {
  const dialog = useDialog();
  const integrations = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Business API',
      category: 'Atendimento Omnichannel',
      status: 'sandbox',
      description: 'Canal oficial para recebimento de demandas da população e envio automático de devolutivas auditadas.',
      specs: 'Meta Cloud API v19.0 · Webhooks HTTPS com HMAC SHA256.',
      icon: MessageSquare,
      statusLabel: 'Modo Sandbox Demonstrativo',
    },
    {
      id: 'instagram',
      name: 'Instagram Graph API (Direct Messages)',
      category: 'Redes Sociais',
      status: 'sandbox',
      description: 'Triagem de mensagens diretas e comentários nas publicações da Deputada.',
      specs: 'Graph API v19.0 · Meta for Developers App.',
      icon: Camera,
      statusLabel: 'Modo Sandbox Demonstrativo',
    },
    {
      id: 'email',
      name: 'E-mail Institucional (IMAP/SMTP)',
      category: 'Correio Eletrônico',
      status: 'sandbox',
      description: 'Gabinete ALMT oficial: recebimento de pedidos de entidades, prefeitos e ofícios de órgãos públicos.',
      specs: 'TLS 1.3 · Porta 587/993 com OAuth2 corporativo.',
      icon: Mail,
      statusLabel: 'Modo Sandbox Demonstrativo',
    },
    {
      id: 'tse',
      name: 'Repositório de Dados Abertos do TSE',
      category: 'Inteligência Territorial',
      status: 'simulado',
      description: 'Dados agregados de votação nominal por zona eleitoral e município em Mato Grosso.',
      specs: 'API REST DivulgaCandContas / Arquivos agregados sem PII.',
      icon: Database,
      statusLabel: 'Base Demonstrativa Carregada',
    },
    {
      id: 'siga',
      name: 'SIGA / SEI Assembleia Legislativa de MT',
      category: 'Processo Eletrônico',
      status: 'planejado',
      description: 'Protocolo eletrônico de ofícios, requerimentos e proposições legislativas oficiais.',
      specs: 'Web Services SOAP/REST da ALMT.',
      icon: Server,
      statusLabel: 'Mapeamento Técnico de Integração',
    },
  ];

  return (
    <div className="space-y-4">

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#176B80]" />
          Conectores de Canais & Serviços Governamentais
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Arquitetura para recepção unificada de mensagens, envio de prestação de contas e importação de dados eleitorais
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-lg bg-[#E9F1F4] text-[#176B80]">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-tight">
                        {item.name}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    {item.statusLabel}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {item.description}
                </p>

                <div className="text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  <strong>Especificação:</strong> {item.specs}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">
                  Autenticação segura via Token / OAuth
                </span>
                <button
                  onClick={() =>
                    dialog.alert({ title: `Credenciais · ${item.name}`, message: `Configurações de credenciais para ${item.name} (Modo Sandbox ativo).` })
                  }
                  className="text-xs text-[#176B80] hover:underline font-semibold"
                >
                  Configurar Sandbox
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
