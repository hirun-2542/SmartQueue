import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner,ApiClient } from './client.mjs';

// A short but positive Call timeout keeps the real auto-Skip worker and the real clock involved while bounding the test.
const CALL_TIMEOUT_MINUTES = 0.05; // 3 seconds
const OBSERVE_MS = 30000;

async function closingFixture(name, callTimeoutMinutes = 10) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const service = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Cut', prefix: 'A', callTimeoutMinutes, nearTurnThreshold: 2 })).body;
  const queue = service.queue.id;
  const opened = await owner.post(`/api/queues/${queue}/open`, {});
  assert.equal(opened.status, 200, 'the Owner opens a Business day before anything can join');
  const guest = new ApiClient(); await guest.session();
  return { owner, guest, shop, queue, service };
}

async function consoleSnapshot(owner, shop, queue) {
  const result = await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);
  assert.equal(result.status, 200, 'the Owner console must expose the Queue status and the Shop version');
  return result.body;
}

async function join(guest, queue, extra = false) {
  return guest.post(`/api/queues/${queue}/tickets`, { requestId: randomUUID(), confirmExtra: extra });
}

async function stopAccepting(owner, shop, queue) {
  const view = await consoleSnapshot(owner, shop, queue);
  return owner.post(`/api/queues/${queue}/stop`, { version: view.version });
}

async function dropQueue(owner, shop, queue, confirm = true) {
  const view = await consoleSnapshot(owner, shop, queue);
  return owner.post(`/api/queues/${queue}/drop`, { version: view.version, confirm });
}

async function callNext(owner, shop, queue) {
  const view = await consoleSnapshot(owner, shop, queue);
  return owner.post(`/api/queues/${queue}/call`, { version: view.version });
}

