/**
 * Fontes de dados do Plenário, por esfera:
 *  - FEDERAL: Câmara dos Deputados (API de dados abertos + arquivos anuais de votações): deputados em
 *    exercício, partido atual, foto, votações nominais do Plenário na legislatura atual e orientação do Governo.
 *  - ESTADUAL: eleitos de 2022 (TSE: candidaturas + fotos). Em MT, composição atual pelo portal da ALMT.
 *  - MUNICIPAL: vereadores eleitos em 2024 (TSE: resultado oficial, com foto).
 *  - SAPL (opcional, estadual ou municipal): composição e votações nominais registradas no SAPL da casa.
 */
import { safeGet, assertPublicUrl } from '../safeFetch';
import { fetchBuffer, fetchJson, fetchText, streamCsv, pool, norm, titleCase, HttpStatusError, CsvParser } from './net';
import { openZipBuffer, openRemoteZip } from './zip';

export type Vote = 'sim' | 'nao' | 'abstencao' | 'obstrucao';
export type Theme =
  | 'Saúde'
  | 'Infraestrutura'
  | 'Agricultura & Meio Ambiente'
  | 'Educação'
  | 'Tributário & Orçamento'
  | 'Segurança Pública'
  | 'Servidores Públicos'
  | 'Outros';
export type Quorum = 'Maioria Simples' | 'Maioria Absoluta' | 'Três Quintos (3/5)' | 'Dois Terços (2/3)';

export interface HouseMember {
  id: string;
  name: string;
  popularName: string;
  party: string;
  uf?: string;
  photoUrl?: string;
  email?: string;
  phone?: string;
  role?: string;
  /** Situação na fonte (ex.: "Eleito por QP", "Titular", "Em exercício"). */
  status?: string;
}

export interface HouseSession {
  id: string;
  date: string;
  matterCode: string;
  matterTitle: string;
  description: string;
  result: 'Aprovado' | 'Rejeitado';
  quorumType: Quorum;
  sessionNumber: string;
  theme: Theme;
  /** Orientação do Governo (Câmara dos Deputados). */
  gov?: Vote | 'liberado';
  url?: string;
  votes: Record<string, Vote>;
}

export interface SourceInfo {
  name: string;
  url: string;
  scope: string;
}

export interface SyncContext {
  progress(msg: string): Promise<void>;
  /** Substitui as votações do período [from, to] pelas informadas. */
  saveSessions(sessions: HouseSession[], range: { from: string; to: string }): Promise<void>;
  hasPhoto(key: string): Promise<boolean>;
  savePhoto(key: string, mime: string, data: Buffer): Promise<void>;
  meta: Record<string, any>;
  warnings: string[];
}

