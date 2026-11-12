import type { ChannelType } from '../types';

/**
 * Canais de entrada são cadastrados livremente em Categorias; esta função escolhe o canal técnico
 * mais próximo (usado para ícones, filtros e SLA) a partir do nome digitado pelo gabinete.
 */
export function channelTypeFromName(name: string): ChannelType {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (n.includes('whats')) return 'whatsapp';
  if (n.includes('insta')) return 'instagram';
  if (n.includes('messenger') || n.includes('facebook')) return 'messenger';
  if (n.includes('mail')) return 'email';
  if (/telef|ligac|fone/.test(n)) return 'telefone';
  return 'presencial';
}
