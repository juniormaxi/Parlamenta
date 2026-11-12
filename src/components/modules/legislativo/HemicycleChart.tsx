/**
 * Classic parliament (hemicycle) diagram: one dot per seat, arranged in concentric rows and
 * filled left→right by group, so each group reads as a wedge. Below it, a results table.
 * Seats are allocated per row in proportion to the row's radius (largest-remainder rounding),
 * then all seats are sorted by angle — the standard "parliament diagram" layout.
 */
import React, { useMemo, useState } from 'react';
import type { Parliamentarian } from '../../../types';

export interface HemicycleGroup {
  key: string;
  label: string;
  color: string;
  /** Hollow dots (e.g. "Ausente"): a shape cue in addition to color. */
  hollow?: boolean;
  members: Parliamentarian[];
  /** Extra text for the table row (e.g. the parties folded into "Outros"). */
  detail?: string;
  /** Optional secondary column for the table (e.g. the party's bloc). */
  note?: string;
}

/**
 * Tight packing in "seat units" (1 = distance between neighbouring seats): rows are 1 unit apart and
 * seats ~1 unit apart along each arc, like a classic parliament chart. The fewest rows that fit N seats
 * are used, so small chambers produce a compact hemicycle instead of a few huge dots.
 */
const DOT = 0.4; // dot radius in seat units (dots nearly touch)
const PX_PER_UNIT = 26; // on-screen size of one seat unit at most

function layout(n: number) {
  if (n <= 0) return { seats: [] as { x: number; y: number; angle: number; r: number }[], outer: 1, inner: 1 };
  let rows = 1;
  let r0 = 1;
  for (rows = 1; rows < 40; rows++) {
    r0 = Math.max(1.2, rows * 0.8);
    let cap = 0;
    for (let i = 0; i < rows; i++) cap += Math.floor(Math.PI * (r0 + i)) + 1;
    if (cap >= n) break;
  }
  const radii = Array.from({ length: rows }, (_, i) => r0 + i);
  const sum = radii.reduce((a, b) => a + b, 0);
  const exact = radii.map((r) => (n * r) / sum);
  const perRow = exact.map(Math.floor);
  let left = n - perRow.reduce((a, b) => a + b, 0);
  exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(({ i }) => {
      if (left > 0) {
        perRow[i]!++;
        left--;
      }
    });
  const seats: { x: number; y: number; angle: number; r: number }[] = [];
  radii.forEach((r, i) => {
    const k = perRow[i]!;
    for (let j = 0; j < k; j++) {
      const angle = k === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (k - 1);
      seats.push({ x: r * Math.cos(angle), y: -r * Math.sin(angle), angle, r });
    }
  });
  // Fill order: left to right by angle; inner rows first on ties → each group becomes a wedge.
  seats.sort((a, b) => b.angle - a.angle || a.r - b.r);
  return { seats, outer: r0 + rows - 1, inner: r0 };
}

