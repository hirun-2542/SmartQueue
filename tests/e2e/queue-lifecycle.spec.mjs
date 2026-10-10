import { test, expect, english, mutation, takeTicket, walkIn, callNext, cancelTicket } from './fixtures.mjs';

// The Owner console exposes the single Shop-wide hold through `.held-number`; the Customer link and the
// public Display board are the consumer-facing views these scenarios assert against. Only the observed
// responses of the Owner's own clicks are captured, and the read-only console snapshot supplements the UI.
async function startService(page, ticket) {
  await expect(page.locator('.held-number')).toHaveText(ticket.number);
  return mutation(page, `/api/tickets/${ticket.id}/start`, () => page.getByRole('button', { name: 'Start service', exact: true }).click());
}

async function completeService(page, ticket) {
  return mutation(page, `/api/tickets/${ticket.id}/complete`, () => page.getByRole('button', { name: 'Complete', exact: true }).click());
}

// The Display board carries no language switch, so a fresh visitor context picks English through the
// Customer shop page (which has one) before opening the board.
async function openBoard(page, publicId) {
  await page.goto('/s/' + publicId);
  await english(page);
  await page.goto('/board/' + publicId);
}

test('a private Customer note never leaks while the Owner Calls, Starts and Completes and the Customer and Board stay in step', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;
  const note = `Alice-private-${Math.random().toString(36).slice(2, 8)}`;

  const customer = await actor();
  const joined = await takeTicket(customer.page, shop, service, { note });

  const board = await actor();
  await openBoard(board.page, shop.publicId);
  const storefront = await actor();
  await storefront.page.goto('/s/' + shop.publicId);
  await english(storefront.page);

  // Waiting: the Board lists the number, and no public view shows the note the Owner will see.
  await expect(board.page.locator('.board-waiting-list li')).toHaveText([joined.ticket.number]);
  await expect(board.page.locator('.board-current-number')).toHaveCount(0);
  for (const view of [customer.page, board.page, storefront.page]) await expect(view.getByText(note)).toHaveCount(0);

  const called = await callNext(page, service);
  expect(called.number).toBe(joined.ticket.number);
  expect(called.status).toBe('Called');
  await expect(page.locator('.private-note')).toHaveText(note);

  // Call: the Customer sees their turn and the Board shows the same number as the current Call.
  await expect(customer.page.getByRole('heading', { name: 'Your turn' })).toBeVisible();
  await expect(customer.page.locator('.ticket-number')).toHaveText(called.number);
  await expect(board.page.locator('.board-current-number')).toHaveText(called.number);
  await expect(customer.page.getByText(note)).toHaveCount(0);
  await expect(board.page.getByText(note)).toHaveCount(0);

  // Start: the Board stops showing a current Call and moves the Ticket into its recent list.
  await startService(page, called);
  await expect(customer.page.getByRole('heading', { name: 'In service' })).toBeVisible();
  await expect(board.page.locator('.board-current-number')).toHaveCount(0);
  const boardRow = board.page.locator('.board-recent-item').filter({ hasText: called.number });
  await expect(boardRow.locator('.board-status')).toHaveText('In service');

  // Complete: both consumer surfaces agree on the final outcome and the note still never appears.
  await completeService(page, called);
  await expect(customer.page.getByRole('heading', { name: 'Completed' })).toBeVisible();
  await expect(boardRow.locator('.board-status')).toHaveText('Done');
  await expect(page.locator('.held-number')).toHaveCount(0);
  for (const view of [customer.page, board.page, storefront.page]) await expect(view.getByText(note)).toHaveCount(0);
});

test('mixed Customer and Walk-in Tickets keep one FIFO order and Cancelling a Called Ticket frees the Shop hold and the device quota', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;

  const first = await actor();
  const t1 = await takeTicket(first.page, shop, service, { note: 'First customer' });
  const walkInTicket = await walkIn(page, service, 'Walk-in Uncle');
  const second = await actor();
  const t3 = await takeTicket(second.page, shop, service, { note: 'Second customer' });

  // One line: the Customer who arrived first, then the Walk-in, then the later Customer.
  await expect(page.locator('.waiting-list .waiting-row .number')).toHaveText([t1.ticket.number, walkInTicket.number, t3.ticket.number]);

  const called1 = await callNext(page, service);
  expect(called1.number).toBe(t1.ticket.number);
  expect(called1.origin).toBe('Customer');
  await expect(page.locator('.private-note')).toHaveText('First customer');
  await startService(page, called1);
  await completeService(page, called1);

  const called2 = await callNext(page, service);
  expect(called2.number).toBe(walkInTicket.number);
  expect(called2.origin).toBe('WalkIn');
  await expect(page.locator('.private-note')).toHaveText('Walk-in Uncle');
  await startService(page, called2);
  await completeService(page, called2);

  const called3 = await callNext(page, service);
  expect(called3.number).toBe(t3.ticket.number);
  await expect(page.locator('.held-number')).toHaveText(called3.number);

  // Cancelling the Called Ticket while the Shop is holding it releases the hold immediately.
  await expect(second.page.getByRole('heading', { name: 'Your turn' })).toBeVisible();
  await cancelTicket(second.page);
  await expect(second.page.getByRole('heading', { name: 'Cancelled' })).toBeVisible();
  await expect(page.locator('.held-number')).toHaveCount(0);
  await expect(page.locator('.next-panel')).toContainText('No Waiting Tickets');

  // The device that cancelled holds no active Ticket, so it can take a new one without any extra step.
  const again = await takeTicket(second.page, shop, service);
  expect(again.ticket.number).toBe('R004');
});

