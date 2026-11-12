import React from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  TrendingUp,
  MapPin,
  Printer,
  FileText,
} from 'lucide-react';
import { KpiCard } from '../common/KpiCard';
import { useDialog } from '../common/Dialogs';

export const RelatoriosModule: React.FC = () => {
  const dialog = useDialog();
  const reports = [
    {
      id: 'rep-1',
      title: 'Relatório Executivo de Atendimento Parlamentar (Novembro/2026)',
      type: 'Prestação de Contas Mensal',
      pages: '14 páginas',
      status: 'Pronto para Download',
      format: 'PDF',
    },
    {
      id: 'rep-2',
      title: 'Dossiê Geoespacial de Demandas por Município de Mato Grosso',
      type: 'Inteligência Territorial',
      pages: 'Planilha Completa',
      status: 'Atualizado Hoje',
      format: 'CSV / Excel',
    },
    {
      id: 'rep-3',
      title: 'Auditoria de Cumprimento de SLA e Devolutivas aos Cidadãos',
      type: 'Governança & LGPD',
      pages: '8 páginas',
      status: 'Homologado',
      format: 'PDF Auditado',
    },
    {
      id: 'rep-4',
      title: 'Extrato de Execução Orçamentária e Emendas Impositivas 2026',
      type: 'Transparência Pública',
      pages: '22 páginas',
      status: 'Consolidado',
      format: 'PDF / SIGA',
    },
  ];

  return (
    <div className="space-y-4">

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#176B80]" />
            Relatórios Executivos & Transparência
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Consolidação de atendimentos, resolução de demandas por cidade e dados de conformidade
          </p>
        </div>

        <button
          onClick={() => dialog.toast('Download do Dossiê Completo de Produtividade do Gabinete iniciado.', 'info')}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Download className="w-3.5 h-3.5 text-[#36B7A5]" />
          <span>Exportar Dossiê Consolidado</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total de Cidadãos Atendidos"
          value="1.420"
          subtext="No mandato vigente"
          variant="success"
        />
        <KpiCard
          label="Índice de Resolutividade"
          value="94,2%"
          subtext="Demandas com encaminhamento formal"
          variant="success"
        />
        <KpiCard
          label="Ofícios e Requerimentos Emitidos"
          value="318"
          subtext="Enviados aos órgãos públicos"
        />
        <KpiCard
          label="Emendas Alocadas em MT"
          value="R$ 14,8 M"
          subtext="Saúde, estradas e educação"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
            Relatórios Disponíveis para Exportação
          </h3>
          <span className="text-xs text-slate-400 font-mono">Exportações auditadas</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {reports.map((r) => (
            <div
              key={r.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#176B80]">{r.type}</span>
                  <span className="text-slate-400 font-mono">· Formato {r.format}</span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">{r.title}</h4>
                <div className="text-slate-500 font-mono text-[11px]">
                  {r.pages} · {r.status}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => dialog.toast(`Iniciando download do relatório: ${r.title}`, 'info')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#102C45] bg-[#E9F1F4] hover:bg-[#d6e5eb] rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[#176B80]" />
                  <span>Baixar Arquivo</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
