// Execute against complete BRASPACE web + API: BASE=http://127.0.0.1:5380 node web/browser/unified-shell.mjs
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=(process.env.BASE||'http://127.0.0.1:5380').replace(/\/$/,'');
const sizes=[{width:320,height:720},{width:390,height:844},{width:768,height:1024},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080}];
const browser=await chromium.launch({headless:true,args:['--disable-webgl'],executablePath:process.env.CHROME_PATH||undefined});
try {
  for(const viewport of sizes) {
    const context=await browser.newContext({viewport,reducedMotion:'reduce'});
    try {
      const page=await context.newPage();
      await page.goto(base+'/#/?site=mons-mouton-im2&t=2026-11-15&d=28');
      await page.locator('.tasks .task').first().waitFor();
      assert.equal(await page.locator('.tasks .task').count(),3);
      const dialog=page.locator('#tools-dialog');
      await page.locator('#open-tools').click();
      assert.ok(await dialog.isVisible());
      assert.equal(await dialog.locator('a').count(),6);
      for(const link of await dialog.locator('a').all()) assert.match(await link.getAttribute('href'),/d=28&site=mons-mouton-im2&t=2026-11-15/);
      await page.keyboard.press('Escape');
      assert.ok(!(await dialog.isVisible()));
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'open-tools');
      await page.locator('#moon-toggle').click();
      await page.locator('#moon-status').filter({hasText:/^Prévia estática do relevo LOLA 80 m/}).waitFor();
      assert.equal(await page.locator('#moon-stage').getAttribute('aria-hidden'),'false');
      assert.ok(!(await page.locator('#view').isVisible()));
      assert.ok(await page.locator('#moon-reset').isDisabled());
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#view').isVisible());
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'moon-toggle');
      const scene=await page.locator('#moon-stage').elementHandle();
      const home=page.locator('#view .tasks a');
      for(const path of ['/explorar','/aula','/comparar/tecnico']) {
        await home.filter({has:page.locator('span')}).first().waitFor();
        await page.locator(`#view .tasks a[href^="#${path}?"]`).click();
        await page.locator('#view [data-route-title]').first().waitFor();
        assert.ok(page.url().includes(`#${path}?`));
        assert.ok(await scene.evaluate(el=>el===document.getElementById('moon-stage')));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
        await page.locator('.brand').click();
        await page.locator('.tasks .task').first().waitFor();
      }
      console.log('PASS unified shell', viewport.width, viewport.height);
    } finally {await context.close();}
  }
} finally {await browser.close();}
