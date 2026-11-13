/**
 * Adaptadores das origens reais da Base de Conhecimento. Cada um lê o registro na tabela do próprio módulo
 * (fonte da verdade) e devolve o documento a publicar — ou null se ele não existir mais / não deva aparecer.
 *
 *  oficio    — Legislativo › Ofícios (official_letters). Visível ao gabinete.
 *  discurso  — Banco de Dados › Discursos (speeches), após a extração do texto. Visível ao gabinete.
 *              O arquivo original não é copiado: file_ref aponta para ele.
 *  protocolo — Protocolos & Demandas (protocols). Só campos estruturados de uma lista fechada (número, tema,
 *              município, situação, prioridade, canal, origem, data); nenhum texto livre nem dado do cidadão.
 *              Restrito a Coordenação de Atendimento, ao responsável e (implicitamente) a Parlamentar/Chefe de Gabinete.
 *  clipping  — Comunicação › Clipping (clipping_items), título e resumo da notícia. Arquivadas saem da base.
 *
 * Não há integração com "documentos legislativos": o módulo não armazena documentos no servidor.
 */
import { db } from '../db';
import { registerSource, type DocInput } from './ingest';
import { THEMES } from '../ai';

const OFICIO_STATUS: Record<string, string> = {
  minuta: 'Minuta',
  revisao_juridica: 'Em revisão jurídica',
  assinado_deputado: 'Assinado',
  protocolado_orgao: 'Protocolado no órgão',
  respondido: 'Respondido',
};
const PROTOCOL_STATUS: Record<string, string> = {
  novo: 'Recebido',
  em_analise: 'Em análise',
  em_execucao: 'Em execução',
  aguardando_orgao: 'Aguardando órgão responsável',
  revisao_coordenador: 'Em revisão final',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
};

const page = (table: string, extra = '') => async (tenantId: string, afterId: string, limit: number) =>
  ((await db.prepare(`SELECT id FROM ${table} WHERE tenant_id = ? AND id > ? ${extra} ORDER BY id LIMIT ?`).all(tenantId, afterId, limit)) as any[]).map(
    (r) => r.id as string
  );

// ---------------------------------------------------------------------------
// Ofícios
// ---------------------------------------------------------------------------
export const OFICIO_TAG = 'Ofícios';
registerSource('oficio', {
  label: 'Ofício',
  listIds: page('official_letters'),
  async load(tenantId, id) {
    const r = (await db.prepare(`SELECT * FROM official_letters WHERE id = ? AND tenant_id = ?`).get(id, tenantId)) as any;
    if (!r) return null;
    const l = JSON.parse(r.data);
    return {
      title: `${l.code} · ${l.subject}`,
      summary: [l.recipientName, l.recipientRole, l.recipientOrg].filter(Boolean).join(' · '),
      content: l.body ?? '',
      tags: [OFICIO_TAG],
      docType: 'oficio',
      docNumber: l.code,
      docDate: l.date || r.created_at,
      authorId: r.created_by,
      meta: {
        code: l.code,
        date: l.date,
        status: l.status,
        statusLabel: OFICIO_STATUS[l.status] ?? l.status,
        recipientName: l.recipientName,
        recipientRole: l.recipientRole,
        recipientOrg: l.recipientOrg,
        cityTarget: l.cityTarget,
        linkedProtocolId: l.linkedProtocolId,
      },
      visibility: 'tenant',
    } satisfies DocInput;
  },
});

// ---------------------------------------------------------------------------
// Discursos
// ---------------------------------------------------------------------------
export const SPEECH_TAG = 'Discursos';
registerSource('discurso', {
  label: 'Discurso',
  listIds: page('speeches', `AND status = 'done'`),
  async load(tenantId, id) {
    const s = (await db.prepare(`SELECT * FROM speeches WHERE id = ? AND tenant_id = ?`).get(id, tenantId)) as any;
    if (!s || s.status !== 'done' || !String(s.text ?? '').trim()) return null;
    let pages: number[] = [];
    try {
      pages = s.text_pages ? JSON.parse(s.text_pages) : [];
    } catch {
      pages = [];
    }
    return {
      title: s.title,
      summary: s.summary || [s.occasion, s.location].filter(Boolean).join(' · '),
      content: s.text,
      pages,
      tags: [SPEECH_TAG],
      docType: 'discurso',
      docDate: s.speech_date,
      authorId: s.created_by,
      fileRef: s.file_kept ? `speech:${s.id}` : '',
      meta: {
        date: s.speech_date,
        occasion: s.occasion,
        location: s.location,
        mediaType: s.media_type,
        fileName: s.file_name,
        themes: JSON.parse(s.themes || '[]'),
        keywords: JSON.parse(s.keywords || '[]'),
        taggedBy: s.tagged_by,
        truncated: !!s.text_truncated,
      },
      visibility: 'tenant',
    } satisfies DocInput;
  },
});

// ---------------------------------------------------------------------------
// Protocolos — LISTA FECHADA de campos estruturados (nenhum texto livre)
// ---------------------------------------------------------------------------
export const PROTOCOL_TAG = 'Protocolos';
export const PROTOCOL_ROLES = ['coordenador_atendimento'];

