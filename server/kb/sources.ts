/**
 * Adaptadores das origens reais da Base de Conhecimento. Cada um lê o registro na tabela do próprio módulo
 * (fonte da verdade) e devolve o documento a publicar — ou null se ele não existir mais / não deva aparecer.
 *
 *  oficio    — Legislativo › Ofícios (official_letters). Visível ao gabinete.
 *  discurso  — Banco de Dados › Discursos (speeches), após a extração do texto. Visível ao gabinete.
 *              O arquivo original não é copiado: file_ref aponta para ele.
 *  protocolo — Protocolos & Demandas (protocols). SEM dados pessoais do cidadão (nome, telefone, e-mail,
 *              endereço; CPF/telefones/e-mails no texto são mascarados). Restrito a Coordenação de Atendimento,
 *              ao responsável pelo protocolo e (implicitamente) a Parlamentar/Chefe de Gabinete.
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
// Protocolos — sem dados pessoais
// ---------------------------------------------------------------------------
export const PROTOCOL_TAG = 'Protocolos';
export const PROTOCOL_ROLES = ['coordenador_atendimento'];

/** Masks personal data in free text: the citizen's name, e-mails, phone numbers, CPF and CEP. */
export function redactPersonalData(text: string, names: string[] = []): string {
  let s = String(text ?? '');
  s = s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]');
  s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]');
  s = s.replace(/(\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, '[telefone]');
  s = s.replace(/\b\d{5}-\d{3}\b/g, '[CEP]');
  const parts = new Set<string>();
  for (const n of names) {
    const full = String(n ?? '').trim();
    if (full.length >= 3) parts.add(full);
    for (const p of full.split(/\s+/)) if (p.length >= 4 && !/^(da|de|do|das|dos)$/i.test(p)) parts.add(p);
  }
  for (const p of [...parts].sort((a, b) => b.length - a.length)) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, 'giu'), '[cidadão]');
  }
  return s;
}

registerSource('protocolo', {
  label: 'Protocolo',
  listIds: page('protocols'),
  async load(tenantId, id) {
    const r = (await db.prepare(`SELECT * FROM protocols WHERE id = ? AND tenant_id = ?`).get(id, tenantId)) as any;
    if (!r) return null;
    const d = JSON.parse(r.data);
    const names = [d.citizenName].filter(Boolean);
    const red = (v: unknown) => redactPersonalData(String(v ?? ''), names).trim();
    const status = PROTOCOL_STATUS[r.status] ?? r.status;
    const subject = red(d.subject);
    const content = [
      `Protocolo ${r.number}`,
      d.theme ? `Tema: ${d.theme}` : '',
      r.city ? `Município: ${r.city}` : '',
      `Situação: ${status}`,
      d.priority ? `Prioridade: ${d.priority}` : '',
      d.channelLabel || d.channel ? `Canal: ${d.channelLabel || d.channel}` : '',
      '',
      `Assunto: ${subject}`,
      '',
      'Demanda:',
      red(d.description),
      d.resolutionNotes ? `\nEncaminhamento / resolução:\n${red(d.resolutionNotes)}` : '',
      d.citizenFeedbackStatus === 'enviada_sucesso' && d.citizenFeedbackText ? `\nResposta do gabinete:\n${red(d.citizenFeedbackText)}` : '',
    ]
      .filter((l, i, a) => l !== '' || a[i - 1] !== '')
      .join('\n');
    const assignee = String(d.assigneeId ?? '').trim();
    const users = assignee
      ? ((await db.prepare(`SELECT id FROM users WHERE id = ? AND tenant_id = ?`).all(assignee, tenantId)) as any[]).map((u) => u.id)
      : [];
    return {
      title: `${r.number} · ${subject}`,
      summary: [d.theme, r.city, status].filter(Boolean).join(' · '),
      content,
      tags: [PROTOCOL_TAG],
      docType: 'protocolo',
      docNumber: r.number,
      docDate: String(d.createdAt ?? r.created_at).slice(0, 10),
      authorId: null,
      meta: {
        number: r.number,
        status: r.status,
        statusLabel: status,
        theme: d.theme ?? '',
        cityTarget: r.city,
        priority: d.priority ?? '',
        source: r.source,
        // deliberately absent: citizenName, citizenPhone, citizenEmail, address, attachments
      },
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
