import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner, ApiClient } from './client.mjs';

// Archive is a real HTTP + PostgreSQL boundary: the Owner hides a Service, the Shop row lock serializes the
// change, and the shared close invariant ends the Business day when the last active Ticket is gone. Nothing
// here fakes a timer or a repository, and no test asserts source text or a copied default.

async function archiveFixture(name) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const service = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Cut', prefix: 'A', callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
  const queue = service.queue.id;
  const opened = await owner.post(`/api/queues/${queue}/open`, {});
  assert.equal(opened.status, 200, 'the Owner opens a Business day before anything can join');
  const guest = new ApiClient(); await guest.session();
  return { owner, guest, shop, queue, service };
}

async function shopView(owner, shop) {
  const result = await owner.request(`/api/shops/${shop.id}`);
  assert.equal(result.status, 200, 'the Owner reads their own Shop snapshot');
  return result.body;
}

async function consoleSnapshot(owner, shop, queue) {
  const result = await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);
  assert.equal(result.status, 200, 'the Owner console must expose the Queue status');
  return result.body;
}

async function consoleAny(owner, shop) {
  const result = await owner.request(`/api/shops/${shop.id}/console`);
  assert.equal(result.status, 200);
  return result.body;
}

async function archive(owner, shop, serviceId) {
  const view = await shopView(owner, shop);
  return owner.post(`/api/services/${serviceId}/archive`, { version: view.version });
}

function join(guest, queue, extra = false) {
  return guest.post(`/api/queues/${queue}/tickets`, { requestId: randomUUID(), confirmExtra: extra });
}

async function callNext(owner, shop, queue) {
  const view = await consoleSnapshot(owner, shop, queue);
  return owner.post(`/api/queues/${queue}/call`, { version: view.version });
}

async function start(owner, ticket) { return owner.post(`/api/tickets/${ticket.id}/start`, { version: ticket.version }); }
async function complete(owner, ticket) { return owner.post(`/api/tickets/${ticket.id}/complete`, { version: ticket.version }); }

test('Archiving a Service with Waiting Tickets stops new joins, keeps them callable, and drains to Closed without changing their numbers or links', async () => {
  const { owner, guest, shop, queue, service } = await archiveFixture('Archive drain shop');
  const first = await join(guest, queue); assert.equal(first.status, 201);
  const second = await join(guest, queue, true); assert.equal(second.status, 201);
  assert.match(first.body.ticket.number, /^A\d{3}$/);
  const numbers = [first.body.ticket.number, second.body.ticket.number].sort();

  const archived = await archive(owner, shop, service.id);
  assert.equal(archived.status, 200, 'the Owner archives an own Service');
  assert.equal(archived.body.archived, true);
  assert.equal(archived.body.queue.status, 'Closing', 'a Service that still holds Waiting Tickets drains as Closing');

  const draining = await consoleSnapshot(owner, shop, queue);
  assert.equal(draining.queues[0].status, 'Closing');
  assert.equal(draining.queues[0].waitingCount, 2, 'the Waiting Tickets stay callable after archiving');
  assert.deepEqual(draining.waiting.map(x => x.number).sort(), numbers, 'archiving never ends a Waiting Ticket');

  assert.equal((await join(guest, queue, true)).status, 409, 'no Customer joins an archived Service');
  const walkin = await owner.post(`/api/queues/${queue}/walkin`, { note: null });
  assert.equal(walkin.status, 409);
  assert.equal(walkin.body.code, 'service_archived', 'a Walk-in never joins an archived Service');

  const publicShop = await guest.request(`/api/s/${shop.publicId}`);
  assert.equal(publicShop.status, 200);
  assert.equal(publicShop.body.services.some(s => s.id === service.id), false, 'an archived Service is not a public join choice');

  const callFirst = await callNext(owner, shop, queue); assert.equal(callFirst.status, 200);
  const startFirst = await start(owner, callFirst.body); assert.equal(startFirst.status, 200);
  const completeFirst = await complete(owner, startFirst.body); assert.equal(completeFirst.status, 200);
  assert.equal((await consoleSnapshot(owner, shop, queue)).queues[0].status, 'Closing', 'one Ticket left still keeps the Queue draining');

  const callSecond = await callNext(owner, shop, queue); assert.equal(callSecond.status, 200);
  const startSecond = await start(owner, callSecond.body); assert.equal(startSecond.status, 200);
  const completeSecond = await complete(owner, startSecond.body); assert.equal(completeSecond.status, 200);

  const hidden = await consoleAny(owner, shop);
  assert.equal(hidden.queues.length, 0, 'an archived Service whose Business day ended leaves the active console');

  const preserved = await guest.request(`/api${first.body.link}`);
  assert.equal(preserved.status, 200, 'an old Ticket link stays readable after its Service is archived');
  assert.equal(preserved.body.number, first.body.ticket.number, 'the Ticket keeps the number it was issued with');
  assert.equal(preserved.body.status, 'Completed');

  const own = await shopView(owner, shop);
  assert.equal(own.services.find(s => s.id === service.id).archived, true, 'the archived Service stays in the Owner history with its Tickets');
});