async function queueBusinessDay(owner, shop) {
  const result = await owner.request(`/api/shops/${shop.id}`);
  assert.equal(result.status, 200);
  return result.body.services[0].queue.businessDayId;
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

test('Stop accepting refuses new Tickets, drains the Waiting ones, ends the Business day on the last Ticket, and reopens with a fresh counter', async () => {
  const { owner, guest, shop, queue } = await closingFixture('Drain shop');
  const first = await join(guest, queue); assert.equal(first.status, 201);
  const second = await join(guest, queue, true); assert.equal(second.status, 201);
  assert.match(first.body.ticket.number, /^A\d{3}$/);
  assert.notEqual(first.body.ticket.number, second.body.ticket.number);
  const originalDay = await queueBusinessDay(owner, shop);

  const stopped = await stopAccepting(owner, shop, queue);
  assert.equal(stopped.status, 200, 'an Open Queue stops accepting');
  assert.equal(stopped.body.status, 'Closing', 'the Queue still holds Waiting Tickets, so it drains as Closing');
  assert.equal(stopped.body.businessDayClosedAt, null, 'the Business day is not ended while work is still waiting');
  assert.equal(stopped.body.droppedCount, 0, 'Stop accepting never ends a Waiting Ticket');
  assert.equal(stopped.body.queueId, queue);

  const draining = await consoleSnapshot(owner, shop, queue);
  assert.equal(draining.queues[0].status, 'Closing');
  assert.equal(draining.waiting.length, 2, 'the Waiting Tickets stay callable');

  assert.equal((await join(guest, queue, true)).status, 409, 'a Customer cannot join a Closing Queue');
  assert.equal((await owner.post(`/api/queues/${queue}/walkin`, { note: null })).status, 409, 'a Walk-in cannot join a Closing Queue');
  const reopenWhileClosing = await owner.post(`/api/queues/${queue}/open`, {});
  assert.equal(reopenWhileClosing.status, 409);
  assert.equal(reopenWhileClosing.body.code, 'queue_not_closed', 'a Closing Queue cannot open a new Business day over the draining one');
  const stopAgain = await stopAccepting(owner, shop, queue);
  assert.equal(stopAgain.status, 409);
  assert.equal(stopAgain.body.code, 'queue_closing');

  const callFirst = await callNext(owner, shop, queue);
  assert.equal(callFirst.status, 200);
  const startFirst=await owner.post(`/api/tickets/${callFirst.body.id}/start`,{version:callFirst.body.version});assert.equal(startFirst.status,200);
  const completeFirst = await owner.post(`/api/tickets/${callFirst.body.id}/complete`, { version: startFirst.body.version });
  assert.equal(completeFirst.status, 200); assert.equal(completeFirst.body.status, 'Completed');
  assert.equal((await consoleSnapshot(owner, shop, queue)).queues[0].status, 'Closing', 'one Ticket left still keeps the Queue open');

  const callSecond = await callNext(owner, shop, queue);
  const startSecond=await owner.post(`/api/tickets/${callSecond.body.id}/start`,{version:callSecond.body.version});assert.equal(startSecond.status,200);
  const completeSecond = await owner.post(`/api/tickets/${callSecond.body.id}/complete`, { version: startSecond.body.version });
  assert.equal(completeSecond.status, 200);

  const drained = await consoleSnapshot(owner, shop, queue);
  assert.equal(drained.queues[0].status, 'Closed', 'the last completed Ticket ends the Business day without any scheduled job');
  assert.equal(drained.waiting.length, 0);

  const reopened = await owner.post(`/api/queues/${queue}/open`, {});
  assert.equal(reopened.status, 200, 'a Closed Queue opens a new Business day');
  assert.notEqual(reopened.body.businessDayId, originalDay, 'the reopened Queue points at a different Business day');
  assert.equal(await queueBusinessDay(owner, shop), reopened.body.businessDayId);
  const fresh = await join(guest, queue);
  assert.equal(fresh.status, 201);
  assert.equal(fresh.body.ticket.number, 'A001', 'the counter restarts at 1 in the new Business day');
  assert.notEqual(fresh.body.ticket.id, first.body.ticket.id, 'a repeated number is never the same Ticket identity');
});

test('an empty Queue closes and ends its Business day in the same operation', async () => {
  const empty = await closingFixture('Empty stop shop');
  const result = await stopAccepting(empty.owner, empty.shop, empty.queue);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'Closed', 'an Open Queue with nothing to drain closes immediately');
  assert.ok(result.body.businessDayClosedAt, 'the empty Business day still records a UTC end time');

  const view = await consoleSnapshot(empty.owner, empty.shop, empty.queue);
  assert.equal(view.queues[0].status, 'Closed');
  assert.equal(view.held, null);
  assert.equal(view.waiting.length, 0);
  const closeAgain = await stopAccepting(empty.owner, empty.shop, empty.queue);
  assert.equal(closeAgain.status, 409);
  assert.equal(closeAgain.body.code, 'queue_closed');
  assert.equal((await dropQueue(empty.owner, empty.shop, empty.queue)).status, 409, 'a Closed Queue cannot be Dropped again');
  const reopened = await empty.owner.post(`/api/queues/${empty.queue}/open`, {});
  assert.equal(reopened.status, 200, 'the same calendar day can hold a new Business day');
  const joined = await join(empty.guest, empty.queue);
  assert.equal(joined.body.ticket.number, 'A001');

  const dropped = await closingFixture('Empty drop shop');
  const droppedResult = await dropQueue(dropped.owner, dropped.shop, dropped.queue);
  assert.equal(droppedResult.status, 200);
  assert.equal(droppedResult.body.status, 'Closed', 'Dropping an empty Open Queue ends the Business day in one operation');
  assert.equal(droppedResult.body.droppedCount, 0);
  assert.ok(droppedResult.body.businessDayClosedAt);
});

