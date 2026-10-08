import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ApiClient, base, verifiedOwner } from './client.mjs';

const recordSeparator = '\u001e';
const projectPath = fileURLToPath(new URL('../server/SmartQueue.Api.csproj', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Minimal SignalR JSON-protocol client over the WebSocket transport, with cookies for Owner scopes. */
class LiveClient {
  static async open(url, cookies = null) {
    const client = new LiveClient(url, cookies);
    await client.connect();
    return client;
  }
  constructor(url, cookies) {
    this.url = url;
    this.cookies = cookies;
    this.buffer = '';
    this.sequence = 0;
    this.pending = new Map();
    this.invocations = [];
    this.waiters = [];
    this.handshake = null;
    this.closed = false;
  }
  async connect() {
    const socketUrl = `${this.url.replace(/^http/, 'ws')}/live`;
    const options = this.cookies?.size ? { headers: { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ') } } : undefined;
    const socket = new WebSocket(socketUrl, options);
    this.socket = socket;
    const ready = new Promise((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`live socket refused at ${socketUrl}`)), { once: true });
    });
    socket.addEventListener('message', event => this.receive(event.data));
    socket.addEventListener('close', () => {
      this.closed = true;
      for (const pending of this.pending.values()) pending.reject(new Error('live socket closed'));
      this.pending.clear();
    });
    await ready;
    const handshake = new Promise(resolve => { this.handshake = resolve; });
    this.send({ protocol: 'json', version: 1 });
    await handshake;
  }
  send(message) { this.socket.send(JSON.stringify(message) + recordSeparator); }
  receive(raw) {
    this.buffer += typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
    let end;
    while ((end = this.buffer.indexOf(recordSeparator)) >= 0) {
      const frame = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!frame) continue;
      const message = JSON.parse(frame);
      if (message.type === 1 && typeof message.target === 'string') {
        this.publish({ target: message.target, value: message.arguments?.[0] });
        continue;
      }
      if (message.type === 3) {
        const pending = this.pending.get(message.invocationId);
        if (!pending) continue;
        this.pending.delete(message.invocationId);
        if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
        continue;
      }
      if (message.type === 6 || message.type === 7) continue;
      const handshake = this.handshake;
      this.handshake = null;
      handshake?.();
    }
  }
  publish(invocation) {
    const index = this.waiters.findIndex(waiter => waiter.target === invocation.target);
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(invocation.value);
      return;
    }
    this.invocations.push(invocation);
  }
  invoke(target, ...args) {
    const invocationId = String(++this.sequence);
    const result = new Promise((resolve, reject) => this.pending.set(invocationId, { resolve, reject }));
    this.send({ type: 1, invocationId, target, arguments: args });
    return result;
  }
  next(target, timeout = 8000) {
    const queued = this.invocations.findIndex(invocation => invocation.target === target);
    if (queued >= 0) return Promise.resolve(this.invocations.splice(queued, 1)[0].value);
    return new Promise((resolve, reject) => {
      const waiter = {
        target,
        resolve,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error(`no ${target} received within ${timeout}ms`));
        }, timeout),
      };
      this.waiters.push(waiter);
    });
  }
  snapshot(timeout) { return this.next('snapshot', timeout); }
  update(timeout) { return this.next('update', timeout); }
  async subscribe(target, ...args) {
    await this.invoke(target, ...args);
    return this.snapshot();
  }
  async silence(milliseconds = 1200) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    return this.invocations.splice(0, this.invocations.length);
  }
  close() {
    this.closed = true;
    this.socket.close();
  }
}

