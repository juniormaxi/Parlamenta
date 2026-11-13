import React, { useCallback, useEffect, useState } from 'react';
import { Library, Search, Loader2, Tag, FileText, Send, Building, Calendar, ExternalLink, RefreshCw, Brain, List, Mic, ClipboardList, Newspaper, Lock, ShieldAlert, Activity, AlertTriangle } from 'lucide-react';
import { NeuralMap } from './NeuralMap';
import { knowledge, type KnowledgeItem, type KnowledgeVisibility, type KnowledgeMetrics } from '../../../lib/oficios';
import { useDialog } from '../../common/Dialogs';
import { ModuleHeader, Modal, inputCls, btnGhost, btnPrimary, fmtBytes } from './ui';

const SOURCE: Record<string, { label: string; icon: React.ElementType }> = {
  oficio: { label: 'Ofício', icon: Send },
  discurso: { label: 'Discurso', icon: Mic },
  protocolo: { label: 'Protocolo', icon: ClipboardList },
  clipping: { label: 'Notícia', icon: Newspaper },
};
const VIS: Record<KnowledgeVisibility, { label: string; hint: string }> = {
  tenant: { label: 'Gabinete', hint: 'Todos os usuários do gabinete' },
  roles: { label: 'Restrito por papel', hint: 'Papéis escolhidos, Parlamentar, Chefe de Gabinete e autor' },
  users: { label: 'Restrito a pessoas', hint: 'Pessoas escolhidas, Parlamentar, Chefe de Gabinete e autor' },
  confidential: { label: 'Sigiloso', hint: 'Somente pessoas escolhidas e o autor; fora do Mapa Neural; todo acesso é auditado' },
};
const ROLE_LABEL: Record<string, string> = {
  deputado: 'Parlamentar',
  chefe_gabinete: 'Chefe de Gabinete',
  coordenador_atendimento: 'Coord. Atendimento',
  assessor_parlamentar: 'Assessor(a)',
  comunicacao: 'Comunicação',
};

