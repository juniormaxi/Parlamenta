/** Thin client for the Parlamentta API (server/). Session lives in an httpOnly cookie. */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      // Required by the server's CSRF guard on state-changing requests.
      'X-Parlamentta-Request': '1',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? (res.status >= 500 || res.status === 404 ? 'API indisponível. Verifique se o servidor (npm run dev:api) está rodando.' : `Erro ${res.status}`)
    );
  }
  return data as T;
}

export type PlatformRole =
  | 'super_admin'
  | 'deputado'
  | 'chefe_gabinete'
  | 'coordenador_atendimento'
  | 'assessor_parlamentar'
  | 'comunicacao';

export interface ApiUser {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  role: PlatformRole;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ApiTenant {
  id: string;
  slug: string;
  name: string;
  parliamentarian: string;
  sphere: 'estadual' | 'federal' | 'municipal';
  house: string;
  state: string;
  /** Município (esfera municipal). */
  city: string;
  /** Cadeiras do plenário; 0 = padrão da esfera (ver src/lib/chamber.ts). */
  seats: number;
  status: 'active' | 'suspended';
  storageQuotaMb: number;
  maxUsers: number;
  createdAt: string;
}

export interface Session {
  user: ApiUser;
  tenant: ApiTenant | null;
}

/**
 * Uploads a File as the raw request body (no multipart), reporting progress.
 * The server reads the original name from the X-File-Name header.
 */
export function uploadFile<T = unknown>(
  path: string,
  file: File,
  { method = 'POST', onProgress }: { method?: string; onProgress?: (fraction: number) => void } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Parlamentta-Request', '1');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* empty */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, data?.error ?? `Erro ${xhr.status} no envio do arquivo.`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Falha de rede durante o envio do arquivo.'));
    xhr.send(file);
  });
}
