import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Search, Download, Printer, X, Maximize2, Pencil, FilterX } from 'lucide-react';
import { DocumentModel, Cabinet } from '../../types';
import { useDialog } from '../common/Dialogs';
import { api } from '../../lib/api';
import type { PropositionType } from './banco/ui';

interface DocumentosModuleProps {
  documents: DocumentModel[];
  activeCabinet: Cabinet;
  customLogoUrl?: string;
  onOpenLogoModal: () => void;
  onCreateDocument: (newDoc: Omit<DocumentModel, 'id'>) => void;
  onUpdateDocument: (doc: DocumentModel) => void;
  /** Opens Banco de Dados › Categorias › Tipos de Proposição. */
  onManageTypes: () => void;
}

type Status = DocumentModel['status'];
const STATUS: Record<Status, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-slate-100 text-slate-600' },
  revisao: { label: 'Em revisão', cls: 'bg-amber-50 text-amber-700' },
  assinado: { label: 'Assinado', cls: 'bg-emerald-50 text-emerald-700' },
  protocolado: { label: 'Protocolado', cls: 'bg-[#E9F1F4] text-[#176B80]' },
};
const isSigned = (s: Status) => s === 'assinado' || s === 'protocolado';
const nextVersion = (v: string) => {
  const [maj, min] = v.split('.').map((n) => parseInt(n, 10) || 0);
  return `${maj ?? 1}.${(min ?? 0) + 1}`;
};
const fmtDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);

const selectCls =
  'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#176B80] focus:border-[#176B80]';

