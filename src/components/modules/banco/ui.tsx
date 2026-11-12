/** Shared UI primitives for the "Banco de Dados" modules (same palette as the rest of Parlamenta). */
import React, { useState } from 'react';
import { X } from 'lucide-react';

export const inputCls =
  'w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80] focus:border-[#176B80] disabled:bg-slate-50';
/** Same look as inputCls but sized to its content (for filter bars). */
export const inputAutoCls = inputCls.replace('w-full ', 'w-auto ');
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#102C45] hover:bg-[#176B80] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg transition-colors';

export function ModuleHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Icon className="w-5 h-5 text-[#176B80]" />
          {title}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="block text-[11px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} max-h-[92vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-bold text-slate-900 min-w-0 truncate">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex flex-wrap justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/** Tag colors chosen in Banco de Dados › Categorias › Etiquetas. */
export const TAG_COLORS: Record<string, { chip: string; dot: string; label: string }> = {
  teal: { chip: 'bg-[#E9F1F4] text-[#176B80]', dot: 'bg-[#36B7A5]', label: 'Turquesa' },
  navy: { chip: 'bg-[#102C45] text-white', dot: 'bg-[#102C45]', label: 'Azul institucional' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Verde' },
  amber: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', label: 'Âmbar' },
  rose: { chip: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500', label: 'Vermelho' },
  violet: { chip: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500', label: 'Violeta' },
  sky: { chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500', label: 'Azul claro' },
  slate: { chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', label: 'Cinza' },
};

export function Chip({ children, tone = 'teal', onRemove }: { children: React.ReactNode; tone?: string; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${(TAG_COLORS[tone] ?? TAG_COLORS.teal!).chip}`}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:opacity-70" aria-label="Remover">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export interface TaxonomyTag {
  id: string;
  name: string;
  color: string;
  description: string;
  count: number;
}
export interface TaxonomyCategory {
  id: string;
  name: string;
  description: string;
  count: number;
}
export interface PropositionType {
  id: string;
  name: string;
  acronym: string;
  description: string;
}
/** Item de lista simples do gabinete (canal de entrada, tema de demanda). */
export interface EntryChannel {
  id: string;
  name: string;
  description: string;
}
export interface Taxonomy {
  categories: TaxonomyCategory[];
  tags: TaxonomyTag[];
  propositionTypes: PropositionType[];
  entryChannels: EntryChannel[];
  demandThemes: EntryChannel[];
  colors: string[];
}

/** Picks from the cabinet's registered tags only (controlled vocabulary). */
export function TagPicker({
  options,
  value,
  onChange,
  emptyHint,
}: {
  options: TaxonomyTag[];
  value: string[];
  onChange: (v: string[]) => void;
  emptyHint?: React.ReactNode;
}) {
  const [filter, setFilter] = useState('');
  if (!options.length) return <div className="text-[11px] text-slate-500 p-2.5 rounded-lg border border-dashed border-slate-200">{emptyHint ?? 'Nenhuma etiqueta cadastrada.'}</div>;
  const f = filter.trim().toLowerCase();
  const shown = options.filter((o) => !f || o.name.toLowerCase().includes(f));
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  return (
    <div className="rounded-lg border border-slate-200 p-2 space-y-2">
      {options.length > 12 && (
        <input className={`${inputCls} py-1.5`} placeholder="Filtrar etiquetas…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        {shown.map((o) => {
          const on = value.includes(o.name);
          const c = TAG_COLORS[o.color] ?? TAG_COLORS.teal!;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.name)}
              title={o.description || undefined}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                on ? `${c.chip} border-transparent ring-1 ring-[#176B80]/40` : 'bg-white text-slate-600 border-slate-200 hover:border-[#176B80]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              {o.name}
            </button>
          );
        })}
        {shown.length === 0 && <span className="text-[11px] text-slate-400 px-1">Nenhuma etiqueta encontrada.</span>}
      </div>
      {value.length > 0 && <p className="text-[10px] text-slate-500">{value.length} selecionada{value.length === 1 ? '' : 's'}</p>}
    </div>
  );
}

/** Free-text tag editor: Enter, comma or semicolon adds a tag. */
export function TagInput({ value, onChange, placeholder, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 40));
    onChange(next);
    setDraft('');
  };
  const listId = React.useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus-within:ring-1 focus-within:ring-[#176B80] focus-within:border-[#176B80] min-h-[34px]">
      {value.map((t) => (
        <Chip key={t} onRemove={() => onChange(value.filter((x) => x !== t))}>
          {t}
        </Chip>
      ))}
      <input
        className="flex-1 min-w-[120px] text-xs outline-hidden bg-transparent py-0.5"
        value={draft}
        list={suggestions.length ? listId : undefined}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (/[;,]/.test(e.target.value) ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft.trim()) add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-[#176B80]" />
      </div>
      <div className="text-xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export const fmtPhone = (d: string) =>
  !d ? '' : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;
export const fmtCep = (d: string) => (d && d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
export const fmtDateBr = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}