export interface SyncOutput {
  label: string;
  legislature: string;
  members: HouseMember[];
  sources: SourceInfo[];
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Classificação temática (palavras-chave na ementa/descrição)
// ---------------------------------------------------------------------------
const THEME_RULES: [Theme, RegExp][] = [
  ['Servidores Públicos', /\b(servidor(es)? p[uú]blic|previd[eê]ncia|aposentadori|regime pr[oó]prio|carreira|piso salarial|reajuste|remunera[cç][aã]o|subs[ií]dio)/i],
  ['Saúde', /\b(sa[uú]de|sus\b|hospita|m[eé]dic|medicament|enferm|vacina|sanit[aá]ri|farm[aá]c|odontol|epidemi|doen[cç]a)/i],
  ['Educação', /\b(educa[cç]|escola|ensino|professor|universidad|estudant|creche|fundeb|alfabetiza|bolsa de estudo)/i],
  ['Segurança Pública', /\b(seguran[cç]a p[uú]blica|pol[ií]cia|policia|crime|criminal|penal|pena\b|armas?\b|viol[eê]ncia|pres[ií]di|tr[aá]fico|feminic[ií]dio|penitenci)/i],
  ['Tributário & Orçamento', /\b(tribut|imposto|or[cç]ament|fiscal|cr[eé]dito (extraordin|suplementar|especial)|\bldo\b|\bloa\b|diretrizes or[cç]ament|receita|despesa|d[ií]vida|icms|ipi|ipva|iptu|iss\b|taxa|contribui[cç][aã]o social|arcabou[cç]o)/i],
  ['Agricultura & Meio Ambiente', /\b(agr[ií]col|agricult|agro|rural|pecu[aá]ri|ambient|florest|pesca|agrot[oó]xic|clim[aá]tic|desmatamento|licenciamento|recursos h[ií]dricos|queimada|fundi[aá]ri|terra ind[ií]gena)/i],
  ['Infraestrutura', /\b(infraestrutura|rodovi|estrada|transporte|ferrovi|saneamento|energia|el[eé]tric|obras?\b|habita[cç]|mobilidade|porto|portu[aá]ri|aeroporto|telecomunica|minera[cç]|petr[oó]leo|g[aá]s natural)/i],
];
export function classifyTheme(...texts: string[]): Theme {
  const t = texts.join(' ');
  for (const [theme, re] of THEME_RULES) if (re.test(t)) return theme;
  return 'Outros';
}

function quorumFor(code: string, text: string): Quorum {
  if (/^PEC\b/i.test(code) || /emenda (à|a) constitui[cç][aã]o|proposta de emenda/i.test(text)) return 'Três Quintos (3/5)';
  if (/^(PLP|PLC)\b/i.test(code) || /lei complementar/i.test(text)) return 'Maioria Absoluta';
  return 'Maioria Simples';
}

function mapVote(v: string): Vote | null {
  const s = norm(v);
  if (s === 'sim') return 'sim';
  if (s === 'nao') return 'nao';
  if (s.startsWith('absten')) return 'abstencao';
  if (s.startsWith('obstru')) return 'obstrucao';
  return null; // Artigo 17 (presidente), "Não votou", vazio
}

// ---------------------------------------------------------------------------
// FEDERAL — Câmara dos Deputados
// ---------------------------------------------------------------------------
const CD_API = 'https://dadosabertos.camara.leg.br/api/v2';
const CD_FILES = 'https://dadosabertos.camara.leg.br/arquivos';

export async function syncFederal(ctx: SyncContext): Promise<SyncOutput> {
  await ctx.progress('Consultando a legislatura atual na Câmara dos Deputados…');
  const leg = (await fetchJson(`${CD_API}/legislaturas?data=${today()}`)).dados?.[0];
  if (!leg) throw new Error('A Câmara dos Deputados não informou a legislatura atual.');
  const legStart: string = leg.dataInicio;
  const legEnd: string = leg.dataFim;

  await ctx.progress('Carregando os deputados em exercício…');
  const members: HouseMember[] = [];
  for (let page = 1; page <= 10; page++) {
    // Sem filtro de legislatura a API devolve só quem está em exercício (titulares e suplentes convocados).
    const r = await fetchJson(`${CD_API}/deputados?itens=100&pagina=${page}&ordem=ASC&ordenarPor=nome`);
    for (const d of r.dados ?? []) {
      members.push({
        id: `cd-${d.id}`,
        name: d.nome,
        popularName: d.nome,
        party: d.siglaPartido || 'S/Partido',
        uf: d.siglaUf,
        photoUrl: d.urlFoto,
        email: d.email ?? undefined,
        status: 'Em exercício',
      });
    }
    if (!(r.links ?? []).some((l: any) => l.rel === 'next')) break;
  }
  if (members.length < 400 || members.length > 600) throw new Error(`A Câmara retornou ${members.length} deputados em exercício; importação interrompida.`);

  // Votações nominais do Plenário, ano a ano (arquivos de dados abertos atualizados diariamente).
  const startYear = Number(legStart.slice(0, 4));
  const curYear = Math.min(Number(legEnd.slice(0, 4)), new Date().getFullYear());
  ctx.meta.years ??= {};
  for (let y = startYear; y <= curYear; y++) {
    if (ctx.meta.years[y] && y < curYear) continue; // anos fechados já importados
    const from = y === startYear ? legStart : `${y}-01-01`;
    const to = y === curYear ? legEnd : `${y}-12-31`;

    await ctx.progress(`Votações ${y}: lista do Plenário…`);
    const sessions = new Map<string, HouseSession & { _code?: string }>();
    await streamCsv(`${CD_FILES}/votacoes/csv/votacoes-${y}.csv`, (r) => {
      if (r.siglaOrgao !== 'PLEN' || r.data < from || r.data > to) return;
      const total = Number(r.votosSim || 0) + Number(r.votosNao || 0) + Number(r.votosOutros || 0);
      if (!total) return; // votação simbólica
      sessions.set(r.id, {
        id: r.id,
        date: r.data,
        matterCode: '',
        matterTitle: '',
        description: (r.descricao || '').trim(),
        result: r.aprovacao === '1' ? 'Aprovado' : 'Rejeitado',
        quorumType: 'Maioria Simples',
        sessionNumber: `Sessão deliberativa · ${r.data.split('-').reverse().join('/')}`,
        theme: 'Outros',
        url: `https://www.camara.leg.br/presenca-comissoes/votacao-portal?reuniao=${r.idEvento}&itemVotacao=${r.id.split('-')[1] ?? ''}`,
        votes: {},
      });
    });
    if (!sessions.size) {
      ctx.meta.years[y] = true;
      continue;
    }

    await ctx.progress(`Votações ${y}: proposições votadas…`);
    await streamCsv(`${CD_FILES}/votacoesProposicoes/csv/votacoesProposicoes-${y}.csv`, (r) => {
      const s = sessions.get(r.idVotacao);
      if (!s) return;
      const main = r.proposicao_id === r.idVotacao.split('-')[0];
      if (s.matterCode && !main) return;
      s.matterCode = r.proposicao_titulo || `${r.proposicao_siglaTipo} ${r.proposicao_numero}/${r.proposicao_ano}`;
      s.matterTitle = (r.proposicao_ementa || '').trim();
    });

    await ctx.progress(`Votações ${y}: orientação do Governo…`);
    await streamCsv(`${CD_FILES}/votacoesOrientacoes/csv/votacoesOrientacoes-${y}.csv`, (r) => {
      const s = sessions.get(r.idVotacao);
      if (!s || norm(r.siglaBancada) !== 'governo') return;
      const o = norm(r.orientacao);
      s.gov = o === 'liberado' ? 'liberado' : (mapVote(r.orientacao) ?? undefined);
    });

    await ctx.progress(`Votações ${y}: votos de cada deputado (arquivo grande, pode levar alguns minutos)…`);
    await streamCsv(`${CD_FILES}/votacoesVotos/csv/votacoesVotos-${y}.csv`, (r) => {
      const s = sessions.get(r.idVotacao);
      if (!s) return;
      const v = mapVote(r.voto);
      if (v) s.votes[`cd-${r.deputado_id}`] = v;
    });

    const list = [...sessions.values()].filter((s) => Object.keys(s.votes).length > 0);
    for (const s of list) {
      if (!s.matterCode) s.matterCode = `Votação ${s.id}`;
      if (!s.matterTitle) s.matterTitle = s.description;
      s.quorumType = quorumFor(s.matterCode, `${s.matterTitle} ${s.description}`);
      s.theme = classifyTheme(s.matterTitle, s.description);
    }
    await ctx.saveSessions(list, { from, to });
    ctx.meta.years[y] = true;
  }

  return {
    label: 'Câmara dos Deputados',
    legislature: `${leg.id}ª Legislatura (${legStart.slice(0, 4)}–${legEnd.slice(0, 4)})`,
    members,
    sources: [
      { name: 'Câmara dos Deputados · Dados Abertos', url: 'https://dadosabertos.camara.leg.br', scope: 'Deputados, partidos, fotos, votações nominais e orientação do Governo' },
    ],
  };
}

// ---------------------------------------------------------------------------
// ESTADUAL — TSE 2022 (eleitos) e ALMT (composição atual)
// ---------------------------------------------------------------------------
const TSE_CAND_2022 = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip';
const tsePhotos2022 = (uf: string) => `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/fotos/foto_cand2022_${uf}_div.zip`;
export const photoUrlFor = (key: string) => `/api/tenant/plenario/foto/${encodeURIComponent(key)}`;

async function tseEstaduais2022(uf: string, ctx: SyncContext): Promise<HouseMember[]> {
  await ctx.progress('Baixando as candidaturas de 2022 do TSE…');
  const zip = openZipBuffer(await fetchBuffer(TSE_CAND_2022, { timeoutMs: 120_000 }));
  const entry = zip.entries.find((e) => e.name.toUpperCase().endsWith(`_${uf}.CSV`));
  if (!entry) throw new Error(`Candidaturas de ${uf} não encontradas no arquivo do TSE.`);
  const text = new TextDecoder('latin1').decode(zip.read(entry));
  const cargo = uf === 'DF' ? '8' : '7';
  const out = new Map<string, HouseMember>();
  const p = new CsvParser(';', (r) => {
    if (r.CD_CARGO !== cargo || !/^ELEITO/i.test(r.DS_SIT_TOT_TURNO)) return;
    out.set(r.SQ_CANDIDATO, {
      id: `tse22-${r.SQ_CANDIDATO}`,
      name: titleCase(r.NM_CANDIDATO),
      popularName: titleCase(r.NM_URNA_CANDIDATO || r.NM_CANDIDATO),
      party: r.SG_PARTIDO,
      uf,
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.DS_EMAIL ?? '') ? r.DS_EMAIL.toLowerCase() : undefined,
      status: r.DS_SIT_TOT_TURNO.charAt(0) + r.DS_SIT_TOT_TURNO.slice(1).toLowerCase().replace(/\bqp\b/, 'QP'),
    });
  });
  p.push(text);
  p.end();
  const members = [...out.values()];
  if (!members.length) throw new Error(`Nenhum deputado eleito em 2022 encontrado para ${uf}.`);