test('Drop ends only Waiting Tickets, keeps the held Ticket working across the Shop, and closes when that work ends', async () => {
  const { owner, guest, shop, queue } = await closingFixture('Drop with hold shop');
  const heldJoined = await join(guest, queue); assert.equal(heldJoined.status, 201);
  const heldCall = await callNext(owner, shop, queue); assert.equal(heldCall.status, 200);
  const heldStart = await owner.post(`/api/tickets/${heldCall.body.id}/start`, { version: heldCall.body.version });
  assert.equal(heldStart.status, 200); assert.equal(heldStart.body.status, 'InService');
  const waitingA = await join(guest, queue, true); assert.equal(waitingA.status, 201);
  const waitingB = await join(guest, queue, true); assert.equal(waitingB.status, 201);

  const before = await consoleSnapshot(owner, shop, queue);
  assert.equal(before.waiting.length, 2);
  const dropped = await dropQueue(owner, shop, queue);
  assert.equal(dropped.status, 200);
  assert.equal(dropped.body.droppedCount, 2, 'every Waiting Ticket is reported as Dropped');
  assert.deepEqual(new Set(dropped.body.droppedTicketIds), new Set([waitingA.body.ticket.id, waitingB.body.ticket.id]));
  assert.equal(dropped.body.status, 'Closing', 'the InService Ticket keeps the Queue Closing');
  assert.equal(dropped.body.businessDayClosedAt, null, 'the Shop hold keeps the Business day alive');

  const after = await consoleSnapshot(owner, shop, queue);
  assert.ok(after.held, 'the held Ticket is still on the console after a Drop');
  assert.equal(after.held.id, heldCall.body.id, 'the held Ticket is not ended by a Drop');
  assert.equal(after.held.status, 'InService');
  assert.equal(after.held.version, heldStart.body.version, 'a Drop does not touch the held Ticket version');
  assert.equal(after.waiting.length, 0);

  const droppedView = await guest.request(`/api${waitingA.body.link}`);
  assert.equal(droppedView.status, 200);
  assert.equal(droppedView.body.status, 'Dropped', 'the Customer sees the Shop closure, not a cancellation of their own making');
  assert.equal(droppedView.body.endReason, 'dropped');
  assert.ok(droppedView.body.endedAt, 'a Dropped Ticket records its terminal timestamp');
  assert.equal((await join(guest, queue, true)).status, 409, 'no Ticket joins a Queue that already Dropped');

  // Nothing closes the Queue on a timer while the held work continues.
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal((await consoleSnapshot(owner, shop, queue)).queues[0].status, 'Closing', 'a Closing Queue with active work never auto-closes');

  const complete = await owner.post(`/api/tickets/${heldCall.body.id}/complete`, { version: heldStart.body.version });
  assert.equal(complete.status, 200); assert.equal(complete.body.status, 'Completed');
  const closed = await consoleSnapshot(owner, shop, queue);
  assert.equal(closed.queues[0].status, 'Closed', 'the ended held Ticket closes the drained Queue');
  assert.equal(closed.held, null);
});

async function twoServiceFixture(name) {
  const { api: owner } = await verifiedOwner();
  const shop = (await owner.post('/api/shops', { name })).body;
  const cut = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Cut', prefix: 'A', callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
  const wash = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Wash', prefix: 'B', callTimeoutMinutes: 10, nearTurnThreshold: 2 })).body;
  await owner.post(`/api/queues/${cut.queue.id}/open`, {});
  await owner.post(`/api/queues/${wash.queue.id}/open`, {});
  const guest = new ApiClient(); await guest.session();
  return { owner, guest, shop, cut: cut.queue.id, wash: wash.queue.id, cutServiceId: cut.id, washServiceId: wash.id };
}

