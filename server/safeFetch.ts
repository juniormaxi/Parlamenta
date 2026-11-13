/**
 * SSRF-safe HTTP GET for user-supplied URLs (clipping feeds/sites).
 * - only http/https, standard ports
 * - the resolved IP is checked at *connect time* (custom `lookup`), so DNS rebinding
 *   cannot point an approved hostname at an internal address
 * - blocks loopback, private, link-local, CGNAT, multicast, reserved and IPv6 local ranges
 * - redirects are followed manually (max 4) and every hop is re-validated
 * - response size and total time are capped; gzip/deflate/br are decoded
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';

const UA = 'Mozilla/5.0 (compatible; ParlamenttaClipping/1.0; +https://parlamentta.app)';

export class FetchError extends Error {}

function ipv4ToInt(ip: string) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1') return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(l) || l.startsWith('64:ff9b:') || l.startsWith('2001:db8');
  }
  return true;
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || !list.length) return (callback as any)(new FetchError('Endereço de rede não permitido.'));
    if ((options as any)?.all) return (callback as any)(null, list);
    (callback as any)(null, list[0]!.address, list[0]!.family);
  });
};

export function assertPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchError('URL inválida.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchError('Use um endereço http ou https.');
  if (u.username || u.password) throw new FetchError('URL com credenciais não é permitida.');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new FetchError('Porta não permitida.');
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isBlockedIp(u.hostname.replace(/^\[|\]$/g, ''))) {
    throw new FetchError('Endereço de rede não permitido.');
  }
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(u.hostname)) throw new FetchError('Endereço de rede não permitido.');
  return u;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

function once(url: URL, timeoutMs: number, maxBytes: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: timeoutMs,
        headers: {
          'User-Agent': UA,
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      },
      (res) => {
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new FetchError('Resposta grande demais.'));
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new FetchError('Tempo de resposta esgotado.')));
    req.on('error', reject);
    req.end();
  });
}

export async function safeGet(raw: string, { timeoutMs = 12_000, maxBytes = 4 * 1024 * 1024 } = {}): Promise<SafeResponse> {
  let url = assertPublicUrl(raw);
  for (let hop = 0; hop <= 4; hop++) {
    const r = await once(url, timeoutMs, maxBytes);
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
      url = assertPublicUrl(new URL(String(r.headers.location), url).toString());
      continue;
    }
    const contentType = String(r.headers['content-type'] ?? '');
    const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
    let body = r.body.toString(charset === 'iso-8859-1' || charset === 'latin1' || charset === 'windows-1252' ? 'latin1' : 'utf8');
    if (!charset && body.includes('�') && /encoding=["']iso-8859-1/i.test(body.slice(0, 200))) body = r.body.toString('latin1');
    return { url: url.toString(), status: r.status, contentType, body };
  }
  throw new FetchError('Redirecionamentos demais.');
}
