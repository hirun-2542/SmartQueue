import { test, expect, english } from './fixtures.mjs';

test('an invalid bearer link shows no private Ticket details and offers a clear recovery', async ({ page }) => {
  await page.goto('/t/' + 'x'.repeat(43));
  await english(page);
  await expect(page.getByRole('heading', { name: 'Cannot open this Ticket' })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.ticket-number')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel this Ticket' })).toHaveCount(0);
});

test('a fresh installed-app launch rejects foreign links without navigating off site', async ({ page }) => {
  await page.goto('/resume');
  await english(page);
  await expect(page.getByRole('link', { name: 'Open my Ticket', exact: true })).toHaveCount(0);
  await page.getByRole('textbox').fill('https://example.invalid/t/' + 'x'.repeat(43));
  await page.getByRole('button', { name: 'Open Ticket link', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/resume$/);
});
