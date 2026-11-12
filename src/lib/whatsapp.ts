/** Cliente da integração de WhatsApp (server/whatsapp.ts, via wacli). */
import { api } from './api';

export interface WhatsAppStatus {
  installed: boolean;
  version: string | null;
  canManage: boolean;
  status: 'disconnected' | 'pairing' | 'connected';
  /** Durante o pareamento: aguardando QR, mostrando QR/código, ou sincronizando após escanear. */
  phase: 'starting' | 'qr' | 'code' | 'syncing' | null;
  online: boolean;
  phone: string;
  connectedAt: string | null;
  lastError: string | null;
  alertsEnabled: boolean;
  qrSvg: string | null;
  pairCode: string | null;
  unread: number;
  outbox: { pending: number; failed: number; sent24h: number };
}

export interface WhatsAppChat {
  jid: string;
  name: string;
  kind: string;
  phone: string;
  lastMessageAt: string | null;
  unread: boolean;
  unreadCount: number;
  pinned: boolean;
  archived: boolean;
  preview: { text: string; fromMe: boolean } | null;
}

export interface WhatsAppMessage {
  id: string;
  chatJid: string;
  chatName: string;
  senderJid: string;
  senderName: string;
  fromMe: boolean;
  at: string;
  text: string;
  mediaType: string;
  filename: string;
  revoked: boolean;
  edited: boolean;
  deliveredTo: number;
  readBy: number;
}

export interface WhatsAppOutboxItem {
  id: string;
  to: string;
  body: string;
  kind: string;
  ref: string | null;
  status: 'pending' | 'sent' | 'failed' | 'uncertain';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export const wa = {
  status: () => api<WhatsAppStatus>('/tenant/whatsapp'),
  connect: (phone?: string) => api('/tenant/whatsapp/connect', { method: 'POST', body: phone ? { phone } : {} }),
  cancel: () => api('/tenant/whatsapp/cancel', { method: 'POST', body: {} }),
  disconnect: () => api('/tenant/whatsapp/disconnect', { method: 'POST', body: {} }),
  settings: (alertsEnabled: boolean) => api('/tenant/whatsapp/settings', { method: 'PATCH', body: { alertsEnabled } }),
  chats: (q = '') => api<WhatsAppChat[]>(`/tenant/whatsapp/chats${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  messages: (chat: string, before?: string) =>
    api<{ messages: WhatsAppMessage[]; hasMore: boolean }>(
      `/tenant/whatsapp/messages?chat=${encodeURIComponent(chat)}${before ? `&before=${encodeURIComponent(before)}` : ''}`
    ),
  markRead: (chat: string) => api('/tenant/whatsapp/read', { method: 'POST', body: { chat } }),
  send: (to: string, text: string) => api<{ ok: true; id: string; warning: string | null }>('/tenant/whatsapp/send', { method: 'POST', body: { to, text } }),
  outbox: () => api<WhatsAppOutboxItem[]>('/tenant/whatsapp/outbox'),
  retry: (id: string) => api(`/tenant/whatsapp/outbox/${id}/retry`, { method: 'POST', body: {} }),
};

/** "+5565999990000" → "+55 (65) 99999-0000" (outros países ficam como vieram). */
export function formatPhone(p: string) {
  const d = p.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const n = d.slice(4);
    return `+55 (${d.slice(2, 4)}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
  }
  return p;
}

/** Telefone sem o 55, no formato do formulário de protocolo: "(65) 99999-0000". */
export function localPhone(p: string) {
  const d = p.replace(/\D/g, '');
  const n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (n.length < 10) return p;
  return `(${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
}