async function requestAt(url, path, { method = 'GET', body, cookies, csrf } = {}) {
  const headers = {};
  if (cookies?.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  if (method !== 'GET') {
    headers['X-CSRF'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

const consoleOf = (client, url, shopId, queueId) =>
  requestAt(url, `/api/shops/${shopId}/console?queueId=${queueId}`, { cookies: client.cookies, csrf: client.csrf });

async function liveFixture(name) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const service = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Cut', prefix: 'A', callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
  assert.equal((await owner.post(`/api/queues/${service.queue.id}/open`, {})).status, 200, 'a Queue must be Open before live Tickets are issued');
  const guest = new ApiClient();
  await guest.session();
  return { owner, shop, service, guest };
}

async function takeTicket(guest, queueId, note = null) {
  const issued = await guest.post(`/api/queues/${queueId}/tickets`, { requestId: randomUUID(), note, confirmExtra: true });
  assert.equal(issued.status, 201, 'taking a Ticket must succeed before its live update is observed');
  return issued.body;
}

let second = null;

async function secondInstance() {
  if (second) return second;
  const configured = process.env.SMARTQUEUE_URL_2;
  if (configured) {
    second = { url: configured.replace(/\/+$/, ''), stop: async () => {} };
    return second;
  }
  const port = Number(process.env.SMARTQUEUE_PORT_2 ?? 5291);
  const url = `http://127.0.0.1:${port}`;
  const settings = JSON.parse(await readFile(new URL('../server/appsettings.Development.json', import.meta.url), 'utf8'));
  const connectionString = process.env.SMARTQUEUE_DB ?? settings.ConnectionStrings?.Database;
  const log = [];
  const child = spawn(process.env.SMARTQUEUE_DOTNET ?? 'dotnet', ['run', '--project', projectPath, '--no-launch-profile', '--urls', url], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', ...(connectionString ? { ConnectionStrings__Database: connectionString } : {}) },
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      log.push(chunk.toString());
      if (log.length > 40) log.shift();
    });
  }
  const stop = async () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    const deadline = Date.now() + 5000;
    while (child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }
  };
  const instance = { url, stop };
  second = instance;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      second = null;
      throw new Error(`second API instance exited with code ${child.exitCode}: ${log.join('')}`);
    }
    try {
      if ((await fetch(`${url}/api/health`)).ok) return instance;
    } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  second = null;
  await stop();
  throw new Error(`second API instance never became ready at ${url}: ${log.join('')}`);
}

after(async () => { if (second) await second.stop(); });

