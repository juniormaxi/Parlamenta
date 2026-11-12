import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  RotateCcw,
  Upload,
  UploadCloud,
  XCircle,
  CopyCheck,
  Ban,
} from 'lucide-react';
import { api, uploadFile } from '../../../lib/api';
import { useDialog } from '../../common/Dialogs';
import { ModuleHeader, Field, Chip, TagPicker, Stat, inputCls, btnPrimary, btnGhost, fmtPhone, type Taxonomy } from './ui';

interface PreviewRow {
  line: number;
  status: 'new' | 'duplicate' | 'invalid' | 'ignored';
  errors: string[];
  existing?: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  category: string;
  tags: string[];
}
interface Preview {
  importId: string;
  fileName: string;
  counts: { total: number; new: number; duplicate: number; invalid: number; ignored: number };
  unmappedColumns: string[];
  unknownCategories: string[];
  unknownTags: string[];
  rows: PreviewRow[];
}
interface HistoryRow {
  id: string;
  file_name: string;
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  tags: string[];
  committed_at: string;
  by_name: string | null;
}

const STATUS: Record<PreviewRow['status'], { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'bg-emerald-50 text-emerald-700' },
  duplicate: { label: 'Já existe', cls: 'bg-amber-50 text-amber-700' },
  invalid: { label: 'Com erro', cls: 'bg-rose-50 text-rose-700' },
  ignored: { label: 'Ignorado', cls: 'bg-slate-100 text-slate-500' },
};

