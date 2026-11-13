/**
 * Banco de Dados › Base de Conhecimento: acervo dos documentos produzidos pelo gabinete.
 * Os módulos de origem (ex.: Ofícios) publicam aqui via upsertKnowledge(); cada item leva etiquetas.
 * Montado em /api/tenant/knowledge — sempre filtrado por req.auth.tenantId.
 */
import crypto from 'node:crypto';
import express from 'express';
import { db } from './db';
import { HttpError } from './http';
import { buildKnowledgeGraph, themesOf } from './knowledgeGraph';

export const knowledgeRouter = express.Router();

export async function upsertKnowledge(e: {
  tenantId: string;
  source: string;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  meta: Record<string, unknown>;
  userId: string | null;
}) {
  await db
    .prepare(
      `INSERT INTO knowledge_items (id, tenant_id, source, source_id, title, summary, content, tags, meta, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
         title = EXCLUDED.title, summary = EXCLUDED.summary, content = EXCLUDED.content,
         tags = EXCLUDED.tags, meta = EXCLUDED.meta, updated_at = datetime('now')`
    )
    .run(
      crypto.randomUUID(),
      e.tenantId,
      e.source,
      e.sourceId,
      e.title.slice(0, 500),
      e.summary.slice(0, 1000),
      e.content,
      JSON.stringify(e.tags),
      JSON.stringify(e.meta),
      e.userId
    );
}

export async function removeKnowledge(tenantId: string, source: string, sourceId: string) {
  await db.prepare(`DELETE FROM knowledge_items WHERE tenant_id = ? AND source = ? AND source_id = ?`).run(tenantId, source, sourceId);
}

const mapItem = (r: any, full = false) => ({
  id: r.id,
  source: r.source,
  sourceId: r.source_id,
  title: r.title,
  summary: r.summary,
  ...(full ? { content: r.content } : {}),
  tags: JSON.parse(r.tags || '[]') as string[],
  meta: JSON.parse(r.meta || '{}'),
  createdBy: r.created_by_name ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

knowledgeRouter.get('/', async (req, res) => {
  const t = req.auth!.tenantId!;
  const where = ['k.tenant_id = ?'];
  const params: unknown[] = [t];
  const q = String(req.query.q ?? '').trim().slice(0, 100).toLowerCase();
  if (q) {
    where.push('(lower(k.title) LIKE ? OR lower(k.summary) LIKE ? OR lower(k.content) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const tag = String(req.query.tag ?? '').trim();
  if (tag) {
    where.push(`jsonb_exists(k.tags::jsonb, ?)`); // o operador "?" do jsonb colidiria com os placeholders
    params.push(tag);
  }
  const rows = (await db
    .prepare(
      `SELECT k.*, u.name AS created_by_name FROM knowledge_items k LEFT JOIN users u ON u.id = k.created_by
        WHERE ${where.join(' AND ')} ORDER BY k.updated_at DESC LIMIT 500`
    )
    .all(...params)) as any[];
  const tagRows = (await db
    .prepare(`SELECT x AS tag, COUNT(*)::int AS n FROM knowledge_items, jsonb_array_elements_text(tags::jsonb) AS x WHERE tenant_id = ? GROUP BY x ORDER BY x`)
    .all(t)) as any[];
  res.json({
    items: rows.map((r) => ({ ...mapItem(r), themes: themesOf({ title: r.title, summary: r.summary, content: r.content ?? '' }).map((t) => t.theme) })),
    tags: tagRows.map((r) => ({ tag: r.tag, count: r.n })),
  });
});

/** Mapa Neural: temas, documentos, entidades e conexões do acervo do gabinete. */
knowledgeRouter.get('/graph', async (req, res) => {
  const rows = (await db
    .prepare(`SELECT id, source, source_id, title, summary, content, tags, meta, created_at FROM knowledge_items WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 600`)
    .all(req.auth!.tenantId)) as any[];
  res.json(
    buildKnowledgeGraph(
      rows.map((r) => ({
        id: r.id,
        source: r.source,
        sourceId: r.source_id,
        title: r.title,
        summary: r.summary,
        content: r.content ?? '',
        tags: JSON.parse(r.tags || '[]'),
        meta: JSON.parse(r.meta || '{}'),
        createdAt: r.created_at,
      }))
    )
  );
});

knowledgeRouter.get('/:id', async (req, res) => {
  const r = await db
    .prepare(`SELECT k.*, u.name AS created_by_name FROM knowledge_items k LEFT JOIN users u ON u.id = k.created_by WHERE k.id = ? AND k.tenant_id = ?`)
    .get(req.params.id, req.auth!.tenantId);
  if (!r) throw new HttpError(404, 'Item não encontrado.');
  res.json(mapItem(r, true));
});
