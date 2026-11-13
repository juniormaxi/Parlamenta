import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Target,
  Download,
  UploadCloud,
  Search,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  CalendarClock,
  PhoneMissed,
  PhoneOff,
  Star,
  StickyNote,
  History,
  Users,
  Loader2,
  RefreshCw,
  Trash2,
  UserPlus,
  Shuffle,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Send,
  ExternalLink,
  Inbox,
  Mail,
  MapPin,
  Settings2,
} from 'lucide-react';
import { crm, type Lead, type LeadStatus, type CrmMeta, type LeadPage, type LeadEvent, type ImportPreview, type CrmUser } from '../../lib/crm';
import { useDialog } from '../common/Dialogs';
import { ModuleHeader, Modal, Field, Stat, inputCls, inputAutoCls, btnPrimary, btnGhost, btnDanger, fmtPhone } from './banco/ui';
import { useWhatsAppStatus } from './whatsapp/WhatsAppConnection';

// ---------------------------------------------------------------------------
// Situações do lead
// ---------------------------------------------------------------------------
const STATUS: Record<LeadStatus, { label: string; chip: string }> = {
  novo: { label: 'Novo', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  contatado: { label: 'Contatado', chip: 'bg-slate-100 text-slate-700 border-slate-200' },
  interessado: { label: 'Interessado', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  retornar: { label: 'Retornar depois', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  sem_resposta: { label: 'Sem resposta', chip: 'bg-slate-50 text-slate-500 border-slate-200' },
  sem_interesse: { label: 'Sem interesse', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  numero_invalido: { label: 'Número inválido', chip: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  convertido: { label: 'Convertido', chip: 'bg-[#E9F1F4] text-[#102C45] border-[#176B80]/30' },
};
const STATUS_ORDER: LeadStatus[] = ['novo', 'contatado', 'interessado', 'retornar', 'sem_resposta', 'sem_interesse', 'numero_invalido', 'convertido'];

/** Ícones de classificação do atendimento (um clique). */
const ACTIONS: { status: LeadStatus; icon: React.ElementType; label: string; on: string; hover: string }[] = [
  { status: 'interessado', icon: ThumbsUp, label: 'Interessado', on: 'bg-emerald-600 text-white border-emerald-600', hover: 'hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50' },
  { status: 'retornar', icon: CalendarClock, label: 'Retornar depois', on: 'bg-amber-500 text-white border-amber-500', hover: 'hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50' },
  { status: 'sem_resposta', icon: PhoneMissed, label: 'Sem resposta', on: 'bg-slate-500 text-white border-slate-500', hover: 'hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50' },
  { status: 'sem_interesse', icon: ThumbsDown, label: 'Sem interesse', on: 'bg-rose-600 text-white border-rose-600', hover: 'hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50' },
  { status: 'numero_invalido', icon: PhoneOff, label: 'Número inválido', on: 'bg-zinc-600 text-white border-zinc-600', hover: 'hover:text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50' },
  { status: 'convertido', icon: Star, label: 'Convertido', on: 'bg-[#102C45] text-white border-[#102C45]', hover: 'hover:text-[#102C45] hover:border-[#176B80]/40 hover:bg-[#E9F1F4]' },
];

const ROLE_LABEL: Record<string, string> = {
  deputado: 'Parlamentar',
  chefe_gabinete: 'Chefe de Gabinete',
  coordenador_atendimento: 'Coord. Atendimento',
  assessor_parlamentar: 'Assessor',
  comunicacao: 'Comunicação',
};

const EVENT_LABEL: Record<string, string> = {
  atribuido: 'Direcionado para',
  desatribuido: 'Removido do responsável',
  classificado: 'Classificado como',
  anotacao: 'Anotação',
  whatsapp_gabinete: 'WhatsApp enviado pelo número do gabinete',
  whatsapp_link: 'WhatsApp aberto no aparelho do usuário',
};

/** Datas do servidor vêm em UTC no formato "YYYY-MM-DD HH:MM:SS". */
const parseUtc = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);
const fmtWhen = (s: string | null) => {
  const d = parseUtc(s);
  if (!d || isNaN(+d)) return '—';
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? `hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const showPhone = (p: string) => fmtPhone(p.length > 11 && p.startsWith('55') ? p.slice(2) : p);
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

const TEMPLATE_KEY = 'parlamentta.crm.template';
const DEFAULT_TEMPLATE = 'Olá, {nome}! Tudo bem? Aqui é do gabinete. Estamos entrando em contato para saber como podemos ajudar você em {cidade}.';
const loadTemplate = () => {
  try {
    return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
};
const saveTemplate = (t: string) => {
  try {
    localStorage.setItem(TEMPLATE_KEY, t);
  } catch {
    /* opcional */
  }
};
const fillTemplate = (t: string, l: Lead) =>
  t.replace(/\{nome\}/gi, firstName(l.name)).replace(/\{nome_completo\}/gi, l.name).replace(/\{cidade\}/gi, l.city || 'sua cidade');

type Tab = 'meus' | 'todos' | 'gestao';

// ---------------------------------------------------------------------------
export const CrmModule: React.FC<{ onOpenIntegracoes?: () => void }> = ({ onOpenIntegracoes }) => {
  const dialog = useDialog();
  const [meta, setMeta] = useState<CrmMeta | null>(null);
  const [tab, setTab] = useState<Tab>('meus');
  const [importOpen, setImportOpen] = useState(false);
  const [distributeIds, setDistributeIds] = useState<string[] | 'unassigned' | null>(null);
  const [reload, setReload] = useState(0);

  const loadMeta = useCallback(() => {
    crm
      .meta()
      .then(setMeta)
      .catch((e) => dialog.alert({ title: 'Erro ao carregar o CRM', message: (e as Error).message, tone: 'danger' }));
  }, [dialog]);
  useEffect(loadMeta, [loadMeta, reload]);
  const refreshAll = () => setReload((n) => n + 1);

  if (!meta) {
    return (
      <div className="p-10 text-center text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    );
  }
  const myLoad = meta.users.find((u) => u.id === meta.me);

  const tabs: [Tab, string, React.ElementType][] = [
    ['meus', `Meus leads${myLoad ? ` (${myLoad.open})` : ''}`, Inbox],
    ...(meta.canManage
      ? ([
          ['todos', 'Todos os leads', Users],
          ['gestao', 'Importações & distribuição', Shuffle],
        ] as [Tab, string, React.ElementType][])
      : []),
  ];

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Target}
        title="CRM · Leads"
        subtitle="Leads importados de planilha, distribuídos à equipe e contatados por WhatsApp"
        actions={
          meta.canManage && (
            <>
              <a className={btnGhost} href={crm.templateUrl} download>
                <Download className="w-3.5 h-3.5" /> Planilha modelo
              </a>
              <button className={btnPrimary} onClick={() => setImportOpen(true)}>
                <UploadCloud className="w-3.5 h-3.5" /> Importar leads
              </button>
            </>
          )
        }
      />

      {tabs.length > 1 && (
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto max-w-full">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === id ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'gestao' && meta.canManage ? (
        <GestaoPanel meta={meta} onChanged={refreshAll} onDistributeUnassigned={() => setDistributeIds('unassigned')} />
      ) : (
        <LeadsPanel
          key={tab}
          scope={tab === 'todos' ? 'all' : 'mine'}
          meta={meta}
          reload={reload}
          onChanged={loadMeta}
          onDistribute={(ids) => setDistributeIds(ids)}
          onOpenIntegracoes={onOpenIntegracoes}
        />
      )}

      {importOpen && (
        <ImportModal
          users={meta.users}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            refreshAll();
          }}
        />
      )}
      {distributeIds && (
        <DistributeModal
          users={meta.users}
          target={distributeIds}
          unassigned={meta.unassigned}
          onClose={() => setDistributeIds(null)}
          onDone={() => {
            setDistributeIds(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lista de leads (Meus leads / Todos os leads)
// ---------------------------------------------------------------------------
function LeadsPanel({
  scope,
  meta,
  reload,
  onChanged,
  onDistribute,
  onOpenIntegracoes,
}: {
  scope: 'mine' | 'all';
  meta: CrmMeta;
  reload: number;
  onChanged: () => void;
  onDistribute: (ids: string[]) => void;
  onOpenIntegracoes?: () => void;
}) {
  const dialog = useDialog();
  const { status: wa } = useWhatsAppStatus(60_000);
  const waOnline = wa?.status === 'connected' && wa.online;
  const [status, setStatus] = useState<string>('abertos');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [assignee, setAssignee] = useState('');
  const [data, setData] = useState<LeadPage | null>(null);
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState<Lead | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (page = 0) => {
      setLoading(true);
      try {
        const r = await crm.leads({ scope, status, q: qDebounced, assignee: scope === 'all' ? assignee : undefined, page });
        setData(r);
        setItems((prev) => (page === 0 ? r.items : [...prev, ...r.items]));
        if (page === 0) setSelected(new Set());
      } catch (e) {
        dialog.alert({ title: 'Erro ao carregar leads', message: (e as Error).message, tone: 'danger' });
      } finally {
        setLoading(false);
      }
    },
    [scope, status, qDebounced, assignee, dialog]
  );
  useEffect(() => {
    load(0);
  }, [load, reload]);

  const replace = (lead: Lead) => {
    setItems((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
    setDetail((d) => (d?.id === lead.id ? lead : d));
  };

  const classify = async (lead: Lead, s: LeadStatus) => {
    const next = lead.status === s ? (lead.contactCount > 0 ? 'contatado' : 'novo') : s;
    setBusyId(lead.id);
    try {
      replace(await crm.update(lead.id, { status: next }));
      onChanged();
      dialog.toast(`${firstName(lead.name)}: ${STATUS[next].label}.`);
    } catch (e) {
      dialog.alert({ title: 'Não foi possível classificar', message: (e as Error).message, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts ?? {};
  const allCount = STATUS_ORDER.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const openCount = allCount - (counts.sem_interesse ?? 0) - (counts.numero_invalido ?? 0) - (counts.convertido ?? 0);
  const chips: [string, string, number][] = [
    ['abertos', 'Em aberto', openCount],
    ['', 'Todos', allCount],
    ...STATUS_ORDER.map((s) => [s, STATUS[s].label, counts[s] ?? 0] as [string, string, number]),
  ];
  const allSelected = items.length > 0 && items.every((l) => selected.has(l.id));
  const selIds = [...selected];

  const bulkAssign = async (userId: string) => {
    const user = meta.users.find((u) => u.id === userId);
    try {
      const r = await crm.assign(selIds, userId || null);
      dialog.toast(userId ? `${r.updated} lead(s) direcionados para ${user?.name}.` : `${r.updated} lead(s) sem responsável.`);
      onChanged();
      load(0);
    } catch (e) {
      dialog.alert({ title: 'Erro ao direcionar', message: (e as Error).message, tone: 'danger' });
    }
  };
  const bulkDelete = async () => {
    const ok = await dialog.confirm({
      title: `Excluir ${selIds.length} lead(s)?`,
      message: 'Os leads e o histórico de atendimento serão apagados. Não é possível desfazer.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const r = await crm.remove(selIds);
      dialog.toast(`${r.deleted} lead(s) excluídos.`);
      onChanged();
      load(0);
    } catch (e) {
      dialog.alert({ title: 'Erro ao excluir', message: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <div className="space-y-3">
      {scope === 'mine' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Inbox} label="Em aberto" value={openCount} sub="aguardando atendimento" />
          <Stat icon={Target} label="Novos" value={counts.novo ?? 0} sub="ainda sem contato" />
          <Stat icon={CalendarClock} label="Retornar" value={counts.retornar ?? 0} sub="combinar novo contato" />
          <Stat icon={Star} label="Convertidos" value={counts.convertido ?? 0} sub={`${counts.interessado ?? 0} interessados`} />
        </div>
      )}

      {wa && !waOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {wa.status === 'connected'
              ? 'O WhatsApp do gabinete está reconectando. Enquanto isso, as mensagens podem ser abertas no seu próprio WhatsApp.'
              : 'O WhatsApp do gabinete não está conectado. As mensagens serão abertas no seu próprio WhatsApp (WhatsApp Web ou celular).'}
          </span>
          {wa.status !== 'connected' && onOpenIntegracoes && (
            <button onClick={onOpenIntegracoes} className="font-semibold text-amber-900 underline flex items-center gap-1">
              <Settings2 className="w-3.5 h-3.5" /> Conectar em Canais & Integrações
            </button>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Filtros */}
        <div className="p-3 border-b border-slate-100 space-y-2.5">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${inputCls} pl-8`} placeholder="Buscar por nome, telefone, e-mail ou cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {scope === 'all' && (
              <select className={inputAutoCls} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Todos os responsáveis</option>
                <option value="none">Sem responsável ({meta.unassigned})</option>
                {meta.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.open} em aberto)
                  </option>
                ))}
              </select>
            )}
            <button className={btnGhost} onClick={() => load(0)} title="Atualizar">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {chips.map(([id, label, n]) => (
              <button
                key={id || 'all'}
                onClick={() => setStatus(id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-colors ${
                  status === id ? 'bg-[#102C45] text-white border-[#102C45]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {label} <span className="opacity-70 font-mono">{n}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Ações em massa (gestão) */}
        {scope === 'all' && selected.size > 0 && (
          <div className="px-3 py-2 bg-[#E9F1F4] border-b border-[#176B80]/20 flex flex-wrap items-center gap-2 text-xs">
            <strong className="text-[#102C45]">{selected.size} selecionado(s)</strong>
            <select
              className={inputAutoCls}
              value=""
              onChange={(e) => {
                if (e.target.value) bulkAssign(e.target.value === '__none' ? '' : e.target.value);
              }}
            >
              <option value="">Direcionar para…</option>
              {meta.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              <option value="__none">— Sem responsável</option>
            </select>
            <button className={btnGhost} onClick={() => onDistribute(selIds)}>
              <Shuffle className="w-3.5 h-3.5" /> Distribuir entre usuários
            </button>
            <button className={btnDanger} onClick={bulkDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
            <button className="ml-auto text-[#176B80] font-semibold hover:underline" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}

        {/* Lista */}
        {!data ? (
          <div className="p-10 text-center text-xs text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin inline" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-1">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">Nenhum lead {scope === 'mine' ? 'direcionado a você' : ''} neste filtro.</p>
            {scope === 'mine' && allCount === 0 && <p>Quando a coordenação distribuir leads para você, eles aparecem aqui.</p>}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {scope === 'all' && (
              <label className="px-3 py-2 flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50/60">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(items.map((l) => l.id)) : new Set())}
                />
                Selecionar os {items.length} exibidos
              </label>
            )}
            {items.map((l) => (
              <div key={l.id} className={`p-3 flex flex-col lg:flex-row lg:items-center gap-3 ${selected.has(l.id) ? 'bg-[#E9F1F4]/50' : 'hover:bg-slate-50/60'}`}>
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {scope === 'all' && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(l.id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) s.add(l.id);
                        else s.delete(l.id);
                        setSelected(s);
                      }}
                      aria-label={`Selecionar ${l.name}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setDetail(l)} className="font-semibold text-sm text-slate-900 hover:text-[#176B80] text-left truncate max-w-full">
                        {l.name}
                      </button>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS[l.status].chip}`}>{STATUS[l.status].label}</span>
                      {scope === 'all' && (
                        <span className="text-[10px] text-slate-500">
                          {l.assignedName ? (
                            <>
                              → <strong className="text-slate-700">{l.assignedName}</strong>
                            </>
                          ) : (
                            <em className="text-amber-700">sem responsável</em>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                      {l.phone && (
                        <span className={`font-mono ${l.waPhone ? 'text-slate-700' : 'text-rose-600'}`} title={l.waPhone ? '' : 'Telefone sem DDD ou inválido para WhatsApp'}>
                          {showPhone(l.phone)}
                        </span>
                      )}
                      {l.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" />
                          {l.email}
                        </span>
                      )}
                      {l.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {l.city}
                        </span>
                      )}
                      {l.lastContactAt && <span>· último contato {fmtWhen(l.lastContactAt)}</span>}
                    </div>
                    {(l.notes || l.agentNotes) && (
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">
                        {l.notes && <span>{l.notes}</span>}
                        {l.notes && l.agentNotes && <span className="text-slate-300"> · </span>}
                        {l.agentNotes && <span className="text-[#176B80]">✎ {l.agentNotes}</span>}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 lg:justify-end shrink-0">
                  <button
                    onClick={() => setCompose(l)}
                    disabled={!l.waPhone}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={l.waPhone ? `Enviar WhatsApp para ${showPhone(l.phone)}` : 'Sem celular válido para WhatsApp'}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <span className="w-px h-6 bg-slate-200 mx-0.5 hidden sm:block" />
                  {ACTIONS.map((a) => {
                    const active = l.status === a.status;
                    return (
                      <button
                        key={a.status}
                        onClick={() => classify(l, a.status)}
                        disabled={busyId === l.id}
                        className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${active ? a.on : `bg-white text-slate-400 border-slate-200 ${a.hover}`}`}
                        title={active ? `${a.label} (clique para desfazer)` : a.label}
                        aria-label={a.label}
                        aria-pressed={active}
                      >
                        <a.icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setDetail(l)}
                    className="p-1.5 rounded-lg border bg-white text-slate-400 border-slate-200 hover:text-[#176B80] hover:bg-slate-50"
                    title="Anotações e histórico"
                    aria-label="Anotações e histórico"
                  >
                    {l.agentNotes ? <StickyNote className="w-4 h-4 text-[#176B80]" /> : <History className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {data && items.length < data.total && (
          <div className="p-3 border-t border-slate-100 text-center">
            <button className={btnGhost} disabled={loading} onClick={() => load(data.page + 1)}>
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Carregar mais ({data.total - items.length} restantes)
            </button>
          </div>
        )}
      </div>

      {/* Legenda dos ícones */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 px-1">
        {ACTIONS.map((a) => (
          <span key={a.status} className="flex items-center gap-1">
            <a.icon className="w-3 h-3" /> {a.label}
          </span>
        ))}
        <span>· Clique de novo no ícone ativo para desfazer.</span>
      </div>

      {compose && (
        <ComposeModal
          lead={compose}
          waOnline={Boolean(waOnline)}
          onClose={() => setCompose(null)}
          onSent={(lead) => {
            replace(lead);
            onChanged();
            setCompose(null);
          }}
        />
      )}
      {detail && <LeadDetailModal lead={detail} canEdit={meta.canManage} onClose={() => setDetail(null)} onSaved={replace} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Envio de WhatsApp
// ---------------------------------------------------------------------------
function ComposeModal({ lead, waOnline, onClose, onSent }: { lead: Lead; waOnline: boolean; onClose: () => void; onSent: (l: Lead) => void }) {
  const dialog = useDialog();
  const [template, setTemplate] = useState(loadTemplate);
  const [text, setText] = useState(() => fillTemplate(loadTemplate(), lead));
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [sending, setSending] = useState(false);

  const viaGabinete = async () => {
    setSending(true);
    try {
      const r = await crm.sendWhatsApp(lead.id, text.trim());
      dialog.toast(`Mensagem enviada para ${firstName(lead.name)}.`);
      if (r.warning) dialog.toast(r.warning, 'warning');
      onSent(r.lead);
    } catch (e) {
      dialog.alert({ title: 'WhatsApp', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };
  const viaLink = async () => {
    const phone = (lead.waPhone ?? '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text.trim())}`, '_blank', 'noopener');
    try {
      const r = await crm.markContacted(lead.id, text.trim());
      onSent(r.lead);
    } catch (e) {
      dialog.alert({ title: 'Contato não registrado', message: (e as Error).message, tone: 'warning' });
    }
  };

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp para {lead.name}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnGhost} onClick={viaLink} disabled={!text.trim()} title="Abre o WhatsApp Web ou o app do seu celular com a mensagem pronta">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir no meu WhatsApp
          </button>
          {waOnline && (
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              disabled={sending || !text.trim()}
              onClick={viaGabinete}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar pelo WhatsApp do gabinete
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
          <span className="font-mono">{showPhone(lead.phone)}</span>
          {lead.city && <span>{lead.city}</span>}
          {lead.contactCount > 0 && <span>· {lead.contactCount} contato(s) anteriores, último {fmtWhen(lead.lastContactAt)}</span>}
        </div>
        {lead.notes && <p className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-slate-600">Obs.: {lead.notes}</p>}
        <Field label="Mensagem">
          <textarea className={`${inputCls} leading-relaxed`} rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        </Field>
        {editingTemplate ? (
          <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <Field label="Mensagem padrão" hint="Use {nome}, {nome_completo} e {cidade}. Fica salva neste navegador.">
              <textarea className={inputCls} rows={3} value={template} onChange={(e) => setTemplate(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setEditingTemplate(false)}>
                Cancelar
              </button>
              <button
                className={btnPrimary}
                onClick={() => {
                  saveTemplate(template);
                  setText(fillTemplate(template, lead));
                  setEditingTemplate(false);
                }}
              >
                Salvar e aplicar
              </button>
            </div>
          </div>
        ) : (
          <button className="text-[#176B80] font-semibold hover:underline" onClick={() => setEditingTemplate(true)}>
            Editar mensagem padrão
          </button>
        )}
        <p className="text-[10px] text-slate-500">
          {waOnline
            ? '“Enviar pelo WhatsApp do gabinete” manda pelo número oficial conectado; “Abrir no meu WhatsApp” abre o seu aplicativo com a mensagem pronta.'
            : 'O número do gabinete não está conectado: a mensagem será aberta no seu WhatsApp (Web ou celular) para você enviar.'}{' '}
          O lead passa a “Contatado” automaticamente.
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detalhe: anotações e histórico (e edição dos dados para a gestão)
// ---------------------------------------------------------------------------
function LeadDetailModal({ lead, canEdit, onClose, onSaved }: { lead: Lead; canEdit: boolean; onClose: () => void; onSaved: (l: Lead) => void }) {
  const dialog = useDialog();
  const [events, setEvents] = useState<LeadEvent[] | null>(null);
  const [f, setF] = useState({ name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, notes: lead.notes, agentNotes: lead.agentNotes });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    crm
      .events(lead.id)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [lead.id, lead.status, lead.contactCount, lead.agentNotes]);

  const save = async () => {
    setSaving(true);
    try {
      const body = canEdit ? f : { agentNotes: f.agentNotes };
      onSaved(await crm.update(lead.id, body));
      dialog.toast('Lead atualizado.');
      onClose();
    } catch (e) {
      dialog.alert({ title: 'Erro ao salvar', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={lead.name}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Fechar
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {canEdit ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nome">
              <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Telefone (WhatsApp)">
              <input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
            </Field>
            <Field label="E-mail">
              <input className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Cidade">
              <input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            </Field>
            <Field label="Obs. (da planilha)" className="sm:col-span-2">
              <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </Field>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 text-slate-700">
            <p>
              <span className="text-slate-500">Telefone:</span> <span className="font-mono">{showPhone(lead.phone) || '—'}</span>
            </p>
            <p>
              <span className="text-slate-500">E-mail:</span> {lead.email || '—'}
            </p>
            <p>
              <span className="text-slate-500">Cidade:</span> {lead.city || '—'}
            </p>
            <p>
              <span className="text-slate-500">Situação:</span> {STATUS[lead.status].label}
            </p>
            {lead.notes && <p className="sm:col-span-2 bg-slate-50 rounded-lg p-2">Obs.: {lead.notes}</p>}
          </div>
        )}
        <Field label="Anotações do atendimento" hint="O que foi conversado, melhor horário, próximos passos…">
          <textarea className={inputCls} rows={3} value={f.agentNotes} onChange={(e) => setF({ ...f, agentNotes: e.target.value })} />
        </Field>
        <div>
          <p className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Histórico
          </p>
          {!events ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : events.length === 0 ? (
            <p className="text-slate-500">Sem registros ainda.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {events.map((ev, i) => (
                <li key={i} className="flex gap-2 text-[11px]">
                  <span className="font-mono text-slate-400 shrink-0 w-24">{fmtWhen(ev.at)}</span>
                  <span className="text-slate-700">
                    {EVENT_LABEL[ev.kind] ?? ev.kind}{' '}
                    {ev.kind === 'classificado' ? <strong>{STATUS[ev.detail as LeadStatus]?.label ?? ev.detail}</strong> : ev.kind === 'atribuido' ? <strong>{ev.detail}</strong> : null}
                    {(ev.kind === 'anotacao' || ev.kind.startsWith('whatsapp')) && ev.detail && <span className="text-slate-500"> — “{ev.detail}”</span>}
                    {ev.user && <span className="text-slate-400"> · por {ev.user}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Seleção de usuários (importação e distribuição)
// ---------------------------------------------------------------------------
function UserPicker({ users, value, onChange }: { users: CrmUser[]; value: Set<string>; onChange: (s: Set<string>) => void }) {
  const all = users.length > 0 && users.every((u) => value.has(u.id));
  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
      <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-[11px] font-semibold text-slate-700">
        <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? new Set(users.map((u) => u.id)) : new Set())} />
        Todos os usuários ({users.length})
      </label>
      {users.map((u) => (
        <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
          <input
            type="checkbox"
            checked={value.has(u.id)}
            onChange={(e) => {
              const s = new Set(value);
              if (e.target.checked) s.add(u.id);
              else s.delete(u.id);
              onChange(s);
            }}
          />
          <span className="flex-1 min-w-0 truncate font-medium text-slate-800">{u.name}</span>
          <span className="text-[10px] text-slate-500">{ROLE_LABEL[u.role] ?? u.role}</span>
          <span className="text-[10px] font-mono text-slate-500 w-20 text-right">{u.open} em aberto</span>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------
function ImportModal({ users, onClose, onDone }: { users: CrmUser[]; onClose: () => void; onDone: () => void }) {
  const dialog = useDialog();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [name, setName] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const analyze = async (f: File) => {
    setFile(f);
    setPreview(null);
    setProgress(0);
    try {
      const p = await crm.preview(f, setProgress);
      setPreview(p);
      setName(f.name.replace(/\.(xlsx|csv)$/i, ''));
    } catch (e) {
      dialog.alert({ title: 'Não foi possível ler a planilha', message: (e as Error).message, tone: 'danger' });
      setFile(null);
    } finally {
      setProgress(null);
    }
  };

  const toImport = preview ? preview.valid - (skipDuplicates ? preview.duplicates : 0) : 0;
  const perUser = picked.size ? Math.ceil(toImport / picked.size) : 0;

  const confirm = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const r = await crm.confirm(preview.token, { userIds: [...picked], skipDuplicates, name });
      const dist = Object.entries(r.perUser)
        .map(([id, n]) => `${users.find((u) => u.id === id)?.name ?? 'usuário'}: ${n}`)
        .join(' · ');
      dialog.toast(`${r.imported} lead(s) importados${dist ? ` — ${dist}` : ' (sem responsável)'}.`);
      onDone();
    } catch (e) {
      dialog.alert({ title: 'Erro na importação', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title="Importar leads"
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          {preview && (
            <button className={btnPrimary} onClick={confirm} disabled={saving || toImport <= 0}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Importar {toImport} lead(s){picked.size ? ` e distribuir entre ${picked.size}` : ''}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <FileSpreadsheet className="w-5 h-5 text-[#176B80]" />
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-slate-800">{file ? file.name : 'Selecione a planilha (.xlsx ou .csv)'}</p>
            <p className="text-[11px] text-slate-500">Colunas: Nome, E-mail, Telefone, Cidade, Obs.</p>
          </div>
          <a className={btnGhost} href={crm.templateUrl} download>
            <Download className="w-3.5 h-3.5" /> Planilha modelo
          </a>
          <label className={`${btnPrimary} cursor-pointer`}>
            <UploadCloud className="w-3.5 h-3.5" /> {file ? 'Trocar arquivo' : 'Escolher arquivo'}
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) analyze(f);
              }}
            />
          </label>
        </div>

        {progress !== null && (
          <p className="text-slate-600 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lendo planilha… {Math.round(progress * 100)}%
          </p>
        )}

        {preview && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat icon={CheckCircle2} label="Leads válidos" value={preview.valid} />
              <Stat icon={Users} label="Já no CRM" value={preview.duplicates} sub="mesmo telefone ou e-mail" />
              <Stat icon={PhoneOff} label="Sem WhatsApp" value={preview.withoutWhatsApp} sub="sem celular com DDD" />
              <Stat icon={AlertTriangle} label="Com erro" value={preview.errorCount} sub="serão ignorados" />
            </div>
            {preview.ignoredColumns.length > 0 && (
              <p className="text-[11px] text-slate-500">Colunas ignoradas: {preview.ignoredColumns.join(', ')}.</p>
            )}
            {preview.errorCount > 0 && (
              <details className="bg-rose-50/60 border border-rose-100 rounded-lg p-2.5">
                <summary className="cursor-pointer font-semibold text-rose-800">{preview.errorCount} linha(s) com problema</summary>
                <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto text-[11px] text-rose-900">
                  {preview.errors.map((er) => (
                    <li key={er.line}>
                      Linha {er.line}
                      {er.name && ` (${er.name})`}: {er.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {['Nome', 'Telefone', 'E-mail', 'Cidade', 'Obs'].map((h) => (
                      <th key={h} className="text-left font-semibold px-2.5 py-1.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample.map((l) => (
                    <tr key={l.line} className={l.duplicate ? 'text-slate-400' : 'text-slate-700'}>
                      <td className="px-2.5 py-1.5">
                        {l.name} {l.duplicate && <span className="text-[9px] font-semibold text-amber-700">(já existe)</span>}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono">{showPhone(l.phone)}</td>
                      <td className="px-2.5 py-1.5">{l.email}</td>
                      <td className="px-2.5 py-1.5">{l.city}</td>
                      <td className="px-2.5 py-1.5 max-w-[220px] truncate">{l.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.valid > preview.sample.length && (
                <p className="px-2.5 py-1.5 text-[10px] text-slate-500 bg-slate-50">… e mais {preview.valid - preview.sample.length} lead(s).</p>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Field label="Nome da lista" hint="Para identificar esta importação depois (ex.: Evento Saúde 10/11).">
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </Field>
                {preview.duplicates > 0 && (
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                    <span>
                      Ignorar os {preview.duplicates} lead(s) que já estão no CRM
                      <span className="block text-[10px] text-slate-500">Desmarque para importar mesmo assim (ficarão duplicados).</span>
                    </span>
                  </label>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-700">Distribuir entre os usuários</p>
                <UserPicker users={users} value={picked} onChange={setPicked} />
                <p className="text-[10px] text-slate-500">
                  {picked.size
                    ? `Cerca de ${perUser} lead(s) por usuário. Quem tem menos leads em aberto recebe primeiro.`
                    : 'Nenhum usuário marcado: os leads ficam “sem responsável” para distribuir depois.'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Distribuição (selecionados ou sem responsável)
// ---------------------------------------------------------------------------
function DistributeModal({
  users,
  target,
  unassigned,
  onClose,
  onDone,
}: {
  users: CrmUser[];
  target: string[] | 'unassigned';
  unassigned: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialog = useDialog();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const count = target === 'unassigned' ? unassigned : target.length;

  const run = async () => {
    setSaving(true);
    try {
      const r = await crm.distribute(target === 'unassigned' ? { userIds: [...picked], scope: 'unassigned' } : { userIds: [...picked], leadIds: target });
      const dist = Object.entries(r.perUser)
        .map(([id, n]) => `${users.find((u) => u.id === id)?.name ?? 'usuário'}: ${n}`)
        .join(' · ');
      dialog.toast(`${r.distributed} lead(s) distribuídos — ${dist}.`);
      onDone();
    } catch (e) {
      dialog.alert({ title: 'Erro na distribuição', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={target === 'unassigned' ? `Distribuir ${count} lead(s) sem responsável` : `Distribuir ${count} lead(s) selecionado(s)`}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={run} disabled={saving || !picked.size || !count}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Distribuir
          </button>
        </>
      }
    >
      <div className="space-y-2 text-xs">
        <UserPicker users={users} value={picked} onChange={setPicked} />
        <p className="text-[10px] text-slate-500">
          {picked.size ? `Cerca de ${Math.ceil(count / picked.size)} lead(s) por usuário. ` : ''}A divisão equilibra a carga: quem tem menos leads em aberto recebe
          primeiro.{target !== 'unassigned' && ' Leads que já tinham responsável serão redirecionados.'}
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Gestão: equipe e importações
// ---------------------------------------------------------------------------
function GestaoPanel({ meta, onChanged, onDistributeUnassigned }: { meta: CrmMeta; onChanged: () => void; onDistributeUnassigned: () => void }) {
  const dialog = useDialog();
  const maxOpen = useMemo(() => Math.max(1, ...meta.users.map((u) => u.open)), [meta.users]);

  const removeImport = async (id: string, name: string, remaining: number) => {
    const ok = await dialog.confirm({
      title: 'Excluir importação?',
      message: (
        <>
          A lista <strong>{name}</strong> e os seus <strong>{remaining}</strong> lead(s), com todo o histórico de atendimento, serão apagados.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const r = await crm.removeImport(id);
      dialog.toast(`${r.deleted} lead(s) excluídos.`);
      onChanged();
    } catch (e) {
      dialog.alert({ title: 'Erro ao excluir', message: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#176B80]" /> Carga por usuário
          </h3>
          {meta.unassigned > 0 && (
            <button className={btnPrimary} onClick={onDistributeUnassigned}>
              <UserPlus className="w-3.5 h-3.5" /> Distribuir {meta.unassigned} sem responsável
            </button>
          )}
        </div>
        <ul className="divide-y divide-slate-100">
          {meta.users.map((u) => (
            <li key={u.id} className="px-4 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800 truncate">{u.name}</span>
                <span className="text-slate-500 shrink-0">
                  <strong className="text-slate-800 font-mono">{u.open}</strong> em aberto · {u.total} no total
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-[#176B80] rounded-full" style={{ width: `${(u.open / maxOpen) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#176B80]" /> Importações
          </h3>
        </div>
        {meta.imports.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500">Nenhuma planilha importada ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {meta.imports.map((i) => (
              <li key={i.id} className="px-4 py-2.5 text-xs flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{i.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {fmtWhen(i.createdAt)} · {i.createdBy || '—'} · {i.remaining} de {i.total} lead(s)
                  </p>
                </div>
                <button
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  title="Excluir importação e seus leads"
                  onClick={() => removeImport(i.id, i.name, i.remaining)}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
