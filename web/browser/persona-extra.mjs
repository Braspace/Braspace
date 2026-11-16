// Independent pixel decoding and a real educational flight (no injected simulation outcome).
import assert from 'node:assert/strict';
export async function verifyQr(page) {
 const jsQR=(await import(process.env.QR_DECODER_MODULE||'jsqr')).default;
 const {PNG}=await import(process.env.PNG_MODULE||'pngjs');
 await page.locator('.mp-qr svg').waitFor();
 const image=PNG.sync.read(await page.locator('.mp-qr').screenshot());
 const decoded=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);
 assert.ok(decoded,'QR must decode from its rendered pixels');
 assert.equal(decoded.data,await page.locator('#share-url').innerText(),'decoded QR must equal the classroom link');
 return decoded.data;
}
export async function verifyLandingReplay(page) {
 await page.locator('#bar button').first().waitFor();
 await page.getByRole('button',{name:/^(Free|Livre)$/i}).click();
 const pause=page.locator('button[aria-label*="(P)"]');
 if(/retomar|resume|continuar/i.test(await pause.getAttribute('aria-label')))await pause.click();
 await page.waitForURL(/debrief\.html/,{timeout:90000});
 await page.locator('#actions a[href*="landing.html"]').waitFor();
 assert.equal(await page.locator('.deb-none').count(),0,'a real attempt, not the empty state');
 await page.locator('#actions a[href*="landing.html"]').click();
 await page.waitForURL(/landing\.html/);await page.locator('#bar').waitFor();
}