test('Archiving a Service while a Ticket is held lets that work finish and closes the Business day only when the last Ticket ends', async () => {
  const { owner, guest, shop, queue, service } = await archiveFixture('Archive held shop');
  const held = await join(guest, queue); assert.equal(held.status, 201);
  const called = await callNext(owner, shop, queue); assert.equal(called.status, 200);
  const started = await start(owner, called.body); assert.equal(started.status, 200); assert.equal(started.body.status, 'InService');
  const waiting = await join(guest, queue, true); assert.equal(waiting.status, 201);

  const archived = await archive(owner, shop, service.id);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.archived, true);
  assert.equal(archived.body.queue.status, 'Closing', 'the held Ticket keeps the archived Queue Closing');

  const after = await consoleSnapshot(owner, shop, queue);
  assert.ok(after.held, 'the held Ticket continues after its Service is archived');
  assert.equal(after.held.id, called.body.id);
  assert.equal(after.held.status, 'InService');
  assert.equal(after.held.version, started.body.version, 'archiving never touches the held Ticket');
  assert.equal(after.waiting.length, 1, 'the Waiting Ticket stays callable in the archived Queue');

  const finished = await complete(owner, started.body); assert.equal(finished.status, 200);
  assert.equal((await consoleSnapshot(owner, shop, queue)).queues[0].status, 'Closing', 'the Waiting Ticket still holds the Business day open');

  const callWaiting = await callNext(owner, shop, queue); assert.equal(callWaiting.status, 200);
  const startWaiting = await start(owner, callWaiting.body); assert.equal(startWaiting.status, 200);
  const completeWaiting = await complete(owner, startWaiting.body); assert.equal(completeWaiting.status, 200);
  assert.equal((await consoleAny(owner, shop)).queues.length, 0, 'the last served Ticket ends the archived Business day');
});

test('Archiving never Drops Waiting Tickets; the explicit Drop operation remains the only way to end them', async () => {
  const { owner, guest, shop, queue, service } = await archiveFixture('Archive no silent drop shop');
  const first = await join(guest, queue); assert.equal(first.status, 201);
  const second = await join(guest, queue, true); assert.equal(second.status, 201);

  const archived = await archive(owner, shop, service.id); assert.equal(archived.status, 200);
  const stillWaiting = await guest.request(`/api${first.body.link}`);
  assert.equal(stillWaiting.body.status, 'Waiting', 'a Waiting Ticket is not silently Dropped by archiving');
  assert.equal(stillWaiting.body.endReason, null);

  const view = await consoleSnapshot(owner, shop, queue);
  const dropped = await owner.post(`/api/queues/${queue}/drop`, { version: view.version, confirm: true });
  assert.equal(dropped.status, 200, 'the existing explicit Drop still works on an archived Queue');
  assert.equal(dropped.body.droppedCount, 2);
  assert.equal(dropped.body.status, 'Closed');

  const ended = await guest.request(`/api${first.body.link}`);
  assert.equal(ended.body.status, 'Dropped', 'the Customer sees the explicit Shop closure, not an archiving side effect');
  assert.equal(ended.body.endReason, 'dropped');
  assert.equal((await guest.request(`/api${second.body.link}`)).body.status, 'Dropped');
});

test('Archiving an empty Open Queue closes its Business day in the same operation and it can never open again', async () => {
  const { owner, guest, shop, queue, service } = await archiveFixture('Archive empty shop');

  const archived = await archive(owner, shop, service.id);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.archived, true);
  assert.equal(archived.body.queue.status, 'Closed', 'an empty Queue closes when its Service is archived');

  assert.equal((await consoleAny(owner, shop)).queues.length, 0, 'the archived Service leaves the active console');
  const reopen = await owner.post(`/api/queues/${queue}/open`, {});
  assert.equal(reopen.status, 409);
  assert.equal(reopen.body.code, 'service_archived', 'an archived Service cannot open a new Business day');
  assert.equal((await join(guest, queue)).status, 409, 'no Ticket joins an archived Service');
  const publicShop = await guest.request(`/api/s/${shop.publicId}`);
  assert.equal(publicShop.body.services.some(s => s.id === service.id), false);
  const own = await shopView(owner, shop);
  assert.equal(own.services.find(s => s.id === service.id).archived, true, 'the archived Service is still in the Owner history');
});

