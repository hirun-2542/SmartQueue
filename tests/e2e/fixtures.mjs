import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { emailLink, password } from '../client.mjs';

export { expect, emailLink, password };

export async function english(page) {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

export async function mutation(page, pathname, action, method = 'POST') {
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() === method, { timeout: 30000 }),
    action(),
  ]);
  expect(response.ok(), `${method} ${pathname} must commit`).toBeTruthy();
  return response.json();
}

export async function registerOwner(page) {
  const account = { email: `e2e-${randomUUID()}@example.test`, password };
  await page.goto('/account/register');
  await english(page);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: false }).fill(account.password);
  await mutation(page, '/api/account/register', () => page.getByRole('button', { name: 'Create account', exact: true }).click());
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  return account;
}

export async function verifyOwner(page, account) {
  const link = await emailLink(account.email, 'verify');
  await page.goto(link.pathname + link.search);
  await mutation(page, '/api/account/verify', () => page.getByRole('button', { name: 'Verify email', exact: true }).click());
  await expect(page.getByRole('heading', { name: 'You are all set' })).toBeVisible();
}

export async function signIn(page, account) {
  await page.goto('/');
  await english(page);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await mutation(page, '/api/account/login', () => page.getByRole('button', { name: 'Sign in', exact: true }).click());
  await expect(page.getByRole('button', { name: 'Owner account', exact: true })).toBeVisible();
}

export async function createOwner(page) {
  const account = await registerOwner(page);
  await verifyOwner(page, account);
  await signIn(page, account);
  return account;
}

export async function createShop(page, name = `E2E Shop ${randomUUID().slice(0, 8)}`) {
  await page.goto('/owner/shop');
  await page.getByRole('button', { name: 'Create Shop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Shop', exact: true });
  await dialog.getByLabel('Shop name', { exact: true }).fill(name);
  const shop = await mutation(page, '/api/shops', () => dialog.getByRole('button', { name: 'Save Shop', exact: true }).click());
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Shop', exact: true })).toHaveValue(shop.id);
  return shop;
}

export async function addService(page, shop, { name = 'Repair', prefix = 'R', timeoutMinutes = 5, threshold = 2, open = true } = {}) {
  await page.goto('/owner/shop');
  await page.getByRole('button', { name: 'Add Service', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Service', exact: true });
  await dialog.getByLabel('Service name', { exact: true }).fill(name);
  await dialog.getByLabel('Ticket Prefix', { exact: true }).fill(prefix);
  await dialog.getByLabel('Minutes to arrive after Call', { exact: true }).fill(String(timeoutMinutes));
  await dialog.getByLabel('Notify when this many Tickets remain', { exact: true }).fill(String(threshold));
  const service = await mutation(page, `/api/shops/${shop.id}/services`, () => dialog.getByRole('button', { name: 'Save Service', exact: true }).click());
  await expect(dialog).toBeHidden();
  if (open) {
    const row = page.locator('.service-item').filter({ hasText: name });
    await mutation(page, `/api/queues/${service.queue.id}/open`, () => row.getByRole('button', { name: 'Open Queue', exact: true }).click());
    await expect(row.locator('.queue-status')).toHaveText('Open for Tickets');
  }
  return service;
}

export async function takeTicket(page, shop, service, { note = '', extra = false } = {}) {
  await page.goto(`/s/${shop.publicId}`);
  await english(page);
  await page.locator('.public-service').filter({ hasText: service.name }).getByRole('button', { name: 'Take Ticket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Take Ticket · ${service.name}`, exact: true });
  await dialog.getByLabel('Nickname or note (optional)', { exact: false }).fill(note);
  if (extra) await dialog.getByRole('checkbox').check();
  const result = await mutation(page, `/api/queues/${service.queue.id}/tickets`, () => dialog.getByRole('button', { name: extra ? 'Confirm extra Ticket' : 'Take Ticket', exact: true }).click());
  await expect(page).toHaveURL(new RegExp(`${result.link}$`));
  await expect(page.locator('.ticket-number')).toHaveText(result.ticket.number);
  await expect(page.locator('.live-label')).toHaveText('Live');
  return result;
}

export async function walkIn(page, service, note = '') {
  await page.getByRole('button', { name: 'Add Walk-in Ticket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Walk-in Ticket', exact: true });
  await dialog.getByRole('radio', { name: new RegExp(service.name) }).check();
  await dialog.getByLabel('Nickname or note (optional)', { exact: true }).fill(note);
  const result = await mutation(page, `/api/queues/${service.queue.id}/walkin`, () => dialog.getByRole('button', { name: 'Create Ticket', exact: true }).click());
  const done = page.getByRole('dialog', { name: 'Walk-in Ticket created', exact: true });
  await expect(done.locator('.walkin-number')).toHaveText(result.ticket.number);
  await done.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(done).toBeHidden();
  return result.ticket;
}

export async function callNext(page, service) {
  return mutation(page, `/api/queues/${service.queue.id}/call`, () => page.getByRole('button', { name: /^Call next ·/ }).click());
}

export async function cancelTicket(page) {
  const path = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Cancel this Ticket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this Ticket', exact: true });
  const result = await mutation(page, `/api${path}/cancel`, () => dialog.getByRole('button', { name: 'Yes, cancel my Ticket', exact: true }).click());
  await expect(page.getByRole('heading', { name: 'Cancelled', exact: true })).toBeVisible();
  return result;
}

export const test = base.extend({
  runtimeErrors: [async ({ context }, use) => {
    const errors = [];
    const watch = page => page.on('pageerror', error => errors.push(error.message));
    context.on('page', watch);
    for (const page of context.pages()) watch(page);
    await use(errors);
    expect(errors, 'uncaught application errors').toEqual([]);
  }, { auto: true }],
  actor: async ({ browser, contextOptions, runtimeErrors }, use) => {
    const contexts = [];
    await use(async (options = {}) => {
      const context = await browser.newContext({ ...contextOptions, ...options });
      contexts.push(context);
      context.on('page', page => page.on('pageerror', error => runtimeErrors.push(error.message)));
      const page = await context.newPage();
      return { context, page };
    });
    await Promise.all(contexts.map(context => context.close()));
  },
  shop: async ({ page }, use) => {
    const account = await createOwner(page);
    const shop = await createShop(page);
    const service = await addService(page, shop);
    await page.goto('/owner/queue');
    await expect(page.locator('.live-label')).toHaveText('Live');
    await use({ shop, service, account });
  },
});
