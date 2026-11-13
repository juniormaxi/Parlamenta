/**
 * Base de Conhecimento › Mapa Neural. O acervo desenhado como um cérebro:
 *  - temas = núcleos (hubs) distribuídos pelos dois hemisférios;
 *  - documentos = neurônios, atraídos pelos seus temas e pelos documentos parecidos;
 *  - órgãos e municípios = nós de contexto que ligam documentos;
 *  - sinapses com impulsos luminosos que percorrem as conexões.
 * Canvas 2D com simulação de forças própria; arrastar, zoom, busca, foco por tema e painel de detalhes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Search,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Shuffle,
  X,
  FileText,
  ExternalLink,
  Building2,
  MapPin,
  Sparkles,
  Network,
  Zap,
  Eye,
} from 'lucide-react';
import { api } from '../../../lib/api';

// ---------------------------------------------------------------------------
// Tipos da API
// ---------------------------------------------------------------------------
type NodeKind = 'tema' | 'doc' | 'orgao' | 'municipio';
interface ApiNode {
  id: string;
  kind: NodeKind;
  label: string;
  count?: number;
  summary?: string;
  source?: string;
  sourceId?: string;
  tags?: string[];
  date?: string;
  status?: string;
  recipient?: string;
  themes?: { theme: string; weight: number }[];
  neighbors?: { id: string; strength: number }[];
}
interface ApiLink {
  source: string;
  target: string;
  kind: 'tema' | 'similar' | 'entidade' | 'tema-tema';
  strength: number;
  shared?: string[];
}
interface GraphData {
  nodes: ApiNode[];
  links: ApiLink[];
  stats: { documents: number; themes: number; synapses: number; similar: number; topTheme: string | null };
  /** Ligações de semelhança são pré-calculadas em segundo plano; pending = recálculo agendado. */
  state?: { pending: boolean; builtAt: string | null; limit: number };
}

// ---------------------------------------------------------------------------
// Visual
// ---------------------------------------------------------------------------
const THEME_COLORS: Record<string, string> = {
  Saúde: '#ff6b8b',
  Educação: '#ffc65c',
  Infraestrutura: '#5cc8ff',
  'Segurança Pública': '#ff8f5c',
  'Agricultura & Agro': '#9be06f',
  'Meio Ambiente': '#3fe0a8',
  'Economia & Emprego': '#b49bff',
  'Assistência Social': '#ff9fd6',
  'Cultura & Esporte': '#ffe07a',
  'Transporte & Mobilidade': '#6fa8ff',
  Habitação: '#e0ae78',
  'Direitos Humanos & Cidadania': '#e879f9',
  'Administração Pública': '#7dd3c0',
  'Orçamento & Emendas': '#facc15',
  Outros: '#9fb0c4',
};
const ENTITY_COLOR = '#8fb3cc';
const colorOf = (theme?: string) => THEME_COLORS[theme ?? ''] ?? '#9fb0c4';

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Silhueta (vista de cima): dois hemisférios elípticos. Coordenadas do "mundo".
const HEMI = { rx: 300, ry: 360, gap: 26 };
const insideHemisphere = (x: number, y: number) => {
  const cx = x < 0 ? -(HEMI.rx + HEMI.gap / 2) : HEMI.rx + HEMI.gap / 2;
  const dx = (x - cx) / HEMI.rx;
  const dy = y / HEMI.ry;
  return { d: Math.sqrt(dx * dx + dy * dy), cx };
};

interface SimNode extends ApiNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  fx?: number | null;
  fy?: number | null;
  ax?: number;
  ay?: number;
  degree: number;
}
interface SimLink extends ApiLink {
  a: SimNode;
  b: SimNode;
  /** Curvatura da sinapse (lado e intensidade). */
  bend: number;
}
interface Pulse {
  link: SimLink;
  t: number;
  speed: number;
  reverse: boolean;
  size: number;
}

