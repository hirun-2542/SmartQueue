export interface Owner { id: string; email: string }
export interface Session { csrf: string; owner: Owner | null }
export class ApiFailure extends Error {
  constructor(public code: string, public status: number, public details?: unknown, public current?: unknown) { super(code); }
}
let csrf = '';
export async function session(): Promise<Session> {
  const response = await fetch('/api/session', { credentials: 'same-origin' });
  if (!response.ok) throw new ApiFailure('request_failed', response.status);
  const value = await response.json() as Session;
  csrf = value.csrf;
  return value;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && !['GET', 'HEAD'].includes(init.method)) {
    if (!csrf) await session();
    headers.set('X-CSRF', csrf);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(value?.code ?? 'request_failed', response.status, value?.errors, value?.current);
  return value as T;
}
export const post = <T,>(path: string, body: unknown) => api<T>(path, {method:'POST', body:JSON.stringify(body)});
