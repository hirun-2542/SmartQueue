import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { test, expect, english, mutation, callNext } from './fixtures.mjs';

const require = createRequire(import.meta.url);

test('the downloaded Shop QR decodes to the real join page and leads an anonymous Customer to a live Call', async ({ page, baseURL, shop: fixture, actor }, testInfo) => {
  await page.goto('/owner/shop');
  await expect(page.locator('.shop-qr canvas')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PNG', exact: true }).click(),
  ]);
  const imagePath = testInfo.outputPath('shop-qr.png');
  await download.saveAs(imagePath);
  await testInfo.attach('Shop join QR', { path: imagePath, contentType: 'image/png' });
  // Independent reader, not the production qrcode encoder or an expected-pattern echo.
  await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
  const imageURL = 'data:image/png;base64,' + (await readFile(imagePath)).toString('base64');
  const joinURL = await page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(pixels.data, canvas.width, canvas.height)?.data;
  }, imageURL);
  expect(joinURL).toBe(new URL(`/s/${fixture.shop.publicId}`, baseURL).href);

  const customer = await actor();
  await customer.page.goto(joinURL);
  await english(customer.page);
  await customer.page.getByRole('button', { name: 'Take Ticket', exact: true }).click();
  const dialog = customer.page.getByRole('dialog', { name: `Take Ticket · ${fixture.service.name}`, exact: true });
  const issued = await mutation(customer.page, `/api/queues/${fixture.service.queue.id}/tickets`, () => dialog.getByRole('button', { name: 'Take Ticket', exact: true }).click());
  await expect(customer.page.locator('.ticket-number')).toHaveText(issued.ticket.number);
  await page.goto('/owner/queue');
  const called = await callNext(page, fixture.service);
  expect(called.id).toBe(issued.ticket.id);
  await expect(customer.page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
});
