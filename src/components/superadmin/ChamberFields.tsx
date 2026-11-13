/** Campos da casa legislativa do gabinete (Admin da plataforma): esfera, UF, município e cadeiras. */
import React from 'react';
import { Building2, Landmark, Castle } from 'lucide-react';
import {
  UFS,
  MUNICIPAL_BRACKETS,
  FEDERAL_SEATS,
  stateAssemblySeats,
  defaultHouse,
  defaultSeats,
  seatLimits,
  type Sphere,
} from '../../lib/chamber';
import { MunicipioAutocomplete } from '../common/MunicipioAutocomplete';

export interface ChamberValue {
  sphere: Sphere;
  state: string;
  city: string;
  seats: number;
  house: string;
}

const inputCls =
  'w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#176B80] focus:border-[#176B80]';

const SPHERES: { id: Sphere; label: string; house: string; icon: React.ElementType }[] = [
  { id: 'municipal', label: 'Municipal', house: 'Câmara Municipal · vereadores', icon: Building2 },
  { id: 'estadual', label: 'Estadual', house: 'Assembleia Legislativa · deputados estaduais', icon: Landmark },
  { id: 'federal', label: 'Federal', house: 'Câmara dos Deputados · 513 deputados', icon: Castle },
];

/** Valor inicial ao trocar de esfera/UF/município: cadeiras e casa voltam ao padrão. */
export function chamberDefaults(sphere: Sphere, state: string, city: string): Pick<ChamberValue, 'seats' | 'house'> {
  return { seats: defaultSeats(sphere, state), house: defaultHouse(sphere, state, city) };
}

export function ChamberFields({ value, onChange }: { value: ChamberValue; onChange: (v: ChamberValue) => void }) {
  const v = value;
  const reset = (patch: Partial<ChamberValue>) => {
    const next = { ...v, ...patch };
    onChange({ ...next, ...chamberDefaults(next.sphere, next.state, next.city), ...('seats' in patch ? { seats: patch.seats! } : {}) });
  };
  const lim = seatLimits(v.sphere, v.state);
  const bracket = MUNICIPAL_BRACKETS.find((b) => b.seats >= v.seats) ?? MUNICIPAL_BRACKETS[MUNICIPAL_BRACKETS.length - 1]!;
  const stateSeats = stateAssemblySeats(v.state);

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-[11px] font-semibold text-slate-700 mb-1">Esfera</span>
        <div className="grid grid-cols-3 gap-2">
          {SPHERES.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => s.id !== v.sphere && reset({ sphere: s.id, city: s.id === 'municipal' ? v.city : '' })}
              className={`text-left p-2.5 rounded-lg border transition-colors ${
                v.sphere === s.id ? 'border-[#176B80] bg-[#E9F1F4] ring-1 ring-[#176B80]' : 'border-slate-200 hover:bg-slate-50'
              }`}
              aria-pressed={v.sphere === s.id}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <s.icon className="w-3.5 h-3.5 text-[#176B80]" /> {s.label}
              </span>
              <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">{s.house}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="block text-[11px] font-semibold text-slate-700">{v.sphere === 'federal' ? 'UF representada' : 'UF'}</span>
          <select className={inputCls} value={v.state} onChange={(e) => reset({ state: e.target.value, city: v.sphere === 'municipal' ? '' : v.city })}>
            {UFS.map((u) => (
              <option key={u.uf} value={u.uf}>
                {u.uf} · {u.name}
              </option>
            ))}
          </select>
        </label>

        {v.sphere === 'municipal' ? (
          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-slate-700">Município</span>
            <MunicipioAutocomplete
              className={inputCls}
              preferUf={v.state}
              value={v.city}
              onChange={(val) => {
                const m = val.match(/^(.*)\s+-\s+([A-Z]{2})$/);
                if (m) reset({ city: m[1]!, state: m[2]!, seats: v.seats });
                else onChange({ ...v, city: val });
              }}
            />
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-slate-700">Cadeiras no plenário</span>
            <input
              className={inputCls}
              type="number"
              min={lim.min}
              max={lim.max}
              value={v.seats}
              onChange={(e) => onChange({ ...v, seats: Number(e.target.value) })}
            />
            <span className="block text-[10px] text-slate-500">
              {v.sphere === 'federal'
                ? `Câmara dos Deputados: ${FEDERAL_SEATS} cadeiras.`
                : v.state === 'DF'
                  ? 'Câmara Legislativa do DF: 24 deputados distritais.'
                  : `CF art. 27: ${stateSeats} deputados estaduais para ${v.state}.`}
            </span>
          </label>
        )}
      </div>

      {v.sphere === 'municipal' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-slate-700">Faixa populacional</span>
            <select
              className={inputCls}
              value={bracket.seats}
              onChange={(e) => onChange({ ...v, seats: Number(e.target.value) })}
            >
              {MUNICIPAL_BRACKETS.map((b) => (
                <option key={b.seats} value={b.seats}>
                  {b.label} · até {b.seats} vereadores
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-slate-700">Nº de vereadores (Lei Orgânica)</span>
            <input
              className={inputCls}
              type="number"
              min={lim.min}
              max={lim.max}
              value={v.seats}
              onChange={(e) => onChange({ ...v, seats: Number(e.target.value) })}
            />
            <span className={`block text-[10px] ${v.seats > bracket.seats ? 'text-rose-600' : 'text-slate-500'}`}>
              CF art. 29, IV: máximo de {bracket.seats} para a faixa escolhida.
            </span>
          </label>
        </div>
      )}

      <label className="block space-y-1">
        <span className="block text-[11px] font-semibold text-slate-700">Casa legislativa</span>
        <input className={inputCls} value={v.house} onChange={(e) => onChange({ ...v, house: e.target.value })} placeholder={defaultHouse(v.sphere, v.state, v.city)} />
      </label>
    </div>
  );
}
