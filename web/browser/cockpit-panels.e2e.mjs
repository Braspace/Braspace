// Browser-level contract for the one shared MoonProof cockpit, not a DOM-only static test.
// Called from e2e.mjs after the real Go/Rust onboard API request has completed.
import assert from "node:assert/strict";

export const PANEL_IDS = ["battery", "visibility", "illumination", "rules", "alerts", "faults", "crew", "timeline", "report"];

export async function verifyCockpitPanels(page) {
  // The Cockpit is now the canonical landing: verify the guide actually appears,
  // can be dismissed and reopened, then leave the page interactive for panel QA.
  const help = page.locator(".mp-tour-help");
  await help.waitFor({ state: "visible", timeout: 15000 });
  const guide = page.locator(".mp-tour-dialog");
  await guide.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await guide.getAttribute("aria-modal"), "true", "first visit offers an accessible guide");
  await page.locator("#mp-tour-next").click();
  assert.match(await page.locator("#mp-tour-progress").innerText(), /1\s+(?:of|de)\s+7/);
  await page.locator("#mp-tour-skip").click();
  await guide.waitFor({ state: "hidden" });
  await help.click();
  await guide.waitFor({ state: "visible" });
  await page.locator("#mp-tour-close").click();
  await guide.waitFor({ state: "hidden" });
  const menu = page.locator("#ck-panel-controls details.ck-panel-menu");
  await page.locator("#left .mp-visrow").waitFor({ state: "visible", timeout: 30000 });
  await menu.locator("summary").click();
  for (const id of PANEL_IDS) {
    const control = menu.locator(`button[data-panel="${id}"]`);
    // Repaint can close a <details>; reopen before checking true pointer interaction.
    if (!(await menu.evaluate(el => el.open))) await menu.locator("summary").click();
    assert.equal(await control.getAttribute("aria-pressed"), "true", id + " initially visible");
    await control.click();
    await page.waitForFunction(id => document.body.dataset.ckHidden?.split(/\s+/).includes(id), id);
    assert.equal(await control.getAttribute("aria-pressed"), "false", id + " is closed");
    if (!(await menu.evaluate(el => el.open))) await menu.locator("summary").click();
    await control.click();
    await page.waitForFunction(id => !document.body.dataset.ckHidden?.split(/\s+/).includes(id), id);
    assert.equal(await control.getAttribute("aria-pressed"), "true", id + " is restored");
  }
  const selectors = [
    ["battery", "#left > mp-node"],
    ["visibility", "#left > .mp-visrow"],
    ["illumination", "#left > .ck-acc-sun"],
  ];
  for (const [id, selector] of selectors) {
    if (!(await menu.evaluate(el => el.open))) await menu.locator("summary").click();
    const control = menu.locator(`button[data-panel="${id}"]`);
    await control.click();
    assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).display), "none", id + " hidden by CSS");
    if (!(await menu.evaluate(el => el.open))) await menu.locator("summary").click();
    await control.click();
    assert.notEqual(await page.locator(selector).evaluate(el => getComputedStyle(el).display), "none", id + " visible again");
  }
  // Real responsive geometry; do not fake 75% via browser zoom or shrink the touch targets.
  if (await menu.evaluate(el => el.open)) await menu.locator("summary").click();
  for (const [width, height] of [[320, 720], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const toolbar = page.locator("#ck-panel-controls .ck-panel-toolbar");
    await toolbar.waitFor({ state: "visible" });
    const box = await toolbar.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1,
      `panel toolbar overflows ${width}px viewport: ${JSON.stringify(box)}`);
    for (const element of [
      page.locator("#ck-panel-controls button.ck-panel-focus"),
      page.locator("#ck-panel-controls .ck-panel-menu summary"),
    ]) {
      const target = await element.boundingBox();
      assert.ok(target && target.height >= 44 && target.width >= 44,
        `touch target under 44px at ${width}px: ${JSON.stringify(target)}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // The button asks the existing lazy Moon controller to explore, never creates another renderer.
  const moonOnly = page.locator("#ck-panel-controls button.ck-panel-focus");
  await moonOnly.click();
  await page.waitForFunction(ids => ids.every(id => document.body.dataset.ckHidden?.split(/\s+/).includes(id)), PANEL_IDS);
  assert.equal(await moonOnly.getAttribute("aria-pressed"), "true", "Moon only is active");
  // On a GPU the shared 3D canvas covers the viewport. Restore MUST stay pointer-reachable
  // over that canvas; do not mask a z-index failure with DOM evaluate() or Moon's own exit.
  await page.waitForFunction(() => document.documentElement.classList.contains("moon-explore-on"),
    null, { timeout: 5000 }).catch(() => {}); // no-WebGL fallback remains testable
  if (await page.evaluate(() => document.documentElement.classList.contains("moon-explore-on"))) {
    const canHitRestore = await moonOnly.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !!hit && (hit === button || button.contains(hit));
    });
    assert.ok(canHitRestore, "Restore panels button must receive pointer events above the interactive 3D Moon");
  }
  await moonOnly.click({ timeout: 15000 });
  await page.waitForFunction(() => !document.body.dataset.ckHidden?.trim());
  assert.equal(await moonOnly.getAttribute("aria-pressed"), "false", "restored previous nine-panel state");
  console.log("PASS nine independent MoonProof cockpit panel pointer toggles, CSS visibility and Moon-only restore");
}
