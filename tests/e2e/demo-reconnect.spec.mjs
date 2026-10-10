import { test, expect, english, mutation, takeTicket, callNext } from './fixtures.mjs';

async function enterDemo(page) {
  await page.goto('/');
  await english(page);
  const demo = await mutation(page, '/api/demo/session', () => page.getByRole('button', { name: 'Enter demo mode', exact: true }).click());
  await expect(page.getByRole('button', { name: 'Owner account', exact: true })).toBeVisible();
  return demo;
}

test('the simulator issues a real Ticket whose Owner, Customer and Display board agree through completion', async ({ page, context }) => {
  const demo = await enterDemo(page);
  await page.goto('/owner/demo');
  await expect(page.locator('.live-label')).toHaveText('Live');
  await page.getByLabel('Nickname or note (optional)', { exact: true }).fill('Demo private note');
  const [issuedResponse] = await Promise.all([
    page.waitForResponse(response => /\/api\/demo\/queues\/[^/]+\/tickets$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Receive Customer Ticket', exact: true }).click(),
  ]);
  expect(issuedResponse.status()).toBe(201);
  const issued = await issuedResponse.json();
  const [customer] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Open Customer view', exact: true }).click()]);
  await expect(customer.locator('.ticket-number')).toHaveText(issued.ticket.number);
  const [board] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Open Display board', exact: true }).click()]);
  await expect(board.locator('.board-shop')).toHaveText(demo.shop.name);
  const [owner] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Open Owner view', exact: true }).click()]);
  const serviceName = await customer.locator('.ticket-service strong').textContent();
  await owner.getByRole('tab').filter({ hasText: serviceName }).click();
  await expect(owner.locator('.live-label')).toHaveText('Live');
  // Serve the seeded Waiting work with normal commands until the simulated Customer reaches the head.
  for (let i = 0; i < 10; i++) {
    const [callResponse] = await Promise.all([
      owner.waitForResponse(response => /\/api\/queues\/[^/]+\/call$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST'),
      owner.getByRole('button', { name: /^Call next ·/ }).click(),
    ]);
    expect(callResponse.status()).toBe(200);
    const called = await callResponse.json();
    if (called.id === issued.ticket.id) break;
    await mutation(owner, `/api/tickets/${called.id}/skip`, () => owner.getByRole('button', { name: 'Skip', exact: true }).click());
  }
  await expect(owner.locator('.held-number')).toHaveText(issued.ticket.number);
  await expect(customer.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
  await expect(board.locator('.board-current-number')).toHaveText(issued.ticket.number);
  await expect(board.getByText('Demo private note', { exact: true })).toHaveCount(0);
  await mutation(owner, `/api/tickets/${issued.ticket.id}/start`, () => owner.getByRole('button', { name: 'Start service', exact: true }).click());
  await expect(customer.getByRole('heading', { name: 'In service', exact: true })).toBeVisible();
  await expect(board.locator('.board-current-number')).toHaveCount(0);
  await mutation(owner, `/api/tickets/${issued.ticket.id}/complete`, () => owner.getByRole('button', { name: 'Complete', exact: true }).click());
  await expect(customer.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible();
  const latestCall = board.locator('.board-recent-item').first();
  await expect(latestCall.locator('.number')).toHaveText(issued.ticket.number);
  await expect(latestCall.locator('.board-recent-service')).toHaveText(serviceName);
  await expect(latestCall.locator('.board-status')).toHaveText('Done');
});

test('offline Owner commands stay unavailable until reconnect resyncs another tab’s committed work', async ({ page, context, shop: fixture, actor }) => {
  const customer = await actor();
  const issued = await takeTicket(customer.page, fixture.shop, fixture.service);
  const peer = await actor({ storageState: await context.storageState() });
  await peer.page.goto('/owner/queue');
  await expect(peer.page.locator('.live-label')).toHaveText('Live');
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /^Call next ·/ })).toBeDisabled({ timeout: 15000 });
  const called = await callNext(peer.page, fixture.service);
  expect(called.id).toBe(issued.ticket.id);
  await mutation(peer.page, `/api/tickets/${called.id}/start`, () => peer.page.getByRole('button', { name: 'Start service', exact: true }).click());
  await expect.poll(() => page.locator('.owner-actionbar').evaluate(element => {
    const buttons = [...element.querySelectorAll('button')];
    return buttons.length > 0 && buttons.every(button => button.disabled);
  }), { message: 'peer commits must not reopen commands while offline' }).toBe(true);
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => [document.querySelector('.live-label')?.textContent, document.querySelector('.held-number')?.textContent]), { timeout: 20000 }).toEqual(['Live', issued.ticket.number]);
  await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeEnabled();
  await mutation(page, `/api/tickets/${called.id}/complete`, () => page.getByRole('button', { name: 'Complete', exact: true }).click());
  await expect(customer.page.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible();
});

test('independent demo sessions never share Shop commands', async ({ page, actor }) => {
  const first = await enterDemo(page);
  const other = await actor();
  const second = await enterDemo(other.page);
  expect(first.shop.id).not.toBe(second.shop.id);
  expect(first.shop.publicId).not.toBe(second.shop.publicId);
  await expect(other.page.locator('.live-label')).toHaveText('Live');
  const untouched = await other.page.locator('.waiting-row .number').allTextContents();
  await page.getByRole('button', { name: /^Call next ·/ }).click();
  await expect(page.getByRole('button', { name: 'Start service', exact: true })).toBeEnabled();
  await other.page.reload();
  await expect(other.page.locator('.live-label')).toHaveText('Live');
  await expect(other.page.locator('.held-number')).toHaveCount(0);
  await expect(other.page.locator('.waiting-row .number')).toHaveText(untouched);
});
