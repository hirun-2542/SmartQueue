import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const base = process.env.SMARTQUEUE_URL ?? 'http://127.0.0.1:5290';
export const mailBase = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8026';
export const password = 'QueuePass123!';
export const uniqueEmail = () => `owner-${randomUUID()}@example.test`;

export class ApiClient {
  cookies = new Map();
  csrf = '';
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k,v]) => `${k}=${v}`).join('; '));
    if (options.method && options.method !== 'GET') headers.set('X-CSRF', this.csrf);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(base + path, { ...options, headers, redirect: 'manual', body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const equal = pair.indexOf('=');
      this.cookies.set(pair.slice(0,equal),pair.slice(equal+1));
    }
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body, headers: response.headers };
  }
  async session() {
    const result = await this.request('/api/session');
    assert.equal(result.status, 200, 'session endpoint must issue a CSRF token');
    this.csrf = result.body.csrf;
    return result.body;
  }
  post(path, body) { return this.request(path, {method:'POST', body}); }
}

export async function emailLink(email, kind) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const listing = await fetch(`${mailBase}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then(r=>r.json());
    for (const message of listing.messages ?? []) {
      const detail = await fetch(`${mailBase}/api/v1/message/${message.ID}`).then(r=>r.json());
      const text = `${detail.Text ?? ''} ${detail.HTML ?? ''}`;
      const matches = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
      const match = matches.find(link => link.includes(`/account/${kind}`));
      if (match) return new URL(match.replaceAll('&amp;', '&'));
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`No ${kind} email delivered to capture mailbox for ${email}`);
}

export async function verifiedOwner() {
  const api = new ApiClient();
  await api.session();
  const email = uniqueEmail();
  assert.equal((await api.post('/api/account/register', {email,password,language:'en'})).status, 200);
  const link = await emailLink(email,'verify');
  assert.equal((await api.post('/api/account/verify', {userId:link.searchParams.get('userId'),code:link.searchParams.get('code')})).status,200);
  assert.equal((await api.post('/api/account/login',{email,password})).status,200);
  await api.session();
  return {api,email};
}