test('Archiving a Service whose Business day already ended keeps its Tickets readable and hides it from active views', async () => {
  const { owner, guest, shop, queue, service } = await archiveFixture('Archive closed history shop');
  const joined = await join(guest, queue); assert.equal(joined.status, 201);
  const view = await consoleSnapshot(owner, shop, queue);
  const dropped = await owner.post(`/api/queues/${queue}/drop`, { version: view.version, confirm: true });
  assert.equal(dropped.status, 200); assert.equal(dropped.body.status, 'Closed');

  const archived = await archive(owner, shop, service.id);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.queue.status, 'Closed', 'archiving a Closed Queue does not reopen it');
  assert.equal((await consoleAny(owner, shop)).queues.length, 0);

  const history = await guest.request(`/api${joined.body.link}`);
  assert.equal(history.status, 200, 'the Ticket of an archived closed Service is still readable in history');
  assert.equal(history.body.number, joined.body.ticket.number);
  assert.equal(history.body.status, 'Dropped');
  assert.equal(history.body.serviceName, 'Cut');
});

test('Editing a Prefix keeps the number of Tickets already issued and new Tickets use the current Prefix', async () => {
  const { owner, guest, shop, queue, service } = await archiveFixture('Prefix edit shop');
  const first = await join(guest, queue); assert.equal(first.status, 201);
  assert.equal(first.body.ticket.number, 'A001');

  const edited = await owner.request(`/api/services/${service.id}`, { method: 'PUT', body: { name: 'Cut', prefix: 'Z', callTimeoutMinutes: 10, nearTurnThreshold: 2 } });
  assert.equal(edited.status, 200); assert.equal(edited.body.prefix, 'Z');

  const original = await guest.request(`/api${first.body.link}`);
  assert.equal(original.body.number, 'A001', 'an issued Ticket keeps its snapshot number after a Prefix edit');
  assert.equal((await consoleSnapshot(owner, shop, queue)).queues[0].prefix, 'Z', 'the Queue issues with the current Prefix');

  const second = await join(guest, queue, true); assert.equal(second.status, 201);
  assert.equal(second.body.ticket.number, 'Z002', 'a new Ticket uses the current Prefix and the running counter');

  const call = await callNext(owner, shop, queue); assert.equal(call.status, 200);
  assert.equal(call.body.number, 'A001', 'the older Ticket is served by its unchanged number');
  const started = await start(owner, call.body); assert.equal(started.status, 200);
  assert.equal((await complete(owner, started.body)).status, 200, 'an older-numbered Ticket still finishes normally');
});

test('A Prefix in use by an active Service is rejected, and archiving frees it for a new Service', async () => {
  const { owner, shop, service } = await archiveFixture('Prefix uniqueness shop');

  const duplicate = await owner.post(`/api/shops/${shop.id}/services`, { name: 'Duplicate', prefix: 'A', callTimeoutMinutes: 10, nearTurnThreshold: 2 });
  assert.equal(duplicate.status, 409, 'a Prefix already used by an active Service is rejected');
  assert.equal(duplicate.body.code, 'prefix_exists');

  const second = await owner.post(`/api/shops/${shop.id}/services`, { name: 'Wash', prefix: 'B', callTimeoutMinutes: 10, nearTurnThreshold: 2 });
  assert.equal(second.status, 201);

  const clash = await owner.request(`/api/services/${service.id}`, { method: 'PUT', body: { name: 'Cut', prefix: 'B', callTimeoutMinutes: 10, nearTurnThreshold: 2 } });
  assert.equal(clash.status, 409, 'editing onto an active Prefix is rejected too');
  assert.equal(clash.body.code, 'prefix_exists');

  const archived = await archive(owner, shop, second.body.id);
  assert.equal(archived.status, 200); assert.equal(archived.body.archived, true);

  const reused = await owner.post(`/api/shops/${shop.id}/services`, { name: 'Wash again', prefix: 'B', callTimeoutMinutes: 10, nearTurnThreshold: 2 });
  assert.equal(reused.status, 201, 'the Prefix of an archived Service is free for a new active Service');
  const freed = await owner.request(`/api/services/${service.id}`, { method: 'PUT', body: { name: 'Cut', prefix: 'B', callTimeoutMinutes: 10, nearTurnThreshold: 2 } });
  assert.equal(freed.status, 409, 'the reused Prefix is now held by the new active Service');
});

test('Another Owner cannot archive or read the Service, and a stale Shop version is refused', async () => {
  const { owner, shop, service } = await archiveFixture('Archive ownership shop');
  const { api: other } = await verifiedOwner();

  assert.equal((await other.request(`/api/shops/${shop.id}`)).status, 404, 'another Owner cannot read the Shop');
  const foreign = await other.post(`/api/services/${service.id}/archive`, { version: 1 });
  assert.equal(foreign.status, 404, 'another Owner cannot archive the Service');
  assert.equal((await shopView(owner, shop)).services.find(s => s.id === service.id).archived, false, 'the failed archive changed nothing');

  const view = await shopView(owner, shop);
  const stale = await owner.post(`/api/services/${service.id}/archive`, { version: view.version + 5 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'state_changed');
  assert.equal(stale.body.current.version, view.version, 'a stale archive is answered with the current Shop snapshot');
  assert.equal((await shopView(owner, shop)).services.find(s => s.id === service.id).archived, false, 'a stale archive changes nothing');
});
