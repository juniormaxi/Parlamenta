/**
 * Radar de Temas: a partir de um tema (ou da descrição de um projeto), encontra as votações nominais
 * relacionadas e mede, parlamentar a parlamentar e partido a partido, quanto cada um votou a favor do tema.
 *
 * 1. Relevância: busca por termos (radicais, sem acentos) na ementa, no número e na descrição de cada
 *    votação, ponderada pela raridade do termo (IDF) e com peso maior para a ementa. Com GEMINI_API_KEY,
 *    a IA amplia os termos de busca e revisa as votações candidatas (relevância e direção do "Sim").
 * 2. Direção: por padrão "Sim" = a favor do tema. Requerimentos procedimentais (retirada de pauta,
 *    adiamento, encerramento de discussão…) ficam de fora. O gabinete pode inverter ou excluir votações.
 * 3. Apoio = votos a favor ÷ (a favor + contra), ponderado pela relevância. Obstrução conta como contra.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { norm } from './net';

export type Direction = 'favor' | 'contra' | 'off';

export interface RadarSession {
  id: string;
  date: string;
  matterCode: string;
  matterTitle: string;
  description: string;
  result: string;
  source: 'oficial' | 'gabinete';
  url?: string;
  votes: Record<string, string>;
}

export interface RadarMember {
  id: string;
  popularName: string;
  party: string;
  uf?: string;
  photoUrl?: string;
  bloc: string;
}

const STOP = new Set(
  `a o as os um uma uns umas de da do das dos dum duma em no na nos nas num numa por pelo pela pelos pelas para pra com sem sob sobre entre
   e ou que se sua seu suas seus ao aos à às é ser sao foi como mais menos muito muita outros outras outro outra este esta isto esse essa isso
   aquele aquela lei leis projeto projetos proposta propostas institui altera dispoe dispõe dá da providencias providências outras nº n art artigo
   federal estadual municipal nacional brasil brasileira brasileiro publico publica públicos públicas pública público tema quero atuar sobre
   criar cria criação programa politica política fim fins forma termos acerca relativo relativa`.split(/\s+/)
);

/** Radical simples para português: sem acentos, singular e sem sufixos/vogal final. */
export function stem(w: string): string {
  let s = norm(w);
  if (s.length <= 3) return s;
  if (/(oes|aes)$/.test(s)) s = `${s.slice(0, -3)}ao`;
  else if (s.endsWith('ais')) s = `${s.slice(0, -3)}al`;
  else if (s.endsWith('eis') && s.length > 5) s = `${s.slice(0, -3)}el`;
  else if (s.endsWith('ns')) s = `${s.slice(0, -2)}m`;
  else if (s.endsWith('s') && s.length > 4) s = s.slice(0, -1);
  for (const suf of ['amento', 'imento', 'idade', 'acao', 'icao', 'mente', 'ista', 'ismo', 'avel', 'ivel'])
    if (s.length - suf.length >= 4 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  if (s.length >= 5 && /[aoe]$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** Expressões usadas nas ementas para pautas frequentes (usadas também sem IA). */
const SYNONYMS: [RegExp, string[]][] = [
  [/reforma tribut/, ['sistema tributario', 'imposto sobre bens e servicos', 'contribuicao social sobre bens e servicos', 'imposto seletivo', 'ibs', 'cbs']],
  [/armas?|armamento|porte|posse de arma|cac\b/, ['estatuto do desarmamento', 'arma de fogo', 'municao', 'colecionador', 'atirador desportivo']],
  [/agrotox|defensivo|pesticid/, ['agrotoxico', 'defensivo agricola', 'pesticida', 'produto fitossanitario']],
  [/enfermag/, ['enfermeiro', 'tecnico de enfermagem', 'piso salarial']],
  [/saude mental/, ['saude mental', 'psicossocial', 'suicidio', 'automutilacao', 'dependencia quimica']],
  [/aborto|nascituro/, ['aborto', 'nascituro', 'interrupcao da gravidez', 'gestacao']],
  [/drogas?|entorpecent|maconha|cannabis/, ['drogas', 'entorpecente', 'cannabis', 'trafico de drogas']],
  [/marco temporal|indigena|demarca/, ['terras indigenas', 'marco temporal', 'demarcacao', 'povos indigenas']],
  [/licenciamento|meio ambiente|ambiental/, ['licenciamento ambiental', 'meio ambiente', 'codigo florestal', 'unidade de conservacao']],
  [/trabalho por aplicativo|aplicativo|uber|entregador/, ['motorista de aplicativo', 'plataforma digital', 'trabalhador por aplicativo']],
  [/fake news|desinforma|redes sociais|big tech/, ['desinformacao', 'redes sociais', 'plataformas digitais', 'provedores de aplicacao', 'inteligencia artificial']],
  [/inteligencia artificial|\bia\b/, ['inteligencia artificial', 'sistemas de ia']],
  [/previdenc|aposentad/, ['previdencia', 'aposentadoria', 'regime geral', 'beneficio previdenciario']],
  [/salario minimo/, ['salario minimo', 'valorizacao do salario minimo']],
  [/educa|escola|ensino/, ['educacao basica', 'ensino medio', 'escola', 'fundeb', 'professores']],
  [/seguranca publica|violencia|crime/, ['seguranca publica', 'codigo penal', 'crime organizado', 'faccao']],
  [/violencia contra a mulher|feminicid|maria da penha/, ['violencia domestica', 'maria da penha', 'feminicidio', 'violencia contra a mulher']],
  [/agro|agricultur|produtor rural|rural/, ['produtor rural', 'agropecuaria', 'credito rural', 'agricultura familiar']],
  [/divida|renegocia/, ['renegociacao de dividas', 'refinanciamento', 'divida', 'parcelamento']],
  [/arcabouco|teto de gastos|regra fiscal|fiscal/, ['regime fiscal', 'arcabouco fiscal', 'meta fiscal', 'responsabilidade fiscal']],
  [/imposto de renda|\birpf\b/, ['imposto sobre a renda', 'imposto de renda', 'isencao', 'faixa de isencao']],
  [/saneamento|agua|esgoto/, ['saneamento basico', 'abastecimento de agua', 'esgotamento sanitario']],
  [/energia|eletric|combustiv/, ['energia eletrica', 'combustiveis', 'tarifa de energia', 'biocombustiveis', 'transicao energetica']],
  [/pessoa com deficiencia|\bpcd\b|autis/, ['pessoa com deficiencia', 'transtorno do espectro autista', 'acessibilidade']],
  [/crianca|adolescente|\beca\b/, ['crianca e do adolescente', 'estatuto da crianca', 'infancia', 'adolescente']],
  [/idoso/, ['pessoa idosa', 'estatuto da pessoa idosa', 'idoso']],
  [/servidor|concurso/, ['servidores publicos', 'concurso publico', 'carreira', 'remuneracao']],
  [/sus\b|saude publica|hospital/, ['sistema unico de saude', 'sus', 'atencao basica', 'hospitais']],
];

export function synonymPhrases(query: string): string[] {
  const q = norm(query);
  return SYNONYMS.filter(([re]) => re.test(q)).flatMap(([, ph]) => ph);
}

export function terms(text: string): string[] {
  return norm(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

/** Destaques, emendas e requerimentos: o sentido do "Sim" depende do caso (sem IA, ficam fora por padrão). */
const UNCERTAIN = /destaque|\bDVS\b|emenda aglutinativa|emenda de plen[aá]rio|emenda n[ºo°]|requerimento|recurso contra|supress[aã]o/i;

/** Votações de procedimento, em que "Sim" não expressa posição sobre o mérito. */
const PROCEDURAL =
  /retirada de pauta|retirar de pauta|adiamento|adiar a (discuss|vota)|encerramento d[ae] (discuss|encaminh)|encerrar a (discuss|vota)|vota[cç][aã]o por partes|vota[cç][aã]o em globo|quebra de interst[ií]cio|inclus[aã]o na ordem do dia|requerimento de (urg[eê]ncia )?retirada|requerimento de adiamento|requerimento de encerramento|prefer[eê]ncia para|m[eé]todo de vota|verifica[cç][aã]o de qu[oó]rum/i;

/**
 * Sentido do "Sim" pelo tipo de votação (regras do plenário da Câmara e dos SAPL):
 * texto principal e urgência = a favor da matéria; "mantido o texto" (destaque supressivo) = a favor;
 * procedimentos e destaques/emendas/requerimentos genéricos = fora (o gabinete pode incluir).
 */
function classifyVote(desc: string): { direction: Direction; weight: number; reason: string } {
  const d = desc.trim();
  if (PROCEDURAL.test(d)) return { direction: 'off', weight: 1, reason: 'Votação de procedimento' };
  if (/requerimento de urg[eê]ncia/i.test(d)) return { direction: 'favor', weight: 0.6, reason: 'Urgência: “Sim” acelera a matéria' };
  if (
    /ressalvad[oa]s? os destaques/i.test(d) ||
    /^(aprovad|rejeitad)[oa]s? (o|a|em) (projeto|substitutivo|subemenda substitutiva|emenda substitutiva|proposta|reda[cç][aã]o final|parecer|medida provis|pec|mat[eé]ria|texto|primeiro turno|segundo turno|turno [uú]nico)/i.test(d)
  )
    return { direction: 'favor', weight: 1, reason: 'Votação do texto principal' };
  if (/mantido o texto|manuten[cç][aã]o do texto/i.test(d)) return { direction: 'favor', weight: 0.8, reason: 'Destaque supressivo: “Sim” mantém o texto' };
  if (UNCERTAIN.test(d)) return { direction: 'off', weight: 1, reason: 'Destaque/emenda/requerimento: sentido do “Sim” incerto' };
  return { direction: 'favor', weight: 0.8, reason: 'Votação da matéria' };
}

interface Scored {
  s: RadarSession;
  score: number;
  matched: string[];
}

/**
 * Pontua as votações. Para entrar, a votação precisa conter os termos principais do tema
 * (todos, se forem até 2; 60% deles, se forem mais) ou uma das expressões completas sugeridas pela IA.
 */
function scoreSessions(sessions: RadarSession[], queryTerms: string[], phrases: string[][], relax = 0): Scored[] {
  let q = [...new Set(queryTerms)];
  const extraTerms = phrases.flat();
  // IDF por termo sobre o conjunto de votações
  const docs = sessions.map((s) => ({
    title: new Set(terms(`${s.matterCode} ${s.matterTitle}`)),
    body: new Set(terms(s.description)),
  }));
  const N = sessions.length || 1;
  const df = (t: string) => docs.reduce((n, d) => n + (d.title.has(t) || d.body.has(t) ? 1 : 0), 0);
  // Texto longo (ideia de projeto): usa os termos mais distintivos que aparecem na base.
  let required: number;
  if (q.length > 4) {
    q = q
      .map((t) => ({ t, n: df(t) }))
      .filter((x) => x.n > 0 && x.n < N * 0.3)
      .sort((a, b) => a.n - b.n)
      .slice(0, 6)
      .map((x) => x.t);
    required = Math.max(1, Math.min(2, q.length) - relax);
  } else required = Math.max(1, (q.length <= 2 ? q.length : Math.ceil(q.length * 0.6)) - relax);
  const extra = [...new Set(extraTerms.filter((t) => !q.includes(t)))];
  const all = [...q, ...extra];
  if (!all.length) return [];
  const idf = new Map<string, number>();
  for (const t of all) {
    let df = 0;
    for (const d of docs) if (d.title.has(t) || d.body.has(t)) df++;
    idf.set(t, df ? Math.log(1 + N / df) : 0);
  }
  const maxPossible = q.reduce((a, t) => a + (idf.get(t) ?? 0), 0) || 1;
  return sessions
    .map((s, i) => {
      const d = docs[i]!;
      const has = (t: string) => d.title.has(t) || d.body.has(t);
      const qHits = q.filter(has).length;
      const phraseHit = phrases.some((ph) => ph.length > 0 && ph.every(has));
      if (qHits < required && !phraseHit) return { s, score: 0, matched: [] };
      let score = 0;
      const matched: string[] = [];
      for (const t of all) {
        const w = (idf.get(t) ?? 0) * (q.includes(t) ? 1 : 0.6);
        if (d.title.has(t)) {
          score += w * 1.5;
          matched.push(t);
        } else if (d.body.has(t)) {
          score += w * 0.6;
          matched.push(t);
        }
      }
      return { s, score: score / maxPossible, matched };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// IA (opcional)
// ---------------------------------------------------------------------------
const geminiKey = () => {
  const k = process.env.GEMINI_API_KEY?.trim();
  return k && k !== 'MY_GEMINI_API_KEY' ? k : '';
};
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function aiExpand(query: string, house: string): Promise<{ label: string; keywords: string[] } | null> {
  if (!geminiKey()) return null;
  const ai = new GoogleGenAI({ apiKey: geminiKey() });
  const res = await ai.models.generateContent({
    model: model(),
    contents: `Um gabinete parlamentar (${house}) quer saber quais parlamentares apoiam a pauta abaixo, olhando as votações nominais da casa.
Gere um rótulo curto para a pauta (até 6 palavras) e de 8 a 20 palavras-chave ou expressões curtas, em português, que costumam aparecer em ementas de projetos sobre essa pauta (termos técnicos, siglas, sinônimos, nomes de leis/programas). Não inclua palavras genéricas como "lei", "projeto", "altera".

PAUTA:
${query.slice(0, 2000)}`,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: { label: { type: Type.STRING }, keywords: { type: Type.ARRAY, items: { type: Type.STRING } } },
        required: ['label', 'keywords'],
      },
    },
  });
  const p = JSON.parse(res.text ?? '{}');
  return { label: String(p.label ?? '').slice(0, 80), keywords: (Array.isArray(p.keywords) ? p.keywords : []).map(String).slice(0, 25) };
}

async function aiReview(query: string, cands: Scored[]): Promise<Map<string, { relevance: number; direction: Direction; reason: string }> | null> {
  if (!geminiKey() || !cands.length) return null;
  const ai = new GoogleGenAI({ apiKey: geminiKey() });
  const list = cands
    .map((c, i) => `#${i} ${c.s.matterCode} — ${c.s.matterTitle.slice(0, 350)}${c.s.description && c.s.description !== c.s.matterTitle ? ` | Votação: ${c.s.description.slice(0, 300)}` : ''}`)
    .join('\n');
  const res = await ai.models.generateContent({
    model: model(),
    contents: `Pauta do gabinete: "${query.slice(0, 1500)}"

Abaixo há votações nominais. Para cada uma, responda:
- relevance: 0 (não tem relação), 1 (relação fraca), 2 (relacionada), 3 (central para a pauta).
- direction: "favor" se votar SIM nesta votação favorece a pauta; "contra" se votar SIM prejudica a pauta (ex.: aprovar requerimento para derrubar o texto, sustar uma política favorável, suprimir dispositivo favorável); "off" se a votação é só procedimental ou não dá para saber.
- reason: até 12 palavras, em português.

VOTAÇÕES:
${list}`,
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            relevance: { type: Type.INTEGER },
            direction: { type: Type.STRING, enum: ['favor', 'contra', 'off'] },
            reason: { type: Type.STRING },
          },
          required: ['index', 'relevance', 'direction', 'reason'],
        },
      },
    },
  });
  const arr = JSON.parse(res.text ?? '[]');
  const out = new Map<string, { relevance: number; direction: Direction; reason: string }>();
  for (const p of Array.isArray(arr) ? arr : []) {
    const c = cands[p.index];
    if (!c) continue;
    out.set(c.s.id, {
      relevance: Math.max(0, Math.min(3, Number(p.relevance) || 0)),
      direction: ['favor', 'contra', 'off'].includes(p.direction) ? p.direction : 'favor',
      reason: String(p.reason ?? '').slice(0, 140),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------
export async function analyzeTheme(input: {
  query: string;
  overrides: Record<string, Direction>;
  sessions: RadarSession[];
  members: RadarMember[];
  mandateId: string | null;
  houseLabel: string;
  quorum: { absoluta: number; tresQuintos: number; doisTercos: number };
  seats: number;
}) {
  const query = input.query.trim();
  const qTerms = terms(query);
  if (!qTerms.length) return { error: 'Descreva o tema com pelo menos uma palavra significativa (ex.: “piso da enfermagem”).' };

  let ai: { label: string; keywords: string[] } | null = null;
  let aiError: string | null = null;
  try {
    ai = await aiExpand(query, input.houseLabel);
  } catch (e: any) {
    aiError = e?.message ?? String(e);
  }
  const phrases = [...(ai?.keywords ?? []), ...synonymPhrases(query)].map((k) => terms(k)).filter((t) => t.length > 0 && t.length <= 4);
  let scored = scoreSessions(input.sessions, qTerms, phrases);
  // Poucos resultados: amplia a busca aceitando votações com parte dos termos.
  let relaxed = false;
  if (scored.length < 3 && qTerms.length > 1) {
    const wider = scoreSessions(input.sessions, qTerms, phrases, 1);
    if (wider.length > scored.length) {
      scored = wider;
      relaxed = true;
    }
  }

  // Candidatas: as mais relevantes (limiar relativo ao melhor resultado).
  const best = scored[0]?.score ?? 0;
  const cands = scored.filter((x) => x.score >= Math.max(0.18, best * 0.25)).slice(0, 80);

  let review: Awaited<ReturnType<typeof aiReview>> = null;
  if (ai && cands.length) {
    try {
      review = await aiReview(query, cands.slice(0, 60));
    } catch (e: any) {
      aiError = e?.message ?? String(e);
    }
  }

  const evidence = cands
    .map((c) => {
      const r = review?.get(c.s.id);
      const rule = classifyVote(c.s.description || '');
      let direction: Direction = r ? r.direction : rule.direction;
      const relevance = (r ? r.relevance / 3 : Math.min(1, c.score)) * (r ? 1 : rule.weight);
      if (r && r.relevance <= 1) direction = 'off';
      const auto = direction;
      if (input.overrides[c.s.id]) direction = input.overrides[c.s.id]!;
      return {
        c,
        direction,
        auto,
        relevance: Math.max(0.15, relevance),
        reason: r?.reason ?? rule.reason,
      };
    })
    .filter((e) => !(review && e.auto === 'off' && !input.overrides[e.c.s.id] && (review.get(e.c.s.id)?.relevance ?? 0) === 0));

  const used = evidence.filter((e) => e.direction !== 'off');
  // Uma matéria com muitas votações (destaques, turnos) não deve pesar mais que as outras.
  const perMatter = new Map<string, number>();
  for (const e of used) perMatter.set(e.c.s.matterCode, (perMatter.get(e.c.s.matterCode) ?? 0) + 1);
  const weightOf = (e: (typeof used)[number]) => e.relevance / Math.sqrt(perMatter.get(e.c.s.matterCode) ?? 1);

  // Apoio por parlamentar
  const stats = new Map<string, { f: number; a: number; n: number; abst: number }>();
  for (const m of input.members) stats.set(m.id, { f: 0, a: 0, n: 0, abst: 0 });
  for (const e of used) {
    for (const m of input.members) {
      const v = e.c.s.votes[m.id];
      if (!v || v === 'ausente') continue;
      const st = stats.get(m.id)!;
      if (v === 'abstencao') {
        st.abst++;
        continue;
      }
      const sim = v === 'sim';
      const favor = e.direction === 'favor' ? sim : !sim; // não/obstrução
      if (favor) st.f += weightOf(e);
      else st.a += weightOf(e);
      st.n++;
    }
  }

  const minVotes = used.length >= 6 ? 2 : 1;
  const adj = (m: { support: number | null; votes: number }) => (m.support === null ? -1 : (m.support * m.votes + 50 * 3) / (m.votes + 3));
  const members = input.members
    .map((m) => {
      const st = stats.get(m.id)!;
      const w = st.f + st.a;
      const support = w ? Math.round((100 * st.f) / w) : null;
      const tier =
        support === null || st.n < minVotes
          ? 'sem-dados'
          : support >= 75
            ? 'defensor'
            : support >= 55
              ? 'favoravel'
              : support > 35
                ? 'dividido'
                : support > 15
                  ? 'resistente'
                  : 'opositor';
      return { ...m, support, votes: st.n, abstentions: st.abst, tier };
    })
    // Ordem: apoio ajustado pela quantidade de votos (poucos votos puxam para 50%), para não premiar quem votou uma vez só.
    .sort((a, b) => adj(b) - adj(a) || b.votes - a.votes || a.popularName.localeCompare(b.popularName));

  // Apoio por partido
  const parties = new Map<string, { sum: number; n: number; members: number; scores: number[] }>();
  for (const m of members) {
    const p = parties.get(m.party) ?? { sum: 0, n: 0, members: 0, scores: [] };
    p.members++;
    if (m.support !== null && m.tier !== 'sem-dados') {
      p.sum += m.support;
      p.n++;
      p.scores.push(m.support);
    }
    parties.set(m.party, p);
  }
  const partyRank = [...parties.entries()]
    .map(([party, p]) => {
      const avg = p.n ? Math.round(p.sum / p.n) : null;
      const sd = p.n > 1 ? Math.sqrt(p.scores.reduce((a, s) => a + (s - (avg ?? 0)) ** 2, 0) / p.n) : 0;
      return { party, seats: p.members, withData: p.n, support: avg, cohesion: p.n ? Math.max(0, Math.round(100 - sd * 2)) : null };
    })
    .sort((a, b) => (b.support ?? -1) - (a.support ?? -1) || b.seats - a.seats);

  const count = (t: string) => members.filter((m) => m.tier === t).length;
  const favorable = count('defensor') + count('favoravel');
  const mandate = input.mandateId ? members.find((m) => m.id === input.mandateId) ?? null : null;

  // Coautores sugeridos: defensores com mais votos, no máximo 2 por partido, priorizando partidos diferentes.
  const perParty = new Map<string, number>();
  const coauthors = members
    .filter((m) => m.tier === 'defensor' && m.id !== input.mandateId)
    .sort((a, b) => b.votes - a.votes || (b.support ?? 0) - (a.support ?? 0))
    .filter((m) => {
      const n = perParty.get(m.party) ?? 0;
      if (n >= 2) return false;
      perParty.set(m.party, n + 1);
      return true;
    })
    .slice(0, 8);

  return {
    query,
    label: ai?.label || query.slice(0, 80),
    ai: { used: !!ai, reviewed: !!review, keywords: ai?.keywords ?? [], error: aiError },
    relaxed,
    phrases: synonymPhrases(query),
    terms: [...new Set(qTerms)],
    totals: {
      candidates: evidence.length,
      used: used.length,
      membersWithData: members.filter((m) => m.tier !== 'sem-dados').length,
      defensor: count('defensor'),
      favoravel: count('favoravel'),
      dividido: count('dividido'),
      resistente: count('resistente'),
      opositor: count('opositor'),
      semDados: count('sem-dados'),
      favorable,
      quorum: input.quorum,
      seats: input.seats,
      avgSupport: (() => {
        const xs = members.filter((m) => m.support !== null && m.tier !== 'sem-dados').map((m) => m.support!);
        return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
      })(),
    },
    mandate: mandate ? { id: mandate.id, support: mandate.support, votes: mandate.votes } : null,
    members,
    parties: partyRank,
    coauthors,
    evidence: evidence.map((e) => {
      let sim = 0;
      let nao = 0;
      for (const v of Object.values(e.c.s.votes)) {
        if (v === 'sim') sim++;
        else if (v === 'nao' || v === 'obstrucao') nao++;
      }
      return {
        id: e.c.s.id,
        date: e.c.s.date,
        matterCode: e.c.s.matterCode,
        matterTitle: e.c.s.matterTitle.length > 260 ? `${e.c.s.matterTitle.slice(0, 259)}…` : e.c.s.matterTitle,
        description: e.c.s.description.length > 200 ? `${e.c.s.description.slice(0, 199)}…` : e.c.s.description,
        result: e.c.s.result,
        url: e.c.s.url,
        source: e.c.s.source,
        relevance: Math.round(e.relevance * 100),
        direction: e.direction,
        autoDirection: e.auto,
        overridden: !!input.overrides[e.c.s.id],
        reason: e.reason,
        sim,
        nao,
        mandateVote: input.mandateId ? (e.c.s.votes[input.mandateId] ?? 'ausente') : null,
      };
    }),
  };
}