export function HemicycleChart({
  groups,
  selectedId,
  mandateId,
  isDimmed,
  onSelect,
  groupHeading,
  showNote,
}: {
  groups: HemicycleGroup[];
  selectedId?: string;
  mandateId?: string;
  /** Seats not matching the page filters are faded, not removed. */
  isDimmed?: (p: Parliamentarian) => boolean;
  onSelect: (p: Parliamentarian) => void;
  groupHeading: string;
  showNote?: string;
}) {
  const [hoverSeat, setHoverSeat] = useState<number | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const total = groups.reduce((a, g) => a + g.members.length, 0);
  const { seats, outer } = useMemo(() => layout(total), [total]);

  const assigned = useMemo(() => {
    const out: { p: Parliamentarian; g: HemicycleGroup }[] = [];
    groups.forEach((g) => g.members.forEach((p) => out.push({ p, g })));
    return out;
  }, [groups]);

  const hovered = hoverSeat !== null ? assigned[hoverSeat] : null;
  const hs = hoverSeat !== null ? seats[hoverSeat] : null;
  const majority = Math.floor(total / 2) + 1;
  // Viewbox in seat units, centred on the hemicycle; room for the selection ring.
  const pad = DOT + 0.35;
  const VX = -(outer + pad);
  const VY = -(outer + pad);
  const VW = 2 * (outer + pad);
  const VH = outer + 2 * pad;
  const maxWidth = Math.round(VW * PX_PER_UNIT);

  return (
    <div className="space-y-4">
      <div className="relative" onMouseLeave={() => setHoverSeat(null)}>
        <svg
          viewBox={`${VX} ${VY} ${VW} ${VH}`}
          className="w-full mx-auto block h-auto select-none"
          style={{ maxWidth }}
          role="img" aria-label={`Diagrama do plenário com ${total} cadeiras`}>
          {seats.map((s, i) => {
            const a = assigned[i];
            if (!a) return null;
            const { p, g } = a;
            const faded = (isDimmed?.(p) ?? false) || (hoverGroup !== null && hoverGroup !== g.key);
            const selected = p.id === selectedId;
            const mandate = p.id === mandateId;
            return (
              <g
                key={p.id}
                onClick={() => onSelect(p)}
                onMouseEnter={() => setHoverSeat(i)}
                className="cursor-pointer"
                opacity={faded ? 0.18 : 1}
                style={{ transition: 'opacity 150ms' }}
              >
                {/* Generous hit target */}
                <circle cx={s.x} cy={s.y} r={0.5} fill="transparent" />
                {(selected || mandate) && (
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={DOT + 0.14}
                    fill="none"
                    stroke={selected ? '#102C45' : '#36B7A5'}
                    strokeWidth={0.08}
                    strokeDasharray={mandate && !selected ? '0.12 0.08' : undefined}
                  />
                )}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={g.hollow ? DOT - 0.05 : DOT}
                  fill={g.hollow ? '#FFFFFF' : g.color}
                  stroke={g.hollow ? g.color : 'none'}
                  strokeWidth={g.hollow ? 0.1 : 0}
                />
              </g>
            );
          })}
        </svg>
        <p className="text-center mt-2 text-xs text-slate-500">
          <strong className="font-mono text-base text-slate-900">{total}</strong> cadeiras · maioria absoluta{' '}
          <strong className="font-mono text-slate-900">{majority}</strong>
        </p>

        {hovered && hs && (
          <div
            className="absolute z-10 pointer-events-none bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-[11px] min-w-[170px]"
            style={{
              left: `clamp(0px, calc(50% + ${(hs.x / VW) * Math.min(maxWidth, 99999)}px - 85px), calc(100% - 170px))`,
              top: `${(hs.y - VY) * PX_PER_UNIT + (hs.y - VY < 2 ? 18 : -96)}px`,
            }}
          >
            <p className="font-semibold text-slate-900 flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={hovered.g.hollow ? { border: `2px solid ${hovered.g.color}` } : { background: hovered.g.color }}
              />
              {hovered.p.popularName || hovered.p.name}
            </p>
            <p className="text-slate-500 mt-0.5">
              {hovered.p.party} · {hovered.p.bloc}
            </p>
            <p className="text-slate-700 mt-0.5">
              {groupHeading}: <strong>{hovered.g.label}</strong>
            </p>
            <p className="text-slate-400 mt-0.5">Cadeira nº {hovered.p.seatNumber} · clique para ver o perfil</p>
          </div>
        )}
      </div>

      {/* Results table (always visible: carries identity + exact values) */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left font-semibold py-2 pr-3">{groupHeading}</th>
              {showNote && <th className="text-left font-semibold py-2 pr-3">{showNote}</th>}
              <th className="text-right font-semibold py-2 pr-3">Cadeiras</th>
              <th className="text-right font-semibold py-2 pr-3">%</th>
              <th className="py-2 w-[35%] min-w-[120px]" aria-label="Proporção" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups
              .filter((g) => g.members.length > 0)
              .map((g) => {
                const pct = total ? (g.members.length / total) * 100 : 0;
                return (
                  <tr
                    key={g.key}
                    onMouseEnter={() => setHoverGroup(g.key)}
                    onMouseLeave={() => setHoverGroup(null)}
                    className={`transition-colors ${hoverGroup === g.key ? 'bg-slate-50' : ''}`}
                  >
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={g.hollow ? { border: `2.5px solid ${g.color}` } : { background: g.color }}
                        />
                        <span className="font-semibold text-slate-900">{g.label}</span>
                      </span>
                      {g.detail && <span className="block text-[10px] text-slate-500 ml-5">{g.detail}</span>}
                    </td>
                    {showNote && <td className="py-2 pr-3 text-slate-600">{g.note ?? '—'}</td>}
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-900 font-semibold">{g.members.length}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-600">{pct.toFixed(1).replace('.', ',')}%</td>
                    <td className="py-2">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: g.hollow ? 'transparent' : g.color, border: g.hollow ? `1.5px solid ${g.color}` : undefined }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
