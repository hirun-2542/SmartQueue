import { randomUUID } from 'node:crypto';
import {
  test,
  expect,
  english,
  mutation,
  emailLink,
  registerOwner,
  verifyOwner,
  signIn,
  createShop,
  walkIn,
  callNext,
} from './fixtures.mjs';

test('an Owner registers, verifies from the delivered email, resets a lost password and recovers access', async ({ page }) => {
  const account = await registerOwner(page);
  const newPassword = 'QueueReset456!';

  // An unverified Owner is refused at the door with the reason, and never reaches the Owner shell.
  await page.goto('/');
  await english(page);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner account', exact: true })).toHaveCount(0);

  // Following the real verification link delivered to Mailpit unlocks the account.
  await verifyOwner(page, account);
  await signIn(page, account);

  // Signing out through the Owner account sheet returns to the sign-in screen.
  await page.getByRole('button', { name: 'Owner account', exact: true }).click();
  const accountSheet = page.getByRole('dialog', { name: 'Owner account', exact: true });
  await expect(accountSheet).toContainText(account.email);
  await accountSheet.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Let customers take their own ticket' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // Requesting a reset for the verified account delivers a link that sets a new password.
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/forgot$/);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await mutation(page, '/api/account/forgot-password', () => page.getByRole('button', { name: 'Send reset link', exact: true }).click());
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  const resetLink = await emailLink(account.email, 'reset');
  await page.goto(resetLink.pathname + resetLink.search);
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await page.getByLabel('Password', { exact: false }).fill(newPassword);
  await mutation(page, '/api/account/reset-password', () => page.getByRole('button', { name: 'Save new password', exact: true }).click());
  await expect(page.getByRole('heading', { name: 'You are all set' })).toBeVisible();

  // The old password is refused, the new one signs in.
  await page.goto('/');
  await english(page);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner account', exact: true })).toHaveCount(0);

  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await mutation(page, '/api/account/login', () => page.getByRole('button', { name: 'Sign in', exact: true }).click());
  await expect(page.getByRole('button', { name: 'Owner account', exact: true })).toBeVisible();
});