/** Editor de permissões de um documento (aplicadas no servidor e no banco). */
function AccessEditor({ item, onSaved }: { item: KnowledgeItem; onSaved: () => void }) {
  const dialog = useDialog();
  const [vis, setVis] = useState<KnowledgeVisibility>(item.visibility ?? 'tenant');
  const [roles, setRoles] = useState<string[]>(item.acl?.roles ?? []);
  const [users, setUsers] = useState<string[]>(item.acl?.users ?? []);
  const [opts, setOpts] = useState<{ roles: string[]; users: { id: string; name: string; role: string }[] } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    knowledge.accessOptions().then(setOpts).catch(() => setOpts({ roles: [], users: [] }));
  }, []);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = async () => {
    setSaving(true);
    try {
      await knowledge.setAccess(item.id, { visibility: vis, roles: vis === 'roles' ? roles : [], users: vis === 'tenant' ? [] : users });
      dialog.toast('Permissões atualizadas.');
      onSaved();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível alterar as permissões', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <p className="font-semibold text-slate-800 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Quem pode ver este documento
        {item.aclManaged === 'source' && <span className="font-normal text-slate-500">(definido pelo módulo de origem até ser alterado aqui)</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(VIS) as KnowledgeVisibility[]).map((v) => (
          <button
            key={v}
            onClick={() => setVis(v)}
            title={VIS[v].hint}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vis === v ? 'bg-[#102C45] text-white border-[#102C45]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {VIS[v].label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{VIS[vis].hint}.</p>
      {vis === 'roles' && opts && (
        <div className="flex flex-wrap gap-3">
          {opts.roles
            .filter((r) => !['deputado', 'chefe_gabinete'].includes(r))
            .map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(roles, setRoles, r)} /> {ROLE_LABEL[r] ?? r}
              </label>
            ))}
        </div>
      )}
      {vis !== 'tenant' && opts && (
        <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
          {opts.users.map((u) => (
            <label key={u.id} className="flex items-center gap-1.5 min-w-0">
              <input type="checkbox" checked={users.includes(u.id)} onChange={() => toggle(users, setUsers, u.id)} />
              <span className="truncate">
                {u.name} <span className="text-slate-400">· {ROLE_LABEL[u.role] ?? u.role}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Salvar permissões
        </button>
      </div>
    </div>
  );
}

/** Painel de operação (Parlamentar / Chefe de Gabinete): volume, indexação, fila e tempos. */
function OperationPanel({ m }: { m: KnowledgeMetrics }) {
  const q = (status: string) => m.queue.byStatus.filter((r) => r.status === status).reduce((a, r) => a + r.n, 0);
  const T: Record<string, string> = {
    'kb.list': 'Listagem/busca',
    'kb.get': 'Abrir documento',
    'kb.graph.read': 'Mapa Neural (leitura)',
    'kb.graph.build': 'Mapa Neural (recálculo)',
    'kb.index': 'Indexação (fragmentos)',
    'kb.sync': 'Sincronização',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 space-y-4 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-slate-200 rounded-lg p-3">
          <p className="text-slate-500">Documentos</p>
          <p className="text-lg font-bold font-mono">{m.totals.docs}</p>
          <p className="text-slate-500">{fmtBytes(m.totals.bytes)}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3">
          <p className="text-slate-500">Indexação</p>
          <p className="text-lg font-bold font-mono">{m.indexing.pending ?? 0} pendente(s)</p>
          <p className={m.indexing.error ? 'text-rose-700 font-semibold' : 'text-slate-500'}>{m.indexing.error ?? 0} com erro</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3">
          <p className="text-slate-500">Fila de processamento</p>
          <p className="text-lg font-bold font-mono">{q('queued') + q('running')} ativa(s)</p>
          <p className="text-slate-500">
            {q('done')} concluída(s) · <span className={q('dead') ? 'text-rose-700 font-semibold' : ''}>{q('dead')} falha(s)</span>
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3">
          <p className="text-slate-500">Mapa Neural</p>
          <p className="text-lg font-bold font-mono">{m.graph?.duration_ms != null ? `${m.graph.duration_ms} ms` : '—'}</p>
          <p className="text-slate-500">{m.graph ? `${m.graph.docs} docs · ${m.graph.links} ligações${m.graph.dirty ? ' · recálculo agendado' : ''}` : 'ainda não calculado'}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="overflow-x-auto">
          <p className="font-semibold text-slate-800 mb-1">Por origem</p>
          <table className="w-full">
            <tbody>
              {m.documents.map((d) => (
                <tr key={d.source} className="border-t border-slate-100">
                  <td className="py-1">{SOURCE[d.source]?.label ?? d.source}</td>
                  <td className="py-1 text-right font-mono">{d.docs}</td>
                  <td className="py-1 text-right text-slate-500">{fmtBytes(d.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <p className="font-semibold text-slate-800 mb-1">Tempos (últimas 24 h)</p>
          <table className="w-full">
            <tbody>
              {m.timings
                .filter((t) => T[t.name])
                .map((t) => (
                  <tr key={t.name} className="border-t border-slate-100">
                    <td className="py-1">{T[t.name]}</td>
                    <td className="py-1 text-right font-mono">{t.count}×</td>
                    <td className="py-1 text-right font-mono">média {t.avgMs ?? '—'} ms</td>
                    <td className="py-1 text-right font-mono">p95 ≤ {t.p95Ms ?? '—'} ms</td>
                    <td className={`py-1 text-right ${t.errors ? 'text-rose-700 font-semibold' : 'text-slate-400'}`}>{t.errors} erro(s)</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {m.queue.recentErrors.length > 0 && (
        <div>
          <p className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Falhas recentes
          </p>
          <ul className="space-y-1">
            {m.queue.recentErrors.slice(0, 8).map((e, i) => (
              <li key={i} className="text-slate-600 break-words">
                <span className="font-mono">{e.kind}</span> · {e.attempts} tentativa(s) · {e.last_error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
const fmtDate = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/** Banco de Dados › Base de Conhecimento: acervo de documentos do gabinete, com etiquetas. */
export const ConhecimentoModule: React.FC<{ onOpenSource?: (source: string, sourceId: string) => void }> = ({ onOpenSource }) => {
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [data, setData] = useState<{ items: KnowledgeItem[]; tags: { tag: string; count: number }[] } | null>(null);
  const [open, setOpen] = useState<KnowledgeItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'acervo' | 'mapa' | 'operacao'>('acervo');
  const [metrics, setMetrics] = useState<KnowledgeMetrics | null>(null);
  const [canSeeOps, setCanSeeOps] = useState(false);
  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await knowledge.metrics());
      setCanSeeOps(true);
    } catch {
      setCanSeeOps(false); // 403 para quem não é Parlamentar/Chefe de Gabinete
    }
  }, []);
  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

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

  const openItem = async (it: Pick<KnowledgeItem, 'id'>) => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
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
        subtitle="Acervo do gabinete, organizado por etiquetas e por temas identificados no conteúdo. Entram automaticamente: Ofícios, Discursos processados, Protocolos (sem dados pessoais do cidadão, acesso restrito) e notícias do Clipping."
      />

      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold border border-slate-200" role="tablist">
        {(
          [
            ['acervo', 'Acervo', List],
            ['mapa', 'Mapa Neural', Brain],
            ...(canSeeOps ? ([['operacao', 'Operação', Activity]] as const) : []),
          ] as const
        ).map(([k, l, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`px-3.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${view === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Icon className={`w-3.5 h-3.5 ${k === 'mapa' ? 'text-[#36B7A5]' : 'text-[#176B80]'}`} />
            {l}
          </button>
        ))}
      </div>

      {view === 'mapa' && <NeuralMap onOpenItem={(id) => openItem({ id })} onOpenSource={onOpenSource} />}
      {view === 'operacao' && metrics && <OperationPanel m={metrics} />}

      <div className={`bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden ${view === 'acervo' ? '' : 'hidden'}`}>
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
            {!q && !tag && <p>Ofícios, discursos, protocolos e notícias do clipping aparecem aqui automaticamente.</p>}
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
                        {it.themes
                          ?.filter((t) => t !== 'Outros')
                          .map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-[#36B7A5]/10 text-[#176B80] text-[10px] font-semibold" title="Tema identificado no conteúdo">
                              {t}
                            </span>
                          ))}
                        {it.visibility && it.visibility !== 'tenant' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold flex items-center gap-1" title={VIS[it.visibility].hint}>
                            <Lock className="w-2.5 h-2.5" /> {VIS[it.visibility].label}
                          </span>
                        )}
                        {it.indexStatus === 'error' && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-semibold">erro de indexação</span>
                        )}
                        {it.meta?.statusLabel && <span className="text-[10px] text-slate-500">· {it.meta.statusLabel}</span>}
                        <span className="text-[10px] text-slate-400">
                          · {src.label} de {fmtDate(it.docDate || it.meta?.date || it.createdAt)}
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
              {open.version && <span>Versão {open.version}</span>}
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> {VIS[open.visibility ?? 'tenant'].label}
              </span>
            </div>
            {open.indexStatus === 'error' && (
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" /> Falha na indexação: {open.indexError ?? 'erro desconhecido'}
                </span>
                {canSeeOps && (
                  <button
                    className={btnGhost}
                    onClick={async () => {
                      try {
                        await knowledge.reprocess(open.id);
                        dialog.toast('Reprocessamento agendado.');
                      } catch (e) {
                        dialog.alert({ title: 'Erro', message: (e as Error).message, tone: 'danger' });
                      }
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reprocessar
                  </button>
                )}
              </div>
            )}
            {!!open.sameContent?.length && (
              <p className="text-slate-500">
                Conteúdo idêntico a: {open.sameContent.map((x) => `${SOURCE[x.source]?.label ?? x.source} “${x.title}”`).join('; ')}.
              </p>
            )}
            {open.meta?.truncated && <p className="text-amber-700">Atenção: a transcrição/OCR atingiu o limite da IA e pode estar incompleta.</p>}
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
            {open.canManage && (
              <AccessEditor
                key={open.id}
                item={open}
                onSaved={() => {
                  void openItem(open);
                  void load();
                }}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
