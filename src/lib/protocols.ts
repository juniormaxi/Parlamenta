import type { Protocol, SLAStatus } from '../types';

/** Tag aplicada pelo servidor a toda demanda aberta pelo formulário do site do parlamentar. */
export const WEB_DEMAND_TAG = 'Demanda Web';

/** Recalcula horas decorridas e situação de SLA de um protocolo vindo do servidor. */
export function hydrateProtocol(p: Protocol): Protocol {
  const now = Date.now();
  const created = Date.parse(p.createdAt) || now;
  const deadline = Date.parse(p.deadline) || now;
  const closed = p.status === 'resolvido' || p.status === 'cancelado';
  const slaStatus: SLAStatus = closed ? 'normal' : now > deadline ? 'atrasado' : deadline - now < 48 * 3600_000 ? 'alerta_48h' : 'normal';
  return {
    ...p,
    persisted: true,
    slaStatus,
    hoursElapsedTotal: Math.max(0, Math.round((now - created) / 3600_000)),
    hoursElapsedWithAssignee: p.hoursElapsedWithAssignee ?? 0,
    attachments: p.attachments ?? [],
    tags: p.tags ?? [],
    timeline: p.timeline ?? [],
  };
}
