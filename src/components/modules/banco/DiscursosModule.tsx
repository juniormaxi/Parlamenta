import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  FileType2,
  Loader2,
  Mic,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  Plus,
  MapPin,
  X,
} from 'lucide-react';
import { api, uploadFile } from '../../../lib/api';
import { useDialog } from '../../common/Dialogs';
import { ModuleHeader, Modal, Field, Chip, TagInput, inputCls, inputAutoCls, btnPrimary, btnGhost, btnDanger, fmtDateBr, fmtBytes } from './ui';

type MediaType = 'pending' | 'audio' | 'video' | 'pdf' | 'docx' | 'text';
type Status = 'awaiting_file' | 'queued' | 'processing' | 'done' | 'needs_ai' | 'error';
interface Speech {
  id: string;
  title: string;
  speechDate: string;
  occasion: string;
  location: string;
  mediaType: MediaType;
  fileName: string;
  fileBytes: number;
  fileKept: boolean;
  status: Status;
  statusDetail: string;
  summary: string;
  themes: string[];
  keywords: string[];
  taggedBy: string;
  wordCount: number;
  createdAt: string;
  processedAt: string | null;
  createdByName: string | null;
  excerpt?: string;
  text?: string;
}
interface Meta {
  themes: string[];
  occasions: string[];
  aiAvailable: boolean;
  acceptedExtensions: string[];
  maxUploadMb: number;
}

