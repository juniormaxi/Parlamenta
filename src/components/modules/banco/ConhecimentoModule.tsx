import React, { useCallback, useEffect, useState } from 'react';
import { Library, Search, Loader2, Tag, FileText, Send, Building, Calendar, ExternalLink, RefreshCw } from 'lucide-react';
import { knowledge, type KnowledgeItem } from '../../../lib/oficios';
import { useDialog } from '../../common/Dialogs';
import { ModuleHeader, Modal, inputCls, btnGhost, btnPrimary } from './ui';

const SOURCE: Record<string, { label: string; icon: React.ElementType }> = {
  oficio: { label: 'Ofício', icon: Send },
};
const fmtDate = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/** Banco de Dados › Base de Conhecimento: acervo de documentos do gabinete, com etiquetas. */
export const ConhecimentoModule: React.FC<{ onOpenSource?: (source: string, sourceId: string) => void }> = ({ onOpenSource }) => {
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [data, setData] = useState<{ items: KnowledgeItem[]; tags: { tag: string; count: number }[] } | null>(null);
  const [open, setOpen] = useState<KnowledgeItem | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await knowledge.list({ q: q.trim(), tag }));
    } catch (e) {
      dialog.alert({ title: 'Erro ao carregar a Base de Conhecimento', message: (e as Error).message, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [q, tag, dialog]);
  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const openItem = async (it: KnowledgeItem) => {
    try {
      setOpen(await knowledge.get(it.id));
    } catch (e) {
      dialog.alert({ title: 'Erro ao abrir', message: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Library}
        title="Base de Conhecimento"
        subtitle="Acervo dos documentos produzidos pelo gabinete, organizados por etiquetas. Todo ofício salvo chega aqui com a etiqueta “Ofícios”."
      />

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-3 border-b border-slate-100 space-y-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${inputCls} pl-8`} placeholder="Buscar no título, resumo ou texto…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className={btnGhost} onClick={load} title="Atualizar">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <button
              onClick={() => setTag('')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${!tag ? 'bg-[#102C45] text-white border-[#102C45]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              Todas
            </button>
            {data?.tags.map((t) => (
              <button
                key={t.tag}
                onClick={() => setTag(tag === t.tag ? '' : t.tag)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  tag === t.tag ? 'bg-[#102C45] text-white border-[#102C45]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                #{t.tag} <span className="opacity-70 font-mono">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {!data ? (
          <div className="p-10 text-center">
            <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-1">
            <Library className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">{q || tag ? 'Nada encontrado com esses filtros.' : 'A Base de Conhecimento está vazia.'}</p>
            {!q && !tag && <p>Os ofícios salvos em Legislativo › Ofícios aparecem aqui automaticamente.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((it) => {
              const src = SOURCE[it.source] ?? { label: it.source, icon: FileText };
              return (
                <li key={it.id}>
                  <button onClick={() => openItem(it)} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3">
                    <span className="p-2 rounded-lg bg-[#E9F1F4] text-[#176B80] h-fit">
                      <src.icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{it.title}</span>
                      {it.summary && <span className="block text-[11px] text-slate-500 truncate">{it.summary}</span>}
                      <span className="flex flex-wrap items-center gap-1.5 mt-1">
                        {it.tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-[#102C45]/5 text-[#102C45] text-[10px] font-semibold">
                            #{t}
                          </span>
                        ))}
                        {it.meta?.statusLabel && <span className="text-[10px] text-slate-500">· {it.meta.statusLabel}</span>}
                        <span className="text-[10px] text-slate-400">
                          · {src.label} de {fmtDate(it.meta?.date || it.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.items.length > 0 && (
          <p className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-100">
            {data.items.length} documento(s){tag ? ` com #${tag}` : ''}.
          </p>
        )}
      </div>

      {open && (
        <Modal
          wide
          title={open.title}
          onClose={() => setOpen(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setOpen(null)}>
                Fechar
              </button>
              {onOpenSource && open.source === 'oficio' && (
                <button className={btnPrimary} onClick={() => onOpenSource(open.source, open.sourceId)}>
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir em Ofícios
                </button>
              )}
            </>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
              {open.meta?.recipientOrg && (
                <span className="flex items-center gap-1">
                  <Building className="w-3.5 h-3.5" /> {[open.meta.recipientName, open.meta.recipientRole, open.meta.recipientOrg].filter(Boolean).join(' · ')}
                </span>
              )}
              {open.meta?.date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {fmtDate(open.meta.date)}
                </span>
              )}
              {open.meta?.statusLabel && <span>Situação: {open.meta.statusLabel}</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {open.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-[#102C45]/5 text-[#102C45] text-[10px] font-semibold">
                  #{t}
                </span>
              ))}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-serif text-[13px] leading-relaxed whitespace-pre-line text-slate-800 max-h-[55vh] overflow-y-auto">
              {open.content}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
