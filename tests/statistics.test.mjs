import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner, ApiClient } from './client.mjs';

// Statistics are exercised only through public HTTP operations: real Owners open Queues and drive
// Call/Start/Complete/Skip/Cancel/Drop and Walk-in creation, and every assertion reads the consumer-visible
// statistics response. Durations are compared with the timestamps the same operations returned, so the test
// does not depend on the wall clock or on any internal query.

async function shopFixture(name) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const services = [];
  for (const [serviceName, prefix] of [['Cut', 'A'], ['Wash', 'B']]) {
    const service = (await owner.post(`/api/shops/${shop.id}/services`, { name: serviceName, prefix, callTimeoutMinutes: 600, nearTurnThreshold: 2 })).body;
    services.push(service);
  }
  return { owner, shop, services };
}

async function shopVersion(owner, shop) {
  const snapshot = await owner.request(`/api/shops/${shop.id}`);
  assert.equal(snapshot.status, 200);
  return snapshot.body.version;
}

async function openQueue(owner, queue) {
  assert.equal((await owner.post(`/api/queues/${queue}/open`, {})).status, 200);
}

async function join(owner, queue) {
  const joined = await owner.post(`/api/queues/${queue}/tickets`, { requestId: randomUUID(), confirmExtra: true });
  assert.equal(joined.status, 201);
  return joined.body;
}

async function walkin(owner, queue, note = 'Walk-in Customer') {
  const created = await owner.post(`/api/queues/${queue}/walkin`, { note });
  assert.equal(created.status, 201);
  assert.equal(created.body.ticket.origin, 'WalkIn');
  return created.body.ticket;
}

async function callNext(owner, shop, queue) {
  const called = await owner.post(`/api/queues/${queue}/call`, {});
  assert.equal(called.status, 200);
  return called.body;
}

async function start(owner, ticket) {
  const started = await owner.post(`/api/tickets/${ticket.id}/start`, { version: ticket.version });
  assert.equal(started.status, 200);
  return started.body;
}

async function complete(owner, ticket) {
  const completed = await owner.post(`/api/tickets/${ticket.id}/complete`, { version: ticket.version });
  assert.equal(completed.status, 200);
  return completed.body;
}

async function skip(owner, ticket) {
  const skipped = await owner.post(`/api/tickets/${ticket.id}/skip`, { version: ticket.version });
  assert.equal(skipped.status, 200);
  return skipped.body;
}

async function serve(owner, shop, queue) {
  const called = await callNext(owner, shop, queue);
  const started = await start(owner, called);
  return { called, completed: await complete(owner, started) };
}

async function stopAccepting(owner, shop, queue) {
  const stopped = await owner.post(`/api/queues/${queue}/stop`, { version: await shopVersion(owner, shop) });
  assert.equal(stopped.status, 200);
  return stopped.body;
}

async function dropQueue(owner, shop, queue) {
  const dropped = await owner.post(`/api/queues/${queue}/drop`, { version: await shopVersion(owner, shop), confirm: true });
  assert.equal(dropped.status, 200);
  return dropped.body;
}

async function statistics(owner, shop, query = '') {
  const result = await owner.request(`/api/shops/${shop.id}/statistics${query}`);
  assert.equal(result.status, 200, `statistics must be readable by its Owner: ${JSON.stringify(result.body)}`);
  return result.body;
}

const seconds = (from, to) => (new Date(to) - new Date(from)) / 1000;

test('statistics count both origins and measure only the durations the Tickets really have', async () => {
  const { owner, shop, services } = await shopFixture('Statistics shop');
  const queue = services[0].queue.id;
  await openQueue(owner, queue);

  // One Customer Ticket served to completion: it has both a wait and a service measurement.
  const first = await join(owner, queue);
  const served = await serve(owner, shop, queue);
  assert.equal(served.completed.id, first.ticket.id);

  // One Walk-in Ticket that is Called and Skipped: a wait measurement, but no service time.
  const second = await walkin(owner, queue);
  const calledSecond = await callNext(owner, shop, queue);
  assert.equal(calledSecond.id, second.id);
  await skip(owner, calledSecond);

  // Cancelled before any Call: no wait measurement at all.
  const third = await join(owner, queue);
  const cancelledWaiting = await owner.post(`/api${third.link}/cancel`, { version: third.ticket.version });
  assert.equal(cancelledWaiting.status, 200);
  assert.equal(cancelledWaiting.body.status, 'Cancelled');

  // Called and then cancelled: it does have a wait measurement.
  const fourth = await join(owner, queue);
  const calledFourth = await callNext(owner, shop, queue);
  const cancelledCalled = await owner.post(`/api${fourth.link}/cancel`, { version: calledFourth.version });
  assert.equal(cancelledCalled.status, 200);
  assert.equal(cancelledCalled.body.status, 'Cancelled');
  assert.ok(cancelledCalled.body.calledAt, 'a Ticket cancelled while Called keeps its Call timestamp');

  // Two more stay Waiting until the Owner Drops the Queue.
  await join(owner, queue);
  await join(owner, queue);
  const dropped = await dropQueue(owner, shop, queue);
  assert.equal(dropped.status, 'Closed');
  assert.equal(dropped.droppedCount, 2);

  const stats = await statistics(owner, shop, '?range=current');
  assert.equal(stats.range, 'current');
  assert.equal(stats.issued, 6, 'issued counts Customer and Walk-in Tickets');
  assert.equal(stats.completed, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.cancelled, 2);
  assert.equal(stats.dropped, 2);
  assert.equal(stats.pending, 0);
  assert.equal(stats.terminal, 6);
  assert.equal(stats.skippedRate, 1 / 6);
  assert.equal(stats.cancelledRate, 2 / 6);

  const expectedWait = [
    seconds(served.called.receivedAt, served.called.calledAt),
    seconds(calledSecond.receivedAt, calledSecond.calledAt),
    seconds(calledFourth.receivedAt, calledFourth.calledAt),
  ];
  assert.equal(stats.waitSampleCount, 3, 'only the Tickets that were really Called have a wait');
  assert.ok(Math.abs(stats.averageWaitSeconds - expectedWait.reduce((a, b) => a + b, 0) / expectedWait.length) < 0.5, 'average wait is the mean of the real Called−Received durations');

  assert.equal(stats.serviceSampleCount, 1, 'only Completed work has a service measurement');
  assert.ok(Math.abs(stats.averageServiceSeconds - seconds(served.completed.startedAt, served.completed.endedAt)) < 0.5);
  assert.equal(stats.businessDayCount, 1);
  assert.ok(stats.businessDays[0].closedAt, 'the Drained Business day reports when it ended');
});

