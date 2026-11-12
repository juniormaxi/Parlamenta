import React, { useCallback, useEffect, useState } from 'react';
import { FolderTree, Pencil, Plus, Search, Tags, Trash2, Users, Lock, FileSignature } from 'lucide-react';
import { api } from '../../../lib/api';
import { useDialog } from '../../common/Dialogs';
import {
  ModuleHeader,
  Modal,
  Field,
  Chip,
  inputCls,
  btnPrimary,
  btnGhost,
  TAG_COLORS,
  type Taxonomy,
  type TaxonomyCategory,
  type TaxonomyTag,
  type PropositionType,
} from './ui';

export type CategoriasTab = 'categorias' | 'etiquetas' | 'tipos';
type Tab = CategoriasTab;

export function CategoriasModule({
  canManage,
  initialTab = 'categorias',
  onOpenContacts,
}: {
  canManage: boolean;
  initialTab?: Tab;
  onOpenContacts: (filter: { tag?: string; category?: string }) => void;
}) {
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [tx, setTx] = useState<Taxonomy | null>(null);
  const [q, setQ] = useState('');
  const [editingCat, setEditingCat] = useState<TaxonomyCategory | 'new' | null>(null);
  const [editingTag, setEditingTag] = useState<TaxonomyTag | 'new' | null>(null);
  const [editingType, setEditingType] = useState<PropositionType | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setTx(await api<Taxonomy>('/tenant/db/taxonomy'));
    } catch (e) {
      dialog.alert({ title: 'Erro ao carregar', message: (e as Error).message, tone: 'danger' });
    }
  }, [dialog]);
  useEffect(() => {
    load();
  }, [load]);

  const f = q.trim().toLowerCase();
  const cats = (tx?.categories ?? []).filter((c) => !f || c.name.toLowerCase().includes(f) || c.description.toLowerCase().includes(f));
  const tags = (tx?.tags ?? []).filter((t) => !f || t.name.toLowerCase().includes(f) || t.description.toLowerCase().includes(f));
  const types = (tx?.propositionTypes ?? []).filter(
    (t) => !f || t.name.toLowerCase().includes(f) || t.acronym.toLowerCase().includes(f) || t.description.toLowerCase().includes(f)
  );

  const removeType = async (t: PropositionType) => {
    const ok = await dialog.confirm({
      title: 'Excluir tipo de proposição',
      message: (
        <>
          Excluir o tipo <strong>{t.name}</strong>? Ele deixará de aparecer ao elaborar novos documentos. Documentos já criados não são alterados.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/tenant/db/proposition-types/${t.id}`, { method: 'DELETE' });
      dialog.toast('Tipo de proposição excluído.');
      load();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível excluir', message: (e as Error).message, tone: 'danger' });
    }
  };

  const removeCategory = async (c: TaxonomyCategory) => {
    const ok = await dialog.confirm({
      title: 'Excluir categoria',
      message: (
        <>
          Excluir a categoria <strong>{c.name}</strong>?
          {c.count > 0 && (
            <>
              {' '}
              {c.count === 1 ? '1 contato ficará' : `${c.count} contatos ficarão`} sem categoria.
            </>
          )}
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/tenant/db/categories/${c.id}`, { method: 'DELETE' });
      dialog.toast('Categoria excluída.');
      load();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível excluir', message: (e as Error).message, tone: 'danger' });
    }
  };

  const removeTag = async (t: TaxonomyTag) => {
    const ok = await dialog.confirm({
      title: 'Excluir etiqueta',
      message: (
        <>
          Excluir a etiqueta <strong>{t.name}</strong>?
          {t.count > 0 && <> Ela será removida de {t.count === 1 ? '1 contato' : `${t.count} contatos`}.</>}
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/tenant/db/tags/${t.id}`, { method: 'DELETE' });
      dialog.toast('Etiqueta excluída.');
      load();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível excluir', message: (e as Error).message, tone: 'danger' });
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'categorias', label: 'Categorias de Contatos', icon: FolderTree, count: tx?.categories.length },
    { id: 'etiquetas', label: 'Etiquetas de Classificação', icon: Tags, count: tx?.tags.length },
    { id: 'tipos', label: 'Tipos de Proposição', icon: FileSignature, count: tx?.propositionTypes.length },
  ];
  const newLabel = { categorias: 'Nova categoria', etiquetas: 'Nova etiqueta', tipos: 'Novo tipo de proposição' }[tab];
  const openNew = () => (tab === 'categorias' ? setEditingCat('new') : tab === 'etiquetas' ? setEditingTag('new') : setEditingType('new'));

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={FolderTree}
        title="Categorias"
        subtitle="Defina categorias e etiquetas de contatos e os tipos de proposição usados nos documentos do gabinete"
        actions={
          canManage && (
            <button className={btnPrimary} onClick={openNew}>
              <Plus className="w-3.5 h-3.5 text-[#36B7A5]" /> {newLabel}
            </button>
          )
        }
      />

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3">
          <div className="flex gap-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-[#176B80] text-[#102C45]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count !== undefined && (
                  <span className={`px-1.5 rounded-full text-[10px] ${tab === t.id ? 'bg-[#E9F1F4] text-[#176B80]' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64 pb-2 sm:pb-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 sm:translate-y-[-50%]" />
            <input className={`${inputCls} pl-8 py-1.5`} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {!canManage && (
          <p className="px-4 py-2 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Somente Parlamentar, Chefe de Gabinete ou Coordenação podem criar, editar ou excluir.
          </p>
        )}

        {tab === 'tipos' ? (
          <p className="px-4 pt-3 text-[11px] text-slate-500">
            Tipos disponíveis em <strong>Documentos do Gabinete › Redigir Novo Documento</strong>. A sigla compõe o número do documento (ex.: OF-123/2026-GAB).
          </p>
        ) : tab === 'categorias' ? (
          <p className="px-4 pt-3 text-[11px] text-slate-500">
            Cada contato pertence a <strong>uma</strong> categoria (perfil). Estas opções aparecem no campo “Categoria” do cadastro de contatos.
          </p>
        ) : (
          <p className="px-4 pt-3 text-[11px] text-slate-500">
            Um contato pode ter <strong>várias</strong> etiquetas (temas de interesse, origem, bairro, evento). Elas aparecem em “Classificação” no cadastro e
            servem para segmentar envios.
          </p>
        )}

        {tab === 'tipos' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-2">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Tipo de proposição</th>
                  <th className="text-left font-semibold px-4 py-2.5">Sigla</th>
                  <th className="text-left font-semibold px-4 py-2.5">Descrição</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{t.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#E9F1F4] text-[#176B80] font-semibold">{t.acronym}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{t.description || <span className="text-slate-300">—</span>}</td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <RowActions onEdit={() => setEditingType(t)} onDelete={() => removeType(t)} />
                      </td>
                    )}
                  </tr>
                ))}
                {tx && types.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                      {f ? 'Nada encontrado.' : 'Nenhum tipo de proposição cadastrado.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs mt-2">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left font-semibold px-4 py-2.5">{tab === 'categorias' ? 'Categoria' : 'Etiqueta'}</th>
                <th className="text-left font-semibold px-4 py-2.5">Descrição</th>
                <th className="text-left font-semibold px-4 py-2.5">Em uso</th>
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tab === 'categorias' &&
                cats.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.description || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <UsageButton count={c.count} onClick={() => onOpenContacts({ category: c.name })} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <RowActions onEdit={() => setEditingCat(c)} onDelete={() => removeCategory(c)} />
                      </td>
                    )}
                  </tr>
                ))}
              {tab === 'etiquetas' &&
                tags.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <Chip tone={t.color}>{t.name}</Chip>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{t.description || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <UsageButton count={t.count} onClick={() => onOpenContacts({ tag: t.name })} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <RowActions onEdit={() => setEditingTag(t)} onDelete={() => removeTag(t)} />
                      </td>
                    )}
                  </tr>
                ))}
              {tx && (tab === 'categorias' ? cats : tags).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    {f ? 'Nada encontrado.' : tab === 'categorias' ? 'Nenhuma categoria cadastrada.' : 'Nenhuma etiqueta cadastrada.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {editingType && (
        <PropositionTypeModal
          item={editingType === 'new' ? null : editingType}
          onClose={() => setEditingType(null)}
          onSaved={() => {
            setEditingType(null);
            load();
          }}
        />
      )}

      {editingCat && (
        <CategoryModal
          item={editingCat === 'new' ? null : editingCat}
          onClose={() => setEditingCat(null)}
          onSaved={() => {
            setEditingCat(null);
            load();
          }}
        />
      )}
      {editingTag && tx && (
        <TagModal
          item={editingTag === 'new' ? null : editingTag}
          colors={tx.colors}
          onClose={() => setEditingTag(null)}
          onSaved={() => {
            setEditingTag(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UsageButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (!count) return <span className="text-slate-400">Nenhum contato</span>;
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[#176B80] hover:underline font-semibold" title="Ver contatos">
      <Users className="w-3 h-3" />
      {count} contato{count === 1 ? '' : 's'}
    </button>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <button className={btnGhost} onClick={onEdit} title="Editar" aria-label="Editar">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button className={btnGhost} onClick={onDelete} title="Excluir" aria-label="Excluir">
        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
      </button>
    </div>
  );
}

function CategoryModal({ item, onClose, onSaved }: { item: TaxonomyCategory | null; onClose: () => void; onSaved: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [saving, setSaving] = useState(false);
  const renamed = item && name.trim() && name.trim() !== item.name;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (item) await api(`/tenant/db/categories/${item.id}`, { method: 'PATCH', body: { name, description } });
      else await api('/tenant/db/categories', { method: 'POST', body: { name, description } });
      dialog.toast(item ? 'Categoria atualizada.' : 'Categoria criada.');
      onSaved();
    } catch (err) {
      dialog.alert({ title: 'Não foi possível salvar', message: (err as Error).message, tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={item ? 'Editar categoria' : 'Nova categoria de contato'}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={() => save()} disabled={saving || !name.trim()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-3">
        <Field label="Nome *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="Ex.: Liderança Religiosa" />
        </Field>
        <Field label="Descrição" hint="Ajuda a equipe a escolher a categoria certa.">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        {renamed && item!.count > 0 && (
          <p className="text-[11px] text-[#102C45] bg-[#E9F1F4]/60 border border-[#E9F1F4] rounded-lg p-2">
            {item!.count === 1 ? 'O contato desta categoria será atualizado' : `Os ${item!.count} contatos desta categoria serão atualizados`} para o novo nome.
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function TagModal({ item, colors, onClose, onSaved }: { item: TaxonomyTag | null; colors: string[]; onClose: () => void; onSaved: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(item?.name ?? '');
  const [color, setColor] = useState(item?.color ?? 'teal');
  const [description, setDescription] = useState(item?.description ?? '');
  const [saving, setSaving] = useState(false);
  const renamed = item && name.trim() && name.trim() !== item.name;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (item) await api(`/tenant/db/tags/${item.id}`, { method: 'PATCH', body: { name, color, description } });
      else await api('/tenant/db/tags', { method: 'POST', body: { name, color, description } });
      dialog.toast(item ? 'Etiqueta atualizada.' : 'Etiqueta criada.');
      onSaved();
    } catch (err) {
      dialog.alert({ title: 'Não foi possível salvar', message: (err as Error).message, tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={item ? 'Editar etiqueta' : 'Nova etiqueta de classificação'}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={() => save()} disabled={saving || !name.trim()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-3">
        <Field label="Nome *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus placeholder="Ex.: Bairro Jardim Itália" />
        </Field>
        <div>
          <span className="block text-[11px] font-semibold text-slate-700 mb-1.5">Cor</span>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const t = TAG_COLORS[c] ?? TAG_COLORS.teal!;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  title={t.label}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] ${color === c ? 'border-[#176B80] ring-1 ring-[#176B80]/40' : 'border-slate-200'}`}
                >
                  <span className={`w-3 h-3 rounded-full ${t.dot}`} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Descrição">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          Prévia: <Chip tone={color}>{name.trim() || 'Etiqueta'}</Chip>
        </div>
        {renamed && item!.count > 0 && (
          <p className="text-[11px] text-[#102C45] bg-[#E9F1F4]/60 border border-[#E9F1F4] rounded-lg p-2">
            A etiqueta será renomeada em {item!.count === 1 ? '1 contato' : `${item!.count} contatos`}.
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function PropositionTypeModal({ item, onClose, onSaved }: { item: PropositionType | null; onClose: () => void; onSaved: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(item?.name ?? '');
  const [acronym, setAcronym] = useState(item?.acronym ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = { name, acronym, description };
      if (item) await api(`/tenant/db/proposition-types/${item.id}`, { method: 'PATCH', body });
      else await api('/tenant/db/proposition-types', { method: 'POST', body });
      dialog.toast(item ? 'Tipo de proposição atualizado.' : 'Tipo de proposição criado.');
      onSaved();
    } catch (err) {
      dialog.alert({ title: 'Não foi possível salvar', message: (err as Error).message, tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={item ? 'Editar tipo de proposição' : 'Novo tipo de proposição'}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={() => save()} disabled={saving || !name.trim() || !acronym.trim()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nome *" className="col-span-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="Ex.: Moção de Aplauso" />
          </Field>
          <Field label="Sigla *" hint="Prefixo do número do documento.">
            <input
              className={`${inputCls} font-mono uppercase`}
              value={acronym}
              onChange={(e) => setAcronym(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              placeholder="MOC"
            />
          </Field>
        </div>
        <Field label="Descrição">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <p className="text-[11px] text-slate-500">
          Exemplo de numeração: <span className="font-mono text-slate-700">{acronym || 'SIGLA'}-123/{new Date().getFullYear()}-GAB</span>
        </p>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
