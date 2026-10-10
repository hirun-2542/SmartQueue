import { test, expect, takeTicket, callNext, mutation } from './fixtures.mjs';

test('an older foreground resync cannot enable commands before the post-online resync completes', async ({ page, context, baseURL, shop: fixture, actor }) => {
  const customer = await actor();
  const issued = await takeTicket(customer.page, fixture.shop, fixture.service);
  const peer = await actor({ storageState: await context.storageState() });
  await peer.page.goto('/owner/queue');
  await expect(peer.page.locator('.live-label')).toHaveText('Live');
  const cdp = await context.newCDPSession(page);
  const paused = [];
  cdp.on('Fetch.requestPaused', request => paused.push(request));
  // Pause delivery of genuine server responses; no status/body/header is replaced or mocked.
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `${baseURL}/api/shops/${fixture.shop.id}/console*`, requestStage: 'Response' }] });
  try {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => paused.length).toBe(1);
    expect(paused[0].responseStatusCode).toBe(200);
    await context.setOffline(true);
    await expect(page.locator('.live-label')).not.toHaveText('Live');
    const called = await callNext(peer.page, fixture.service);
    await mutation(peer.page, `/api/tickets/${called.id}/start`, () => peer.page.getByRole('button', { name: 'Start service', exact: true }).click());
    await context.setOffline(false);
    await expect.poll(() => paused.length).toBe(2);
    expect(paused[1].responseStatusCode).toBe(200);
    const oldRequest = paused[0].requestId;
    const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/shops/${fixture.shop.id}/console`);
    await cdp.send('Fetch.continueResponse', { requestId: oldRequest });
    await (await oldResponse).finished();
    // The old callback has now had the chance to finish, while the newest actual response is held.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const readyTooEarly = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.owner-actionbar button')];
      return document.querySelector('.live-label')?.textContent === 'Live' || buttons.some(button => !button.disabled);
    });
    expect(readyTooEarly, 'only the latest authoritative resync may reopen Owner commands').toBe(false);
    await cdp.send('Fetch.continueResponse', { requestId: paused[1].requestId });
    await expect.poll(() => page.evaluate(() => [document.querySelector('.live-label')?.textContent, document.querySelector('.held-number')?.textContent])).toEqual(['Live', issued.ticket.number]);
    await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeEnabled();
  } finally {
    await cdp.send('Fetch.disable');
    await cdp.detach();
  }
});