test('an extra Ticket in the same Queue needs confirmation and one device may hold at most three active Tickets', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;
  const me = await actor();

  const one = await takeTicket(me.page, shop, service);
  const two = await takeTicket(me.page, shop, service, { extra: true });
  const three = await takeTicket(me.page, shop, service, { extra: true });

  await expect(page.getByRole('heading', { name: `Waiting · 3` })).toBeVisible();
  await expect(page.locator('.waiting-list .waiting-row .number')).toHaveText([one.ticket.number, two.ticket.number, three.ticket.number]);

  // A fourth active Ticket is refused by the real quota rule, not by a mock: the dialog stays put.
  await me.page.goto('/s/' + shop.publicId);
  await english(me.page);
  await me.page.locator('.public-service').filter({ hasText: service.name }).getByRole('button', { name: 'Take Ticket', exact: true }).click();
  const sheet = me.page.getByRole('dialog', { name: `Take Ticket · ${service.name}`, exact: true });
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: 'Confirm extra Ticket', exact: true }).click();
  await expect(sheet.getByRole('alert')).toBeVisible();
  await expect(me.page).toHaveURL(new RegExp(`/s/${shop.publicId}$`));

  // Cancelling one Ticket frees its quota slot, and the device may take another again.
  await me.page.goto(three.link);
  await cancelTicket(me.page);
  await expect(me.page.getByRole('heading', { name: 'Cancelled' })).toBeVisible();
  const four = await takeTicket(me.page, shop, service, { extra: true });
  expect(four.ticket.number).toBe('R004');
});

test('Stop accepting drains the remaining Tickets and reopening restarts Ticket numbers at 1', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;

  const first = await actor();
  const t1 = await takeTicket(first.page, shop, service);
  const second = await actor();
  const t2 = await takeTicket(second.page, shop, service);
  await expect(page.locator('.waiting-list .waiting-row .number')).toHaveText([t1.ticket.number, t2.ticket.number]);

  await mutation(page, `/api/queues/${service.queue.id}/stop`, () => page.getByRole('button', { name: 'Stop accepting', exact: true }).click());
  await expect(page.locator('.close-status')).toHaveText('Closing · still calling the remaining Tickets');

  // The Customer join page reflects the closed door: no button, and the Queue says so.
  await first.page.goto('/s/' + shop.publicId);
  await english(first.page);
  const firstService = first.page.locator('.public-service').filter({ hasText: service.name });
  await expect(firstService.locator('.queue-status')).toHaveText('Closing · no new Tickets');
  await expect(firstService.getByRole('button', { name: 'Take Ticket', exact: true })).toHaveCount(0);

  const called1 = await callNext(page, service);
  expect(called1.number).toBe(t1.ticket.number);
  await startService(page, called1);
  await completeService(page, called1);
  await expect(page.locator('.close-status')).toHaveText('Closing · still calling the remaining Tickets');

  const called2 = await callNext(page, service);
  expect(called2.number).toBe(t2.ticket.number);
  await startService(page, called2);
  await completeService(page, called2);
  await expect(page.locator('.close-status')).toHaveText('Business day closed');
  await expect(page.locator('.waiting-list .waiting-row')).toHaveCount(0);

  // Reopening starts a new Business day, so the Ticket numbers restart at 1.
  await page.goto('/owner/shop');
  const row = page.locator('.service-item').filter({ hasText: service.name });
  await mutation(page, `/api/queues/${service.queue.id}/open`, () => row.getByRole('button', { name: 'Open Queue', exact: true }).click());
  await expect(row.locator('.queue-status')).toHaveText('Open for Tickets');

  const reopened = await takeTicket(first.page, shop, service);
  expect(reopened.ticket.number).toBe('R001');
});