export function ImportarModule({
  canCommit,
  onOpenContacts,
  onOpenCategories,
}: {
  canCommit: boolean;
  onOpenContacts: (tag?: string) => void;
  onOpenCategories: (tab: 'categorias' | 'etiquetas') => void;
}) {
  const dialog = useDialog();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | PreviewRow['status']>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [policy, setPolicy] = useState<'skip' | 'update'>('skip');
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; tags: string[] } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(() => {
    api<HistoryRow[]>('/tenant/db/import/history').then(setHistory).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadHistory();
    api<Taxonomy>('/tenant/db/taxonomy').then(setTaxonomy).catch(() => undefined);
  }, [loadHistory]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      dialog.alert({ title: 'Formato não suportado', message: 'Envie a planilha modelo (.xlsx) ou um arquivo .csv.', tone: 'warning' });
      return;
    }
    setUploading(true);
    setProgress(0);
    setResult(null);
    try {
      const p = await uploadFile<Preview>('/tenant/db/import/preview', file, { onProgress: setProgress });
      setPreview(p);
      setStatusFilter('all');
      setTags([]);
      setCreateMissing(true);
    } catch (e) {
      dialog.alert({ title: 'Não foi possível ler a planilha', message: (e as Error).message, tone: 'warning' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const discard = async () => {
    if (preview) await api(`/tenant/db/import/${preview.importId}`, { method: 'DELETE' }).catch(() => undefined);
    setPreview(null);
  };

  const commit = async () => {
    if (!preview) return;
    const n = preview.counts.new + (policy === 'update' ? preview.counts.duplicate : 0);
    const ok = await dialog.confirm({
      title: 'Confirmar importação',
      message: (
        <>
          Serão cadastrados <strong>{preview.counts.new}</strong> novos contatos
          {policy === 'update' && preview.counts.duplicate > 0 && (
            <>
              {' '}
              e complementados <strong>{preview.counts.duplicate}</strong> existentes
            </>
          )}
          {tags.length > 0 && <> com as etiquetas {tags.join(', ')}</>}. Linhas com erro não serão importadas.
        </>
      ),
      confirmLabel: `Importar ${n} contato${n === 1 ? '' : 's'}`,
      tone: 'info',
    });
    if (!ok) return;
    setCommitting(true);
    try {
      const r = await api<{ inserted: number; updated: number; skipped: number }>(`/tenant/db/import/${preview.importId}/commit`, {
        method: 'POST',
        body: { duplicatePolicy: policy, tags, category, createMissing },
      });
      setResult({ ...r, tags });
      setPreview(null);
      loadHistory();
    } catch (e) {
      dialog.alert({ title: 'Falha na importação', message: (e as Error).message, tone: 'danger' });
    } finally {
      setCommitting(false);
    }
  };

  const rows = preview?.rows.filter((r) => statusFilter === 'all' || r.status === statusFilter) ?? [];

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={FileSpreadsheet}
        title="Importar Bancos de Dados"
        subtitle="Importe listas de contatos, classifique com etiquetas e prepare a base para envios por WhatsApp e e-mail"
        actions={
          <a className={btnGhost} href="/api/tenant/db/import/template" download>
            <Download className="w-3.5 h-3.5 text-[#176B80]" /> Baixar planilha modelo
          </a>
        }
      />

      {result && (
        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Importação concluída</p>
              <p className="text-xs text-slate-600">
                {result.inserted} novos · {result.updated} complementados · {result.skipped} não importados
              </p>
            </div>
          </div>
          <button className={btnPrimary} onClick={() => onOpenContacts(result.tags[0])}>
            Ver contatos importados
          </button>
        </div>
      )}

      {!preview && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div
            className={`lg:col-span-2 bg-white border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
              dragOver ? 'border-[#36B7A5] bg-[#E9F1F4]/40' : 'border-slate-200'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="w-12 h-12 rounded-xl bg-[#E9F1F4] text-[#176B80] flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-900">Arraste a planilha aqui</p>
            <p className="text-xs text-slate-500 mt-1">Planilha modelo (.xlsx) ou arquivo .csv · até 20 MB · até 50 mil linhas</p>
            {uploading ? (
              <div className="w-64 mt-4">
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-[#36B7A5] transition-all" style={{ width: `${Math.max(progress * 100, 8)}%` }} />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">{progress < 1 ? 'Enviando…' : 'Validando linhas…'}</p>
              </div>
            ) : (
              <button className={`${btnPrimary} mt-4`} onClick={() => inputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Selecionar arquivo
              </button>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Como funciona</h3>
            <ol className="space-y-2.5 text-xs text-slate-600">
              {[
                ['Baixe a planilha modelo', 'Colunas: Nome, Telefone, WhatsApp, E-mail, Endereço, Bairro, Cidade, UF, CEP, Categoria, Etiquetas e consentimentos.'],
                ['Preencha ou cole sua base', 'Planilhas com outros nomes de coluna (ex.: "Celular", "Município") também são reconhecidas.'],
                ['Revise a prévia', 'O sistema valida cada linha e detecta contatos que já existem pelo telefone ou e-mail.'],
                ['Classifique e importe', 'Aplique etiquetas à lista inteira para segmentar os envios depois.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#102C45] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span>
                    <strong className="text-slate-800">{t}.</strong> {d}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={CheckCircle2} label="Novos" value={preview.counts.new} sub="serão cadastrados" />
            <Stat icon={CopyCheck} label="Já existentes" value={preview.counts.duplicate} sub="mesmo telefone ou e-mail" />
            <Stat icon={XCircle} label="Com erro" value={preview.counts.invalid} sub="não serão importados" />
            <Stat icon={Ban} label="Ignorados" value={preview.counts.ignored} sub="linhas de exemplo" />
          </div>

          {preview.unmappedColumns.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Colunas não reconhecidas e que serão ignoradas: <strong>{preview.unmappedColumns.join(', ')}</strong>. Use os nomes da planilha modelo para
                aproveitá-las.
              </span>
            </div>
          )}

          {(preview.unknownCategories.length > 0 || preview.unknownTags.length > 0) && (
            <div className="p-3 rounded-lg bg-[#E9F1F4]/60 border border-[#176B80]/20 text-xs text-[#102C45] space-y-2">
              <p className="font-semibold">A planilha usa valores que ainda não estão cadastrados em Categorias:</p>
              {preview.unknownCategories.length > 0 && (
                <p className="flex flex-wrap items-center gap-1">
                  <span className="text-slate-600">Categorias:</span>
                  {preview.unknownCategories.map((c) => (
                    <Chip key={c} tone="slate">
                      {c}
                    </Chip>
                  ))}
                </p>
              )}
              {preview.unknownTags.length > 0 && (
                <p className="flex flex-wrap items-center gap-1">
                  <span className="text-slate-600">Etiquetas:</span>
                  {preview.unknownTags.map((t) => (
                    <Chip key={t} tone="slate">
                      {t}
                    </Chip>
                  ))}
                </p>
              )}
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input type="checkbox" className="mt-0.5 rounded text-[#176B80]" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                <span>
                  <strong>Cadastrar automaticamente</strong> essas categorias e etiquetas ao importar.
                  <span className="block text-[10px] text-slate-500">Se desmarcado, esses valores serão descartados e os contatos entram sem eles.</span>
                </span>
              </label>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900 truncate">
                  Prévia · <span className="font-normal text-slate-500">{preview.fileName}</span>
                </p>
                <div className="flex gap-1">
                  {(['all', 'new', 'duplicate', 'invalid'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold ${statusFilter === s ? 'bg-[#102C45] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {s === 'all' ? 'Todas' : STATUS[s].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-auto max-h-[460px]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Linha</th>
                      <th className="text-left font-semibold px-3 py-2">Situação</th>
                      <th className="text-left font-semibold px-3 py-2">Nome</th>
                      <th className="text-left font-semibold px-3 py-2">Contato</th>
                      <th className="text-left font-semibold px-3 py-2">Cidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.line} className="align-top">
                        <td className="px-3 py-2 font-mono text-slate-400">{r.line}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                          {r.errors.length > 0 && r.status === 'invalid' && <p className="text-[10px] text-rose-600 mt-1">{r.errors.join('; ')}</p>}
                          {r.existing && <p className="text-[10px] text-amber-700 mt-1">= {r.existing}</p>}
                        </td>
                        <td className="px-3 py-2 text-slate-900 font-medium">{r.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {[fmtPhone(r.whatsapp || r.phone), r.email].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.city || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.counts.total > preview.rows.length && (
                  <p className="text-[11px] text-slate-500 px-4 py-2 border-t border-slate-100">
                    Exibindo as primeiras {preview.rows.length} de {preview.counts.total} linhas. Todas serão processadas.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4 h-fit">
              <h3 className="text-sm font-bold text-slate-900">Classificação da lista</h3>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">Etiquetas aplicadas a todos os contatos</span>
                  <button type="button" onClick={() => onOpenCategories('etiquetas')} className="text-[10px] text-[#176B80] hover:underline font-semibold">
                    Gerenciar
                  </button>
                </div>
                <TagPicker
                  options={taxonomy?.tags ?? []}
                  value={tags}
                  onChange={setTags}
                  emptyHint="Nenhuma etiqueta cadastrada. Crie em Banco de Dados › Categorias."
                />
                <span className="block text-[10px] text-slate-500">Ex.: origem da lista, evento, tema de interesse.</span>
              </div>
              <Field label="Categoria padrão" hint="Usada quando a linha não tiver categoria.">
                <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Manter como está na planilha</option>
                  {taxonomy?.categories.map((c) => (
                    <option key={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <fieldset className="space-y-1.5">
                <legend className="text-[11px] font-semibold text-slate-700 mb-1">Contatos que já existem</legend>
                {(
                  [
                    ['skip', 'Ignorar', 'Mantém o cadastro atual sem mudanças.'],
                    ['update', 'Complementar', 'Preenche campos vazios e soma as etiquetas. Nada é apagado.'],
                  ] as const
                ).map(([v, l, d]) => (
                  <label key={v} className={`flex gap-2 p-2 rounded-lg border cursor-pointer ${policy === v ? 'border-[#176B80] bg-[#E9F1F4]/50' : 'border-slate-200'}`}>
                    <input type="radio" name="policy" checked={policy === v} onChange={() => setPolicy(v)} className="mt-0.5 text-[#176B80]" />
                    <span className="text-xs">
                      <strong className="text-slate-800">{l}</strong>
                      <span className="block text-[10px] text-slate-500">{d}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {!canCommit && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  A confirmação da importação é restrita a Parlamentar, Chefe de Gabinete e Coordenação.
                </p>
              )}
              <div className="flex gap-2">
                <button className={btnGhost} onClick={discard}>
                  <RotateCcw className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button
                  className={`${btnPrimary} flex-1`}
                  onClick={commit}
                  disabled={!canCommit || committing || preview.counts.new + (policy === 'update' ? preview.counts.duplicate : 0) === 0}
                >
                  {committing ? 'Importando…' : 'Importar contatos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-[#176B80]" />
          <h3 className="text-sm font-bold text-slate-900">Histórico de importações</h3>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-xs text-slate-500 text-center">Nenhuma importação realizada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Arquivo</th>
                  <th className="text-left font-semibold px-4 py-2">Data</th>
                  <th className="text-left font-semibold px-4 py-2">Por</th>
                  <th className="text-left font-semibold px-4 py-2">Resultado</th>
                  <th className="text-left font-semibold px-4 py-2">Etiquetas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{h.file_name}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      {new Date(h.committed_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{h.by_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <span className="text-emerald-700 font-semibold">{h.inserted} novos</span> · {h.updated} complementados · {h.skipped} não importados
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {h.tags.map((t) => (
                          <button key={t} onClick={() => onOpenContacts(t)} title="Ver contatos com esta etiqueta">
                            <Chip>{t}</Chip>
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