test('Dropping one Queue leaves another Service held Ticket and Business day untouched', async () => {
  const { owner, guest, shop, cut, wash, cutServiceId, washServiceId } = await twoServiceFixture('Drop across services shop');
  const heldJoin = await join(guest, wash); assert.equal(heldJoin.status, 201);
  const heldCall = await callNext(owner, shop, wash); assert.equal(heldCall.status, 200);
  const heldStart = await owner.post(`/api/tickets/${heldCall.body.id}/start`, { version: heldCall.body.version });
  assert.equal(heldStart.body.status, 'InService');

  const waitingA = await join(guest, cut); assert.equal(waitingA.status, 201);
  const waitingB = await join(guest, cut, true); assert.equal(waitingB.status, 201);

  const view = await consoleSnapshot(owner, shop, cut);
  const dropped = await owner.post(`/api/queues/${cut}/drop`, { version: view.version, confirm: true });
  assert.equal(dropped.status, 200);
  assert.equal(dropped.body.droppedCount, 2);
  assert.equal(dropped.body.status, 'Closed', 'the Dropped Queue had no work of its own left, so its Business day ends');
  assert.ok(dropped.body.businessDayClosedAt);

  const held = await consoleSnapshot(owner, shop, wash);
  assert.ok(held.held, 'the Shop-wide hold survives a Drop in another Service');
  assert.equal(held.held.id, heldCall.body.id);
  assert.equal(held.held.status, 'InService');
  assert.equal(held.held.version, heldStart.body.version);
  assert.equal((await guest.request(`/api${heldJoin.body.link}`)).body.status, 'InService', 'work in progress in another Service is never ended by a Drop');
  assert.equal(held.queues.find(q => q.serviceId === cutServiceId).status, 'Closed');
  assert.equal(held.queues.find(q => q.serviceId === washServiceId).status, 'Open', 'the other Service keeps accepting Tickets');

  const complete = await owner.post(`/api/tickets/${heldCall.body.id}/complete`, { version: heldStart.body.version });
  assert.equal(complete.status, 200);
  const afterWork = await consoleSnapshot(owner, shop, wash);
  assert.equal(afterWork.queues.find(q => q.serviceId === washServiceId).status, 'Open', 'a normal Complete never closes an Open Queue');
});

test('Drop requires the explicit confirmation and a current Shop version', async () => {
  const { owner, guest, shop, queue } = await closingFixture('Drop confirmation shop');
  const joined = await join(guest, queue); assert.equal(joined.status, 201);

  const refused = await dropQueue(owner, shop, queue, false);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, 'confirmation_required');
  const untouched = await consoleSnapshot(owner, shop, queue);
  assert.equal(untouched.queues[0].status, 'Open', 'an unconfirmed Drop changes nothing');
  assert.equal(untouched.waiting.length, 1);
  assert.equal((await guest.request(`/api${joined.body.link}`)).body.status, 'Waiting');

  const view = await consoleSnapshot(owner, shop, queue);
  const stale = await owner.post(`/api/queues/${queue}/drop`, { version: view.version + 5, confirm: true });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'state_changed');
  assert.equal(stale.body.current.version, view.version, 'a stale Drop is answered with the current console snapshot');
  assert.equal(stale.body.current.queues[0].status, 'Open');
  const staleStop = await owner.post(`/api/queues/${queue}/stop`, { version: view.version + 5 });
  assert.equal(staleStop.status, 409);
  assert.equal(staleStop.body.code, 'state_changed');
  assert.equal((await consoleSnapshot(owner, shop, queue)).waiting.length, 1, 'a stale Stop changes nothing');
});

test('Stop accepting racing a join is decided by commit order and never issues a Ticket behind the close', async () => {
  const { owner, guest, shop, queue } = await closingFixture('Stop race shop');
  const view = await consoleSnapshot(owner, shop, queue);
  const [stopped, joined] = await Promise.all([
    owner.post(`/api/queues/${queue}/stop`, { version: view.version }),
    join(guest, queue)
  ]);
  assert.equal([stopped.status === 200, joined.status === 201].filter(Boolean).length, 1, 'exactly one side of the race commits');

  const after = await consoleSnapshot(owner, shop, queue);
  if (stopped.status === 200) {
    assert.equal(joined.status, 409);
    assert.equal(joined.body.code, 'queue_closed', 'the losing join is refused instead of issuing a Ticket behind the close');
    assert.equal(after.waiting.length, 0);
    assert.notEqual(after.queues[0].status, 'Open');
  } else {
    assert.equal(stopped.body.code, 'state_changed');
    assert.equal(joined.status, 201);
    assert.equal(after.queues[0].status, 'Open', 'the Queue stays Open when the closing request lost the race');
    assert.equal(after.waiting.length, 1, 'the winning join is part of the work the next Stop would drain');
  }
  if (after.queues[0].status === 'Closed') assert.equal(joined.status, 409, 'a Closed Queue must never have accepted a Ticket');
});

