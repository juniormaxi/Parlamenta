import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

/** "Nome|UF" — lista oficial do IBGE (localidades/municipios), carregada sob demanda. */
type Municipio = { nome: string; uf: string; key: string };

let cache: Promise<Municipio[]> | null = null;
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function loadMunicipios(): Promise<Municipio[]> {
  cache ??= import('../../data/municipios-br.json').then((m) =>
    (m.default as string[]).map((s) => {
      const [nome, uf] = s.split('|');
      return { nome, uf, key: fold(nome) };
    })
  );
  return cache;
}

export const formatMunicipio = (nome: string, uf: string) => `${nome} - ${uf}`;

const MAX_RESULTS = 12;

export function MunicipioAutocomplete({
  value,
  onChange,
  preferUf = 'MT',
  placeholder = 'Digite o nome do município',
  className = '',
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  /** UF cujos municípios aparecem primeiro quando há nomes iguais ou parecidos. */
  preferUf?: string;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [all, setAll] = useState<Municipio[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadMunicipios().then((m) => alive && setAll(m));
    return () => {
      alive = false;
    };
  }, []);

  const results = useMemo(() => {
    const q = fold(value.replace(/\s+-\s+[A-Za-z]{2}$/, ''));
    if (!all || !q) return [];
    const ranked: [number, Municipio][] = [];
    for (const m of all) {
      const i = m.key.indexOf(q);
      if (i < 0) continue;
      // 0 = nome exato, 1 = começa com, 2 = palavra começa com, 3 = contém
      const rank = m.key === q ? 0 : i === 0 ? 1 : m.key[i - 1] === ' ' ? 2 : 3;
      ranked.push([rank * 2 + (m.uf === preferUf ? 0 : 1), m]);
    }
    ranked.sort((a, b) => a[0] - b[0] || a[1].nome.localeCompare(b[1].nome, 'pt-BR') || a[1].uf.localeCompare(b[1].uf));
    return ranked.slice(0, MAX_RESULTS).map((r) => r[1]);
  }, [all, value, preferUf]);

  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (m: Municipio) => {
    onChange(formatMunicipio(m.nome, m.uf));
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && value.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={className}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg text-xs py-1"
        >
          {!all && <li className="px-3 py-2 text-slate-400">Carregando municípios…</li>}
          {all && results.length === 0 && <li className="px-3 py-2 text-slate-400">Nenhum município encontrado.</li>}
          {results.map((m, i) => (
            <li
              key={`${m.nome}|${m.uf}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer ${
                i === active ? 'bg-[#E9F1F4] text-[#102C45]' : 'text-slate-700'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                {m.nome}
              </span>
              <span className="font-mono text-[10px] text-slate-500 shrink-0">{m.uf}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