  // Fotos: só as entradas dos eleitos, lidas por Range do pacote de fotos da UF.
  await ctx.progress('Buscando as fotos dos eleitos no TSE…');
  try {
    const missing: HouseMember[] = [];
    for (const m of members) if (!(await ctx.hasPhoto(m.id))) missing.push(m);
    if (missing.length) {
      const pz = await openRemoteZip(tsePhotos2022(uf));
      const bySq = new Map(pz.entries.map((e) => [e.name.replace(/\D/g, ''), e]));
      await pool(missing, 4, async (m) => {
        const e = bySq.get(m.id.slice('tse22-'.length));
        if (!e) return;
        const data = await pz.read(e);
        await ctx.savePhoto(m.id, /\.png$/i.test(e.name) ? 'image/png' : 'image/jpeg', data);
      });
    }
    for (const m of members) if (await ctx.hasPhoto(m.id)) m.photoUrl = photoUrlFor(m.id);
  } catch (e: any) {
    ctx.warnings.push(`Fotos do TSE indisponíveis no momento (${e.message}).`);
  }
  return members;
}

/** Portal da ALMT: cards com nome, partido atual e foto de cada deputado em exercício. */
async function almtMembers(): Promise<HouseMember[]> {
  const html = await fetchText('https://www.al.mt.gov.br/parlamento/deputados');
  const out: HouseMember[] = [];
  for (const card of html.split(/class="card rounded-0/).slice(1)) {
    const id = /\/parlamento\/deputados\/(\d+)\/perfil/.exec(card)?.[1];
    const img = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/.exec(card);
    const party = /<span class="badge[^"]*">\s*([^<]+?)\s*<\/span>/.exec(card)?.[1];
    const title = /<h6[^>]*>\s*([^<]+?)\s*<\/h6>/.exec(card)?.[1];
    if (!id || !(img || title)) continue;
    const name = (img?.[2] || titleCase(title ?? '')).replace(/&amp;/g, '&').trim();
    out.push({
      id: `almt-${id}`,
      name,
      popularName: name,
      party: (party ?? 'S/Partido').trim(),
      uf: 'MT',
      photoUrl: img?.[1]?.replace(/&amp;/g, '&'),
      status: 'Em exercício',
    });
  }
  return out;
}

