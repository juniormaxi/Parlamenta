/**
 * Base de Conhecimento › Mapa Neural: transforma o acervo num grafo de "neurônios" e "sinapses".
 *  - Tema (hub): identificado automaticamente no título, resumo e texto de cada documento
 *    (palavras-chave por tema, sem acentos; título pesa mais). Até 3 temas por documento.
 *  - Documento (neurônio): ligado aos seus temas, com força proporcional ao peso do tema no texto.
 *  - Documento ↔ documento: semelhança de conteúdo (TF-IDF + cosseno), até 4 vizinhos por documento.
 *  - Entidades: órgão destinatário e município citado (metadados), que conectam documentos entre si.
 *  - Tema ↔ tema: quantos documentos os dois temas compartilham.
 */
import { THEMES, KEYWORDS } from './ai';
import { norm } from './plenario/net';
import { terms, stem } from './plenario/radar';

export interface GraphItem {
  id: string;
  source: string;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  meta: Record<string, any>;
  createdAt: string;
}

const KW = (Object.keys(KEYWORDS) as (typeof THEMES)[number][]).map((theme) => ({
  theme,
  // Busca pelo início da palavra (" hospita" acha "hospitais"); siglas de 2 letras (br-, mt-) dariam falso positivo.
  keys: KEYWORDS[theme].map((k) => ` ${norm(k)}`).filter((k) => k.trim().length >= 3),
}));