export const DocumentosModule: React.FC<DocumentosModuleProps> = ({
  documents,
  activeCabinet,
  customLogoUrl,
  onOpenLogoModal,
  onCreateDocument,
  onUpdateDocument,
  onManageTypes,
}) => {
  const dialog = useDialog();
  const [selectedId, setSelectedId] = useState<string | undefined>(documents[0]?.id);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'' | Status>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Proposition types come from Banco de Dados › Categorias › Tipos de Proposição.
  const [types, setTypes] = useState<PropositionType[]>([]);
  useEffect(() => {
    api<{ propositionTypes: PropositionType[] }>('/tenant/db/taxonomy')
      .then((t) => setTypes(t.propositionTypes))
      .catch(() => undefined);
  }, []);

  // Select a newly created document (App prepends it to the list).
  const prevCount = useRef(documents.length);
  useEffect(() => {
    if (documents.length > prevCount.current) setSelectedId(documents[0]?.id);
    prevCount.current = documents.length;
  }, [documents]);


  // Filter options: registered types + any type still used by older documents, with counts.
  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((d) => counts.set(d.category, (counts.get(d.category) ?? 0) + 1));
    const names = [...new Set([...types.map((t) => t.name), ...counts.keys()])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return names.map((n) => ({ name: n, count: counts.get(n) ?? 0 }));
  }, [documents, types]);

  const q = searchFilter.trim().toLowerCase();
  const filteredDocs = documents.filter(
    (d) =>
      (!typeFilter || d.category === typeFilter) &&
      (!statusFilter || d.status === statusFilter) &&
      (!q || d.title.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || d.recipient.toLowerCase().includes(q))
  );
  const hasFilters = !!(typeFilter || statusFilter || q);
  // The preview always shows a document from the filtered list.
  const selectedDoc = filteredDocs.find((d) => d.id === selectedId) ?? filteredDocs[0];

  const openEdit = async () => {
    if (!selectedDoc) return;
    if (isSigned(selectedDoc.status)) {
      const ok = await dialog.confirm({
        title: 'Editar documento assinado',
        message: (
          <>
            <strong>{selectedDoc.code}</strong> já está {STATUS[selectedDoc.status].label.toLowerCase()}. Ao salvar alterações, ele volta para{' '}
            <strong>Em revisão</strong>, perde a assinatura e ganha uma nova versão.
          </>
        ),
        confirmLabel: 'Editar mesmo assim',
        tone: 'warning',
      });
      if (!ok) return;
    }
    setFormMode('edit');
  };

  const handleSubmit = (data: DocFormData) => {
    const type = types.find((t) => t.name === data.category);
    if (formMode === 'create') {
      if (!type) {
        dialog.alert({ title: 'Selecione o tipo', message: 'Escolha o tipo de proposição do documento.', tone: 'warning' });
        return;
      }
      onCreateDocument({
        code: `${type.acronym}-${Math.floor(100 + Math.random() * 900)}/${new Date().getFullYear()}-GAB`,
        title: data.title,
        category: data.category,
        recipient: data.recipient,
        author: 'Dep. Mariana Ribeiro / Assessoria',
        createdAt: new Date().toISOString().split('T')[0]!,
        version: '1.0',
        status: 'rascunho',
        contentPreview: data.contentPreview,
      });
      dialog.toast('Minuta criada.');
    } else if (selectedDoc) {
      const changed =
        data.title !== selectedDoc.title ||
        data.category !== selectedDoc.category ||
        data.recipient !== selectedDoc.recipient ||
        data.contentPreview !== selectedDoc.contentPreview;
      // Content edits invalidate a signature; a status change alone does not bump the version.
      const status: Status = changed && isSigned(selectedDoc.status) ? 'revisao' : data.status;
      onUpdateDocument({
        ...selectedDoc,
        ...data,
        status,
        version: changed ? nextVersion(selectedDoc.version) : selectedDoc.version,
      });
      dialog.toast(changed ? `Documento salvo · versão ${nextVersion(selectedDoc.version)}.` : 'Documento atualizado.');
    }
    setFormMode(null);
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#176B80]" />
            Biblioteca de Documentos & Modelos Timbrados
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Expedição formal perante o Poder Executivo, secretarias de estado e órgãos de controle</p>
        </div>

        <button
          onClick={() => setFormMode('create')}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Redigir Novo Documento</span>
        </button>
      </div>

      {/* Main Grid: Document List & Document Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left list */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por código, título ou destinatário…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className={`${selectCls} pl-8`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tipo de documento</span>
                <select className={selectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">Todos ({documents.length})</option>
                  {typeOptions.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Situação</span>
                <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | Status)}>
                  <option value="">Todas</option>
                  {(Object.keys(STATUS) as Status[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s].label} ({documents.filter((d) => d.status === s).length})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {filteredDocs.length} documento{filteredDocs.length === 1 ? '' : 's'}
              </span>
              {hasFilters && (
                <button
                  onClick={() => {
                    setTypeFilter('');
                    setStatusFilter('');
                    setSearchFilter('');
                  }}
                  className="flex items-center gap-1 text-[#176B80] hover:underline font-semibold"
                >
                  <FilterX className="w-3 h-3" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
            {filteredDocs.length === 0 && <p className="p-6 text-center text-xs text-slate-500">Nenhum documento com esses filtros.</p>}
            {filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  className={`w-full text-left p-3.5 transition-colors border-l-4 ${
                    isSelected ? 'bg-[#E9F1F4]/70 border-l-[#176B80]' : 'border-l-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-[#102C45]">{doc.code}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS[doc.status].cls}`}>{STATUS[doc.status].label}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-xs mt-1 line-clamp-2">{doc.title}</h4>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mt-1.5">
                    <span className="truncate">
                      <span className="font-semibold text-slate-600">{doc.category}</span> · {doc.recipient}
                    </span>
                    <span className="font-mono shrink-0">v{doc.version}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        {selectedDoc && (
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#102C45] bg-slate-100 px-2 py-0.5 rounded">{selectedDoc.code}</span>
                  <span className="text-xs text-slate-500">Versão {selectedDoc.version}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS[selectedDoc.status].cls}`}>{STATUS[selectedDoc.status].label}</span>
                </div>
                <DocActions
                  onEdit={openEdit}
                  onFullscreen={() => setFullscreen(true)}
                  onPrint={() => window.print()}
                  onExport={() => dialog.toast(`Download simulado do arquivo ${selectedDoc.code}.pdf`, 'info')}
                />
              </div>

              <DocumentSheet doc={selectedDoc} cabinet={activeCabinet} logoUrl={customLogoUrl} />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Precisa trocar o brasão ou logo timbrado?</span>
              <button onClick={onOpenLogoModal} className="text-[#176B80] hover:underline font-medium">
                Personalizar Logotipo do Gabinete
              </button>
            </div>
          </div>
        )}
      </div>

      {fullscreen && selectedDoc && (
        <FullscreenViewer
          doc={selectedDoc}
          cabinet={activeCabinet}
          logoUrl={customLogoUrl}
          suspendEsc={formMode !== null}
          onClose={() => setFullscreen(false)}
          onEdit={openEdit}
          onExport={() => dialog.toast(`Download simulado do arquivo ${selectedDoc.code}.pdf`, 'info')}
        />
      )}

      {formMode && (
        <DocumentFormModal
          mode={formMode}
          initial={formMode === 'edit' && selectedDoc ? selectedDoc : null}
          types={types}
          onManageTypes={() => {
            setFormMode(null);
            setFullscreen(false);
            onManageTypes();
          }}
          onClose={() => setFormMode(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
function DocActions({
  onEdit,
  onFullscreen,
  onPrint,
  onExport,
  dark = false,
}: {
  onEdit: () => void;
  onFullscreen?: () => void;
  onPrint: () => void;
  onExport: () => void;
  dark?: boolean;
}) {
  const ghost = dark
    ? 'p-1.5 text-white/80 hover:text-white border border-white/20 rounded-lg hover:bg-white/10 transition-colors'
    : 'p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors';
  return (
    <div className="flex items-center gap-2">
      <button onClick={onEdit} className={`${ghost} flex items-center gap-1.5 px-2.5 text-xs font-semibold`} title="Editar documento">
        <Pencil className="w-3.5 h-3.5" /> Editar
      </button>
      {onFullscreen && (
        <button onClick={onFullscreen} className={ghost} title="Ver em tela cheia" aria-label="Ver em tela cheia">
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
      <button onClick={onPrint} className={ghost} title="Imprimir documento" aria-label="Imprimir documento">
        <Printer className="w-4 h-4" />
      </button>
      <button
        onClick={onExport}
        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#176B80] hover:bg-[#36B7A5] rounded-lg transition-colors flex items-center gap-1.5"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Exportar PDF</span>
      </button>
    </div>
  );
}

/** The official letterhead sheet, used in the side preview and in fullscreen. */
function DocumentSheet({ doc, cabinet, logoUrl, large = false }: { doc: DocumentModel; cabinet: Cabinet; logoUrl?: string; large?: boolean }) {
  const paragraphs = doc.contentPreview.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div
      className={`border border-slate-300 rounded-lg bg-white shadow-xs mx-auto font-serif text-slate-800 leading-relaxed ${
        large ? 'max-w-3xl p-14 space-y-8 text-sm' : 'max-w-2xl p-8 space-y-6 text-xs'
      }`}
    >
      <div className="text-center pb-4 border-b border-slate-300 space-y-1">
        <div className={`${large ? 'w-20 h-20' : 'w-14 h-14'} mx-auto mb-2 flex items-center justify-center`}>
          {logoUrl ? (
            <img src={logoUrl} alt="Brasão" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className={`${large ? 'w-16 h-16' : 'w-12 h-12'} rounded-full border-2 border-[#102C45] flex items-center justify-center font-sans font-bold text-[#102C45]`}>
              ALMT
            </div>
          )}
        </div>
        <h3 className={`font-sans font-bold uppercase tracking-wider text-[#102C45] ${large ? 'text-sm' : 'text-xs'}`}>{cabinet.house}</h3>
        <p className={`font-sans text-slate-600 ${large ? 'text-xs' : 'text-[11px]'}`}>Gabinete da {cabinet.parliamentarian}</p>
        <p className={`font-sans text-slate-400 ${large ? 'text-[11px]' : 'text-[10px]'}`}>
          Palácio Paschoal Moreira Cabral · Centro Político Administrativo · Cuiabá - MT
        </p>
      </div>

      <div className={`font-sans flex justify-between font-bold text-slate-700 ${large ? 'text-xs' : 'text-[11px]'}`}>
        <span>{doc.code}</span>
        <span>Cuiabá-MT, {fmtDate(doc.createdAt)}</span>
      </div>

      <div className="space-y-1">
        <p className="font-bold">A Sua Excelência o(a) Senhor(a),</p>
        <p className="font-bold">{doc.recipient}</p>
        <p className="text-slate-600">Estado de Mato Grosso</p>
      </div>

      <p className="font-bold font-sans">
        Assunto: <span className="font-normal">{doc.title}</span>
      </p>

      <div className="space-y-3 text-justify indent-6">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p>
          Na certeza de contar com a costumeira presteza e atenção de Vossa Excelência para com as demandas legítimas da população mato-grossense,
          renovamos nossos protestos de elevada estima e distinta consideração.
        </p>
      </div>

      <div className="pt-8 text-center space-y-1 font-sans">
        <div className="w-48 border-t border-slate-400 mx-auto" />
        <p className={`font-bold text-[#102C45] ${large ? 'text-sm' : 'text-xs'}`}>{cabinet.parliamentarian}</p>
        <p className="text-[10px] text-slate-500">Deputada Estadual · Estado de Mato Grosso</p>
        {isSigned(doc.status) ? (
          <div className="mt-2 text-[9px] font-mono text-emerald-700 bg-emerald-50 p-1 rounded inline-block">
            ✓ Assinado Digitalmente · ICP-Brasil · Hash: 9fa2...e41b
          </div>
        ) : (
          <div className="mt-2 text-[9px] font-mono text-slate-500 bg-slate-100 p-1 rounded inline-block">
            Minuta · aguardando assinatura · versão {doc.version}
          </div>
        )}
      </div>
    </div>
  );
}

function FullscreenViewer({
  doc,
  cabinet,
  logoUrl,
  suspendEsc,
  onClose,
  onEdit,
  onExport,
}: {
  doc: DocumentModel;
  cabinet: Cabinet;
  logoUrl?: string;
  suspendEsc: boolean;
  onClose: () => void;
  onEdit: () => void;
  onExport: () => void;
}) {
  useEffect(() => {
    if (suspendEsc) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, suspendEsc]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/85 flex flex-col" role="dialog" aria-modal="true" aria-label={`Documento ${doc.code} em tela cheia`}>
      <div className="bg-[#102C45] text-white px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-[#36B7A5]">
            {doc.code} · v{doc.version} · {STATUS[doc.status].label}
          </p>
          <p className="text-sm font-semibold truncate">{doc.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <DocActions dark onEdit={onEdit} onPrint={() => window.print()} onExport={onExport} />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white" title="Fechar (Esc)" aria-label="Fechar tela cheia">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-10" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>
          <DocumentSheet doc={doc} cabinet={cabinet} logoUrl={logoUrl} large />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface DocFormData {
  title: string;
  category: string;
  recipient: string;
  contentPreview: string;
  status: Status;
}

function DocumentFormModal({
  mode,
  initial,
  types,
  onManageTypes,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: DocumentModel | null;
  types: PropositionType[];
  onManageTypes: () => void;
  onClose: () => void;
  onSubmit: (d: DocFormData) => void;
}) {
  const [f, setF] = useState<DocFormData>(() =>
    initial
      ? { title: initial.title, category: initial.category, recipient: initial.recipient, contentPreview: initial.contentPreview, status: initial.status }
      : { title: '', category: types[0]?.name ?? '', recipient: '', contentPreview: '', status: 'rascunho' }
  );
  // Keep an unregistered legacy type selectable when editing an old document.
  const options = initial && !types.some((t) => t.name === initial.category) ? [{ id: 'legacy', name: initial.category, acronym: '—', description: '' }, ...types] : types;
  const field = 'w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-[#176B80]';

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onMouseDown={onClose}>
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.title.trim()) return;
          onSubmit({ ...f, title: f.title.trim(), recipient: f.recipient.trim() });
        }}
        className={`bg-white border border-slate-200 rounded-2xl w-full ${mode === 'edit' ? 'max-w-3xl' : 'max-w-lg'} shadow-xl overflow-hidden flex flex-col max-h-[92vh]`}
      >
        <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm">{mode === 'create' ? 'Elaborar Novo Documento' : `Editar ${initial?.code}`}</h3>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-white" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-3 text-xs text-slate-700 overflow-y-auto">
          <div className={`grid gap-2 ${mode === 'edit' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="doc-type" className="font-semibold text-slate-800">
                  Tipo de Proposição
                </label>
                <button type="button" onClick={onManageTypes} className="text-[10px] text-[#176B80] hover:underline font-semibold">
                  Gerenciar tipos
                </button>
              </div>
              <select id="doc-type" required value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={field}>
                {options.length === 0 && <option value="">Nenhum tipo cadastrado</option>}
                {options.map((t) => (
                  <option key={t.id} value={t.name} title={t.description}>
                    {t.name} ({t.acronym})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-800 block mb-1">Destinatário</label>
              <input
                type="text"
                required
                placeholder="Ex: Secretário da SINFRA-MT"
                value={f.recipient}
                onChange={(e) => setF({ ...f, recipient: e.target.value })}
                className={field}
              />
            </div>
            {mode === 'edit' && (
              <div>
                <label htmlFor="doc-status" className="font-semibold text-slate-800 block mb-1">
                  Situação
                </label>
                <select id="doc-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })} className={field}>
                  {(Object.keys(STATUS) as Status[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s].label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="font-semibold text-slate-800 block mb-1">Título / Ementa</label>
            <input
              type="text"
              required
              placeholder="Ex: Requer providências imediatas quanto à MT-249"
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-800 block mb-1">Texto da Proposição</label>
            <textarea
              rows={mode === 'edit' ? 14 : 4}
              required
              placeholder="Cumprimentando-o cordialmente, vimos por meio deste solicitar..."
              value={f.contentPreview}
              onChange={(e) => setF({ ...f, contentPreview: e.target.value })}
              className={`${field} leading-relaxed`}
            />
            <p className="text-[10px] text-slate-500 mt-1">Cada linha em branco separa um parágrafo no documento timbrado.</p>
          </div>
          {mode === 'edit' && initial && (
            <p className="text-[10px] text-slate-500">
              Alterações no conteúdo geram a versão <strong>{nextVersion(initial.version)}</strong>
              {isSigned(initial.status) && ' e devolvem o documento para revisão (a assinatura deixa de valer)'}.
            </p>
          )}
        </div>
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900">
            Cancelar
          </button>
          <button type="submit" className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg">
            {mode === 'create' ? 'Gerar Minuta' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