test('Drop racing a join leaves no Waiting Ticket behind and never leaves the closed outcome ambiguous', async () => {
  const { owner, guest, shop, queue } = await closingFixture('Drop race shop');
  const settledTicket = await join(guest, queue); assert.equal(settledTicket.status, 201);
  const racer = new ApiClient(); await racer.session();
  const view = await consoleSnapshot(owner, shop, queue);
  const [dropped, joined] = await Promise.all([
    owner.post(`/api/queues/${queue}/drop`, { version: view.version, confirm: true }),
    join(racer, queue)
  ]);

  const after = await consoleSnapshot(owner, shop, queue);
  if (dropped.status === 200) {
    assert.equal(after.queues[0].status, 'Closed');
    assert.equal(after.waiting.length, 0, 'a committed Drop leaves no Waiting Ticket, whether or not a join committed first');
    assert.equal(after.held, null);
    if (joined.status === 201) {
      const raced = await racer.request(`/api${joined.body.link}`);
      assert.equal(raced.body.status, 'Dropped', 'a Ticket issued just before the Drop belongs to the Dropped work');
    }
  } else {
    assert.equal(dropped.status, 409);
    assert.equal(dropped.body.code, 'state_changed');
    assert.equal(joined.status, 201);
    assert.equal(after.queues[0].status, 'Open', 'the Queue stays Open when the Drop lost the race');
    assert.equal(after.waiting.length, 2);
  }
});

test('Cancel and Skip end a drained Closing Queue through the shared invariant, without any worker', async () => {
  const cancelled = await closingFixture('Cancel drain shop');
  const joinCancelled = await join(cancelled.guest, cancelled.queue); assert.equal(joinCancelled.status, 201);
  assert.equal((await stopAccepting(cancelled.owner, cancelled.shop, cancelled.queue)).body.status, 'Closing');
  const cancel = await cancelled.guest.post(`/api${joinCancelled.body.link}/cancel`, { version: joinCancelled.body.ticket.version });
  assert.equal(cancel.status, 200); assert.equal(cancel.body.status, 'Cancelled');
  const afterCancel = await consoleSnapshot(cancelled.owner, cancelled.shop, cancelled.queue);
  assert.equal(afterCancel.queues[0].status, 'Closed', 'the Customer Cancel ends the drained Business day');

  const skipped = await closingFixture('Skip drain shop');
  const joinSkipped = await join(skipped.guest, skipped.queue); assert.equal(joinSkipped.status, 201);
  assert.equal((await stopAccepting(skipped.owner, skipped.shop, skipped.queue)).body.status, 'Closing');
  const call = await callNext(skipped.owner, skipped.shop, skipped.queue);
  const skip = await skipped.owner.post(`/api/tickets/${call.body.id}/skip`, { version: call.body.version });
  assert.equal(skip.status, 200); assert.equal(skip.body.status, 'Skipped');
  const afterSkip = await consoleSnapshot(skipped.owner, skipped.shop, skipped.queue);
  assert.equal(afterSkip.queues[0].status, 'Closed', 'the Owner Skip ends the drained Business day');
});

test('the real auto-Skip worker also ends a drained Closing Queue', async () => {
  const { owner, guest, shop, queue } = await closingFixture('Auto-skip drain shop', CALL_TIMEOUT_MINUTES);
  const joined = await join(guest, queue); assert.equal(joined.status, 201);
  assert.equal((await stopAccepting(owner, shop, queue)).body.status, 'Closing');
  const call = await callNext(owner, shop, queue);
  assert.equal(call.status, 200); assert.ok(call.body.deadline);

  const skipped = await waitForStatus(guest, joined.body.link, 'Skipped');
  assert.equal(skipped.endReason, 'auto_skip');
  assert.equal(skipped.status, 'Skipped');
  const after = await consoleSnapshot(owner, shop, queue);
  assert.equal(after.queues[0].status, 'Closed', 'the auto-Skip transition closes the drained Queue too');
  assert.equal(after.waiting.length, 0);
});
