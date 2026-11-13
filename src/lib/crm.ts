/** Cliente do CRM de leads (server/crm.ts). */
import { api, uploadFile } from './api';

export type LeadStatus = 'novo' | 'contatado' | 'interessado' | 'retornar' | 'sem_resposta' | 'sem_interesse' | 'numero_invalido' | 'convertido';

export interface Lead {
  id: string;
  importId: string | null;
  name: string;
  email: string;
  phone: string;
  /** Telefone no formato do WhatsApp (+55...), ou null se não for um celular válido. */
  waPhone: string | null;
  city: string;
  notes: string;
  agentNotes: string;
  status: LeadStatus;
  statusAt: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  assignedAt: string | null;
  lastContactAt: string | null;
  contactCount: number;
  createdAt: string;
}

export interface CrmUser {
  id: string;
  name: string;
  role: string;
  total: number;
  open: number;
}

export interface CrmImport {
  id: string;
  name: string;
  fileName: string;
  total: number;
  remaining: number;
  createdAt: string;
  createdBy: string;
}

export interface CrmMeta {
  canManage: boolean;
  me: string;
  users: CrmUser[];
  unassigned: number;
  imports: CrmImport[];
}

export interface LeadPage {
  scope: 'mine' | 'all';
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<LeadStatus, number>>;
  items: Lead[];
}

export interface LeadEvent {
  kind: string;
  detail: string;
  at: string;
  user: string;
}

export interface ImportPreview {
  token: string;
  fileName: string;
  valid: number;
  duplicates: number;
  withoutWhatsApp: number;
  skippedExamples: number;
  ignoredColumns: string[];
  errors: { line: number; name: string; reason: string }[];
  errorCount: number;
  sample: { line: number; name: string; email: string; phone: string; city: string; notes: string; duplicate: boolean }[];
}

const qs = (p: Record<string, string | number | undefined>) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

export const crm = {
  meta: () => api<CrmMeta>('/tenant/crm/meta'),
  leads: (p: { scope: 'mine' | 'all'; status?: string; q?: string; assignee?: string; importId?: string; page?: number }) =>
    api<LeadPage>(`/tenant/crm/leads?${qs(p)}`),
  events: (id: string) => api<LeadEvent[]>(`/tenant/crm/leads/${id}/events`),
  update: (id: string, body: Partial<Pick<Lead, 'status' | 'agentNotes' | 'name' | 'email' | 'phone' | 'city' | 'notes'>>) =>
    api<Lead>(`/tenant/crm/leads/${id}`, { method: 'PATCH', body }),
  sendWhatsApp: (id: string, text: string) =>
    api<{ lead: Lead; warning: string | null }>(`/tenant/crm/leads/${id}/whatsapp`, { method: 'POST', body: { text } }),
  markContacted: (id: string, text: string) => api<{ lead: Lead }>(`/tenant/crm/leads/${id}/contacted`, { method: 'POST', body: { text } }),
  assign: (leadIds: string[], userId: string | null) => api<{ updated: number }>('/tenant/crm/assign', { method: 'POST', body: { leadIds, userId } }),
  distribute: (body: { userIds: string[]; leadIds?: string[]; scope?: 'unassigned' }) =>
    api<{ distributed: number; perUser: Record<string, number> }>('/tenant/crm/distribute', { method: 'POST', body }),
  remove: (leadIds: string[]) => api<{ deleted: number }>('/tenant/crm/leads/delete', { method: 'POST', body: { leadIds } }),
  removeImport: (id: string) => api<{ deleted: number }>(`/tenant/crm/imports/${id}`, { method: 'DELETE' }),
  preview: (file: File, onProgress?: (f: number) => void) => uploadFile<ImportPreview>('/tenant/crm/import/preview', file, { onProgress }),
  confirm: (token: string, body: { userIds: string[]; skipDuplicates: boolean; name: string }) =>
    api<{ importId: string; imported: number; perUser: Record<string, number> }>(`/tenant/crm/import/${token}/confirm`, { method: 'POST', body }),
  templateUrl: '/api/tenant/crm/template',
};