/**
 * Campos do protocolo que podem ir para a Base de Conhecimento. Mascarar texto livre com expressões regulares
 * não garante anonimização (nomes de terceiros, endereços descritos, apelidos, dados de saúde...). Por isso o
 * assunto, o relato do cidadão, as notas internas, a resposta e os anexos NÃO entram: ficam apenas no módulo
 * Protocolos, sob as permissões dele. A base guarda só categorias controladas e a referência ao original.
 */
export const PROTOCOL_KB_FIELDS = ['number', 'theme', 'city', 'status', 'priority', 'channel', 'origin', 'openedAt'] as const;

const PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const one = (v: unknown, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function protocolKnowledgeFields(r: { number: string; status: string; city: string; source: string; created_at: string }, d: Record<string, any>) {
  return {
    number: one(r.number, 40),
    theme: one(d.theme, 60), // vocabulário controlado (Categorias › Temas de Demanda)
    city: one(r.city, 120),
    status: PROTOCOL_STATUS[r.status] ?? one(r.status, 40),
    priority: PRIORITY_LABEL[d.priority] ?? '',
    channel: one(d.channelLabel || d.channel, 60), // canal cadastrado (Categorias › Canais de Entrada)
    origin: r.source === 'web' ? 'Site do parlamentar' : 'Equipe do gabinete',
    openedAt: String(d.createdAt ?? r.created_at).slice(0, 10),
  } satisfies Record<(typeof PROTOCOL_KB_FIELDS)[number], string>;
}

registerSource('protocolo', {
  label: 'Protocolo',
  listIds: page('protocols'),
  async load(tenantId, id) {
    const r = (await db.prepare(`SELECT * FROM protocols WHERE id = ? AND tenant_id = ?`).get(id, tenantId)) as any;
    if (!r) return null;
    const f = protocolKnowledgeFields(r, JSON.parse(r.data));
    // Tema só entra se for do vocabulário cadastrado do gabinete (protocolos internos aceitam texto livre).
    if (f.theme && !(await db.prepare(`SELECT 1 FROM demand_themes WHERE tenant_id = ? AND name = ?`).get(tenantId, f.theme))) f.theme = 'Outro tema';
    const content = [
      `Protocolo ${f.number}`,
      f.theme ? `Tema: ${f.theme}` : null,
      f.city ? `Município: ${f.city}` : null,
      `Situação: ${f.status}`,
      f.priority ? `Prioridade: ${f.priority}` : null,
      f.channel ? `Canal: ${f.channel}` : null,
      `Origem: ${f.origin}`,
      `Aberto em: ${f.openedAt}`,
      '',
      'O relato, o assunto e os dados do cidadão ficam apenas no módulo Protocolos, conforme as permissões do módulo.',
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
    const d = JSON.parse(r.data);
    const assignee = String(d.assigneeId ?? '').trim();
    const users = assignee
      ? ((await db.prepare(`SELECT id FROM users WHERE id = ? AND tenant_id = ?`).all(assignee, tenantId)) as any[]).map((u) => u.id)
      : [];
    return {
      title: [f.number, f.theme || 'Demanda', f.city].filter(Boolean).join(' · '),
      summary: [f.status, f.priority && `prioridade ${f.priority.toLowerCase()}`, f.origin].filter(Boolean).join(' · '),
      content,
      tags: [PROTOCOL_TAG],
      docType: 'protocolo',
      docNumber: f.number,
      docDate: f.openedAt,
      authorId: null,
      fileRef: `protocol:${r.id}`, // o original continua no módulo Protocolos
      meta: { ...f, statusLabel: f.status, cityTarget: f.city, statusCode: r.status },
      visibility: 'roles',
      acl: { roles: PROTOCOL_ROLES, users },
    } satisfies DocInput;
  },
});

// ---------------------------------------------------------------------------
// Clipping
// ---------------------------------------------------------------------------
export const CLIPPING_TAG = 'Clipping';
registerSource('clipping', {
  label: 'Notícia',
  listIds: page('clipping_items', 'AND archived = 0'),
  async load(tenantId, id) {
    const r = (await db.prepare(`SELECT * FROM clipping_items WHERE id = ? AND tenant_id = ?`).get(id, tenantId)) as any;
    if (!r || r.archived) return null;
    const themes = (JSON.parse(r.themes || '[]') as string[]).filter((t) => (THEMES as readonly string[]).includes(t));
    return {
      title: r.title,
      summary: [r.source_name, String(r.published_at).slice(0, 10)].filter(Boolean).join(' · '),
      content: [r.title, r.summary].filter(Boolean).join('\n\n'),
      tags: [CLIPPING_TAG],
      docType: 'noticia',
      docDate: String(r.published_at).slice(0, 10),
      fileRef: r.url,
      meta: {
        url: r.url,
        sourceName: r.source_name,
        domain: r.source_domain,
        date: String(r.published_at).slice(0, 10),
        sentiment: r.sentiment_manual ?? r.sentiment_auto,
        themes,
        topics: JSON.parse(r.topics || '[]'),
      },
      visibility: 'tenant',
    } satisfies DocInput;
  },
});
