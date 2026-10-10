import { test, expect, takeTicket, cancelTicket, english } from './fixtures.mjs';

test('a Ticket link recovers in a fresh browser context without Customer signup or saved storage', async ({ shop: fixture, actor }) => {
  const original = await actor();
  const issued = await takeTicket(original.page, fixture.shop, fixture.service);
  const installed = await actor();
  await installed.page.goto('/resume');
  await english(installed.page);
  await expect(installed.page.getByRole('link', { name: 'Open my Ticket', exact: true })).toHaveCount(0);
  await installed.page.getByLabel('Received Ticket link', { exact: true }).fill(issued.link);
  await installed.page.getByRole('button', { name: 'Open Ticket link', exact: true }).click();
  await expect(installed.page.locator('.ticket-number')).toHaveText(issued.ticket.number);
  await expect(installed.page.getByRole('button', { name: 'Cancel this Ticket', exact: true })).toBeEnabled();
  await expect(installed.page.getByRole('status').filter({ hasText: 'Almost your turn' })).toBeVisible();
  await installed.page.goto('/resume');
  await installed.page.getByRole('link', { name: 'Open my Ticket', exact: true }).click();
  await expect(installed.page.locator('.ticket-number')).toHaveText(issued.ticket.number);
});

test('unsupported notifications do not block taking or cancelling a real Ticket', async ({ shop: fixture, actor }) => {
  const guest = await actor();
  await guest.context.addInitScript(() => { delete window.PushManager; });
  const issued = await takeTicket(guest.page, fixture.shop, fixture.service);
  await expect(guest.page.locator('.push-toggle')).toContainText('does not support notifications');
  await expect(guest.page.getByRole('switch')).toHaveCount(0);
  await expect(guest.page.locator('.ticket-number')).toHaveText(issued.ticket.number);
  await expect(guest.page.getByRole('button', { name: 'Cancel this Ticket', exact: true })).toBeEnabled();
  await cancelTicket(guest.page);
  await expect(guest.page.getByRole('link', { name: 'Take a new Ticket', exact: true })).toBeVisible();
});

test('Safari-tab emulation offers copy-install-paste guidance without pretending Push is enabled', async ({ shop: fixture, actor }) => {
  const guest = await actor({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  await takeTicket(guest.page, fixture.shop, fixture.service);
  await expect(guest.page.locator('.push-steps')).toContainText('Copy your Ticket link');
  await expect(guest.page.locator('.push-steps')).toContainText('paste the link');
  await expect(guest.page.getByRole('switch')).toHaveCount(0);
  await expect(guest.page.getByRole('button', { name: 'Cancel this Ticket', exact: true })).toBeEnabled();
});
