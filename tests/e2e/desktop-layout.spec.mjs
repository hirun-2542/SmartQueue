import { test, expect, takeTicket, walkIn, callNext, mutation, addService, cancelTicket, english } from './fixtures.mjs';

const computerSizes = [{ width: 1024, height: 900 }, { width: 1280, height: 900 }, { width: 1920, height: 1080 }];

async function reserveClassicScrollbar(page) {
  await page.addStyleTag({ content: 'html{scrollbar-gutter:stable}::-webkit-scrollbar{width:17px}' });
}

async function noOverflow(page) {
  await expect.poll(async () => (await page.evaluate(() => document.documentElement.scrollWidth)) - page.viewportSize().width).toBeLessThanOrEqual(1);
}

async function toTheRight(left, right) {
  const a = await left.boundingBox();
  const b = await right.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(b.x, 'secondary information must be beside the primary workspace, not below a scaled phone layout').toBeGreaterThanOrEqual(a.x + a.width - 1);
}

test('computer navigation and Queue panels operate side by side while phone controls stay thumb-accessible', async ({ page, shop: fixture, actor }) => {
  const customer = await actor();
  const issued = await takeTicket(customer.page, fixture.shop, fixture.service);
  const waiting = await walkIn(page, fixture.service, 'Desktop waiting Customer');
  await reserveClassicScrollbar(page);
  for (const size of computerSizes) {
    await page.setViewportSize(size);
    await noOverflow(page);
    await toTheRight(page.getByRole('navigation', { name: 'Main navigation' }), page.locator('.next-panel'));
    await toTheRight(page.locator('.next-panel'), page.locator('.waiting-list'));
    await expect(page.locator('.waiting-list')).toContainText(waiting.number);
    const primary = await page.getByRole('button', { name: /^Call next ·/ }).boundingBox();
    const list = await page.locator('.waiting-list').boundingBox();
    expect(primary.x + primary.width).toBeLessThanOrEqual(list.x + 1);
  }
  const called = await callNext(page, fixture.service);
  expect(called.id).toBe(issued.ticket.id);
  await expect(customer.page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
  await toTheRight(page.locator('.now-panel'), page.locator('.waiting-list'));
  await page.screenshot({ path: test.info().outputPath('computer-queue.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await noOverflow(page);
  const navigation = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
  expect(navigation.y + navigation.height).toBeGreaterThanOrEqual(811);
  await mutation(page, `/api/tickets/${called.id}/start`, () => page.getByRole('button', { name: 'Start service', exact: true }).click());
  await mutation(page, `/api/tickets/${called.id}/complete`, () => page.getByRole('button', { name: 'Complete', exact: true }).click());
  await expect(customer.page.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('phone-queue.png'), fullPage: true });
});

test('computer Shop and Statistics expose related information in parallel without changing mobile outcomes', async ({ page, shop: fixture, actor }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await addService(page, fixture.shop, { name: 'Wash', prefix: 'W' });
  await reserveClassicScrollbar(page);
  for (const size of computerSizes) {
    await page.setViewportSize(size);
    await noOverflow(page);
    await toTheRight(page.locator('.shop-qr'), page.locator('.service-list'));
  }
  const customer = await actor();
  await takeTicket(customer.page, fixture.shop, fixture.service);
  await cancelTicket(customer.page);
  await page.getByRole('link', { name: 'Statistics', exact: true }).click();
  await expect(page.locator('.stats-hero-number')).toHaveText('1');
  await expect(page.locator('.demand-section')).toBeVisible();
  for (const size of computerSizes) {
    await page.setViewportSize(size);
    await toTheRight(page.locator('.stats-hero'), page.locator('.demand-section'));
    await noOverflow(page);
  }
  await page.screenshot({ path: test.info().outputPath('computer-statistics.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('.stats-hero-number')).toHaveText('1');
  await noOverflow(page);
  const summary = await page.locator('.stats-hero').boundingBox();
  const demand = await page.locator('.demand-section').boundingBox();
  expect(demand.y).toBeGreaterThanOrEqual(summary.y + summary.height);
  const refresh = await page.getByRole('button', { name: 'Refresh statistics', exact: true }).boundingBox();
  expect(refresh.width, 'the mobile Refresh control must retain its full-width tap area').toBeGreaterThanOrEqual(summary.width - 1);
});

test('computer demo puts the real receipt task beside its walkthrough and no-show controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await english(page);
  await mutation(page, '/api/demo/session', () => page.getByRole('button', { name: 'Enter demo mode', exact: true }).click());
  await page.goto('/owner/demo');
  await expect(page.getByRole('button', { name: 'Receive Customer Ticket', exact: true })).toBeEnabled();
  await reserveClassicScrollbar(page);
  for (const size of computerSizes) {
    await page.setViewportSize(size);
    await toTheRight(page.locator('.simulator-form'), page.locator('.simulator-timeout'));
    await noOverflow(page);
  }
  await page.getByRole('button', { name: 'Receive Customer Ticket', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open Customer view', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await noOverflow(page);
  await expect(page.getByRole('link', { name: 'Open Customer view', exact: true })).toBeVisible();
});
