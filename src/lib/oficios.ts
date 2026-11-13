/** Clientes de Ofícios (server/oficios.ts) e da Base de Conhecimento (server/knowledge.ts). */
import { api } from './api';
import type { OfficialLetterModel } from '../types';

export type LetterInput = Omit<OfficialLetterModel, 'id'>;

export const oficios = {
  list: () => api<OfficialLetterModel[]>('/tenant/oficios'),
  create: (l: LetterInput) => api<OfficialLetterModel>('/tenant/oficios', { method: 'POST', body: l }),
  update: (id: string, l: Partial<LetterInput>) => api<OfficialLetterModel>(`/tenant/oficios/${id}`, { method: 'PATCH', body: l }),
  remove: (id: string) => api(`/tenant/oficios/${id}`, { method: 'DELETE' }),
};

export type KnowledgeVisibility = 'tenant' | 'roles' | 'users' | 'confidential';

export interface KnowledgeItem {
  id: string;
  source: string;
  sourceId: string;
  title: string;
  summary: string;
  content?: string;
  tags: string[];
  /** Temas identificados automaticamente no conteúdo. */
  themes?: string[];
  meta: Record<string, any>;
  visibility?: KnowledgeVisibility;
  version?: number;
  indexStatus?: 'pending' | 'indexed' | 'error' | 'skipped';
  indexError?: string | null;
  docType?: string;
  docNumber?: string;
  docDate?: string;
  canManage?: boolean;
  aclManaged?: 'source' | 'manual';
  acl?: { roles: string[]; users: string[] };
  sameContent?: { id: string; source: string; title: string }[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeMetrics {
  documents: { source: string; docs: number; bytes: number }[];
  totals: { docs: number; bytes: number };
  indexing: { pending?: number; error?: number };
  queue: {
    byStatus: { kind: string; status: string; n: number; oldest_queued: string | null }[];
    last24h: { kind: string; n: number; avg_ms: number; p95_ms: number }[];
    recentErrors: { kind: string; ref: string; attempts: number; last_error: string; finished_at: string }[];
  };
  graph: { dirty: boolean; built_at: string | null; duration_ms: number | null; docs: number; links: number; error: string } | null;
  timings: { name: string; count: number; errors: number; avgMs: number | null; p95Ms: number | string | null; maxMs: number }[];
}

export const knowledge = {
  list: (p: { q?: string; tag?: string }) => {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
    return api<{ items: KnowledgeItem[]; tags: { tag: string; count: number }[] }>(`/tenant/knowledge${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api<KnowledgeItem>(`/tenant/knowledge/${id}`),
  accessOptions: () => api<{ roles: string[]; users: { id: string; name: string; role: string }[] }>('/tenant/knowledge/access-options'),
  setAccess: (id: string, body: { visibility: KnowledgeVisibility; roles: string[]; users: string[] }) =>
    api<{ ok: boolean }>(`/tenant/knowledge/${id}/access`, { method: 'PUT', body }),
  reprocess: (id: string) => api<{ ok: boolean }>(`/tenant/knowledge/${id}/reprocess`, { method: 'POST' }),
  metrics: () => api<KnowledgeMetrics>('/tenant/knowledge/metrics'),
};
