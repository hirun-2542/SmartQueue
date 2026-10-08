import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner, ApiClient } from './client.mjs';

// Tickets ahead and Estimated wait are exercised only through public HTTP operations: real Owners open
// Queues and drive Call/Start/Complete/Skip, real Customers receive Tickets, and the assertions read the
// consumer-visible Ticket snapshot and public Shop snapshot.

async function estimateFixture() {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name: 'Estimate Shop' })).body;
  const services = [];
  for (const [name, prefix] of [['Cut', 'A'], ['Wash', 'B']]) {
    const service = (await owner.post(`/api/shops/${shop.id}/services`, { name, prefix, callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
    assert.equal((await owner.post(`/api/queues/${service.queue.id}/open`, {})).status, 200, 'Owner must open a real Business day before taking Tickets');
    services.push(service);
  }
  return { owner, shop, services };
}

// Every Ticket comes from its own device so the per-device active Ticket quota never shapes the fixture.
async function join(queueId, note = null) {
  const client = new ApiClient();
  await client.session();
  const result = await client.post(`/api/queues/${queueId}/tickets`, { requestId: randomUUID(), note, confirmExtra: true });
  assert.equal(result.status, 201, 'a Customer must be able to receive a Ticket through the public operation');
  return { client, ticket: result.body.ticket, link: result.body.link };
}

const view = joined => joined.client.request('/api' + joined.link);

async function consoleVersion(owner, shop, queue) {
  const result = await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);
  assert.equal(result.status, 200, 'Owner console must expose the live Queue state');
  return result.body.version;
}

async function callNext(owner, shop, queue) {
  const call = await owner.post(`/api/queues/${queue}/call`, { version: await consoleVersion(owner, shop, queue) });
  assert.equal(call.status, 200, 'Owner must be able to Call the oldest Waiting Ticket');
  return call.body;
}

// Serves the oldest Waiting Ticket in the Queue through the real Call/Start/Complete operations.
async function serve(owner, shop, queue, { pauseMs = 0 } = {}) {
  const held = await callNext(owner, shop, queue);
  const started = await owner.post(`/api/tickets/${held.id}/start`, { version: held.version });
  assert.equal(started.status, 200, 'Owner must be able to Start a Called Ticket');
  if (pauseMs) await new Promise(resolve => setTimeout(resolve, pauseMs));
  const done = await owner.post(`/api/tickets/${held.id}/complete`, { version: started.body.version });
  assert.equal(done.status, 200, 'Owner must be able to Complete an InService Ticket');
  return done.body;
}

async function publicShop(publicId) {
  const client = new ApiClient();
  await client.session();
  const result = await client.request('/api/s/' + publicId);
  assert.equal(result.status, 200);
  return result.body;
}

test('estimated wait stays hidden until five real Completed jobs exist and then scales with Tickets ahead', async () => {
  const { owner, shop, services } = await estimateFixture();
  const queue = services[0].queue.id;
  const first = await join(queue);
  let current = (await view(first)).body;
  assert.equal(current.ticketsAhead, 0);
  assert.equal(current.estimateSampleCount, 0, 'the empty history state must be explicit');
  assert.equal(current.estimatedWaitSeconds, null, 'no Completed history must never produce a zero-minute average');
  await serve(owner, shop, queue);
  for (let i = 0; i < 3; i++) { await join(queue); await serve(owner, shop, queue); }
  const older = await join(queue);
  const probe = await join(queue);
  current = (await view(probe)).body;
  assert.equal(current.ticketsAhead, 1);
  assert.equal(current.estimateSampleCount, 4);
  assert.equal(current.estimatedWaitSeconds, null, 'four samples hide the time while Tickets ahead stay visible');
  await serve(owner, shop, queue);
  assert.equal((await view(older)).body.status, 'Completed');
  const second = await join(queue);
  const third = await join(queue);
  const fourth = await join(queue);
  const one = (await view(second)).body;
  const two = (await view(third)).body;
  const three = (await view(fourth)).body;
  assert.equal(one.estimateSampleCount, 5, 'five usable samples enable the estimate');
  assert.ok(one.estimatedWaitSeconds > 0, 'the estimate must come from recorded service durations');
  assert.equal(two.ticketsAhead, 2);
  assert.equal(three.ticketsAhead, 3);
  assert.equal(two.estimatedWaitSeconds, 2 * one.estimatedWaitSeconds, 'the estimate is Tickets ahead times the same mean');
  assert.equal(three.estimatedWaitSeconds, 3 * one.estimatedWaitSeconds);
  const next = (await view(probe)).body;
  assert.equal(next.ticketsAhead, 0);
  assert.equal(next.estimateSampleCount, 5);
  assert.equal(next.estimatedWaitSeconds, 0, 'zero Tickets ahead is arithmetic zero, never a promise of immediate service');
  const shopSnapshot = await publicShop(shop.publicId);
  const publicService = shopSnapshot.services.find(x => x.id === services[0].id);
  assert.equal(publicService.queue.waitingCount, 4);
  assert.equal(publicService.queue.estimateSampleCount, 5, 'the public Shop snapshot must show the same estimate as the Ticket snapshot');
  assert.equal(publicService.queue.estimatedWaitSeconds, 4 * one.estimatedWaitSeconds);
});

test('the estimate uses only the latest twenty usable Completed jobs of the same Service', async () => {
  const { owner, shop, services } = await estimateFixture();
  const [a, b] = services;
  for (let i = 0; i < 20; i++) { await join(b.queue.id); await serve(owner, shop, b.queue.id); }
  const controlOlder = await join(b.queue.id);
  const control = (await view(await join(b.queue.id))).body;
  assert.equal(control.estimateSampleCount, 20);
  assert.equal(control.ticketsAhead, 1);
  assert.ok(control.estimatedWaitSeconds > 0);
  assert.equal((await view(controlOlder)).body.estimatedWaitSeconds, 0);
  await join(a.queue.id);
  await serve(owner, shop, a.queue.id, { pauseMs: 5000 });
  for (let i = 0; i < 20; i++) { await join(a.queue.id); await serve(owner, shop, a.queue.id); }
  await join(a.queue.id);
  const probe = (await view(await join(a.queue.id))).body;
  assert.equal(probe.estimateSampleCount, 20, 'the window holds at most the latest twenty usable jobs');
  assert.equal(probe.ticketsAhead, 1);
  assert.ok(probe.estimatedWaitSeconds > 0);
  assert.ok(probe.estimatedWaitSeconds < control.estimatedWaitSeconds + 0.1, 'the long oldest job must fall outside the twenty-job window');
});

test('Skipped, Called and in-progress Tickets add neither samples nor Tickets ahead', async () => {
  const { owner, shop, services } = await estimateFixture();
  const queue = services[0].queue.id;
  for (let i = 0; i < 5; i++) { await join(queue); await serve(owner, shop, queue); }
  const skipped = await join(queue);
  const skipCall = await callNext(owner, shop, queue);
  assert.equal(skipCall.id, skipped.ticket.id);
  assert.equal((await owner.post(`/api/tickets/${skipCall.id}/skip`, { version: skipCall.version })).status, 200);
  const older = await join(queue);
  const probe = await join(queue);
  const before = (await view(probe)).body;
  assert.equal(before.ticketsAhead, 1, 'a Skipped Ticket is not ahead of a Waiting Ticket');
  assert.equal(before.estimateSampleCount, 5, 'Skipped work must not contribute a duration');
  const callOlder = await callNext(owner, shop, queue);
  assert.equal(callOlder.id, older.ticket.id);
  const afterCall = (await view(probe)).body;
  assert.equal(afterCall.ticketsAhead, 0, 'a Called Ticket is not ahead of a Waiting Ticket');
  assert.equal(afterCall.estimateSampleCount, 5);
  const started = await owner.post(`/api/tickets/${callOlder.id}/start`, { version: callOlder.version });
  assert.equal(started.status, 200);
  const tail = await join(queue);
  const after = (await view(tail)).body;
  assert.equal(after.ticketsAhead, 1, 'in-progress and Skipped Tickets are not ahead of a Waiting Ticket');
  assert.equal(after.estimateSampleCount, 5, 'in-progress work must not contribute a duration');
  assert.equal(after.estimatedWaitSeconds, before.estimatedWaitSeconds, 'the mean must still come from the same five Completed jobs');
});

test('estimates never mix Queues or Services and the public snapshot mirrors the Ticket snapshot', async () => {
  const { owner, shop, services } = await estimateFixture();
  const [a, b] = services;
  for (let i = 0; i < 5; i++) { await join(a.queue.id); await serve(owner, shop, a.queue.id); }
  await join(a.queue.id, 'Private remark for Service A');
  const aProbe = await join(a.queue.id);
  const before = (await view(aProbe)).body;
  assert.equal(before.estimateSampleCount, 5);
  assert.equal(before.ticketsAhead, 1);
  for (let i = 0; i < 7; i++) { await join(b.queue.id); await serve(owner, shop, b.queue.id); }
  const after = (await view(aProbe)).body;
  assert.equal(after.estimateSampleCount, 5, 'Completed jobs in another Service must not contribute samples');
  assert.equal(after.estimatedWaitSeconds, before.estimatedWaitSeconds, 'another Service must not change this Service estimate');
  const bProbe = await join(b.queue.id);
  const bView = (await view(await join(b.queue.id))).body;
  assert.equal(bView.estimateSampleCount, 7, 'each Service estimates from its own history');
  assert.equal(bView.ticketsAhead, 1, 'Waiting Tickets in another Queue are never ahead');
  const shopSnapshot = await publicShop(shop.publicId);
  assert.equal(JSON.stringify(shopSnapshot).includes('Private remark for Service A'), false);
  const publicA = shopSnapshot.services.find(x => x.id === a.id);
  assert.equal(publicA.queue.waitingCount, 2);
  assert.equal(publicA.queue.estimateSampleCount, 5);
  assert.equal(publicA.queue.estimatedWaitSeconds, 2 * before.estimatedWaitSeconds, 'a joining Customer waits behind every Waiting Ticket');
  assert.equal(publicA.queue.id, a.queue.id);
  assert.equal(shopSnapshot.services.find(x => x.id === b.id).queue.estimateSampleCount, 7);
  assert.equal((await view(bProbe)).body.ticketsAhead, 0);
});

test('zero Tickets ahead never promises immediate service while the Shop holds another Queue', async () => {
  const { owner, shop, services } = await estimateFixture();
  const [a, b] = services;
  for (let i = 0; i < 5; i++) { await join(a.queue.id); await serve(owner, shop, a.queue.id); }
  const held = await join(b.queue.id);
  const call = await callNext(owner, shop, b.queue.id);
  assert.equal(call.id, held.ticket.id, 'the Shop holds a Called Ticket from the other Queue');
  const waiting = await join(a.queue.id);
  const current = (await view(waiting)).body;
  assert.equal(current.ticketsAhead, 0);
  assert.equal(current.estimateSampleCount, 5);
  assert.equal(current.estimatedWaitSeconds, 0, 'zero ahead is arithmetic only and is not a guarantee of service');
  const console_ = await owner.request(`/api/shops/${shop.id}/console?queueId=${b.queue.id}`);
  assert.equal(console_.status, 200);
  assert.equal(console_.body.held.number, held.ticket.number);
  assert.equal(console_.body.held.queueId, b.queue.id, 'the held Ticket comes from the other Queue while this Queue reports zero ahead');
});
