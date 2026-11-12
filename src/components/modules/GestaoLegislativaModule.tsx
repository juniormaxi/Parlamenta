import React, { useState } from 'react';
import {
  Gavel,
  FileText,
  Clock,
  CheckCircle2,
  Users,
  Building,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { useDialog } from '../common/Dialogs';

export const GestaoLegislativaModule: React.FC = () => {
  const dialog = useDialog();
  const [propositions] = useState([
    {
      id: 'pl-1',
      code: 'PL 312/2026',
      title: 'Programa Estadual Água no Campo para Pequenos Produtores',
      type: 'Projeto de Lei',
      stage: 'CCJR — Aguardando Parecer do Relator',
      author: 'Dep. Mariana Ribeiro',
      date: '24/10/2026',
      status: 'tramitando',
    },
    {
      id: 'pl-2',
      code: 'PEC 08/2026',
      title: 'Emenda Constitucional de Climatização Obrigatória das Escolas Estaduais',
      type: 'Proposta de Emenda Constitucional',
      stage: 'Comissão de Educação — Parecer Favorável Aprovado',
      author: 'Dep. Mariana Ribeiro e Bancada da Educação',
      date: '15/09/2026',
      status: 'aprovado_comissao',
    },
    {
      id: 'pl-3',
      code: 'REQ 142/2026',
      title: 'Requerimento de Urgência para Regulação de Leitos UTI Infantil no Sul de MT',
      type: 'Requerimento de Mesa',
      stage: 'Mesa Diretora — Aprovado e Encaminhado à SES-MT',
      author: 'Dep. Mariana Ribeiro',
      date: '10/11/2026',
      status: 'deferido',
    },
  ]);

  return (
    <div className="space-y-4">

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Gavel className="w-5 h-5 text-[#176B80]" />
            Atividade Legislativa & Tramitação Regimental
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoramento de proposições de autoria do mandato, comissões técnicas e prazos de emendas
          </p>
        </div>

        <button
          onClick={() => dialog.alert({ title: 'Nova proposição', message: 'Formulário de cadastro de nova proposição regimental.' })}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Proposição</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
            Proposições em Tramitação no Plenário e Comissões
          </h3>
          <span className="text-xs text-slate-400 font-mono">3 ativas</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {propositions.map((item) => (
            <div
              key={item.id}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#102C45] bg-slate-100 px-2 py-0.5 rounded">
                    {item.code}
                  </span>
                  <span className="text-[#176B80] font-semibold">{item.type}</span>
                  <span className="text-slate-400 font-mono">· {item.date}</span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                <div className="flex items-center gap-2 text-slate-600 font-medium pt-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Fase Atual: <strong className="text-slate-800">{item.stage}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => dialog.alert({ title: 'Consulta de tramitação', message: `Consulta à tramitação do ${item.code} no portal da ALMT.` })}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <span>Ver Tramitação</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
