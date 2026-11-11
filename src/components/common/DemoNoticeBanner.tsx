import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

interface DemoNoticeBannerProps {
  moduleName?: string;
  contextText?: string;
  onOpenDocs?: () => void;
}

export const DemoNoticeBanner: React.FC<DemoNoticeBannerProps> = ({
  moduleName,
  contextText = 'Ambiente de protótipo navegável com dados demonstrativos sinalizados. Nenhuma integração com redes ou APIs externas está conectada em produção.',
  onOpenDocs,
}) => {
  return (
    <div className="bg-[#102C45]/5 border border-[#176B80]/20 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs text-[#102C45] mb-5">
      <div className="flex items-center gap-2.5">
        <span className="p-1 rounded bg-[#176B80]/10 text-[#176B80] shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#102C45] uppercase tracking-wider text-[10px]">
            {moduleName ? `Protótipo Demonstrativo · ${moduleName}` : 'Protótipo Demonstrativo'}
          </span>
          <span className="text-slate-400 hidden sm:inline" aria-hidden="true">|</span>
          <span className="text-slate-600 font-normal">{contextText}</span>
        </div>
      </div>
      {onOpenDocs && (
        <button
          onClick={onOpenDocs}
          className="text-[11px] font-medium text-[#176B80] hover:text-[#102C45] underline underline-offset-2 shrink-0 ml-3 transition-colors"
        >
          Ver Matriz Técnica & Mock
        </button>
      )}
    </div>
  );
};