// Giros e sulcos decorativos (curvas fixas, geradas uma vez por semente).
function makeGyri(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { side: number; pts: [number, number][] }[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 15; k++) {
      const pts: [number, number][] = [];
      let ang = rnd() * Math.PI * 2;
      let rad = 0.25 + rnd() * 0.65;
      for (let i = 0; i < 9; i++) {
        ang += (rnd() - 0.5) * 0.9;
        rad = Math.min(0.94, Math.max(0.15, rad + (rnd() - 0.5) * 0.12));
        const cx = side * (HEMI.rx + HEMI.gap / 2);
        pts.push([cx + Math.cos(ang) * HEMI.rx * rad, Math.sin(ang) * HEMI.ry * rad]);
      }
      out.push({ side, pts });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export function NeuralMap({ onOpenItem, onOpenSource }: { onOpenItem: (id: string) => void; onOpenSource?: (source: string, sourceId: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [isolate, setIsolate] = useState<string | null>(null);
  const [showSimilar, setShowSimilar] = useState(true);
  const [showEntities, setShowEntities] = useState(true);
  const [animate, setAnimate] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [fullscreen, setFullscreen] = useState(false);

  // Estado mutável da simulação (fora do React para rodar a 60 fps).
  const sim = useRef({
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    adj: new Map<string, Set<string>>(),
    alpha: 1,
    cam: { x: 0, y: 0, k: 0.6 },
    pulses: [] as Pulse[],
    drag: null as null | { node?: SimNode; panX?: number; panY?: number; startX: number; startY: number; moved: boolean },
    gyri: makeGyri(7),
    t0: performance.now(),
    w: 800,
    h: 600,
  });
  // Espelhos do estado do React lidos dentro do loop de desenho.
  const view = useRef({ selected, hover: hover?.id ?? null, query, isolate, showSimilar, showEntities, animate });
  view.current = { selected, hover: hover?.id ?? null, query, isolate, showSimilar, showEntities, animate };

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<GraphData>('/tenant/knowledge/graph'));
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao montar o mapa.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // ---- monta a simulação quando os dados chegam
  const seedLayout = useCallback(() => {
    if (!data) return;
    const S = sim.current;
    const themes = data.nodes.filter((n) => n.kind === 'tema').sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    // Âncoras dos temas: alternando hemisférios, em espiral (ângulo áureo) para ocupar o cérebro todo.
    const anchors = new Map<string, { x: number; y: number }>();
    themes.forEach((t, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const j = Math.floor(i / 2);
      const per = Math.ceil(themes.length / 2);
      const rad = per <= 1 ? 0 : 0.2 + 0.55 * Math.sqrt((j + 0.5) / per);
      const ang = j * 2.399963 + (side > 0 ? Math.PI : 0);
      anchors.set(t.id, {
        x: side * (HEMI.rx + HEMI.gap / 2) + Math.cos(ang) * HEMI.rx * rad,
        y: Math.sin(ang) * HEMI.ry * rad,
      });
    });
    const degree = new Map<string, number>();
    data.links.forEach((l) => {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    });
    const nodes: SimNode[] = data.nodes.map((n) => {
      const mainTheme = n.kind === 'doc' ? n.themes?.[0]?.theme : n.kind === 'tema' ? n.label : undefined;
      const anchor = n.kind === 'tema' ? anchors.get(n.id)! : anchors.get(`tema:${mainTheme}`) ?? { x: 0, y: 0 };
      const jitter = n.kind === 'tema' ? 0 : 60;
      const deg = degree.get(n.id) ?? 0;
      return {
        ...n,
        x: anchor.x + (Math.random() - 0.5) * jitter * 2,
        y: anchor.y + (Math.random() - 0.5) * jitter * 2,
        vx: 0,
        vy: 0,
        ax: n.kind === 'tema' ? anchor.x : undefined,
        ay: n.kind === 'tema' ? anchor.y : undefined,
        r: n.kind === 'tema' ? 13 + Math.min(16, Math.sqrt(n.count ?? 1) * 4) : n.kind === 'doc' ? 3.6 + Math.min(4, Math.sqrt(deg)) : 4.5,
        color: n.kind === 'doc' || n.kind === 'tema' ? colorOf(mainTheme) : ENTITY_COLOR,
        degree: deg,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = data.links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l, i) => ({ ...l, a: byId.get(l.source)!, b: byId.get(l.target)!, bend: ((i * 7919) % 100) / 100 - 0.5 }));
    const adj = new Map<string, Set<string>>();
    links.forEach((l) => {
      if (!adj.has(l.a.id)) adj.set(l.a.id, new Set());
      if (!adj.has(l.b.id)) adj.set(l.b.id, new Set());
      adj.get(l.a.id)!.add(l.b.id);
      adj.get(l.b.id)!.add(l.a.id);
    });
    Object.assign(S, { nodes, links, byId, adj, alpha: 1, pulses: [] });
  }, [data]);

  useEffect(() => {
    seedLayout();
  }, [seedLayout]);

  // ---- ajusta o zoom para caber
  const fit = useCallback(() => {
    const S = sim.current;
    const worldW = 4 * HEMI.rx + HEMI.gap + 120;
    const worldH = 2 * HEMI.ry + 120;
    S.cam.k = Math.min(S.w / worldW, S.h / worldH);
    S.cam.x = 0;
    S.cam.y = 0;
  }, []);

  // ---- loop: física + desenho
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    const S = sim.current;
    let raf = 0;
    let first = true;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      S.w = r.width;
      S.h = r.height;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (first) {
        fit();
        first = false;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const visible = (n: SimNode) => {
      const v = view.current;
      if (!v.showEntities && (n.kind === 'orgao' || n.kind === 'municipio')) return false;
      return true;
    };
    const linkVisible = (l: SimLink) => {
      const v = view.current;
      if (!visible(l.a) || !visible(l.b)) return false;
      if (l.kind === 'similar' && !v.showSimilar) return false;
      return true;
    };

    const step = () => {
      const nodes = S.nodes;
      if (S.alpha < 0.004 && !S.drag?.node) return;
      const a = S.alpha;
      // repulsão
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i]!;
        if (!visible(p)) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const q = nodes[j]!;
          if (!visible(q)) continue;
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 0.5;
          }
          if (d2 > 160 * 160) continue;
          const minD = p.r + q.r + 6;
          const strength = (p.kind === 'tema' || q.kind === 'tema' ? 900 : 260) * a;
          let f = strength / d2;
          if (d2 < minD * minD) f += (minD - Math.sqrt(d2)) * 0.25;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          p.vx -= fx;
          p.vy -= fy;
          q.vx += fx;
          q.vy += fy;
        }
      }
      // molas (sinapses)
      for (const l of S.links) {
        if (!linkVisible(l)) continue;
        if (l.kind === 'tema-tema') continue;
        const rest = l.kind === 'tema' ? 38 + (1 - l.strength) * 90 : l.kind === 'similar' ? 70 : 110;
        const k = (l.kind === 'tema' ? 0.07 * (0.25 + l.strength) : l.kind === 'similar' ? 0.006 * l.strength + 0.002 : 0.003) * (0.3 + a);
        const dx = l.b.x - l.a.x;
        const dy = l.b.y - l.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - rest) * k;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        const wa = l.a.kind === 'tema' ? 0.15 : 1;
        const wb = l.b.kind === 'tema' ? 0.15 : 1;
        l.a.vx += fx * wa;
        l.a.vy += fy * wa;
        l.b.vx -= fx * wb;
        l.b.vy -= fy * wb;
      }
      // âncoras dos temas, contenção no cérebro, integração
      for (const n of nodes) {
        if (n.ax !== undefined) {
          n.vx += (n.ax - n.x) * 0.02;
          n.vy += (n.ay! - n.y) * 0.02;
        }
        const { d, cx } = insideHemisphere(n.x, n.y);
        if (d > 0.93) {
          n.vx += (cx - n.x) * 0.02 * (d - 0.93) * 10;
          n.vy += -n.y * 0.02 * (d - 0.93) * 10;
        }
        if (Math.abs(n.x) < HEMI.gap * 1.5) n.vx += (n.x >= 0 ? 1 : -1) * 1.2; // fissura central
        if (n.fx != null) {
          n.x = n.fx;
          n.y = n.fy!;
          n.vx = n.vy = 0;
          continue;
        }
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += Math.max(-12, Math.min(12, n.vx));
        n.y += Math.max(-12, Math.min(12, n.vy));
      }
      S.alpha *= 0.985;
    };

    const draw = (now: number) => {
      const v = view.current;
      const { w, h, cam } = S;
      const t = (now - S.t0) / 1000;
      ctx.save();
      // fundo
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#0e2a42');
      bg.addColorStop(0.55, '#081b2c');
      bg.addColorStop(1, '#040d17');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
      ctx.scale(cam.k, cam.k);

      // silhueta do cérebro
      for (const side of [-1, 1]) {
        const cx = side * (HEMI.rx + HEMI.gap / 2);
        const g = ctx.createRadialGradient(cx, 0, 20, cx, 0, HEMI.ry);
        g.addColorStop(0, 'rgba(54,183,165,0.07)');
        g.addColorStop(1, 'rgba(54,183,165,0.015)');
        ctx.beginPath();
        ctx.ellipse(cx, 0, HEMI.rx, HEMI.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2 / cam.k;
        ctx.strokeStyle = 'rgba(120,200,220,0.22)';
        ctx.shadowColor = 'rgba(54,183,165,0.6)';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // giros
      ctx.lineWidth = 1.2 / cam.k;
      ctx.strokeStyle = 'rgba(140,210,230,0.085)';
      for (const g of S.gyri) {
        ctx.beginPath();
        g.pts.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else {
            const [px, py] = g.pts[i - 1]!;
            ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
          }
        });
        ctx.stroke();
      }

      // foco: selecionado > hover > tema isolado > busca
      const q = v.query.trim().toLowerCase();
      const focusId = v.hover ?? v.selected;
      const focusSet = focusId ? new Set([focusId, ...(S.adj.get(focusId) ?? [])]) : null;
      const isolateSet = v.isolate ? new Set([v.isolate, ...(S.adj.get(v.isolate) ?? [])]) : null;
      const matches = q ? new Set(S.nodes.filter((n) => n.label.toLowerCase().includes(q) || (n.summary ?? '').toLowerCase().includes(q)).map((n) => n.id)) : null;
      const lit = (n: SimNode) =>
        (!focusSet || focusSet.has(n.id)) && (!isolateSet || isolateSet.has(n.id)) && (!matches || matches.has(n.id) || (focusSet?.has(n.id) ?? false));
      const dimAlpha = 0.08;

      // sinapses
      ctx.globalCompositeOperation = 'lighter';
      for (const l of S.links) {
        if (!linkVisible(l)) continue;
        const on = lit(l.a) && lit(l.b);
        const focusLink = focusId && (l.a.id === focusId || l.b.id === focusId);
        let alpha = l.kind === 'tema' ? 0.1 + 0.25 * l.strength : l.kind === 'similar' ? 0.08 + 0.4 * l.strength : l.kind === 'tema-tema' ? Math.min(0.18, 0.03 * l.strength) : 0.08;
        if (!on) alpha *= dimAlpha;
        if (focusLink) alpha = Math.min(0.85, alpha * 3 + 0.25);
        const mx = (l.a.x + l.b.x) / 2;
        const my = (l.a.y + l.b.y) / 2;
        const dx = l.b.x - l.a.x;
        const dy = l.b.y - l.a.y;
        const bend = l.kind === 'tema-tema' ? 0.35 : 0.18;
        const cx = mx - dy * l.bend * bend;
        const cy = my + dx * l.bend * bend;
        const grad = ctx.createLinearGradient(l.a.x, l.a.y, l.b.x, l.b.y);
        grad.addColorStop(0, hexA(l.a.color, alpha));
        grad.addColorStop(1, hexA(l.b.color, alpha));
        ctx.strokeStyle = grad;
        ctx.lineWidth = (l.kind === 'similar' ? 0.6 + 2 * l.strength : l.kind === 'tema-tema' ? 0.8 + Math.min(3, l.strength * 0.4) : 0.7) * (focusLink ? 1.8 : 1) / Math.sqrt(cam.k);
        if (l.kind === 'entidade') ctx.setLineDash([3 / cam.k, 4 / cam.k]);
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.quadraticCurveTo(cx, cy, l.b.x, l.b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // impulsos
      if (v.animate) {
        const candidates = S.links.filter((l) => linkVisible(l) && l.kind !== 'tema-tema');
        if (candidates.length && S.pulses.length < 70 && Math.random() < 0.6) {
          const l = candidates[Math.floor(Math.random() * candidates.length)]!;
          S.pulses.push({ link: l, t: 0, speed: 0.006 + Math.random() * 0.01, reverse: Math.random() < 0.5, size: 1.6 + Math.random() * 1.6 });
        }
        if (focusId && Math.random() < 0.5) {
          const own = candidates.filter((l) => l.a.id === focusId || l.b.id === focusId);
          if (own.length) {
            const l = own[Math.floor(Math.random() * own.length)]!;
            S.pulses.push({ link: l, t: 0, speed: 0.015 + Math.random() * 0.01, reverse: l.b.id === focusId, size: 2.6 });
          }
        }
        S.pulses = S.pulses.filter((p) => p.t <= 1);
        for (const p of S.pulses) {
          p.t += p.speed;
          const l = p.link;
          const tt = p.reverse ? 1 - p.t : p.t;
          const mx = (l.a.x + l.b.x) / 2;
          const my = (l.a.y + l.b.y) / 2;
          const dx = l.b.x - l.a.x;
          const dy = l.b.y - l.a.y;
          const cx = mx - dy * l.bend * 0.18;
          const cy = my + dx * l.bend * 0.18;
          const x = (1 - tt) * (1 - tt) * l.a.x + 2 * (1 - tt) * tt * cx + tt * tt * l.b.x;
          const y = (1 - tt) * (1 - tt) * l.a.y + 2 * (1 - tt) * tt * cy + tt * tt * l.b.y;
          const on = lit(l.a) && lit(l.b);
          const c = tt < 0.5 ? l.a.color : l.b.color;
          const fade = Math.sin(Math.PI * p.t);
          const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 4);
          glow.addColorStop(0, hexA('#ffffff', (on ? 0.9 : 0.1) * fade));
          glow.addColorStop(0.3, hexA(c, (on ? 0.6 : 0.06) * fade));
          glow.addColorStop(1, hexA(c, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, p.size * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // nós
      for (const n of S.nodes) {
        if (!visible(n)) continue;
        const on = lit(n);
        const isSel = n.id === v.selected;
        const isHover = n.id === v.hover;
        const alpha = on ? 1 : dimAlpha + 0.05;
        if (n.kind === 'tema') {
          const breathe = v.animate ? 1 + 0.08 * Math.sin(t * 1.6 + n.x * 0.01) : 1;
          const R = n.r * breathe;
          const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, R * 3.2);
          halo.addColorStop(0, hexA(n.color, 0.55 * alpha));
          halo.addColorStop(0.4, hexA(n.color, 0.16 * alpha));
          halo.addColorStop(1, hexA(n.color, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(n.x, n.y, R * 3.2, 0, Math.PI * 2);
          ctx.fill();
          const core = ctx.createRadialGradient(n.x - R * 0.3, n.y - R * 0.3, 0, n.x, n.y, R);
          core.addColorStop(0, hexA('#ffffff', 0.95 * alpha));
          core.addColorStop(0.35, hexA(n.color, alpha));
          core.addColorStop(1, hexA(n.color, 0.75 * alpha));
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
          ctx.fill();
        } else if (n.kind === 'doc') {
          const R = n.r * (isHover || isSel ? 1.6 : 1);
          const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, R * 3);
          halo.addColorStop(0, hexA(n.color, 0.5 * alpha));
          halo.addColorStop(1, hexA(n.color, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(n.x, n.y, R * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = hexA('#ffffff', 0.85 * alpha);
          ctx.beginPath();
          ctx.arc(n.x, n.y, R * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = hexA(n.color, alpha);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const R = n.r;
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = hexA(ENTITY_COLOR, 0.25 * alpha);
          ctx.strokeStyle = hexA(ENTITY_COLOR, 0.9 * alpha);
          ctx.lineWidth = 1.2;
          ctx.fillRect(-R, -R, 2 * R, 2 * R);
          ctx.strokeRect(-R, -R, 2 * R, 2 * R);
          ctx.restore();
        }
        if (isSel) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.5 / cam.k;
          ctx.setLineDash([4 / cam.k, 3 / cam.k]);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * (n.kind === 'tema' ? 1.5 : 2.6), (t * 0.8) % (Math.PI * 2), (t * 0.8) % (Math.PI * 2) + Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // rótulos
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const n of S.nodes) {
        if (!visible(n)) continue;
        const on = lit(n);
        const show =
          n.kind === 'tema' ||
          n.id === v.selected ||
          (focusSet?.has(n.id) && n.kind !== 'doc') ||
          (matches?.has(n.id) ?? false) ||
          (cam.k > 1.5 && on && n.kind !== 'doc') ||
          (cam.k > 2.2 && on);
        if (!show) continue;
        const fs = (n.kind === 'tema' ? 13 : 11) / Math.min(1.6, Math.max(0.6, cam.k));
        ctx.font = `${n.kind === 'tema' ? 700 : 500} ${fs}px Inter, system-ui, sans-serif`;
        const text = n.kind === 'tema' ? `${n.label} · ${n.count}` : n.label.length > 46 ? `${n.label.slice(0, 45)}…` : n.label;
        const y = n.y + (n.kind === 'tema' ? n.r * 1.9 + fs * 0.4 : n.r * 2.4 + fs * 0.4);
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = `rgba(4,13,23,${on ? 0.62 : 0.2})`;
        const pad = 4 / Math.max(0.6, cam.k);
        ctx.beginPath();
        ctx.roundRect?.(n.x - tw / 2 - pad, y - fs * 0.7, tw + pad * 2, fs * 1.4, fs * 0.4);
        ctx.fill();
        ctx.fillStyle = on ? (n.kind === 'tema' ? hexA(n.color, 1) : 'rgba(226,240,250,0.95)') : 'rgba(226,240,250,0.25)';
        ctx.fillText(text, n.x, y);
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      step();
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fit, data]);

  // ---- interação
  const toWorld = (sx: number, sy: number) => {
    const S = sim.current;
    return { x: (sx - S.w / 2 - S.cam.x) / S.cam.k, y: (sy - S.h / 2 - S.cam.y) / S.cam.k };
  };
  const pick = (sx: number, sy: number): SimNode | null => {
    const S = sim.current;
    const { x, y } = toWorld(sx, sy);
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of S.nodes) {
      if (!showEntities && (n.kind === 'orgao' || n.kind === 'municipio')) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      const hit = (n.kind === 'tema' ? n.r * 1.3 : n.r * 2.2) + 6 / S.cam.k;
      if (d < hit && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };
  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    const S = sim.current;
    const n = pick(sx, sy);
    (e.target as Element).setPointerCapture(e.pointerId);
    if (n) {
      S.drag = { node: n, startX: sx, startY: sy, moved: false };
      n.fx = n.x;
      n.fy = n.y;
    } else S.drag = { panX: S.cam.x, panY: S.cam.y, startX: sx, startY: sy, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    const S = sim.current;
    const d = S.drag;
    if (d) {
      if (Math.hypot(sx - d.startX, sy - d.startY) > 3) d.moved = true;
      if (d.node) {
        const w = toWorld(sx, sy);
        d.node.fx = w.x;
        d.node.fy = w.y;
        if (d.node.kind === 'tema') {
          d.node.ax = w.x;
          d.node.ay = w.y;
        }
        S.alpha = Math.max(S.alpha, 0.3);
      } else {
        S.cam.x = d.panX! + (sx - d.startX);
        S.cam.y = d.panY! + (sy - d.startY);
      }
      return;
    }
    const n = pick(sx, sy);
    setHover(n ? { id: n.id, x: sx, y: sy } : null);
    canvasRef.current!.style.cursor = n ? 'pointer' : 'grab';
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const S = sim.current;
    const d = S.drag;
    S.drag = null;
    if (d?.node) {
      d.node.fx = null;
      d.node.fy = null;
      if (!d.moved) setSelected(d.node.id);
    } else if (d && !d.moved) {
      setSelected(null);
    }
    void e;
  };
  const onWheel = (e: React.WheelEvent) => {
    const { sx, sy } = local(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
  };
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const S = sim.current;
    const before = toWorld(sx, sy);
    S.cam.k = Math.max(0.2, Math.min(5, S.cam.k * factor));
    S.cam.x = sx - S.w / 2 - before.x * S.cam.k;
    S.cam.y = sy - S.h / 2 - before.y * S.cam.k;
  };
  const focusNode = (id: string, k = 1.8) => {
    const S = sim.current;
    const n = S.byId.get(id);
    if (!n) return;
    setSelected(id);
    S.cam.k = Math.max(S.cam.k, k);
    S.cam.x = -n.x * S.cam.k;
    S.cam.y = -n.y * S.cam.k;
  };

  // Rolagem da página não deve competir com o zoom do mapa.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    c.addEventListener('wheel', stop, { passive: false });
    return () => c.removeEventListener('wheel', stop);
  }, [data]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---- dados derivados para os painéis
  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);
  const themeList = useMemo(() => (data?.nodes ?? []).filter((n) => n.kind === 'tema').sort((a, b) => (b.count ?? 0) - (a.count ?? 0)), [data]);
  const sel = selected ? nodeById.get(selected) : null;
  const linksOf = (id: string) => (data?.links ?? []).filter((l) => l.source === id || l.target === id);
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return [];
    return data.nodes.filter((n) => n.label.toLowerCase().includes(q) || (n.summary ?? '').toLowerCase().includes(q)).slice(0, 8);
  }, [query, data]);
  const hoverNode = hover ? nodeById.get(hover.id) : null;

  if (error)
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-rose-700">
        {error}{' '}
        <button className="underline" onClick={load}>
          Tentar de novo
        </button>
      </div>
    );

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-2xl border border-[#176B80]/40 shadow-lg select-none bg-[#040d17] ${fullscreen ? 'h-screen rounded-none' : 'h-[min(78vh,760px)] min-h-[520px]'}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onDoubleClick={(e) => {
          const { sx, sy } = local(e as unknown as React.PointerEvent);
          const n = pick(sx, sy);
          if (n) focusNode(n.id, 2.2);
        }}
        aria-label="Mapa neural da Base de Conhecimento"
        role="img"
      />

      {!data && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-cyan-100/70 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Conectando os neurônios do acervo…
        </div>
      )}

      {data && data.stats.documents === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-2">
          <Brain className="w-10 h-10 text-cyan-300/60" />
          <p className="text-base font-semibold text-white">O cérebro do gabinete ainda está vazio</p>
          <p className="text-xs text-cyan-100/60 max-w-md">Cada ofício salvo vira um neurônio, ligado aos seus temas, órgãos e documentos parecidos. Salve ofícios em Legislativo › Ofícios para ver as conexões aparecerem.</p>
        </div>
      )}

      {/* topo: título, estatísticas e busca */}
      {data && data.stats.documents > 0 && (
        <>
          <div className="absolute top-3 left-3 right-3 flex flex-col md:flex-row md:items-start justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto bg-[#071a2b]/80 backdrop-blur-md border border-cyan-300/15 rounded-xl px-3.5 py-2.5 text-white max-w-md">
              <p className="text-sm font-bold flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#36B7A5]" /> Mapa Neural do Gabinete
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-cyan-100/75">
                <span>
                  <strong className="text-white font-mono">{data.stats.documents}</strong> documentos
                </span>
                <span>
                  <strong className="text-white font-mono">{data.stats.themes}</strong> temas
                </span>
                <span>
                  <strong className="text-white font-mono">{data.stats.synapses}</strong> sinapses
                </span>
                {data.stats.topTheme && (
                  <span>
                    núcleo dominante: <strong style={{ color: colorOf(data.stats.topTheme) }}>{data.stats.topTheme}</strong>
                  </span>
                )}
              </div>
              {data.state?.pending && (
                <p className="mt-1 text-[10px] text-amber-200/90">Conexões de semelhança sendo recalculadas em segundo plano — atualize em instantes.</p>
              )}
              {data.state && data.stats.documents >= data.state.limit && (
                <p className="mt-1 text-[10px] text-cyan-100/60">Mostrando os {data.state.limit} documentos mais recentes (sigilosos não aparecem no mapa).</p>
              )}
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-cyan-200/60 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar no cérebro…"
                  className="w-64 pl-8 pr-7 py-2 rounded-lg bg-[#071a2b]/85 backdrop-blur-md border border-cyan-300/20 text-xs text-white placeholder:text-cyan-100/40 focus:outline-none focus:ring-1 focus:ring-[#36B7A5]"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-100/60 hover:text-white" aria-label="Limpar busca">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {searchHits.length > 0 && (
                  <div className="absolute right-0 mt-1 w-72 bg-[#071a2b]/95 backdrop-blur-md border border-cyan-300/20 rounded-lg overflow-hidden z-10">
                    {searchHits.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => focusNode(n.id)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-cyan-50 hover:bg-white/10 flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: n.kind === 'doc' ? colorOf(n.themes?.[0]?.theme) : n.kind === 'tema' ? colorOf(n.label) : ENTITY_COLOR }} />
                        <span className="truncate">{n.label}</span>
                        <span className="ml-auto text-[9px] uppercase text-cyan-100/40">{n.kind === 'doc' ? 'doc' : n.kind}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                {(
                  [
                    [showSimilar, setShowSimilar, Network, 'Sinapses entre documentos parecidos'],
                    [showEntities, setShowEntities, Building2, 'Órgãos e municípios'],
                    [animate, setAnimate, Zap, 'Impulsos animados'],
                  ] as const
                ).map(([on, set, Icon, label]) => (
                  <button
                    key={label}
                    onClick={() => {
                      (set as (v: boolean) => void)(!on);
                      sim.current.alpha = Math.max(sim.current.alpha, 0.3);
                    }}
                    title={label}
                    aria-pressed={on}
                    className={`p-2 rounded-lg border backdrop-blur-md transition-colors ${on ? 'bg-[#36B7A5]/25 border-[#36B7A5]/60 text-white' : 'bg-[#071a2b]/80 border-cyan-300/15 text-cyan-100/50 hover:text-white'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* legenda de temas (clique isola o tema) */}
          <div className="absolute bottom-3 left-3 max-w-[min(560px,calc(100%-140px))] flex flex-wrap gap-1.5">
            {themeList.map((tn) => {
              const active = isolate === tn.id;
              return (
                <button
                  key={tn.id}
                  onClick={() => {
                    setIsolate(active ? null : tn.id);
                    if (!active) focusNode(tn.id, 1.1);
                  }}
                  onMouseEnter={() => setHover({ id: tn.id, x: 0, y: 0 })}
                  onMouseLeave={() => setHover(null)}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold border backdrop-blur-md flex items-center gap-1.5 transition-colors ${
                    active ? 'bg-white/20 border-white/50 text-white' : 'bg-[#071a2b]/75 border-cyan-300/15 text-cyan-50/85 hover:bg-white/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: colorOf(tn.label), boxShadow: `0 0 8px ${colorOf(tn.label)}` }} />
                  {tn.label}
                  <span className="font-mono text-cyan-100/50">{tn.count}</span>
                </button>
              );
            })}
            {isolate && (
              <button onClick={() => setIsolate(null)} className="px-2 py-1 rounded-full text-[10px] font-semibold bg-[#36B7A5]/30 border border-[#36B7A5]/60 text-white flex items-center gap-1">
                <Eye className="w-3 h-3" /> Ver tudo
              </button>
            )}
          </div>

          {/* controles de câmera */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1">
            {(
              [
                [ZoomIn, 'Aproximar', () => zoomAt(sim.current.w / 2, sim.current.h / 2, 1.3)],
                [ZoomOut, 'Afastar', () => zoomAt(sim.current.w / 2, sim.current.h / 2, 1 / 1.3)],
                [Crosshair, 'Enquadrar', () => fit()],
                [
                  Shuffle,
                  'Reorganizar',
                  () => {
                    seedLayout();
                    fit();
                  },
                ],
                [
                  fullscreen ? Minimize2 : Maximize2,
                  fullscreen ? 'Sair da tela cheia' : 'Tela cheia',
                  () => (document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen?.()),
                ],
              ] as const
            ).map(([Icon, label, fn]) => (
              <button
                key={label}
                onClick={fn as () => void}
                title={label}
                aria-label={label}
                className="p-2 rounded-lg bg-[#071a2b]/80 backdrop-blur-md border border-cyan-300/15 text-cyan-100/80 hover:text-white hover:bg-white/10"
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* dica */}
          {!selected && (
            <p className="absolute bottom-14 right-14 text-[10px] text-cyan-100/40 text-right hidden md:block">
              Arraste para mover · roda do mouse para zoom · clique num neurônio para ver as conexões · duplo clique para focar
            </p>
          )}
        </>
      )}

      {/* tooltip */}
      {hoverNode && hover && hover.x > 0 && hoverNode.id !== selected && (
        <div
          className="absolute pointer-events-none z-20 max-w-[260px] bg-[#071a2b]/95 border border-cyan-300/25 rounded-lg px-2.5 py-1.5 text-[11px] text-cyan-50 shadow-xl"
          style={{ left: Math.min(hover.x + 14, (sim.current.w || 800) - 270), top: hover.y + 14 }}
        >
          <p className="font-semibold text-white leading-snug">{hoverNode.label}</p>
          <p className="text-cyan-100/60">
            {hoverNode.kind === 'tema'
              ? `Tema · ${hoverNode.count} documento(s)`
              : hoverNode.kind === 'doc'
                ? [hoverNode.themes?.map((t) => t.theme).join(' · '), hoverNode.date?.split('-').reverse().join('/')].filter(Boolean).join(' — ')
                : `${hoverNode.kind === 'orgao' ? 'Órgão' : 'Município'} · ${hoverNode.count} documento(s)`}
          </p>
        </div>
      )}

      {/* painel de detalhes */}
      {sel && (
        <aside className="absolute top-3 bottom-3 right-3 w-[min(340px,calc(100%-24px))] bg-[#071a2b]/92 backdrop-blur-xl border border-cyan-300/20 rounded-xl text-cyan-50 flex flex-col shadow-2xl z-10">
          <div className="p-4 border-b border-cyan-300/10 flex items-start gap-3">
            <span
              className="mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: sel.kind === 'doc' ? hexA(colorOf(sel.themes?.[0]?.theme), 0.18) : sel.kind === 'tema' ? hexA(colorOf(sel.label), 0.2) : hexA(ENTITY_COLOR, 0.2),
                boxShadow: `0 0 18px ${sel.kind === 'tema' ? colorOf(sel.label) : sel.kind === 'doc' ? colorOf(sel.themes?.[0]?.theme) : ENTITY_COLOR}55`,
              }}
            >
              {sel.kind === 'tema' ? (
                <Sparkles className="w-4 h-4" style={{ color: colorOf(sel.label) }} />
              ) : sel.kind === 'doc' ? (
                <FileText className="w-4 h-4" style={{ color: colorOf(sel.themes?.[0]?.theme) }} />
              ) : sel.kind === 'orgao' ? (
                <Building2 className="w-4 h-4 text-cyan-200" />
              ) : (
                <MapPin className="w-4 h-4 text-cyan-200" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-cyan-100/50 font-bold">
                {sel.kind === 'tema' ? 'Núcleo temático' : sel.kind === 'doc' ? 'Documento' : sel.kind === 'orgao' ? 'Órgão destinatário' : 'Município'}
              </p>
              <h4 className="text-sm font-bold text-white leading-snug">{sel.label}</h4>
            </div>
            <button onClick={() => setSelected(null)} className="text-cyan-100/50 hover:text-white" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {sel.kind === 'doc' && (
              <>
                <div className="space-y-1 text-cyan-100/75">
                  {sel.date && <p>Data: {sel.date.split('-').reverse().join('/')}</p>}
                  {sel.status && <p>Situação: {sel.status}</p>}
                  {sel.recipient && <p>Destinatário: {sel.recipient}</p>}
                </div>
                {sel.summary && !(sel.recipient && sel.summary.includes(sel.recipient.split(' · ').pop()!)) && (
                  <p className="text-cyan-50/90 leading-relaxed">{sel.summary}</p>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-cyan-100/50 font-bold mb-1.5">Temas identificados</p>
                  <div className="space-y-1.5">
                    {sel.themes?.map((t) => (
                      <button key={t.theme} onClick={() => focusNode(`tema:${t.theme}`, 1.3)} className="w-full text-left group">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-semibold group-hover:underline" style={{ color: colorOf(t.theme) }}>
                            {t.theme}
                          </span>
                          <span className="font-mono text-cyan-100/60">{Math.round(t.weight * 100)}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-0.5">
                          <div className="h-full rounded-full" style={{ width: `${t.weight * 100}%`, background: colorOf(t.theme), boxShadow: `0 0 8px ${colorOf(t.theme)}` }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-cyan-100/50 font-bold mb-1.5">Documentos mais conectados</p>
                  {sel.neighbors && sel.neighbors.length > 0 ? (
                    <div className="space-y-1">
                      {sel.neighbors.map((nb) => {
                        const nn = nodeById.get(nb.id);
                        if (!nn) return null;
                        const link = linksOf(sel.id).find((l) => (l.source === nb.id || l.target === nb.id) && l.kind === 'similar');
                        return (
                          <button key={nb.id} onClick={() => focusNode(nb.id)} className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-[11px] font-semibold text-white leading-snug line-clamp-2">{nn.label}</span>
                              <span className="font-mono text-[10px] text-[#36B7A5] shrink-0">{Math.round(nb.strength * 100)}%</span>
                            </div>
                            {link?.shared && link.shared.length > 0 && <p className="text-[10px] text-cyan-100/50 mt-0.5">em comum: {link.shared.join(', ')}</p>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-cyan-100/50">Nenhum documento com conteúdo parecido ainda.</p>
                  )}
                </div>
                {sel.tags && sel.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {sel.tags.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-semibold text-cyan-50">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {sel.kind !== 'doc' && (
              <>
                {sel.kind === 'tema' && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-cyan-100/50 font-bold mb-1.5">Temas vizinhos</p>
                    <div className="flex flex-wrap gap-1">
                      {linksOf(sel.id)
                        .filter((l) => l.kind === 'tema-tema')
                        .sort((a, b) => b.strength - a.strength)
                        .map((l) => {
                          const other = l.source === sel.id ? l.target : l.source;
                          const on = nodeById.get(other);
                          return on ? (
                            <button
                              key={other}
                              onClick={() => focusNode(other, 1.3)}
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-white/10 hover:bg-white/10"
                              style={{ color: colorOf(on.label) }}
                            >
                              {on.label} · {l.strength}
                            </button>
                          ) : null;
                        })}
                      {!linksOf(sel.id).some((l) => l.kind === 'tema-tema') && <span className="text-cyan-100/50">Nenhum documento compartilha este tema com outro.</span>}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-cyan-100/50 font-bold mb-1.5">Documentos ({sel.count})</p>
                  <div className="space-y-1">
                    {linksOf(sel.id)
                      .filter((l) => l.kind === 'tema' || l.kind === 'entidade')
                      .map((l) => ({ l, d: nodeById.get(l.source === sel.id ? l.target : l.source) }))
                      .filter((x) => x.d?.kind === 'doc')
                      .sort((a, b) => b.l.strength - a.l.strength)
                      .map(({ l, d }) => (
                        <button key={d!.id} onClick={() => focusNode(d!.id)} className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5">
                          <span className="text-[11px] font-semibold text-white leading-snug line-clamp-2">{d!.label}</span>
                          <span className="text-[10px] text-cyan-100/50">
                            {d!.date?.split('-').reverse().join('/')}
                            {sel.kind === 'tema' && ` · ${Math.round(l.strength * 100)}% do documento`}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {sel.kind === 'doc' && (
            <div className="p-3 border-t border-cyan-300/10 flex gap-2">
              <button onClick={() => onOpenItem(sel.id)} className="flex-1 px-3 py-2 rounded-lg bg-[#36B7A5] hover:bg-[#2fa293] text-[#04202a] text-xs font-bold flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Ler documento
              </button>
              {onOpenSource && sel.source === 'oficio' && sel.sourceId && (
                <button
                  onClick={() => onOpenSource(sel.source!, sel.sourceId!)}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ofícios
                </button>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
