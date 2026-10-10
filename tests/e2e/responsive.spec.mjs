import { test, expect, english, mutation, takeTicket, callNext } from './fixtures.mjs';

const sizes = [
  { width: 320, height: 740 }, { width: 375, height: 812 },
  { width: 767, height: 1024 }, { width: 768, height: 1024 },
  { width: 1023, height: 900 }, { width: 1024, height: 900 },
  { width: 1280, height: 900 }, { width: 844, height: 390 },
];

async function noHorizontalOverflow(page) {
  await expect.poll(async () => (await page.evaluate(() => document.documentElement.scrollWidth)) - page.viewportSize().width).toBeLessThanOrEqual(1);
}

async function visibleControl(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.height).toBeGreaterThanOrEqual(48);
  const unobscured = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(unobscured, 'the visible control must not be covered by fixed navigation').toBeTruthy();
}

test('Owner workspace adapts to phone, tablet, desktop and landscape without obscuring commands', async ({ page, shop: fixture, actor }) => {
  const customer = await actor();
  const ticket = await takeTicket(customer.page, fixture.shop, fixture.service);
  await expect(page.locator('.next-number')).toHaveText(ticket.ticket.number);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await noHorizontalOverflow(page);
    await visibleControl(page, page.getByRole('button', { name: /^Call next ·/ }));
    await visibleControl(page, page.getByRole('link', { name: 'Shop', exact: true }));
    const bounds = await page.locator('.owner-phone').boundingBox();
    if (size.width >= 768) expect(bounds.width, 'larger screens must not remain a narrow phone mockup').toBeGreaterThan(size.width / 2);
    await expect(page.locator('.next-number')).toHaveText(ticket.ticket.number);
  }
  await page.screenshot({ path: test.info().outputPath('owner-landscape.png'), fullPage: true });
});

test('Customer Ticket, Owner forms and public Board reflow at 200 percent text and narrow widths', async ({ page, shop: fixture, actor }) => {
  await page.goto('/owner/shop');
  await page.locator('.service-item').filter({ hasText: fixture.service.name }).locator('.service-row').click();
  const serviceEditor = page.getByRole('dialog', { name: 'Edit Service', exact: true });
  await serviceEditor.getByLabel('Ticket Prefix', { exact: true }).fill('LONGWAIT');
  await mutation(page, `/api/services/${fixture.service.id}`, () => serviceEditor.getByRole('button', { name: 'Save Service', exact: true }).click(), 'PUT');
  await page.goto('/owner/queue');
  await expect(page.locator('.live-label')).toHaveText('Live');
  const customer = await actor();
  const ticket = await takeTicket(customer.page, fixture.shop, fixture.service, { note: 'Responsive private note' });
  const board = await actor();
  await board.page.goto(`/s/${fixture.shop.publicId}`);
  await english(board.page);
  await board.page.goto(`/board/${fixture.shop.publicId}`);
  await expect(board.page.locator('.live-label')).toHaveText('Live');
  for (const target of [page, customer.page, board.page]) {
    await target.setViewportSize({ width: 320, height: 740 });
    await target.emulateMedia({ reducedMotion: 'reduce' });
    await target.evaluate(() => document.documentElement.style.fontSize = '200%');
    await noHorizontalOverflow(target);
  }
  await expect(customer.page.locator('.ticket-number')).toHaveText(ticket.ticket.number);
  const numberLines = locator => locator.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  await expect.poll(() => numberLines(customer.page.locator('.ticket-number')), { message: 'the Ticket identifier must stay on one readable line' }).toBe(1);
  await visibleControl(customer.page, customer.page.getByRole('button', { name: 'Cancel this Ticket', exact: true }));
  await page.getByRole('button', { name: 'Owner account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Owner account', exact: true });
  await noHorizontalOverflow(page);
  await visibleControl(page, dialog.getByRole('button', { name: 'Sign out', exact: true }));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Owner account', exact: true })).toBeFocused();
  await expect(board.page.getByText('Responsive private note', { exact: true })).toHaveCount(0);
  await callNext(page, fixture.service);
  await expect(customer.page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
  await expect(board.page.locator('.board-current-number')).toHaveText(ticket.ticket.number);
  for (const [target, selector] of [[page, '.held-number'], [customer.page, '.ticket-number'], [board.page, '.board-current-number']]) {
    await noHorizontalOverflow(target);
    await expect.poll(() => numberLines(target.locator(selector)), { message: 'a Called number must fit without splitting its identity' }).toBe(1);
  }
  await customer.page.screenshot({ path: test.info().outputPath('customer-large-text.png'), fullPage: true });
});

test('Display board columns and QR remain readable on both sides of their breakpoint', async ({ page }) => {
  await page.goto('/');
  await english(page);
  const demo = await mutation(page, '/api/demo/session', () => page.getByRole('button', { name: 'Enter demo mode', exact: true }).click());
  await page.goto(`/board/${demo.shop.publicId}`);
  for (const size of [
    { width: 320, height: 740 }, { width: 375, height: 812 },
    { width: 899, height: 600 }, { width: 900, height: 600 }, { width: 901, height: 600 },
    { width: 1024, height: 768 }, { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.locator('.board-grid')).toBeVisible();
    await noHorizontalOverflow(page);
    const main = await page.locator('.board-main').boundingBox();
    const side = await page.locator('.board-side').boundingBox();
    const intersectionWidth = Math.min(main.x + main.width, side.x + side.width) - Math.max(main.x, side.x);
    const intersectionHeight = Math.min(main.y + main.height, side.y + side.height) - Math.max(main.y, side.y);
    expect(intersectionWidth <= 1 || intersectionHeight <= 1, 'board columns must not overlap').toBeTruthy();
    await expect(page.locator('.shop-qr canvas')).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath('board-desktop.png'), fullPage: true });
});
