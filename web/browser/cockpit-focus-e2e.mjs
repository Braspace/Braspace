// Run against an authenticated local deployment of the candidate, not production.
// npm --prefix web install --no-save playwright@1.56.1
// BRASPACE_COCKPIT_QA_URL=http://127.0.0.1:5377/moonproof/ node web/browser/cockpit-focus-e2e.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = new URL(process.env.BRASPACE_COCKPIT_QA_URL || 'http://127.0.0.1:5377/moonproof/');
base.searchParams.set('lang', 'en');
base.searchParams.set('site', 'malapert-massif');
const widths = [320, 390, 768, 1024, 1440, 1920];
const artifacts = resolve(process.env.BRASPACE_BROWSER_ARTIFACTS || '/tmp/braspace-cockpit-focus');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width <= 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    try {
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base.href, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/moonproof\/cockpit(?:\.html)?(?:\?|$)/);
      assert.equal(new URL(page.url()).searchParams.get('site'), 'malapert-massif');
      await page.locator('#left .mp-stat').waitFor({ timeout: 45000 });
      const menu = page.locator('.ck-panel-menu summary');
      await menu.click();
      await page.getByRole('button', { name: 'Battery', exact: true }).click();
      assert.equal(await page.locator('#left .mp-stat').isVisible(), false);
      await menu.focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.ck-panel-menu').getAttribute('open'), null);
      await page.getByRole('button', { name: 'Moon only', exact: true }).click();
      for (const selector of ['#left','#right','#sheet','#player','.mp-links']) assert.equal(await page.locator(selector).isVisible(), false, selector);
      assert.ok(await page.locator('.mp-cockpit-3d-controls').isVisible());
      await page.screenshot({ path: resolve(artifacts, `${width}-moon-only.png`) });
      await page.getByRole('button', { name: 'Restore panels', exact: true }).click();
      assert.equal(await page.locator('#left .mp-stat').isVisible(), false, 'previous panel selection preserved');
      assert.ok(await page.locator('#right .mp-rules').isVisible());
      await menu.click(); await page.getByRole('button',{name:'Open all',exact:true}).click();
      await menu.focus(); await page.keyboard.press('Escape');
      assert.ok(await page.locator('#left .mp-stat').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
      await page.screenshot({ path: resolve(artifacts, `${width}-cockpit.png`) });
      assert.deepEqual(errors, [], `uncaught errors at ${width}px`);
      console.log(`PASS ${width}px`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