const MEDIA: Record<MediaType, { icon: React.ElementType; label: string }> = {
  pending: { icon: FileText, label: 'Sem arquivo' },
  audio: { icon: FileAudio, label: 'Áudio' },
  video: { icon: FileVideo, label: 'Vídeo' },
  pdf: { icon: FileType2, label: 'PDF' },
  docx: { icon: FileText, label: 'Word' },
  text: { icon: FileText, label: 'Texto' },
};
const STATUS: Record<Status, { label: string; cls: string }> = {
  awaiting_file: { label: 'Aguardando arquivo', cls: 'bg-slate-100 text-slate-600' },
  queued: { label: 'Na fila', cls: 'bg-[#E9F1F4] text-[#176B80]' },
  processing: { label: 'Processando', cls: 'bg-[#E9F1F4] text-[#176B80]' },
  done: { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700' },
  needs_ai: { label: 'Aguardando IA', cls: 'bg-amber-50 text-amber-700' },
  error: { label: 'Erro', cls: 'bg-rose-50 text-rose-700' },
};
const busy = (s: Status) => s === 'queued' || s === 'processing';

export function DiscursosModule({ canManage }: { canManage: boolean }) {
  const dialog = useDialog();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<Speech[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [theme, setTheme] = useState('');
  const [occasion, setOccasion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api<Meta>('/tenant/db/speeches/meta').then(setMeta).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set('q', debouncedQ);
    if (theme) p.set('theme', theme);
    if (occasion) p.set('occasion', occasion);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    try {
      setItems(await api<Speech[]>(`/tenant/db/speeches?${p}`));
    } catch (e) {
      dialog.alert({ title: 'Erro ao carregar discursos', message: (e as Error).message, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, theme, occasion, from, to, dialog]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while something is being processed.
  const anyBusy = items.some((s) => busy(s.status));
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [anyBusy, load]);

  const filtered = !!(debouncedQ || theme || occasion || from || to);

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Mic}
        title="Discursos"
        subtitle="Acervo de tudo o que foi dito pelo parlamentar: áudios, vídeos, PDFs e textos, decupados e etiquetados por tema"
        actions={
          <button className={btnPrimary} onClick={() => setUploadOpen(true)}>
            <Plus className="w-3.5 h-3.5 text-[#36B7A5]" /> Adicionar discurso
          </button>
        }
      />

      {meta && !meta.aiAvailable && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>IA não configurada.</strong> Textos e documentos Word são arquivados e etiquetados por palavras-chave. Áudios, vídeos e PDFs ficam
            guardados com status “Aguardando IA” até a chave do Gemini ser configurada no servidor (<code className="font-mono">GEMINI_API_KEY</code>).
          </span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-8`} placeholder="Buscar no conteúdo dos discursos, título, etiquetas…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inputAutoCls} value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">Todos os temas</option>
          {meta?.themes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className={inputAutoCls} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
          <option value="">Todas as ocasiões</option>
          {meta?.occasions.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input className={inputAutoCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
          <span className="text-[11px] text-slate-400">até</span>
          <input className={inputAutoCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#E9F1F4] text-[#176B80] flex items-center justify-center mb-3">
            <Mic className="w-6 h-6" />
          </div>
          {filtered ? (
            <p className="text-xs text-slate-500">Nenhum discurso encontrado com esses filtros.</p>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-900">O acervo está vazio</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">Envie gravações de sessões, entrevistas, pronunciamentos em PDF ou textos.</p>
              <button className={btnPrimary} onClick={() => setUploadOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Adicionar o primeiro discurso
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((s) => {
            const M = MEDIA[s.mediaType];
            return (
              <button
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className="text-left bg-white border border-slate-200 hover:border-[#176B80]/50 rounded-xl p-4 shadow-xs transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#E9F1F4] text-[#176B80] flex items-center justify-center shrink-0">
                    <M.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{s.title}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS[s.status].cls}`}>
                        {busy(s.status) && <Loader2 className="w-3 h-3 animate-spin" />}
                        {STATUS[s.status].label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {fmtDateBr(s.speechDate)}
                      </span>
                      <span className="font-semibold text-[#176B80]">{s.occasion}</span>
                      {s.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {s.location}
                        </span>
                      )}
                      <span>
                        {M.label}
                        {s.wordCount > 0 && ` · ${s.wordCount.toLocaleString('pt-BR')} palavras`}
                      </span>
                    </p>
                    {busy(s.status) && s.statusDetail && <p className="text-[11px] text-[#176B80] mt-1.5">{s.statusDetail}</p>}
                    {(s.status === 'error' || s.status === 'needs_ai') && <p className="text-[11px] text-amber-700 mt-1.5">{s.statusDetail}</p>}
                    {(s.summary || s.excerpt) && (
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2">{s.summary || s.excerpt}</p>
                    )}
                    {(s.themes.length > 0 || s.keywords.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.themes.map((t) => (
                          <Chip key={t} tone="navy">
                            {t}
                          </Chip>
                        ))}
                        {s.keywords.slice(0, 6).map((k) => (
                          <Chip key={k}>{k}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {uploadOpen && meta && (
        <UploadModal
          meta={meta}
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false);
            load();
          }}
        />
      )}
      {openId && meta && (
        <SpeechDetail
          id={openId}
          meta={meta}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
interface QueueItem {
  file: File;
  title: string;
  progress: number;
  state: 'ready' | 'uploading' | 'done' | 'error';
  error?: string;
}

function UploadModal({ meta, onClose, onDone }: { meta: Meta; onClose: () => void; onDone: () => void }) {
  const dialog = useDialog();
  const today = new Date().toISOString().slice(0, 10);
  const [files, setFiles] = useState<QueueItem[]>([]);
  const [date, setDate] = useState(today);
  const [occasion, setOccasion] = useState(meta.occasions[0] ?? '');
  const [occasionOther, setOccasionOther] = useState('');
  const [location, setLocation] = useState('');
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = meta.acceptedExtensions.map((e) => `.${e}`).join(',');

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const rejected: string[] = [];
    const next: QueueItem[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!meta.acceptedExtensions.includes(ext)) rejected.push(`${f.name}${ext === 'doc' ? ' (salve como .docx ou PDF)' : ''}`);
      else if (f.size > meta.maxUploadMb * 1024 * 1024) rejected.push(`${f.name} (maior que ${meta.maxUploadMb} MB)`);
      else next.push({ file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), progress: 0, state: 'ready' });
    }
    setFiles((p) => [...p, ...next]);
    if (rejected.length) dialog.alert({ title: 'Arquivos não aceitos', message: rejected.join(' · '), tone: 'warning' });
  };

  const send = async () => {
    const occ = occasion === 'Outro' ? occasionOther.trim() || 'Outro' : occasion;
    if (!date) return dialog.alert({ title: 'Informe a data', message: 'A data em que o discurso foi proferido é obrigatória.', tone: 'warning' });
    if (files.some((f) => !f.title.trim())) return dialog.alert({ title: 'Título obrigatório', message: 'Dê um título para cada arquivo.', tone: 'warning' });
    setSending(true);
    let failures = 0;
    for (let i = 0; i < files.length; i++) {
      const item = files[i]!;
      if (item.state === 'done') continue;
      const update = (patch: Partial<QueueItem>) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      update({ state: 'uploading', progress: 0, error: undefined });
      try {
        const { id } = await api<{ id: string }>('/tenant/db/speeches', {
          method: 'POST',
          body: { title: item.title.trim(), speechDate: date, occasion: occ, location },
        });
        await uploadFile(`/tenant/db/speeches/${id}/file`, item.file, { method: 'PUT', onProgress: (p) => update({ progress: p }) });
        update({ state: 'done', progress: 1 });
      } catch (e) {
        failures++;
        update({ state: 'error', error: (e as Error).message });
      }
    }
    setSending(false);
    if (!failures) {
      dialog.toast(files.length === 1 ? 'Discurso enviado para processamento.' : `${files.length} discursos enviados para processamento.`);
      onDone();
    }
  };

  return (
    <Modal
      title="Adicionar discurso ao acervo"
      onClose={sending ? () => undefined : onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={send} disabled={sending || files.length === 0 || files.every((f) => f.state === 'done')}>
            {sending ? 'Enviando…' : `Enviar ${files.length || ''} arquivo${files.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragOver ? 'border-[#36B7A5] bg-[#E9F1F4]/40' : 'border-slate-200'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <UploadCloud className="w-7 h-7 text-[#176B80] mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-900">Arraste arquivos ou</p>
          <button className={`${btnGhost} mt-2`} onClick={() => inputRef.current?.click()} disabled={sending}>
            Selecionar arquivos
          </button>
          <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-[10px] text-slate-500 text-left">
            <div className="p-2 rounded-lg bg-slate-50">
              <strong className="block text-slate-700">Áudio</strong>mp3, wav, m4a, ogg… → decupagem por IA
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <strong className="block text-slate-700">Vídeo</strong>mp4, mov, webm… → decupado e descartado
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <strong className="block text-slate-700">PDF</strong>OCR para texto nativo
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <strong className="block text-slate-700">Texto</strong>docx, txt, srt → etiquetagem
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((f, i) => {
              const ext = f.file.name.split('.').pop()?.toLowerCase();
              const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', '3gp', 'wmv'].includes(ext ?? '');
              return (
                <div key={i} className="p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      className={`${inputCls} flex-1`}
                      value={f.title}
                      disabled={sending || f.state === 'done'}
                      onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      aria-label="Título"
                      placeholder="Título do discurso"
                    />
                    {!sending && f.state !== 'done' && (
                      <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label="Remover">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {f.file.name} · {fmtBytes(f.file.size)}
                    {isVideo && ' · o vídeo será descartado após a decupagem'}
                  </p>
                  {f.state !== 'ready' && (
                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all ${f.state === 'error' ? 'bg-rose-500' : f.state === 'done' ? 'bg-emerald-500' : 'bg-[#36B7A5]'}`}
                        style={{ width: `${Math.max(f.progress * 100, 4)}%` }}
                      />
                    </div>
                  )}
                  {f.error && <p className="text-[10px] text-rose-600">{f.error}</p>}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data em que foi dito *">
            <input className={inputCls} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} disabled={sending} />
          </Field>
          <Field label="Ocasião *">
            <select className={inputCls} value={occasion} onChange={(e) => setOccasion(e.target.value)} disabled={sending}>
              {meta.occasions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          {occasion === 'Outro' && (
            <Field label="Descreva a ocasião" className="col-span-2">
              <input className={inputCls} value={occasionOther} onChange={(e) => setOccasionOther(e.target.value)} disabled={sending} />
            </Field>
          )}
          <Field label="Local" className="col-span-2">
            <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Plenário da ALMT, Rádio CBN Cuiabá" disabled={sending} />
          </Field>
        </div>
        {files.length > 1 && <p className="text-[10px] text-slate-500">Data, ocasião e local serão aplicados a todos os arquivos deste envio.</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function SpeechDetail({ id, meta, canManage, onClose, onChanged }: { id: string; meta: Meta; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const dialog = useDialog();
  const [s, setS] = useState<Speech | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ title: string; speechDate: string; occasion: string; location: string; themes: string[]; keywords: string[] } | null>(null);
  const [find, setFind] = useState('');

  const load = useCallback(async () => {
    try {
      setS(await api<Speech>(`/tenant/db/speeches/${id}`));
    } catch (e) {
      dialog.alert({ title: 'Erro', message: (e as Error).message, tone: 'danger' });
      onClose();
    }
  }, [id, dialog, onClose]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!s || !busy(s.status)) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [s, load]);

  const highlighted = useMemo(() => {
    if (!s?.text) return null;
    const term = find.trim();
    if (term.length < 2) return s.text;
    const parts = s.text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-[#36B7A5]/30 text-slate-900 rounded px-0.5">{p}</mark> : p));
  }, [s?.text, find]);
  const matches = useMemo(() => {
    const term = find.trim().toLowerCase();
    return s?.text && term.length >= 2 ? s.text.toLowerCase().split(term).length - 1 : 0;
  }, [s?.text, find]);

  if (!s) return null;
  const M = MEDIA[s.mediaType];

  const save = async () => {
    try {
      await api(`/tenant/db/speeches/${s.id}`, { method: 'PATCH', body: draft });
      dialog.toast('Discurso atualizado.');
      setEditing(false);
      load();
      onChanged();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível salvar', message: (e as Error).message, tone: 'warning' });
    }
  };
  const reprocess = async () => {
    const ok = await dialog.confirm({
      title: 'Reprocessar discurso',
      message: s.taggedBy === 'manual' ? 'As etiquetas editadas manualmente serão substituídas pela classificação automática.' : 'O texto será analisado novamente e as etiquetas, refeitas.',
      confirmLabel: 'Reprocessar',
      tone: 'info',
    });
    if (!ok) return;
    try {
      await api(`/tenant/db/speeches/${s.id}/reprocess`, { method: 'POST' });
      load();
      onChanged();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível reprocessar', message: (e as Error).message, tone: 'warning' });
    }
  };
  const remove = async () => {
    const ok = await dialog.confirm({
      title: 'Excluir discurso',
      message: (
        <>
          Excluir <strong>{s.title}</strong> do acervo, incluindo o texto e o arquivo original? Esta ação não pode ser desfeita.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/tenant/db/speeches/${s.id}`, { method: 'DELETE' });
      dialog.toast('Discurso excluído.');
      onChanged();
      onClose();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível excluir', message: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <Modal
      wide
      title={
        <span className="flex items-center gap-2">
          <M.icon className="w-4 h-4 text-[#176B80]" /> {s.title}
        </span>
      }
      onClose={onClose}
      footer={
        editing ? (
          <>
            <button className={btnGhost} onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button className={btnPrimary} onClick={save}>
              Salvar alterações
            </button>
          </>
        ) : (
          <>
            {canManage && (
              <button className={`${btnDanger} mr-auto`} onClick={remove} disabled={busy(s.status)}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )}
            {s.fileKept && (
              <a className={btnGhost} href={`/api/tenant/db/speeches/${s.id}/file`} download>
                <Download className="w-3.5 h-3.5" /> Arquivo original
              </a>
            )}
            <button className={btnGhost} onClick={reprocess} disabled={busy(s.status) || s.status === 'awaiting_file'}>
              <RefreshCw className="w-3.5 h-3.5" /> Reprocessar
            </button>
            <button
              className={btnPrimary}
              disabled={busy(s.status)}
              onClick={() => {
                setDraft({ title: s.title, speechDate: s.speechDate, occasion: s.occasion, location: s.location, themes: s.themes, keywords: s.keywords });
                setEditing(true);
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Editar dados e etiquetas
            </button>
          </>
        )
      }
    >
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-4 lg:order-2">
          {editing && draft ? (
            <div className="space-y-3">
              <Field label="Título">
                <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Data">
                <input className={inputCls} type="date" value={draft.speechDate} onChange={(e) => setDraft({ ...draft, speechDate: e.target.value })} />
              </Field>
              <Field label="Ocasião">
                <select className={inputCls} value={draft.occasion} onChange={(e) => setDraft({ ...draft, occasion: e.target.value })}>
                  {[...new Set([draft.occasion, ...meta.occasions])].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Local">
                <input className={inputCls} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </Field>
              <div>
                <span className="block text-[11px] font-semibold text-slate-700 mb-1">Temas</span>
                <div className="flex flex-wrap gap-1">
                  {meta.themes.map((t) => {
                    const on = draft.themes.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDraft({ ...draft, themes: on ? draft.themes.filter((x) => x !== t) : [...draft.themes, t] })}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${on ? 'bg-[#102C45] text-white border-[#102C45]' : 'border-slate-200 text-slate-600 hover:border-[#176B80]'}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Etiquetas livres">
                <TagInput value={draft.keywords} onChange={(keywords) => setDraft({ ...draft, keywords })} placeholder="Município, obra, programa…" />
              </Field>
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Data</dt>
                  <dd className="text-slate-900 font-medium">{fmtDateBr(s.speechDate)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Ocasião</dt>
                  <dd className="text-slate-900 font-medium">{s.occasion}</dd>
                </div>
                {s.location && (
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Local</dt>
                    <dd className="text-slate-900">{s.location}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Origem</dt>
                  <dd className="text-slate-900">
                    {M.label}
                    {s.fileBytes > 0 && ` · ${fmtBytes(s.fileBytes)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Situação</dt>
                  <dd>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS[s.status].cls}`}>
                      {busy(s.status) && <Loader2 className="w-3 h-3 animate-spin" />}
                      {STATUS[s.status].label}
                    </span>
                  </dd>
                </div>
                <div className="col-span-2 text-[10px] text-slate-400">
                  Enviado por {s.createdByName ?? '—'} em {new Date(s.createdAt.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </dl>
              {s.mediaType === 'video' && !s.fileKept && (
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2">O vídeo original foi descartado após a decupagem. O texto permanece no acervo.</p>
              )}
              {s.statusDetail && (
                <p className={`text-[11px] rounded-lg p-2 border ${s.status === 'error' || s.status === 'needs_ai' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-[#E9F1F4]/60 border-[#E9F1F4] text-[#102C45]'}`}>
                  {s.statusDetail}
                </p>
              )}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
                  Temas
                  {s.taggedBy && <span className="normal-case tracking-normal font-normal">· por {s.taggedBy === 'ia' ? 'IA' : s.taggedBy}</span>}
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.themes.length ? s.themes.map((t) => <Chip key={t} tone="navy">{t}</Chip>) : <span className="text-[11px] text-slate-400">—</span>}
                </div>
              </div>
              {s.keywords.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Etiquetas</p>
                  <div className="flex flex-wrap gap-1">
                    {s.keywords.map((k) => (
                      <Chip key={k}>{k}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-2 space-y-3 lg:order-1 min-w-0">
          {s.summary && (
            <div className="p-3 rounded-xl bg-[#E9F1F4]/60 border border-[#E9F1F4]">
              <p className="text-[10px] uppercase tracking-wider text-[#176B80] font-bold flex items-center gap-1 mb-1">
                <Sparkles className="w-3 h-3" /> Resumo
              </p>
              <p className="text-xs text-slate-700 leading-relaxed">{s.summary}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              {s.mediaType === 'audio' || s.mediaType === 'video' ? 'Decupagem' : s.mediaType === 'pdf' ? 'Texto extraído (OCR)' : 'Texto'}
              {s.wordCount > 0 && <span className="font-normal normal-case tracking-normal"> · {s.wordCount.toLocaleString('pt-BR')} palavras</span>}
            </p>
            {s.text && (
              <div className="relative w-48">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input className={`${inputCls} pl-7 py-1.5`} placeholder="Localizar no texto" value={find} onChange={(e) => setFind(e.target.value)} />
                {find.trim().length >= 2 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{matches}</span>}
              </div>
            )}
          </div>
          <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-[52vh] overflow-y-auto">
            {highlighted || <span className="text-slate-400">{busy(s.status) ? 'O texto aparecerá aqui ao fim do processamento…' : 'Sem texto disponível.'}</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