test('statistics ranges count each Queue own Business days before union and keep history after a Service edit', async () => {
  const { owner, shop, services } = await shopFixture('Rounds shop');
  const cut = services[0];const wash = services[1];

  // Wash is opened, drained and reopened, so it has two rounds that both restart at B001.
  await openQueue(owner, wash.queue.id);
  await join(owner, wash.queue.id);
  await stopAccepting(owner, shop, wash.queue.id);
  await serve(owner, shop, wash.queue.id);
  await openQueue(owner, wash.queue.id);
  const washSecond = await join(owner, wash.queue.id);
  assert.equal(washSecond.ticket.number, 'B001', 'a reopened Business day restarts the Ticket number');
  await stopAccepting(owner, shop, wash.queue.id);
  await serve(owner, shop, wash.queue.id);

  // Cut has one round.
  await openQueue(owner, cut.queue.id);
  await join(owner, cut.queue.id);
  await stopAccepting(owner, shop, cut.queue.id);
  await serve(owner, shop, cut.queue.id);

  const all = await statistics(owner, shop, '?range=latest7');
  assert.equal(all.businessDayCount, 3, 'two Wash rounds and one Cut round are all in the latest seven');
  assert.equal(all.issued, 3, 'rounds that restart at the same number are counted separately');
  assert.equal(all.completed, 3);

  const current = await statistics(owner, shop, '?range=current');
  assert.equal(current.businessDayCount, 2, 'current takes the newest round of each Queue');
  assert.equal(current.issued, 2);
  assert.ok(current.businessDays.every(day => day.openedAt), 'each counted round reports when it opened');

  const washOnly = await statistics(owner, shop, `?range=latest7&serviceId=${wash.id}`);
  assert.equal(washOnly.businessDayCount, 2);
  assert.equal(washOnly.issued, 2);
  assert.equal(washOnly.serviceName, 'Wash');

  // Renaming and re-prefixing a Service changes future numbers only; the aggregate keeps counting the rounds
  // already recorded for that Queue instead of dropping them with the old label.
  const edited = await owner.request(`/api/services/${wash.id}`, { method: 'PUT', body: { name: 'Wash XL', prefix: 'C', callTimeoutMinutes: 600, nearTurnThreshold: 2 } });
  assert.equal(edited.status, 200);
  const afterEdit = await statistics(owner, shop, `?range=latest7&serviceId=${wash.id}`);
  assert.equal(afterEdit.issued, 2, 'history stays in the aggregate after the Service changes');
  assert.equal(afterEdit.serviceName, 'Wash XL');
  assert.ok(afterEdit.services.some(service => service.id === wash.id && service.name === 'Wash XL'));
});

test('statistics are private to their Owner and answer a missing range or Service explicitly', async () => {
  const { owner, shop, services } = await shopFixture('Private shop');
  const queue = services[0].queue.id;

  // A Shop whose Queue was never opened has no round at all: nothing is fabricated as a zero measurement.
  const quietShop = (await owner.post('/api/shops', { name: 'Quiet shop' })).body;
  const quiet = await owner.request(`/api/shops/${quietShop.id}/statistics?range=current`);
  assert.equal(quiet.status, 200);
  assert.equal(quiet.body.issued, 0);
  assert.equal(quiet.body.businessDayCount, 0);
  assert.equal(quiet.body.averageWaitSeconds, null, 'no measurement is null, never a fake zero-minute wait');
  assert.equal(quiet.body.averageServiceSeconds, null);
  assert.equal(quiet.body.skippedRate, null);
  assert.equal(quiet.body.cancelledRate, null);

  await openQueue(owner, queue);
  await join(owner, queue);
  await serve(owner, shop, queue);
  assert.equal((await statistics(owner, shop, '?range=latest7')).issued, 1);

  const { api: other } = await verifiedOwner();
  const crossed = await other.request(`/api/shops/${shop.id}/statistics?range=latest7`);
  assert.equal(crossed.status, 404);
  assert.equal(crossed.body.code, 'not_found');

  const guest = new ApiClient();
  const anonymous = await guest.request(`/api/shops/${shop.id}/statistics`);
  assert.equal(anonymous.status, 401);

  const badRange = await owner.request(`/api/shops/${shop.id}/statistics?range=this-week`);
  assert.equal(badRange.status, 400);
  assert.equal(badRange.body.code, 'invalid_range');

  const badService = await owner.request(`/api/shops/${shop.id}/statistics?range=latest7&serviceId=${randomUUID()}`);
  assert.equal(badService.status, 404);
  assert.equal(badService.body.code, 'not_found');
});
