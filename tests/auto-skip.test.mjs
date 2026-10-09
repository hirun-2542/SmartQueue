import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner,ApiClient } from './client.mjs';

// A short but positive Call timeout keeps the real worker and the real clock involved while bounding the test.
const CALL_TIMEOUT_MINUTES = 0.05; // 3 seconds
const OBSERVE_MS = 40000;          // bounded observation budget for the real background worker

async function workerFixture(name) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const service = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Cut', prefix: 'A', callTimeoutMinutes: CALL_TIMEOUT_MINUTES, nearTurnThreshold: 2 })).body;
  await owner.post(`/api/queues/${service.queue.id}/open`, {});
  const guest = new ApiClient(); await guest.session();
  return { owner, guest, shop, queue: service.queue.id };
}

async function consoleSnapshot(owner, shop, queue) {
  const result = await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);
  assert.equal(result.status, 200, 'Owner console must expose the held Ticket and the Shop version');
  return result.body;
}

async function join(guest, queue) {
  return guest.post(`/api/queues/${queue}/tickets`, { requestId: randomUUID() });
}

async function waitForStatus(guest, link, expected, timeoutMs = OBSERVE_MS) {
  const deadline = Date.now() + timeoutMs;
  let ticket = null;
  while (Date.now() < deadline) {
    ticket = (await guest.request(`/api${link}`)).body;
    if (ticket.status === expected) return ticket;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Ticket stayed ${ticket?.status} instead of becoming ${expected} within ${timeoutMs} ms`);
}

test('the real worker auto-Skips a Called Ticket past its deadline without any live client and frees the Shop', async () => {
  const { owner, guest, shop, queue } = await workerFixture('Auto skip shop');
  const joined = await join(guest, queue);
  assert.equal(joined.status, 201);
  const link = joined.body.link;

  
  const call = await owner.post(`/api/queues/${queue}/call`, {});
  assert.equal(call.status, 200);
  assert.equal(call.body.status, 'Called');
  assert.ok(call.body.deadline, 'a Called Ticket publishes its server deadline for the countdown');

  const customer = await guest.request(`/api${link}`);
  assert.equal(customer.body.status, 'Called');
  assert.ok(customer.body.deadline, 'the Customer countdown anchors on the server deadline');
  assert.ok(customer.body.serverTime, 'the Customer countdown anchors on server time, not the device clock');
  assert.equal(customer.body.endReason, null);

  // No SignalR, no poll and no browser timer is connected here: only the durable deadline ends the Ticket.
  const skipped = await waitForStatus(guest, link, 'Skipped');
  assert.equal(skipped.endReason, 'auto_skip', 'the Customer sees why the Ticket ended');
  assert.equal(skipped.version, call.body.version + 1, 'exactly one committed transition ends the Ticket');
  assert.ok(skipped.endedAt, 'the terminal timestamp is recorded');

  const released = await consoleSnapshot(owner, shop, queue);
  assert.equal(released.held, null, 'the Shop-wide hold is released after the timeout');
  assert.equal(released.waiting.length, 0);

  const taken = await join(guest, queue);
  assert.equal(taken.status, 201, 'a Skipped Customer can take a new Ticket because terminal Tickets leave no quota');

  
  const next = await owner.post(`/api/queues/${queue}/call`, {});
  assert.equal(next.status, 200, 'the Owner can Call again once the timeout released the Shop');
  assert.equal(next.body.status, 'Called');
});

test('the real worker never auto-Skips a Ticket whose service already started', async () => {
  const { owner, guest, shop, queue } = await workerFixture('No auto complete shop');
  const joined = await join(guest, queue);
  const link = joined.body.link;

  
  const call = await owner.post(`/api/queues/${queue}/call`, {});
  assert.equal(call.status, 200);
  const start = await owner.post(`/api/tickets/${call.body.id}/start`, { version: call.body.version });
  assert.equal(start.status, 200);
  assert.equal(start.body.status, 'InService');

  // Watch past the Call deadline plus more than one worker interval: InService work is never ended automatically.
  const observeUntil = Math.max(Date.now(), new Date(call.body.deadline).getTime()) + 8000;
  while (Date.now() < observeUntil) {
    const ticket = (await guest.request(`/api${link}`)).body;
    assert.equal(ticket.status, 'InService', 'the auto-Skip worker must never touch a Ticket whose service started');
    assert.equal(ticket.endReason, null, 'no automatic Skip or Complete reason may appear');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
});
