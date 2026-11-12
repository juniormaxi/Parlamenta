import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookUser,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FolderTree,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Tags,
  Trash2,
  Users,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { useDialog } from '../../common/Dialogs';
import {
  ModuleHeader,
  Modal,
  Field,
  Chip,
  TagPicker,
  type Taxonomy,
  Stat,
  inputCls,
  inputAutoCls,
  btnPrimary,
  btnGhost,
  btnDanger,
  fmtPhone,
  fmtCep,
} from './ui';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  birthDate: string;
  gender: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  category: string;
  organization: string;
  tags: string[];
  notes: string;
  source: string;
  consentWhatsapp: boolean;
  consentEmail: boolean;
  createdAt: string;
  updatedAt: string;
}
interface Facets {
  total: number;
  withWhatsappConsent: number;
  withEmailConsent: number;
  cities: { value: string; count: number }[];
  categories: { value: string; count: number }[];
  tags: { value: string; count: number }[];
  categoryOptions: string[];
}

const PAGE = 50;
export const GENDERS = ['Masculino', 'Feminino', 'Não Quis Se Identificar'];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function ContatosModule({
  canManage,
  initialTag = '',
  initialCategory = '',
  onOpenImport,
  onOpenCategories,
}: {
  canManage: boolean;
  initialTag?: string;
  initialCategory?: string;
  onOpenImport: () => void;
  onOpenCategories: (tab: 'categorias' | 'etiquetas') => void;
}) {
  const dialog = useDialog();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [items, setItems] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [tag, setTag] = useState(initialTag);
  const [consent, setConsent] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  // Bulk selection: explicit ids, or every contact matching the current filters.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    setAllMatching(false);
  }, [debouncedQ, city, category, tag, consent]);

  const filterParams = useCallback(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set('q', debouncedQ);
    if (city) p.set('city', city);
    if (category) p.set('category', category);
    if (tag) p.set('tag', tag);
    if (consent) p.set('consent', consent);
    return p;
  }, [debouncedQ, city, category, tag, consent]);

  const loadFacets = useCallback(() => {
    api<Facets>('/tenant/db/contacts/facets').then(setFacets).catch(() => undefined);
    api<Taxonomy>('/tenant/db/taxonomy').then(setTaxonomy).catch(() => undefined);
  }, []);
  const tagColor = (name: string) => taxonomy?.tags.find((t) => t.name === name)?.color ?? 'teal';

  const load = useCallback(async () => {
    setLoading(true);
    const p = filterParams();
    p.set('limit', String(PAGE));
    p.set('offset', String(page * PAGE));
    try {
      const r = await api<{ total: number; items: Contact[] }>(`/tenant/db/contacts?${p}`);
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      dialog.alert({ title: 'Erro ao carregar contatos', message: (e as Error).message, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [filterParams, page, dialog]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadFacets();
  }, [loadFacets]);

  const refresh = () => {
    load();
    loadFacets();
  };
  const filtered = !!(debouncedQ || city || category || tag || consent);
  const pageIds = items.map((c) => c.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectionCount = allMatching ? total : selected.size;
  const toggleOne = (id: string) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => {
    setSelected(new Set());
    setAllMatching(false);
  };

  const deleteContacts = async (opts: { ids?: string[]; all?: boolean; single?: Contact }) => {
    const n = opts.single ? 1 : opts.all ? total : opts.ids!.length;
    const everything = opts.all && !filtered;
    const ok = await dialog.confirm({
      title: opts.single ? 'Excluir contato' : `Excluir ${n} contato${n === 1 ? '' : 's'}`,
      message: opts.single ? (
        <>
          Excluir <strong>{opts.single.name}</strong> do banco de contatos? Esta ação não pode ser desfeita.
        </>
      ) : everything ? (
        <>
          Você vai excluir <strong>TODOS os {n} contatos</strong> do gabinete. Esta ação não pode ser desfeita.
        </>
      ) : (
        <>
          Excluir <strong>{n} contato{n === 1 ? '' : 's'}</strong>
          {opts.all ? ' que correspondem aos filtros atuais' : ' selecionados'}? Esta ação não pode ser desfeita.
        </>
      ),
      confirmLabel: opts.single ? 'Excluir' : `Excluir ${n}`,
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      if (opts.single) {
        await api(`/tenant/db/contacts/${opts.single.id}`, { method: 'DELETE' });
      } else {
        const r = await api<{ deleted: number }>(
          `/tenant/db/contacts/bulk-delete${opts.all ? `?${filterParams()}` : ''}`,
          { method: 'POST', body: opts.all ? { allMatching: true } : { ids: opts.ids } }
        );
        dialog.toast(`${r.deleted} contato${r.deleted === 1 ? '' : 's'} excluído${r.deleted === 1 ? '' : 's'}.`);
      }
      if (opts.single) dialog.toast('Contato excluído.');
      clearSelection();
      if (page > 0 && n >= items.length) setPage(0);
      refresh();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível excluir', message: (e as Error).message, tone: 'danger' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={BookUser}
        title="Contatos"
        subtitle="Todos os contatos registrados no gabinete: cidadãos, lideranças, imprensa e parceiros"
        actions={
          <>
            <button className={btnGhost} onClick={() => onOpenCategories('categorias')}>
              <FolderTree className="w-3.5 h-3.5 text-[#176B80]" /> Categorias e etiquetas
            </button>
            <button className={btnGhost} onClick={onOpenImport}>
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#176B80]" /> Importar planilha
            </button>
            <button className={btnPrimary} onClick={() => setEditing('new')}>
              <Plus className="w-3.5 h-3.5 text-[#36B7A5]" /> Novo contato
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Users} label="Contatos" value={facets?.total ?? '—'} />
        <Stat icon={MessageCircle} label="WhatsApp autorizado" value={facets?.withWhatsappConsent ?? '—'} sub="com opt-in LGPD" />
        <Stat icon={Mail} label="E-mail autorizado" value={facets?.withEmailConsent ?? '—'} sub="com opt-in LGPD" />
        <Stat icon={MapPin} label="Municípios" value={facets?.cities.length ?? '—'} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-8`} placeholder="Buscar por nome, telefone, e-mail, bairro ou entidade" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inputAutoCls} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Todas as cidades</option>
          {facets?.cities.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>
        <select className={inputAutoCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {category && !facets?.categories.some((c) => c.value === category) && <option value={category}>{category}</option>}
          {facets?.categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>
        <select className={inputAutoCls} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Todas as etiquetas</option>
          {tag && !facets?.tags.some((t) => t.value === tag) && <option value={tag}>{tag}</option>}
          {facets?.tags.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value} ({t.count})
            </option>
          ))}
        </select>
        <select className={inputAutoCls} value={consent} onChange={(e) => setConsent(e.target.value)}>
          <option value="">Qualquer consentimento</option>
          <option value="whatsapp">Aceita WhatsApp</option>
          <option value="email">Aceita e-mail</option>
        </select>
      </div>

      {canManage && selectionCount > 0 && (
        <div className="bg-[#102C45] text-white rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs shadow-xs">
          <span className="font-semibold">
            {allMatching ? `Todos os ${total} contatos ${filtered ? 'do filtro' : 'do gabinete'} selecionados` : `${selected.size} selecionado${selected.size === 1 ? '' : 's'}`}
          </span>
          {!allMatching && pageAllSelected && total > selected.size && (
            <button className="underline underline-offset-2 text-[#36B7A5] font-semibold" onClick={() => setAllMatching(true)}>
              Selecionar todos os {total} contatos {filtered ? 'do filtro' : 'do gabinete'}
            </button>
          )}
          <button className="underline underline-offset-2 text-white/70 hover:text-white" onClick={clearSelection}>
            Limpar seleção
          </button>
          <button
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-lg font-semibold disabled:opacity-50"
            disabled={deleting}
            onClick={() => (allMatching ? deleteContacts({ all: true }) : deleteContacts({ ids: [...selected] }))}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Excluindo…' : 'Excluir selecionados'}
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              {canManage && (
                <th className="pl-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    className="rounded text-[#176B80] align-middle"
                    checked={allMatching || pageAllSelected}
                    onChange={togglePage}
                    disabled={!items.length}
                    aria-label="Selecionar todos desta página"
                  />
                </th>
              )}
              <th className="text-left font-semibold px-4 py-2.5">Nome</th>
              <th className="text-left font-semibold px-4 py-2.5">Telefone / WhatsApp</th>
              <th className="text-left font-semibold px-4 py-2.5">E-mail</th>
              <th className="text-left font-semibold px-4 py-2.5">Endereço</th>
              <th className="text-left font-semibold px-4 py-2.5">Etiquetas</th>
              <th className="text-left font-semibold px-4 py-2.5">Opt-in</th>
              {canManage && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={canManage ? 8 : 6} className="px-4 py-10 text-center text-slate-500">
                  {filtered ? (
                    'Nenhum contato encontrado com esses filtros.'
                  ) : (
                    <div className="space-y-2">
                      <p>Nenhum contato cadastrado ainda.</p>
                      <div className="flex justify-center gap-2">
                        <button className={btnGhost} onClick={onOpenImport}>
                          <FileSpreadsheet className="w-3.5 h-3.5" /> Importar planilha
                        </button>
                        <button className={btnPrimary} onClick={() => setEditing('new')}>
                          <Plus className="w-3.5 h-3.5" /> Cadastrar manualmente
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr
                key={c.id}
                className={`cursor-pointer ${allMatching || selected.has(c.id) ? 'bg-[#E9F1F4]/60' : 'hover:bg-slate-50/70'}`}
                onClick={() => setEditing(c)}
              >
                {canManage && (
                  <td className="pl-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded text-[#176B80] align-middle"
                      checked={allMatching || selected.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      aria-label={`Selecionar ${c.name}`}
                    />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="text-[10px] text-slate-500">{[c.category, c.organization].filter(Boolean).join(' · ') || '—'}</p>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                  {c.phone && <div>{fmtPhone(c.phone)}</div>}
                  {c.whatsapp && c.whatsapp !== c.phone && (
                    <div className="text-emerald-700 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {fmtPhone(c.whatsapp)}
                    </div>
                  )}
                  {!c.phone && !c.whatsapp && '—'}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{c.email || '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  <p className="truncate max-w-[240px]">{[c.street, c.number].filter(Boolean).join(', ') || '—'}</p>
                  <p className="text-[10px] text-slate-500">
                    {[c.neighborhood, [c.city, c.state].filter(Boolean).join('/'), fmtCep(c.zip)].filter(Boolean).join(' · ')}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                    {c.tags.slice(0, 3).map((t) => (
                      <Chip key={t} tone={tagColor(t)}>
                        {t}
                      </Chip>
                    ))}
                    {c.tags.length > 3 && <Chip tone="slate">+{c.tags.length - 3}</Chip>}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <span title={c.consentWhatsapp ? 'Aceita WhatsApp' : 'Sem consentimento para WhatsApp'}>
                      <MessageCircle className={`w-4 h-4 ${c.consentWhatsapp ? 'text-emerald-600' : 'text-slate-200'}`} />
                    </span>
                    <span title={c.consentEmail ? 'Aceita e-mail' : 'Sem consentimento para e-mail'}>
                      <Mail className={`w-4 h-4 ${c.consentEmail ? 'text-emerald-600' : 'text-slate-200'}`} />
                    </span>
                  </div>
                </td>
                {canManage && (
                  <td className="pr-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Excluir contato"
                      aria-label={`Excluir ${c.name}`}
                      onClick={() => deleteContacts({ single: c })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-500">
            <span>
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total} contatos
            </span>
            <div className="flex gap-1">
              <button className={btnGhost} disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button className={btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} aria-label="Próxima página">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <ContactModal
          contact={editing === 'new' ? null : editing}
          taxonomy={taxonomy}
          onOpenCategories={(tab) => {
            setEditing(null);
            onOpenCategories(tab);
          }}
          canDelete={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const EMPTY = {
  name: '', phone: '', whatsapp: '', email: '', birthDate: '', gender: '', street: '', number: '', complement: '',
  neighborhood: '', city: '', state: 'MT', zip: '', category: '', organization: '', tags: [] as string[], notes: '',
  consentWhatsapp: false, consentEmail: false,
};

function ContactModal({
  contact,
  taxonomy,
  onOpenCategories,
  canDelete,
  onClose,
  onSaved,
}: {
  contact: Contact | null;
  taxonomy: Taxonomy | null;
  onOpenCategories: (tab: 'categorias' | 'etiquetas') => void;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useDialog();
  const [f, setF] = useState(() =>
    contact ? { ...EMPTY, ...contact, phone: fmtPhone(contact.phone), whatsapp: fmtPhone(contact.whatsapp), zip: fmtCep(contact.zip) } : EMPTY
  );
  const [saving, setSaving] = useState(false);
  // CEP lookup: fills street, neighborhood, city and UF from ViaCEP/BrasilAPI (via our API).
  const [cepStatus, setCepStatus] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; msg?: string }>({ state: 'idle' });
  const lastCep = useRef(contact ? contact.zip : '');
  const numberRef = useRef<HTMLInputElement>(null);
  const onCepChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setF((p) => ({ ...p, zip: masked }));
    if (digits.length !== 8) {
      setCepStatus({ state: 'idle' });
      return;
    }
    if (digits === lastCep.current) return;
    lastCep.current = digits;
    setCepStatus({ state: 'loading' });
    try {
      const r = await api<{ street: string; neighborhood: string; city: string; state: string }>(`/tenant/db/cep/${digits}`);
      if (lastCep.current !== digits) return; // user typed another CEP meanwhile
      setF((p) => ({
        ...p,
        street: r.street || p.street,
        neighborhood: r.neighborhood || p.neighborhood,
        city: r.city || p.city,
        state: r.state || p.state,
      }));
      setCepStatus({ state: 'ok', msg: r.street ? 'Endereço preenchido pelo CEP.' : 'CEP geral da cidade: informe o logradouro.' });
      numberRef.current?.focus();
    } catch (e) {
      if (lastCep.current !== digits) return;
      lastCep.current = '';
      setCepStatus({ state: 'error', msg: e instanceof ApiError ? e.message : 'Não foi possível consultar o CEP.' });
    }
  };
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (contact) await api(`/tenant/db/contacts/${contact.id}`, { method: 'PATCH', body: f });
      else await api('/tenant/db/contacts', { method: 'POST', body: f });
      dialog.toast(contact ? 'Contato atualizado.' : 'Contato cadastrado.');
      onSaved();
    } catch (err) {
      dialog.alert({ title: 'Não foi possível salvar', message: (err as Error).message, tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!contact) return;
    const ok = await dialog.confirm({
      title: 'Excluir contato',
      message: (
        <>
          Excluir <strong>{contact.name}</strong> do banco de contatos? Esta ação não pode ser desfeita.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/tenant/db/contacts/${contact.id}`, { method: 'DELETE' });
      dialog.toast('Contato excluído.');
      onSaved();
    } catch (err) {
      dialog.alert({ title: 'Não foi possível excluir', message: (err as Error).message, tone: 'danger' });
    }
  };

  return (
    <Modal
      title={contact ? contact.name : 'Novo contato'}
      onClose={onClose}
      footer={
        <>
          {contact && canDelete && (
            <button className={`${btnDanger} mr-auto`} onClick={remove}>
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          )}
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={() => save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar contato'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-5">
        <section className="space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#176B80]">Identificação</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Nome completo *" className="col-span-2 sm:col-span-4">
              <input className={inputCls} value={f.name} onChange={set('name')} required autoFocus />
            </Field>
            <div className="col-span-2 space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="contact-category" className="text-[11px] font-semibold text-slate-700">
                  Categoria
                </label>
                <button type="button" onClick={() => onOpenCategories('categorias')} className="text-[10px] text-[#176B80] hover:underline font-semibold">
                  Gerenciar categorias
                </button>
              </div>
              <select id="contact-category" className={inputCls} value={f.category} onChange={set('category')}>
                <option value="">— Sem categoria —</option>
                {taxonomy?.categories.map((c) => (
                  <option key={c.id} value={c.name} title={c.description}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Organização / Entidade" className="col-span-2">
              <input className={inputCls} value={f.organization} onChange={set('organization')} />
            </Field>
            <Field label="Data de nascimento">
              <input className={inputCls} type="date" value={f.birthDate} onChange={set('birthDate')} />
            </Field>
            <Field label="Gênero">
              <select className={inputCls} value={f.gender} onChange={set('gender')}>
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#176B80]">Contato</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Telefone">
              <input className={inputCls} value={f.phone} onChange={set('phone')} placeholder="(65) 3333-4444" inputMode="tel" />
            </Field>
            <Field label="WhatsApp">
              <input className={inputCls} value={f.whatsapp} onChange={set('whatsapp')} placeholder="(65) 99999-0000" inputMode="tel" />
            </Field>
            <Field label="E-mail" className="col-span-2 sm:col-span-1">
              <input className={inputCls} type="email" value={f.email} onChange={set('email')} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={f.consentWhatsapp} onChange={set('consentWhatsapp')} className="rounded text-[#176B80]" />
              Aceita receber mensagens por WhatsApp
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={f.consentEmail} onChange={set('consentEmail')} className="rounded text-[#176B80]" />
              Aceita receber e-mails
            </label>
            <span className="text-[10px] text-slate-500 w-full">LGPD: marque apenas com consentimento registrado do titular.</span>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#176B80]">Endereço</h4>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="col-span-1 sm:col-span-2 space-y-1">
              <label htmlFor="contact-cep" className="block text-[11px] font-semibold text-slate-700">
                CEP
              </label>
              <div className="relative">
                <input
                  id="contact-cep"
                  className={`${inputCls} pr-8`}
                  value={f.zip}
                  onChange={(e) => onCepChange(e.target.value)}
                  placeholder="78000-000"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  aria-describedby="contact-cep-status"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {cepStatus.state === 'loading' && <Loader2 className="w-3.5 h-3.5 text-[#176B80] animate-spin" />}
                  {cepStatus.state === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                </span>
              </div>
              <span
                id="contact-cep-status"
                aria-live="polite"
                className={`block text-[10px] ${cepStatus.state === 'error' ? 'text-amber-700' : 'text-slate-500'}`}
              >
                {cepStatus.state === 'loading' ? 'Buscando endereço…' : cepStatus.msg ?? 'Digite o CEP para preencher o endereço.'}
              </span>
            </div>
            <Field label="Endereço" className="col-span-2 sm:col-span-4">
              <input className={inputCls} value={f.street} onChange={set('street')} placeholder="Rua, avenida…" />
            </Field>
            <Field label="Número" className="sm:col-span-1">
              <input ref={numberRef} className={inputCls} value={f.number} onChange={set('number')} />
            </Field>
            <Field label="Complemento" className="sm:col-span-2">
              <input className={inputCls} value={f.complement} onChange={set('complement')} />
            </Field>
            <Field label="Bairro" className="col-span-2 sm:col-span-3">
              <input className={inputCls} value={f.neighborhood} onChange={set('neighborhood')} />
            </Field>
            <Field label="Cidade" className="col-span-2 sm:col-span-4">
              <input className={inputCls} value={f.city} onChange={set('city')} />
            </Field>
            <Field label="UF" className="sm:col-span-2">
              <select className={inputCls} value={f.state} onChange={set('state')}>
                <option value="">—</option>
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#176B80] flex items-center gap-1.5">
            <Tags className="w-3.5 h-3.5" /> Classificação
          </h4>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700">Etiquetas</span>
              <button type="button" onClick={() => onOpenCategories('etiquetas')} className="text-[10px] text-[#176B80] hover:underline font-semibold">
                Gerenciar etiquetas
              </button>
            </div>
            <TagPicker
              options={taxonomy?.tags ?? []}
              value={f.tags}
              onChange={(tags) => setF((p) => ({ ...p, tags }))}
              emptyHint="Nenhuma etiqueta cadastrada. Crie em Banco de Dados › Categorias › Etiquetas de Classificação."
            />
            <span className="block text-[10px] text-slate-500">Clique para marcar ou desmarcar. Usadas para segmentar envios.</span>
          </div>
          <Field label="Observações">
            <textarea className={`${inputCls} min-h-[70px]`} value={f.notes} onChange={set('notes')} />
          </Field>
          {contact && (
            <p className="text-[10px] text-slate-400">
              Origem: {contact.source.startsWith('import:') ? 'importação de planilha' : contact.source} · cadastrado em{' '}
              {new Date(contact.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}
            </p>
          )}
        </section>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