function count(hay: string, needle: string) {
  if (!needle.trim()) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/** Temas do documento com peso (0–1), do mais forte ao mais fraco. */
export function themesOf(it: Pick<GraphItem, 'title' | 'summary' | 'content'>): { theme: string; weight: number }[] {
  const T = ` ${norm(it.title)} `;
  const S = ` ${norm(it.summary)} `;
  const C = ` ${norm(it.content.slice(0, 20_000))} `;
  const scored = KW.filter((k) => k.theme !== 'Outros')
    .map(({ theme, keys }) => ({
      theme,
      score: keys.reduce((a, k) => a + 3 * count(T, k) + 2 * count(S, k) + Math.min(6, count(C, k)), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [{ theme: 'Outros', weight: 1 }];
  const top = scored[0]!.score;
  const picked = scored.filter((s, i) => i === 0 || s.score >= Math.max(2, top * 0.3)).slice(0, 3);
  const total = picked.reduce((a, s) => a + s.score, 0);
  return picked.map((s) => ({ theme: s.theme, weight: Math.round((100 * s.score) / total) / 100 }));
}

/** Palavras de praxe dos documentos oficiais, que não indicam assunto. */
const BOILERPLATE = new Set(
  `solicita solicitamos solicito pede pedimos requer requeremos propoe propomos apoio senhor senhora excelentissimo exmo secretario secretaria
   atenciosamente deputado deputada estadual vereador gabinete oficio estado governo cordialmente respeitosamente cumprimentando
   vossa excelencia considerando referente encaminha encaminhamos informa informamos necessidade urgente urgencia prezado prezada`
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
);

export function buildKnowledgeGraph(items: GraphItem[]) {
  // ---- temas
  const docThemes = new Map(items.map((it) => [it.id, themesOf(it)]));
  const themeCount = new Map<string, number>();
  for (const ts of docThemes.values()) for (const t of ts) themeCount.set(t.theme, (themeCount.get(t.theme) ?? 0) + 1);

  // ---- TF-IDF para semelhança entre documentos
  // Palavra mais usada para cada radical (para mostrar "hospital" em vez de "hospit").
  const surface = new Map<string, Map<string, number>>();
  for (const it of items)
    for (const w of `${it.title} ${it.summary} ${it.content.slice(0, 12_000)}`.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []) {
      const st = stem(w);
      const m = surface.get(st) ?? new Map<string, number>();
      m.set(w, (m.get(w) ?? 0) + 1);
      surface.set(st, m);
    }
  const word = (st: string) => [...(surface.get(st)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? st;
  const vecs = items.map((it) => {
    const tf = new Map<string, number>();
    const add = (text: string, w: number) => {
      for (const t of terms(text)) if (t.length >= 4 && !BOILERPLATE.has(t)) tf.set(t, (tf.get(t) ?? 0) + w);
    };
    add(it.title, 3);
    add(it.summary, 2);
    add(it.content.slice(0, 12_000), 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const v of vecs) for (const t of v.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const N = items.length || 1;
  const weighted = vecs.map((v) => {
    const w = new Map<string, number>();
    let norm2 = 0;
    for (const [t, f] of v) {
      const d = df.get(t)!;
      if (d < 2 && N > 3) continue; // termo exclusivo de um documento não conecta nada
      if (d > N * 0.6 && N > 5) continue; // termo presente em quase tudo (cabeçalhos, fórmulas)
      const x = (1 + Math.log(f)) * Math.log(1 + N / d);
      w.set(t, x);
      norm2 += x * x;
    }
    return { w, norm: Math.sqrt(norm2) || 1 };
  });
  const sim = (a: number, b: number) => {
    const A = weighted[a]!;
    const B = weighted[b]!;
    const [small, big] = A.w.size < B.w.size ? [A, B] : [B, A];
    let dot = 0;
    for (const [t, x] of small.w) {
      const y = big.w.get(t);
      if (y) dot += x * y;
    }
    return dot / (A.norm * B.norm);
  };
  const topTerms = (i: number, j: number) => {
    const A = weighted[i]!.w;
    const B = weighted[j]!.w;
    return [...A.entries()]
      .filter(([t]) => B.has(t))
      .map(([t, x]) => [t, x * B.get(t)!] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => word(t));
  };

  const docLinks: { source: string; target: string; kind: 'similar'; strength: number; shared: string[] }[] = [];
  const seen = new Set<string>();
  const neighbors = new Map<string, { id: string; strength: number }[]>();
  for (let i = 0; i < items.length; i++) {
    const cands: { j: number; s: number }[] = [];
    for (let j = 0; j < items.length; j++) if (j !== i) cands.push({ j, s: sim(i, j) });
    cands.sort((a, b) => b.s - a.s);
    const list = cands.filter((c) => c.s >= 0.12).slice(0, 4);
    neighbors.set(items[i]!.id, list.map((c) => ({ id: items[c.j]!.id, strength: Math.round(c.s * 100) / 100 })));
    for (const c of list) {
      const key = [i, c.j].sort((a, b) => a - b).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      docLinks.push({ source: items[i]!.id, target: items[c.j]!.id, kind: 'similar', strength: Math.round(c.s * 100) / 100, shared: topTerms(i, c.j) });
    }
  }

  // ---- entidades (órgão destinatário, município)
  const entities = new Map<string, { id: string; label: string; kind: 'orgao' | 'municipio'; docs: string[] }>();
  const addEntity = (kind: 'orgao' | 'municipio', label: string, docId: string) => {
    const l = String(label ?? '').trim();
    if (!l || l.length < 3) return;
    const id = `${kind}:${norm(l)}`;
    const e = entities.get(id) ?? { id, label: l, kind, docs: [] };
    if (!e.docs.includes(docId)) e.docs.push(docId);
    entities.set(id, e);
  };
  for (const it of items) {
    addEntity('orgao', it.meta?.recipientOrg, it.id);
    addEntity('municipio', it.meta?.cityTarget, it.id);
  }

  // ---- tema ↔ tema (coocorrência)
  const co = new Map<string, number>();
  for (const ts of docThemes.values())
    for (let a = 0; a < ts.length; a++)
      for (let b = a + 1; b < ts.length; b++) {
        const k = [ts[a]!.theme, ts[b]!.theme].sort().join('|');
        co.set(k, (co.get(k) ?? 0) + 1);
      }

  const nodes = [
    ...[...themeCount.entries()].map(([theme, n]) => ({ id: `tema:${theme}`, kind: 'tema' as const, label: theme, count: n })),
    ...items.map((it) => ({
      id: it.id,
      kind: 'doc' as const,
      label: it.title,
      summary: it.summary,
      source: it.source,
      sourceId: it.sourceId,
      tags: it.tags,
      date: (it.meta?.date as string) || it.createdAt?.slice(0, 10),
      status: it.meta?.statusLabel as string | undefined,
      recipient: [it.meta?.recipientName, it.meta?.recipientOrg].filter(Boolean).join(' · ') || undefined,
      themes: docThemes.get(it.id)!,
      neighbors: neighbors.get(it.id) ?? [],
    })),
    ...[...entities.values()].map((e) => ({ id: e.id, kind: e.kind, label: e.label, count: e.docs.length })),
  ];
  const links = [
    ...items.flatMap((it) => docThemes.get(it.id)!.map((t) => ({ source: it.id, target: `tema:${t.theme}`, kind: 'tema' as const, strength: t.weight }))),
    ...docLinks,
    ...[...entities.values()].flatMap((e) => e.docs.map((d) => ({ source: d, target: e.id, kind: 'entidade' as const, strength: 0.5 }))),
    ...[...co.entries()].map(([k, n]) => {
      const [a, b] = k.split('|');
      return { source: `tema:${a}`, target: `tema:${b}`, kind: 'tema-tema' as const, strength: n };
    }),
  ];
  return {
    nodes,
    links,
    stats: {
      documents: items.length,
      themes: themeCount.size,
      synapses: links.length,
      similar: docLinks.length,
      topTheme: [...themeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    },
  };
}