test('Owner console and public board subscriptions carry committed changes without private data', async () => {
  const { owner, shop, service, guest } = await liveFixture('Live Privacy Shop');
  const console = await LiveClient.open(base, owner.cookies);
  const initial = await console.subscribe('SubscribeShop', shop.id, service.queue.id);
  assert.equal(initial.kind, 'shop', 'an Owner subscription must reply with a Shop snapshot');
  assert.equal(initial.console.selectedQueueId, service.queue.id, 'the Owner snapshot must cover the selected Queue');
  assert.ok(Math.abs(Date.now() - Date.parse(initial.serverTime)) < 10000, 'live messages must carry server time');

  const board = await LiveClient.open(base, null);
  const boardInitial = await board.subscribe('SubscribePublic', shop.publicId);
  assert.equal(boardInitial.kind, 'public');
  assert.equal(boardInitial.publicId, shop.publicId);
  assert.equal(boardInitial.console, null, 'a public scope must never receive Owner console data');
  assert.equal(boardInitial.ticket, null, 'a public scope must never receive Ticket data');

  const issued = await takeTicket(guest, service.queue.id, 'Private live note');
  const ownerUpdate = await console.update();
  assert.equal(ownerUpdate.kind, 'shop');
  assert.ok(ownerUpdate.version > initial.version, 'a committed Ticket must move the Shop version forward');
  assert.equal(ownerUpdate.console.waiting.length, 1, 'the Owner console must show the committed Waiting Ticket');
  assert.equal(ownerUpdate.console.waiting[0].note, 'Private live note', 'the Owner scope keeps the private note');

  const boardUpdate = await board.update();
  assert.equal(boardUpdate.kind, 'public');
  assert.ok(boardUpdate.version > boardInitial.version);
  assert.equal(boardUpdate.console, null);
  assert.equal(boardUpdate.ticket, null);
  assert.equal(JSON.stringify(boardUpdate).includes('Private live note'), false, 'public channels must never carry a Customer note');
  assert.equal(JSON.stringify(boardUpdate).includes(issued.link.replace('/t/', '')), false, 'public channels must never carry the private Ticket link');

  const other = (await owner.post('/api/shops', { name: 'Live Other Shop' })).body;
  const otherService = (await owner.post(`/api/shops/${other.id}/services`, { name: 'Wash', prefix: 'B', callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
  await owner.post(`/api/queues/${otherService.queue.id}/open`, {});
  await takeTicket(guest, otherService.queue.id);
  assert.deepEqual(await console.silence(1000), [], 'a subscription for one Shop must not receive another Shop of the same Owner');

  const { api: stranger } = await verifiedOwner();
  const intruder = await LiveClient.open(base, stranger.cookies);
  await assert.rejects(() => intruder.invoke('SubscribeShop', shop.id, null), /not_found/, 'another Owner must not subscribe to a Shop they do not own');
  await assert.rejects(() => intruder.invoke('SubscribePublic', 'missing-public-id'), /not_found/, 'an unknown public Shop must be refused');
  await takeTicket(guest, service.queue.id);
  assert.deepEqual(await intruder.silence(1000), [], 'a refused Owner subscription must receive no private data');

  console.close();
  board.close();
  intruder.close();
});

test('private Ticket subscriptions follow committed transitions and refuse unknown links', async () => {
  const { owner, shop, service, guest } = await liveFixture('Live Ticket Shop');
  const issued = await takeTicket(guest, service.queue.id, 'Hidden note');
  const secret = issued.link.replace('/t/', '');
  const ticket = await LiveClient.open(base, null);
  const initial = await ticket.subscribe('SubscribeTicket', secret);
  assert.equal(initial.kind, 'ticket');
  assert.equal(initial.ticketId, issued.ticket.id);
  assert.equal(initial.ticket.status, 'Waiting');
  assert.equal(initial.ticket.note ?? null, null, 'a Customer snapshot must not expose the private note');
  assert.equal(JSON.stringify(initial).includes('Hidden note'), false);

  const view = (await consoleOf(owner, base, shop.id, service.queue.id)).body;
  const call = await owner.post(`/api/queues/${service.queue.id}/call`, { version: view.version });
  assert.equal(call.status, 200);
  const called = await ticket.update();
  assert.equal(called.ticket.status, 'Called');
  assert.ok(called.version > initial.version, 'Ticket updates must only move forward in version');
  assert.equal(called.ticket.number, call.body.number);

  const start = await owner.post(`/api/tickets/${call.body.id}/start`, { version: call.body.version });
  assert.equal(start.status, 200);
  const started = await ticket.update();
  assert.equal(started.ticket.status, 'InService');
  assert.ok(started.version > called.version);

  const complete = await owner.post(`/api/tickets/${call.body.id}/complete`, { version: start.body.version });
  assert.equal(complete.status, 200);
  const completed = await ticket.update();
  assert.equal(completed.ticket.status, 'Completed');
  assert.ok(completed.version > started.version);
  assert.equal(JSON.stringify(completed).includes('Hidden note'), false, 'Ticket snapshots never include the note');

  const unknown = await LiveClient.open(base, null);
  await assert.rejects(() => unknown.invoke('SubscribeTicket', 'a'.repeat(43)), /not_found/, 'an unknown Ticket link must be refused');
  await assert.rejects(() => unknown.invoke('SubscribeTicket', 'short'), /not_found/, 'a malformed Ticket link must be refused');
  assert.equal((await guest.request(`/api/t/${'a'.repeat(43)}`)).status, 404, 'the same unknown link is unreadable over HTTP');
  await takeTicket(guest, service.queue.id);
  assert.deepEqual(await unknown.silence(1000), [], 'a refused Ticket link must receive no live data');

  ticket.close();
  unknown.close();
});

test('changes committed on another API instance reach subscribers through PostgreSQL fan-out', async () => {
  const remote = await secondInstance();
  const { owner, shop, service, guest } = await liveFixture('Live Cross Instance Shop');
  const localConsole = await LiveClient.open(base, owner.cookies);
  await localConsole.subscribe('SubscribeShop', shop.id, service.queue.id);
  const remoteBoard = await LiveClient.open(remote.url, null);
  await remoteBoard.subscribe('SubscribePublic', shop.publicId);

  const issued = await requestAt(remote.url, `/api/queues/${service.queue.id}/tickets`, {
    method: 'POST',
    body: { requestId: randomUUID(), note: 'cross instance note', confirmExtra: true },
    cookies: guest.cookies,
    csrf: guest.csrf,
  });
  assert.equal(issued.status, 201, 'the second instance must accept the Ticket on the shared database');
  const delivered = await localConsole.update();
  assert.equal(delivered.kind, 'shop');
  assert.equal(delivered.console.waiting.length, 1, 'a commit on another instance must reach this instance subscriber');
  assert.equal(delivered.console.waiting[0].note, 'cross instance note');
  const boardOnRemote = await remoteBoard.update();
  assert.equal(boardOnRemote.kind, 'public');

  const localView = (await consoleOf(owner, base, shop.id, service.queue.id)).body;
  const call = await owner.post(`/api/queues/${service.queue.id}/call`, { version: localView.version });
  assert.equal(call.status, 200);
  const remoteUpdate = await remoteBoard.update();
  assert.equal(remoteUpdate.kind, 'public');
  assert.ok(remoteUpdate.version > boardOnRemote.version, 'the second instance must publish changes committed on the first instance');

  localConsole.close();
  remoteBoard.close();
});

test('commands that roll back publish no live update', async () => {
  const { owner, shop, service, guest } = await liveFixture('Live Rollback Shop');
  const issued = await takeTicket(guest, service.queue.id);
  const console = await LiveClient.open(base, owner.cookies);
  const initial = await console.subscribe('SubscribeShop', shop.id, service.queue.id);

  const refused = await owner.post(`/api/tickets/${issued.ticket.id}/start`, { version: issued.ticket.version });
  assert.equal(refused.status, 409, 'starting a Waiting Ticket must conflict');
  assert.deepEqual(await console.silence(1200), [], 'a rolled back command must not notify live subscribers');
  const after = (await consoleOf(owner, base, shop.id, service.queue.id)).body;
  assert.equal(after.version, initial.version, 'the Shop version must not move without a commit');
  console.close();
});

test('a reconnecting subscriber resyncs the latest state and server clock', async () => {
  const { owner, shop, service, guest } = await liveFixture('Live Reconnect Shop');
  const issued = await takeTicket(guest, service.queue.id);
  const secret = issued.link.replace('/t/', '');
  const backgrounded = await LiveClient.open(base, null);
  const before = await backgrounded.subscribe('SubscribeTicket', secret);
  assert.equal(before.ticket.status, 'Waiting');
  backgrounded.close();

  const view = (await consoleOf(owner, base, shop.id, service.queue.id)).body;
  const call = await owner.post(`/api/queues/${service.queue.id}/call`, { version: view.version });
  assert.equal(call.status, 200);

  const returned = await LiveClient.open(base, null);
  const resynced = await returned.subscribe('SubscribeTicket', secret);
  assert.equal(resynced.ticket.status, 'Called', 'a reconnect must resync the latest state even when the update was lost');
  assert.equal(resynced.ticketId, issued.ticket.id);
  const anchor = Date.parse(resynced.serverTime);
  assert.ok(Math.abs(anchor - Date.now()) < 10000, 'the server clock must be usable as the countdown anchor');
  const remaining = Date.parse(resynced.ticket.deadline) - anchor;
  assert.ok(remaining > 9 * 60 * 1000 && remaining <= 10 * 60 * 1000 + 1000, 'the countdown must be anchored to the server deadline');

  const skipped = await owner.post(`/api/tickets/${call.body.id}/skip`, { version: call.body.version });
  assert.equal(skipped.status, 200);
  const terminal = await returned.update();
  assert.equal(terminal.ticket.status, 'Skipped', 'the resynced subscription must keep receiving committed transitions');
  returned.close();
});
