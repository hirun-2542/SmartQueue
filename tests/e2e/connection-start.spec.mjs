import { test, expect, takeTicket, callNext, english } from './fixtures.mjs';

test('foreground recovery shares a pending connection start and still subscribes to live Ticket changes', async ({ baseURL, shop: fixture, actor, page }) => {
  const customer = await actor();
  const issued = await takeTicket(customer.page, fixture.shop, fixture.service);
  const visitor = await actor();
  await visitor.page.goto('/resume');
  await english(visitor.page);
  const cdp = await visitor.context.newCDPSession(visitor.page);
  const paused = [];
  cdp.on('Fetch.requestPaused', request => paused.push(request));
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `${baseURL}/live/negotiate*`, requestStage: 'Response' }] });
  try {
    await visitor.page.goto(issued.link);
    await expect(visitor.page.locator('.ticket-number')).toHaveText(issued.ticket.number);
    await expect.poll(() => paused.length).toBe(1);
    expect(paused[0].responseStatusCode).toBe(200);
    // Real foreground event while the genuine negotiate reply has not yet been delivered.
    await visitor.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await cdp.send('Fetch.continueResponse', { requestId: paused[0].requestId });
    await expect(visitor.page.locator('.live-label')).toHaveText('Live');
    const called = await callNext(page, fixture.service);
    expect(called.id).toBe(issued.ticket.id);
    await expect(visitor.page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
  } finally {
    await cdp.send('Fetch.disable');
    await cdp.detach();
  }
});