test('Close now (Drop) ends only the Waiting Tickets while the held Ticket finishes', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;

  const first = await actor();
  const t1 = await takeTicket(first.page, shop, service);
  const second = await actor();
  const t2 = await takeTicket(second.page, shop, service);
  const third = await actor();
  const t3 = await takeTicket(third.page, shop, service);

  const held = await callNext(page, service);
  expect(held.number).toBe(t1.ticket.number);
  await expect(first.page.getByRole('heading', { name: 'Your turn' })).toBeVisible();

  // The confirmation spells out exactly which Tickets lose their place before anything is Dropped.
  await page.getByRole('button', { name: 'Close now', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: `Close the ${service.name} Queue now?`, exact: true });
  await expect(sheet).toContainText('2 Waiting Ticket(s) become');
  await expect(sheet).toContainText('continues to the end');
  await mutation(page, `/api/queues/${service.queue.id}/drop`, () => sheet.getByRole('button', { name: 'Close the Queue now', exact: true }).click());

  // The Waiting customers are Dropped; the Customer already being called is untouched.
  await expect(second.page.getByRole('heading', { name: 'Shop closed this Queue' })).toBeVisible();
  await expect(third.page.getByRole('heading', { name: 'Shop closed this Queue' })).toBeVisible();
  await expect(second.page.locator('.ticket-number')).toHaveText(t2.ticket.number);
  await expect(page.locator('.waiting-list .waiting-row')).toHaveCount(0);
  await expect(page.locator('.close-status')).toHaveText('Closing · still calling the remaining Tickets');
  await expect(first.page.getByRole('heading', { name: 'Your turn' })).toBeVisible();

  // The held Ticket is served to the end, and only then does the Business day close.
  await startService(page, held);
  await completeService(page, held);
  await expect(first.page.getByRole('heading', { name: 'Completed' })).toBeVisible();
  await expect(page.locator('.close-status')).toHaveText('Business day closed');
});

test('hiding an active Service drains it without losing the held Ticket or the history of its Tickets', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;

  const first = await actor();
  const t1 = await takeTicket(first.page, shop, service);
  const second = await actor();
  const t2 = await takeTicket(second.page, shop, service);

  const board = await actor();
  await openBoard(board.page, shop.publicId);
  const storefront = await actor();
  await storefront.page.goto('/s/' + shop.publicId);
  await english(storefront.page);
  await expect(storefront.page.locator('.public-service').filter({ hasText: service.name })).toHaveCount(1);

  const held1 = await callNext(page, service);
  expect(held1.number).toBe(t1.ticket.number);

  await page.goto('/owner/shop');
  const row = page.locator('.service-item').filter({ hasText: service.name });
  await row.locator('.service-row').click();
  const editor = page.getByRole('dialog', { name: 'Edit Service', exact: true });
  await editor.locator('.archive-trigger').click();
  const confirm = page.getByRole('dialog', { name: `Hide the ${service.name} Service?`, exact: true });
  await expect(confirm).toContainText('stay callable and are served to the end');
  await mutation(page, `/api/services/${service.id}/archive`, () => confirm.getByRole('button', { name: 'Hide this Service', exact: true }).click());

  // The Service is gone from the Shop page and the Customer join page, but its Queue keeps draining.
  await expect(page.locator('.service-item').filter({ hasText: service.name })).toHaveCount(0);
  await expect(storefront.page.locator('.public-service').filter({ hasText: service.name })).toHaveCount(0);

  await page.goto('/owner/queue');
  await startService(page, held1);
  await completeService(page, held1);
  await expect(first.page.getByRole('heading', { name: 'Completed' })).toBeVisible();

  const held2 = await callNext(page, service);
  expect(held2.number).toBe(t2.ticket.number);
  await startService(page, held2);
  await completeService(page, held2);
  await expect(second.page.getByRole('heading', { name: 'Completed' })).toBeVisible();

  // Both old Tickets still have their numbers, links and final status on the public Board.
  await expect(board.page.locator('.board-recent-item').filter({ hasText: t1.ticket.number }).locator('.board-status')).toHaveText('Done');
  await expect(board.page.locator('.board-recent-item').filter({ hasText: t2.ticket.number }).locator('.board-status')).toHaveText('Done');
});

test('the real worker auto-Skips a Called Ticket after the Call timeout set through the Service editor', async ({ page, shop: seeded, actor }) => {
  const { shop, service } = seeded;

  // A short but real timeout (0.1 min = 6 s) is configured through the ordinary Service editor.
  await page.goto('/owner/shop');
  const row = page.locator('.service-item').filter({ hasText: service.name });
  await row.locator('.service-row').click();
  const editor = page.getByRole('dialog', { name: 'Edit Service', exact: true });
  await editor.getByLabel('Minutes to arrive after Call', { exact: true }).fill('0.1');
  await mutation(page, `/api/services/${service.id}`, () => editor.getByRole('button', { name: 'Save Service', exact: true }).click(), 'PUT');
  await expect(editor).toBeHidden();

  const me = await actor();
  const joined = await takeTicket(me.page, shop, service);

  const board = await actor();
  await openBoard(board.page, shop.publicId);

  await page.goto('/owner/queue');
  const held = await callNext(page, service);
  expect(held.number).toBe(joined.ticket.number);
  await expect(me.page.getByRole('heading', { name: 'Your turn' })).toBeVisible();

  // No clock is faked: the real background worker ends the Ticket at its deadline, and the Customer,
  // the Owner console and the Board all follow without anyone pressing Skip.
  await expect(me.page.getByRole('heading', { name: 'Skipped' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.held-number')).toHaveCount(0, { timeout: 20000 });
  await expect(board.page.locator('.board-recent-item').filter({ hasText: held.number }).locator('.board-status')).toHaveText('Skipped', { timeout: 20000 });

  // The released Shop accepts a fresh Ticket again.
  const again = await takeTicket(me.page, shop, service);
  expect(again.ticket.number).toBe('R002');
});
