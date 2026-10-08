import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ApiClient, verifiedOwner } from './client.mjs';

const fixtureLifetimeSeconds = 86400;

async function startDemo() {
  const api = new ApiClient();
  await api.session();
  const result = await api.post('/api/demo/session', {});
  assert.equal(result.status, 201, 'Try demo must open a session without registration');
  assert.equal(result.body.demo, true, 'the created session must be marked as a demo');
  return { api, demo: result.body };
}

async function consoleOf(api, shopId, queueId) {
  const result = await api.request(`/api/shops/${shopId}/console?queueId=${queueId}`);
  assert.equal(result.status, 200, 'the demo Owner console must expose the seeded fixture');
  return result.body;
}

async function realShopWithOpenQueue(owner) {
  const shop = (await owner.post('/api/shops', { name: `Real Shop ${randomUUID()}` })).body;
  const service = (await owner.post(`/api/shops/${shop.id}/services`, { name: 'Repair', prefix: 'R', callTimeoutMinutes: 5, nearTurnThreshold: 2 })).body;
  assert.equal((await owner.post(`/api/queues/${service.queue.id}/open`, {})).status, 200);
  return shop;
}

test('Try demo opens a real seeded Shop where every normal command works', async () => {
  const { api, demo } = await startDemo();
  const remaining = (new Date(demo.expiresAt).getTime() - Date.now()) / 1000;
  assert.ok(Math.abs(remaining - fixtureLifetimeSeconds) < 900, `the demo must publish its fixed 24 hour expiry (server reported ${Math.round(remaining)}s)`);
  assert.ok(demo.seed.completed >= 5, 'the fixture must seed at least five usable Completed jobs');
  assert.ok(demo.seed.waiting >= 1, 'the fixture must seed Waiting Tickets the Owner can serve');

  const shops = (await api.request('/api/shops')).body;
  assert.equal(shops.length, 1, 'a demo session owns exactly one seeded Shop');
  const shop = shops[0];
  assert.equal(shop.id, demo.shop.id);
  const haircut = shop.services.find(service => service.prefix === 'A');
  const wash = shop.services.find(service => service.prefix === 'B');
  assert.ok(haircut && wash, 'the fixture must seed distinguishable Services');
  assert.equal(haircut.queue.status, 'Open');
  assert.equal(wash.queue.status, 'Open');

  const view = await consoleOf(api, shop.id, haircut.queue.id);
  assert.ok(view.waiting.length >= 2, 'the seeded Queue must show Waiting Tickets');
  assert.equal(view.held, null, 'a fresh demo Shop holds no Ticket yet');
  const oldest = view.waiting[0];
  assert.equal(oldest.number, 'A001', 'seed numbering must follow receive order');

  const call = await api.post(`/api/queues/${haircut.queue.id}/call`, { version: view.version });
  assert.equal(call.status, 200);
  assert.equal(call.body.id, oldest.id, 'Call must serve the oldest seeded Waiting Ticket');
  const start = await api.post(`/api/tickets/${call.body.id}/start`, { version: call.body.version });
  assert.equal(start.status, 200);
  const complete = await api.post(`/api/tickets/${call.body.id}/complete`, { version: start.body.version });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.status, 'Completed');

  const afterComplete = await consoleOf(api, shop.id, haircut.queue.id);
  const next = await api.post(`/api/queues/${haircut.queue.id}/call`, { version: afterComplete.version });
  assert.equal(next.status, 200);
  const skipped = await api.post(`/api/tickets/${next.body.id}/skip`, { version: next.body.version });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.status, 'Skipped');

  const guest = new ApiClient();
  await guest.session();
  const publicShop = await guest.request(`/api/s/${shop.publicId}`);
  assert.equal(publicShop.status, 200, 'the demo Shop must be joinable by a Customer');
  assert.equal(publicShop.body.services.some(service => service.prefix === 'A'), true);
  assert.equal(JSON.stringify(publicShop.body).includes('"note"'), false, 'the public Shop view must not expose private notes');
  const issued = await guest.post(`/api/queues/${haircut.queue.id}/tickets`, { requestId: randomUUID(), note: 'demo walk-up' });
  assert.equal(issued.status, 201, 'a Customer must take a real Ticket in the demo Queue');
  const ticketView = await guest.request('/api' + issued.body.link);
  assert.equal(ticketView.status, 200);
  assert.equal(ticketView.body.status, 'Waiting');
  assert.equal(Object.hasOwn(ticketView.body, 'note'), false, 'the Customer view must not expose the private note');
});

test('two demo sessions and a real Owner stay isolated and never reset each other', async () => {
  const first = await startDemo();
  const second = await startDemo();
  const firstOwner = (await first.api.session()).owner;
  const secondOwner = (await second.api.session()).owner;
  assert.notEqual(firstOwner.id, secondOwner.id, 'each demo session must own a separate account');
  assert.equal(firstOwner.demo, true, 'the session metadata must mark the account as a demo');
  assert.notEqual(firstOwner.email, secondOwner.email);
  assert.notEqual(first.demo.shop.id, second.demo.shop.id);
  assert.notEqual(first.demo.shop.publicId, second.demo.shop.publicId);

  const real = await verifiedOwner();
  const realShop = await realShopWithOpenQueue(real.api);
  const realShops = (await real.api.request('/api/shops')).body;
  assert.equal(realShops.length, 1);
  assert.equal(realShops.some(shop => shop.id === first.demo.shop.id), false, 'a real Owner must not see demo Shops');
  assert.equal((await real.api.request(`/api/shops/${first.demo.shop.id}`)).status, 404);
  assert.equal((await real.api.request(`/api/shops/${first.demo.shop.id}/console`)).status, 404);

  const firstShop = (await first.api.request('/api/shops')).body[0];
  const firstQueue = firstShop.services.find(service => service.prefix === 'A').queue.id;
  const firstView = await consoleOf(first.api, firstShop.id, firstQueue);
  assert.equal((await real.api.post(`/api/queues/${firstQueue}/call`, { version: firstView.version })).status, 404, 'a demo Queue is not a public unrestricted Owner token');
  assert.equal((await first.api.request(`/api/shops/${realShop.id}/console`)).status, 404, 'a demo Owner must not reach a real Shop');

  const served = await first.api.post(`/api/queues/${firstQueue}/call`, { version: firstView.version });
  assert.equal(served.status, 200);
  const started = await first.api.post(`/api/tickets/${served.body.id}/start`, { version: served.body.version });
  assert.equal(started.status, 200);
  assert.equal((await first.api.post(`/api/tickets/${served.body.id}/complete`, { version: started.body.version })).status, 200);

  const firstLater = await consoleOf(first.api, firstShop.id, firstQueue);
  assert.equal(firstLater.waiting.length, firstView.waiting.length - 1, 'the first session keeps its own progress');
  const secondShop = (await second.api.request('/api/shops')).body[0];
  const secondQueue = secondShop.services.find(service => service.prefix === 'A').queue.id;
  const secondView = await consoleOf(second.api, secondShop.id, secondQueue);
  assert.equal(secondView.waiting.length, firstView.waiting.length, 'a new session gets a fresh fixture instead of another session state');
  assert.equal(secondView.held, null);
});
