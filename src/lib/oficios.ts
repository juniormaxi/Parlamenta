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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const knowledge = {
  list: (p: { q?: string; tag?: string }) => {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
    return api<{ items: KnowledgeItem[]; tags: { tag: string; count: number }[] }>(`/tenant/knowledge${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api<KnowledgeItem>(`/tenant/knowledge/${id}`),
};
