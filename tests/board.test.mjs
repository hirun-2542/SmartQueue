import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ApiClient, base, verifiedOwner } from './client.mjs';

const recordSeparator = '\u001e';

/** Minimal SignalR JSON-protocol client over the WebSocket transport, anonymous unless cookies are given. */
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
  async subscribe(target, ...args) {
    await this.invoke(target, ...args);
    return this.next('snapshot');
  }
  close() { this.closed = true; this.socket.close(); }
}

async function boardFixture(name, services = [{ name: 'Cut', prefix: 'A' }]) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const created = [];
  for (const service of services) {
    const body = (await owner.post(`/api/shops/${shop.id}/services`, { name: service.name, prefix: service.prefix, callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
    assert.equal((await owner.post(`/api/queues/${body.queue.id}/open`, {})).status, 200, 'a Queue must be Open before Tickets are issued');
    created.push(body);
  }
  const guest = new ApiClient();
  await guest.session();
  return { owner, shop, services: created, guest };
}

async function takeTicket(guest, queueId, note = null) {
  const issued = await guest.post(`/api/queues/${queueId}/tickets`, { requestId: randomUUID(), note, confirmExtra: true });
  assert.equal(issued.status, 201, 'taking a Ticket must succeed');
  return issued.body;
}

const boardOf = publicId => fetch(`${base}/api/board/${publicId}`).then(async response => ({ status: response.status, body: await response.json().catch(() => null) }));

const consoleOf = (owner, shopId, queueId) =>
  owner.request(`/api/shops/${shopId}/console?queueId=${queueId}`).then(result => result.body);

const forbiddenKeys = ['note', 'deviceId', 'requestId', 'linkHash', 'protectedLink', 'ownerId', 'joinedAhead', 'secret', 'subscription'];
function collectKeys(value, found = new Set()) {
  if (Array.isArray(value)) { for (const item of value) collectKeys(item, found); return found; }
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { found.add(key); collectKeys(child, found); }
  return found;
}


test('anonymous board serves the committed queue without any private Ticket data', async () => {
  const { shop, services, guest } = await boardFixture('Board Privacy Shop');
  const issued = await takeTicket(guest, services[0].queue.id, 'Private board note');
  const secret = issued.link.replace('/t/', '');

  const empty = await boardOf(shop.publicId);
  assert.equal(empty.status, 200, 'the Display board must be readable without a session');
  assert.equal(empty.body.publicId, shop.publicId);
  assert.equal(empty.body.shopName, 'Board Privacy Shop');
  assert.equal(empty.body.currentCalled, null, 'a Shop with no Call has no current Called Ticket');
  assert.deepEqual(empty.body.recent, []);
  assert.deepEqual(empty.body.services[0].waiting, [issued.ticket.number], 'the Waiting number must be listed per Service');
  assert.ok(Math.abs(Date.now() - Date.parse(empty.body.serverTime)) < 10000, 'the board must carry server time');

  const text = JSON.stringify(empty.body);
  assert.equal(text.includes('Private board note'), false, 'the board must never expose a Customer note');
  assert.equal(text.includes(secret), false, 'the board must never expose a private Ticket link');
  const keys = collectKeys(empty.body);
  for (const key of forbiddenKeys) assert.equal(keys.has(key), false, `the board payload must not carry the private field ${key}`);
});

test('the board current Call moves Call → Start → Complete without a second current Call', async () => {
  const { owner, shop, services, guest } = await boardFixture('Board Lifecycle Shop');
  const first = await takeTicket(guest, services[0].queue.id, 'Board lifecycle note');
  const second = await takeTicket(guest, services[0].queue.id);

  const view = await consoleOf(owner, shop.id, services[0].queue.id);
  const call = await owner.post(`/api/queues/${services[0].queue.id}/call`, { version: view.version });
  assert.equal(call.status, 200);

  const called = await boardOf(shop.publicId);
  assert.equal(called.body.currentCalled.number, first.ticket.number, 'the Called Ticket is the single current Call');
  assert.deepEqual(called.body.services[0].waiting, [second.ticket.number], 'the Called Ticket leaves the Waiting list');
  assert.equal(called.body.recent.some(ticket => ticket.number === first.ticket.number), false, 'the current Call is not repeated in recent');

  const start = await owner.post(`/api/tickets/${call.body.id}/start`, { version: call.body.version });
  assert.equal(start.status, 200);
  const started = await boardOf(shop.publicId);
  assert.equal(started.body.currentCalled, null, 'an InService Ticket must not read as a new current Call');
  assert.equal(started.body.recent[0].number, first.ticket.number);
  assert.equal(started.body.recent[0].status, 'InService', 'the started Ticket is reported as InService, not Called');
  assert.equal(started.body.recent[0].serviceName, services[0].name);

  const complete = await owner.post(`/api/tickets/${call.body.id}/complete`, { version: start.body.version });
  assert.equal(complete.status, 200);
  const completed = await boardOf(shop.publicId);
  assert.equal(completed.body.currentCalled, null);
  assert.equal(completed.body.recent[0].number, first.ticket.number);
  assert.equal(completed.body.recent[0].status, 'Completed');

  const nextView = await consoleOf(owner, shop.id, services[0].queue.id);
  const nextCall = await owner.post(`/api/queues/${services[0].queue.id}/call`, { version: nextView.version });
  assert.equal(nextCall.status, 200);
  const after = await boardOf(shop.publicId);
  assert.equal(after.body.currentCalled.number, second.ticket.number, 'exactly the newly Called Ticket is current');
  assert.equal(after.body.recent.some(ticket => ticket.number === second.ticket.number), false, 'recent stays distinct from the current Call');
  assert.equal(after.body.recent[0].status, 'Completed');
});

test('Waiting lists are grouped per Service in FIFO order and never cross Queues', async () => {
  const { shop, services, guest } = await boardFixture('Board FIFO Shop', [{ name: 'Cut', prefix: 'A' }, { name: 'Wash', prefix: 'B' }]);
  const a1 = await takeTicket(guest, services[0].queue.id);
  const b1 = await takeTicket(guest, services[1].queue.id);
  const a2 = await takeTicket(guest, services[0].queue.id);

  const board = await boardOf(shop.publicId);
  const cut = board.body.services.find(service => service.name === 'Cut');
  const wash = board.body.services.find(service => service.name === 'Wash');
  assert.deepEqual(cut.waiting, [a1.ticket.number, a2.ticket.number], 'each Service lists only its own Waiting Tickets in arrival order');
  assert.deepEqual(wash.waiting, [b1.ticket.number]);
  assert.equal(cut.waiting.includes(b1.ticket.number), false, 'a Ticket from another Queue must never appear here');
  assert.equal(board.body.services.length, 2, 'every active Service is reported so the board can label its Waiting numbers');
});

test('the board isolates Shops and refuses an unknown public identifier', async () => {
  const first = await boardFixture('Board First Shop');
  const second = await boardFixture('Board Second Shop', [{name:'Second Repair',prefix:'Z'}]);
  const firstTicket = await takeTicket(first.guest, first.services[0].queue.id);
  const secondTicket = await takeTicket(second.guest, second.services[0].queue.id);

  const board = await boardOf(first.shop.publicId);
  const text = JSON.stringify(board.body);
  assert.equal(text.includes(firstTicket.ticket.number), true);
  assert.equal(text.includes(secondTicket.ticket.number), false, 'one Shop board must never show another Shop Queue');
  assert.equal(text.includes(second.shop.publicId), false);

  const unknown = await boardOf('does-not-exist');
  assert.equal(unknown.status, 404, 'an unknown board identifier answers not_found');
  assert.equal(unknown.body.code, 'not_found');
});

test('an anonymous board subscriber refreshes on committed changes and receives no private payload', async t => {
  const { shop, services, guest } = await boardFixture('Board Live Shop');
  const board = await LiveClient.open(base, null);
  t.after(()=>board.close());
  const initial = await board.subscribe('SubscribePublic', shop.publicId);
  assert.equal(initial.kind, 'public');
  assert.equal(initial.publicId, shop.publicId);
  assert.equal(initial.console, null, 'a board scope must never receive Owner console data');
  assert.equal(initial.ticket, null, 'a board scope must never receive Ticket data');

  const issued = await takeTicket(guest, services[0].queue.id, 'Board live note');
  const update = await board.next('update');
  assert.equal(update.kind, 'public');
  assert.ok(update.version > initial.version, 'a committed Ticket must move the board forward');
  assert.equal(JSON.stringify(update).includes('Board live note'), false, 'the fan-out must never carry a Customer note');

  const refreshed = await boardOf(shop.publicId);
  assert.ok(refreshed.body.version >= update.version, 'a resync after the fan-out reads the committed state');
  assert.deepEqual(refreshed.body.services[0].waiting, [issued.ticket.number]);
});

