import { test, expect, english, addService, takeTicket } from './fixtures.mjs';

// Real concurrency, no network interception: two Owner tabs that share one signed-in session Call two
// different Queues at the same moment. The server serializes Calls on the Shop-wide one-hold rule, so the
// scenario asserts the consumer invariant — exactly one hold, one refused Call, and the other Ticket Waiting —
// rather than any particular conflict wording.
test('two Owner tabs Calling across two Queues keep one hold and leave the other Ticket Waiting', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;
  const other = await addService(page, shop, { name: 'Wash', prefix: 'W' });

  const firstCustomer = await actor();
  const repairTicket = await takeTicket(firstCustomer.page, shop, service);
  const secondCustomer = await actor();
  const washTicket = await takeTicket(secondCustomer.page, shop, other);

  // The peer tab shares the real Owner account through the same browser context.
  await page.goto('/owner/queue');
  const peer = await page.context().newPage();
  await peer.goto('/owner/queue');
  await english(peer);

  const repairTab = page.getByRole('tab', { name: /^Repair/ });
  const washTab = peer.getByRole('tab', { name: /^Wash/ });
  const repairCall = page.getByRole('button', { name: /^Call next · R/ });
  const washCall = peer.getByRole('button', { name: /^Call next · W/ });

  await repairTab.click();
  await expect(repairCall).toBeVisible();
  await washTab.click();
  await expect(washCall).toBeVisible();
  await expect(repairCall).toBeEnabled();
  await expect(washCall).toBeEnabled();

  const repairResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/queues/${service.queue.id}/call`);
  const washResponse = peer.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/queues/${other.queue.id}/call`);

  await Promise.all([repairCall.dispatchEvent('click'), washCall.dispatchEvent('click')]);
  const [repairResult, washResult] = await Promise.all([repairResponse, washResponse]);

  const attempts = [{ tab: page, response: repairResult }, { tab: peer, response: washResult }];
  const winners = attempts.filter(attempt => attempt.response.ok());
  const losers = attempts.filter(attempt => !attempt.response.ok());
  expect(winners, 'exactly one Call may win the Shop-wide hold').toHaveLength(1);
  expect(losers, 'the other Call must be refused, not silently accepted twice').toHaveLength(1);
  expect(losers[0].response.status()).toBe(409);
  expect((await losers[0].response.json()).code).toBe('shop_busy');

  const winner = await winners[0].response.json();
  expect([repairTicket.ticket.id, washTicket.ticket.id]).toContain(winner.id);

  // The losing tab surfaces the conflict and then converges on the one real hold.
  await expect(losers[0].tab.locator('.console-error')).toBeVisible();
  for (const tab of [page, peer]) {
    await expect(tab.locator('.held-number')).toHaveCount(1);
    await expect(tab.locator('.held-number')).toHaveText(winner.number);
  }

  // Committed truth: one Called Ticket, the other still Waiting, and nothing issued twice.
  const snapshot = await (await page.request.get(`/api/shops/${shop.id}/console`)).json();
  expect(snapshot.held?.id).toBe(winner.id);
  const repairWon = winner.id === repairTicket.ticket.id;
  const winningQueue = repairWon ? service : other;
  const losingQueue = repairWon ? other : service;
  expect(snapshot.queues.reduce((total, queue) => total + queue.waitingCount, 0)).toBe(1);
  expect(snapshot.queues.find(queue => queue.id === losingQueue.queue.id).waitingCount).toBe(1);
  expect(snapshot.queues.find(queue => queue.id === winningQueue.queue.id).waitingCount).toBe(0);
  const losingCustomer = repairWon ? secondCustomer : firstCustomer;
  await expect(losingCustomer.page.locator('.status-word')).toHaveText('Waiting');
});