test('two Shops keep independent Services while Shop and Service edits persist across reloads', async ({ page, shop: fixture }) => {
  const { shop: shopA, service: serviceA } = fixture;
  const renamedShop = `${shopA.name} Renovated`;
  const secondName = `E2E Shop Two ${randomUUID().slice(0, 8)}`;

  const shopB = await createShop(page, secondName);
  const selector = page.getByRole('combobox', { name: 'Shop', exact: true });
  await expect(page.getByRole('option', { name: secondName, exact: true })).toHaveCount(1);

  // The selected Shop survives a reload instead of snapping back to the first one.
  await selector.selectOption(shopA.id);
  await expect(selector).toHaveValue(shopA.id);
  await page.reload();
  await expect(selector).toHaveValue(shopA.id);

  // Renaming the first Shop persists and stays the selected Shop.
  await page.getByRole('button', { name: 'Edit Shop', exact: true }).click();
  const shopDialog = page.getByRole('dialog', { name: 'Edit Shop', exact: true });
  await shopDialog.getByLabel('Shop name', { exact: true }).fill(renamedShop);
  await mutation(page, `/api/shops/${shopA.id}`, () => shopDialog.getByRole('button', { name: 'Save Shop', exact: true }).click(), 'PUT');
  await expect(shopDialog).toBeHidden();
  await page.reload();
  await expect(selector).toHaveValue(shopA.id);
  await expect(page.locator('.shop-summary strong')).toHaveText(renamedShop);
  await expect(page.getByRole('option', { name: renamedShop, exact: true })).toHaveCount(1);

  // The Service edit persists as well, keeping its Prefix.
  await page.locator('.service-item').filter({ hasText: serviceA.name }).locator('.service-row').click();
  const serviceDialog = page.getByRole('dialog', { name: 'Edit Service', exact: true });
  await serviceDialog.getByLabel('Service name', { exact: true }).fill('Repair Deluxe');
  await mutation(page, `/api/services/${serviceA.id}`, () => serviceDialog.getByRole('button', { name: 'Save Service', exact: true }).click(), 'PUT');
  await expect(serviceDialog).toBeHidden();
  await page.reload();
  const renamedRow = page.locator('.service-item').filter({ hasText: 'Repair Deluxe' });
  await expect(renamedRow).toHaveCount(1);
  await expect(renamedRow.locator('.prefix-stub')).toHaveText(serviceA.prefix);

  // The second Shop is empty and does not inherit the first Shop's Services.
  await selector.selectOption(shopB.id);
  await expect(selector).toHaveValue(shopB.id);
  await expect(page.locator('.service-item')).toHaveCount(0);

  // The same Prefix is accepted here because Prefixes are unique per Shop.
  await page.getByRole('button', { name: 'Add Service', exact: true }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add Service', exact: true });
  await addDialog.getByLabel('Service name', { exact: true }).fill('Wash');
  await addDialog.getByLabel('Ticket Prefix', { exact: true }).fill(serviceA.prefix);
  const wash = await mutation(page, `/api/shops/${shopB.id}/services`, () => addDialog.getByRole('button', { name: 'Save Service', exact: true }).click());
  await expect(addDialog).toBeHidden();
  const washRow = page.locator('.service-item').filter({ hasText: 'Wash' });
  await expect(washRow).toHaveCount(1);
  await expect(washRow.locator('.prefix-stub')).toHaveText(serviceA.prefix);

  // A duplicate active Prefix inside this Shop is refused visibly and changes nothing.
  await page.getByRole('button', { name: 'Add Service', exact: true }).click();
  const duplicateDialog = page.getByRole('dialog', { name: 'Add Service', exact: true });
  await duplicateDialog.getByLabel('Service name', { exact: true }).fill('Dry');
  await duplicateDialog.getByLabel('Ticket Prefix', { exact: true }).fill(serviceA.prefix);
  await duplicateDialog.getByRole('button', { name: 'Save Service', exact: true }).click();
  await expect(duplicateDialog.getByRole('alert')).toBeVisible();
  await expect(duplicateDialog).toBeVisible();
  await expect(page.locator('.service-item')).toHaveCount(1);
  await expect(washRow.locator('.prefix-stub')).toHaveText(serviceA.prefix);
  await expect(page.locator('.service-item').filter({ hasText: 'Dry' })).toHaveCount(0);

  // Correcting the Prefix creates the second Service.
  await duplicateDialog.getByLabel('Ticket Prefix', { exact: true }).fill('D');
  const dry = await mutation(page, `/api/shops/${shopB.id}/services`, () => duplicateDialog.getByRole('button', { name: 'Save Service', exact: true }).click());
  await expect(duplicateDialog).toBeHidden();
  const dryRow = page.locator('.service-item').filter({ hasText: 'Dry' });
  await expect(dryRow).toHaveCount(1);
  await expect(dryRow.locator('.prefix-stub')).toHaveText('D');
  expect(dry.id).not.toBe(wash.id);
});

test('Escape returns focus from a real Open Service edit and the Owner account sheet while serving a live Ticket', async ({ page, shop: fixture }) => {
  const { service, account } = fixture;
  const ticket = await walkIn(page, service, 'Focus note');
  await expect(page.locator('.waiting-list')).toContainText(ticket.number);

  // Language choice is part of the workflow: it persists across a reload and work continues after switching back.
  await page.getByRole('button', { name: 'TH', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await english(page);
  await expect(page.locator('.waiting-list')).toContainText(ticket.number);

  // A real state change happens against the live server before the keyboard checks.
  await callNext(page, service);
  await expect(page.locator('.now-panel.called .held-number')).toHaveText(ticket.number);
  await expect(page.locator('.now-panel.called header strong')).toHaveText('Calling');

  // Escape on a real Service edit closes the sheet and hands focus back to the row that opened it.
  await page.goto('/owner/shop');
  const row = page.locator('.service-item').filter({ hasText: service.name }).locator('.service-row');
  await row.focus();
  await page.keyboard.press('Enter');
  const editDialog = page.getByRole('dialog', { name: 'Edit Service', exact: true });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel('Ticket Prefix', { exact: true })).toHaveValue(service.prefix);
  await page.keyboard.press('Escape');
  await expect(editDialog).toBeHidden();
  await expect(row).toBeFocused();

  // Escape on the Owner account sheet behaves the same without disturbing the called Ticket.
  await page.goto('/owner/queue');
  await expect(page.locator('.now-panel.called .held-number')).toHaveText(ticket.number);
  const accountButton = page.getByRole('button', { name: 'Owner account', exact: true });
  await accountButton.focus();
  await page.keyboard.press('Enter');
  const accountSheet = page.getByRole('dialog', { name: 'Owner account', exact: true });
  await expect(accountSheet).toContainText(account.email);
  await expect(accountSheet.getByText('Email verified')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(accountSheet).toBeHidden();
  await expect(accountButton).toBeFocused();
  await expect(page.locator('.now-panel.called .held-number')).toHaveText(ticket.number);
});
