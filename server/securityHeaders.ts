/**
 * Cabeçalhos de segurança de todas as respostas (páginas e API).
 *
 * Content-Security-Policy: scripts só do próprio domínio (o build do Vite não tem script inline). Estilos
 * inline são necessários (atributos style do React e do Leaflet); imagens https (fotos oficiais de
 * parlamentares e mapas); fontes do Google Fonts; CSS do Leaflet no unpkg (com SRI no index.html).
 * A página pública do cidadão (/site/<gabinete>) pode ser incorporada em qualquer site; o resto, não.
 */
import type { Request, Response, NextFunction } from 'express';

export function contentSecurityPolicy(opts: { production: boolean; embeddable: boolean }) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${opts.embeddable ? '*' : "'none'"}`,
    ...(opts.production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function securityHeaders(opts: { production: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const embeddable = req.path.startsWith('/site/');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!embeddable) res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy({ production: opts.production, embeddable }));
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // HTTPS é garantido pela borda da Railway; o navegador passa a recusar HTTP neste domínio por 1 ano.
    if (opts.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}
