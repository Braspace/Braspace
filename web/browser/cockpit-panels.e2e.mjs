// Browser-level contract for the one shared MoonProof cockpit, not a DOM-only static test.
// Called from e2e.mjs after the real Go/Rust onboard API request has completed.
import assert from "node:assert/strict";

export const PANEL_IDS = ["battery", "visibility", "illumination", "rules", "alerts", "faults", "crew", "timeline", "report"];

export async function verifyCockpitPanels(page) {
  const menu = page.locator("#ck-panel-controls details.ck-panel-menu");
  await page.locator("#left .mp-visrow").waitFor({ state: "visible", timeout: 30000 });
  await menu.locator("summary").click();
  for (const id of PANEL_IDS) {
    const control = menu.locator(`button[data-panel="${id}"]`);
    // Repaint can close a <details>; reopen before checking true pointer interaction.
    if (!(await menu.evaluate(el => el.open))) await menu.locator("summary").click();
    assert.equal(await control.getAttribute("aria-pressed"), "true", id + " initially visible");
    await control.click();
    await page.waitForFunction(id => document.body.dataset.ckHidden?.split(/\\s+/).includes(id), id);
    assert.equal(await control.getAttribute("aria-pressed"), "false", id + " is closed");
    await control.click();
    await page.waitForFunction(id => !document.body.dataset.ckHidden?.split(/\\s+/).includes(id), id);
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
    await control.click();
    assert.notEqual(await page.locator(selector).evaluate(el => getComputedStyle(el).display), "none", id + " visible again");
  }
  // The button asks the existing lazy Moon controller to explore, never creates another renderer.
  const moonOnly = page.locator("#ck-panel-controls button.ck-panel-focus");
  await moonOnly.click();
  await page.waitForFunction(ids => ids.every(id => document.body.dataset.ckHidden?.split(/\\s+/).includes(id)), PANEL_IDS);
  assert.equal(await moonOnly.getAttribute("aria-pressed"), "true", "Moon only is active");
  // The Moon overlay may sit above the controls in real WebGL. Exit it via its own button.
  if (await page.evaluate(() => document.documentElement.classList.contains("moon-explore-on"))) {
    await page.locator(".moon-ui.is-explore .moon-open").click();
  }
  // Test restored state independently of overlay visibility (the actual pointer exit above was attempted).
  await page.evaluate(() => document.querySelector("#ck-panel-controls button.ck-panel-focus")?.click());
  await page.waitForFunction(() => !document.body.dataset.ckHidden?.trim());
  assert.equal(await moonOnly.getAttribute("aria-pressed"), "false", "restored previous nine-panel state");
  console.log("PASS nine independent MoonProof cockpit panel pointer toggles, CSS visibility and Moon-only restore");
}