export async function syncEstadual(uf: string, ctx: SyncContext): Promise<SyncOutput> {
  const label = uf === 'DF' ? 'Câmara Legislativa do DF' : `Assembleia Legislativa · ${uf}`;
  const legislature = 'Legislatura 2023–2027';
  if (uf === 'MT') {
    await ctx.progress('Consultando o portal da ALMT…');
    try {
      const members = await almtMembers();
      if (members.length >= 15) {
        return {
          label: 'ALMT',
          legislature,
          members,
          sources: [{ name: 'Portal da ALMT', url: 'https://www.al.mt.gov.br/parlamento/deputados', scope: 'Deputados em exercício, partido atual e foto' }],
        };
      }
      ctx.warnings.push('O portal da ALMT retornou uma lista incompleta; usando os eleitos de 2022 (TSE).');
    } catch (e: any) {
      ctx.warnings.push(`Portal da ALMT indisponível (${e.message}); usando os eleitos de 2022 (TSE).`);
    }
  }
  const members = await tseEstaduais2022(uf, ctx);
  return {
    label,
    legislature,
    members,
    sources: [
      {
        name: 'TSE · Candidaturas 2022',
        url: 'https://dadosabertos.tse.jus.br/dataset/candidatos-2022',
        scope: 'Eleitos em 2022 com o partido da eleição. Trocas de partido e suplentes em exercício devem ser ajustados pelo gabinete.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// MUNICIPAL — TSE 2024 (resultado oficial)
// ---------------------------------------------------------------------------
const TSE_RES = 'https://resultados.tse.jus.br/oficial/ele2024/619';

export async function syncMunicipal(uf: string, city: string, ctx: SyncContext): Promise<SyncOutput> {
  await ctx.progress('Localizando o município no TSE…');
  const cfg = await fetchJson(`${TSE_RES}/config/mun-e000619-cm.json`, 60_000);
  const ufCfg = (cfg.abr ?? []).find((a: any) => String(a.cd).toUpperCase() === uf);
  const mun = ufCfg?.mu?.find((m: any) => norm(m.nm) === norm(city));
  if (!mun) throw new Error(`Município "${city}/${uf}" não encontrado no resultado das eleições de 2024 do TSE.`);

  await ctx.progress('Carregando os vereadores eleitos em 2024…');
  const lc = uf.toLowerCase();
  const res = await fetchJson(`${TSE_RES}/dados/${lc}/${lc}${mun.cd}-c0013-e000619-u.json`, 60_000);
  const members: HouseMember[] = [];
  for (const agr of res.carg?.[0]?.agr ?? [])
    for (const par of agr.par ?? [])
      for (const c of par.cand ?? []) {
        if (!/^eleito/i.test(c.st ?? '')) continue;
        members.push({
          id: `tse24-${c.sqcand}`,
          name: titleCase(c.nm),
          popularName: titleCase(c.nmu || c.nm),
          party: par.sg,
          uf,
          photoUrl: `${TSE_RES}/fotos/${lc}/${c.sqcand}.jpeg`,
          status: c.st,
        });
      }
  if (!members.length) throw new Error(`O TSE não retornou vereadores eleitos para ${city}/${uf}.`);
  return {
    label: `Câmara Municipal de ${titleCase(mun.nm)}`,
    legislature: 'Legislatura 2025–2028',
    members,
    sources: [
      {
        name: 'TSE · Resultado das Eleições 2024',
        url: 'https://resultados.tse.jus.br',
        scope: 'Vereadores eleitos, partido da eleição e foto. Suplentes em exercício e trocas de partido devem ser ajustados pelo gabinete.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// SAPL (Interlegis) — composição e votações nominais, quando a casa usa e registra
// ---------------------------------------------------------------------------
export function normalizeSaplUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const u = assertPublicUrl(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  return `${u.protocol}//${u.host}`;
}

async function saplJson(base: string, path: string): Promise<any> {
  const r = await safeGet(`${base}${path}`, { timeoutMs: 20_000, maxBytes: 6 * 1024 * 1024 });
  if (r.status >= 400) throw new HttpStatusError(r.status, `${base}${path}`);
  try {
    return JSON.parse(r.body);
  } catch {
    throw new Error(`O SAPL não respondeu em JSON (${path}). Confira o endereço.`);
  }
}

async function saplAll(base: string, path: string, maxPages = 40): Promise<any[]> {
  const out: any[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= maxPages; page++) {
    const r = await saplJson(base, `${path}${sep}page_size=100&page=${page}`);
    out.push(...(r.results ?? []));
    if (!r.pagination?.next_page) break;
  }
  return out;
}

/** Usa o SAPL da casa. Retorna null quando não há composição na legislatura atual. */
export async function syncSapl(base: string, uf: string, ctx: SyncContext): Promise<(SyncOutput & { votes: number }) | null> {
  const https = (u?: string | null) => (u ? u.replace(/^http:\/\//i, 'https://') : undefined);
  await ctx.progress('Consultando o SAPL da casa…');
  const legs = await saplAll(base, '/api/parlamentares/legislatura/?o=-numero', 2);
  const t = today();
  const leg = legs.find((l) => l.data_inicio <= t && t <= l.data_fim) ?? null;
  if (!leg) {
    ctx.warnings.push('O SAPL não tem legislatura em curso cadastrada; composição carregada do TSE.');
    return null;
  }

  await ctx.progress('SAPL: mandatos da legislatura atual…');
  const mandatos = (await saplAll(base, `/api/parlamentares/mandato/?legislatura=${leg.id}`)).filter(
    (m) => m.legislatura === leg.id && (!m.data_fim_mandato || m.data_fim_mandato >= t) && (!m.data_inicio_mandato || m.data_inicio_mandato <= t)
  );
  const ids = [...new Set(mandatos.map((m) => Number(m.parlamentar)))];
  if (!ids.length) {
    ctx.warnings.push('O SAPL não tem mandatos em curso cadastrados; composição carregada do TSE.');
    return null;
  }
  const partidos = new Map<number, string>();
  const partido = async (id: number) => {
    if (!partidos.has(id)) partidos.set(id, (await saplJson(base, `/api/parlamentares/partido/${id}/`)).sigla ?? '');
    return partidos.get(id)!;
  };
  const members: HouseMember[] = (
    await pool(ids, 4, async (id) => {
      const p = await saplJson(base, `/api/parlamentares/parlamentar/${id}/`);
      const fil = (await saplAll(base, `/api/parlamentares/filiacao/?parlamentar=${id}`, 2))
        .filter((f) => Number(f.parlamentar) === id && !f.data_desfiliacao)
        .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
      return {
        id: `sapl-${id}`,
        name: p.nome_completo || p.nome_parlamentar,
        popularName: p.nome_parlamentar || p.nome_completo,
        party: fil ? (await partido(Number(fil.partido))) || 'S/Partido' : 'S/Partido',
        uf,
        photoUrl: https(p.fotografia),
        email: p.email || undefined,
        phone: p.telefone || p.telefone_celular || undefined,
        status: mandatos.find((m) => Number(m.parlamentar) === id)?.titular === false ? 'Suplente em exercício' : 'Titular',
      } as HouseMember;
    })
  ).sort((a, b) => a.popularName.localeCompare(b.popularName));

  // Votações nominais registradas no SAPL durante a legislatura.
  await ctx.progress('SAPL: votações nominais…');
  const registros = (await saplAll(base, '/api/sessao/registrovotacao/?o=-data_hora', 60)).filter(
    (r) => String(r.data_hora ?? '').slice(0, 10) >= leg.data_inicio
  );
  const resultados = new Map<number, { nome: string; natureza: string }>();
  const materias = new Map<number, { code: string; ementa: string }>();
  const sessions: HouseSession[] = [];
  await pool(registros, 4, async (reg) => {
    const votos = await saplAll(base, `/api/sessao/votoparlamentar/?votacao=${reg.id}`, 3);
    const votes: Record<string, Vote> = {};
    for (const v of votos) {
      if (Number(v.votacao) !== Number(reg.id)) continue;
      const mv = mapVote(String(v.voto ?? ''));
      if (mv && v.parlamentar) votes[`sapl-${v.parlamentar}`] = mv;
    }
    if (!Object.keys(votes).length) return; // votação simbólica
    if (reg.tipo_resultado_votacao && !resultados.has(reg.tipo_resultado_votacao)) {
      const tr = await saplJson(base, `/api/sessao/tiporesultadovotacao/${reg.tipo_resultado_votacao}/`).catch(() => ({}));
      resultados.set(reg.tipo_resultado_votacao, { nome: tr.nome ?? '', natureza: tr.natureza ?? '' });
    }
    if (reg.materia && !materias.has(reg.materia)) {
      const m = await saplJson(base, `/api/materia/materialegislativa/${reg.materia}/`).catch(() => ({}));
      materias.set(reg.materia, { code: String(m.__str__ ?? `Matéria ${reg.materia}`).split(' - ')[0]!.trim(), ementa: m.ementa ?? '' });
    }
    const res = resultados.get(reg.tipo_resultado_votacao);
    const mat = materias.get(reg.materia) ?? { code: `Votação ${reg.id}`, ementa: '' };
    const approved = res ? res.natureza === 'A' || /aprovad/i.test(res.nome) : (reg.numero_votos_sim ?? 0) > (reg.numero_votos_nao ?? 0);
    const date = String(reg.data_hora).slice(0, 10);
    sessions.push({
      id: `sapl-${reg.id}`,
      date,
      matterCode: mat.code,
      matterTitle: mat.ementa || String(reg.__str__ ?? ''),
      description: String(reg.__str__ ?? ''),
      result: approved ? 'Aprovado' : 'Rejeitado',
      quorumType: quorumFor(mat.code, mat.ementa),
      sessionNumber: String(reg.__str__ ?? '').split(' em ')[1]?.split(' - ')[0]?.trim() || `Sessão de ${date.split('-').reverse().join('/')}`,
      theme: classifyTheme(mat.ementa, String(reg.__str__ ?? '')),
      url: reg.materia ? `${base}/materia/${reg.materia}` : undefined,
      votes,
    });
  });
  await ctx.saveSessions(sessions, { from: leg.data_inicio, to: leg.data_fim });
  if (!sessions.length) ctx.warnings.push('O SAPL da casa não tem votações nominais registradas nesta legislatura.');

  return {
    label: '',
    legislature: String(leg.__str__ ?? `${leg.numero}ª Legislatura`).replace(/\s*\(Atual\)\s*/i, '').trim(),
    members,
    votes: sessions.length,
    sources: [{ name: 'SAPL da casa', url: base, scope: 'Parlamentares em exercício, partido, foto e votações nominais registradas' }],
  };
}
