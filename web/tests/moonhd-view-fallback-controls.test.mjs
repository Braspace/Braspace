import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setViewControls } from "../moon-hd/bootstrap.js";

const button = () => {
  const attrs = new Map();
  return {
    disabled: false,
    setAttribute(key, value) { attrs.set(key, value); },
    getAttribute(key) { return attrs.get(key) ?? null; },
    removeAttribute(key) { attrs.delete(key); },
  };
};

test("Moon HD selects the requested globe or south-pole view while rendering", () => {
  const globe = button(), pole = button(), controls = { globe, pole };
  setViewControls(controls, "pole");
  assert.equal(globe.getAttribute("aria-pressed"), "false");
  assert.equal(pole.getAttribute("aria-pressed"), "true");
  assert.equal(globe.disabled, false);
  assert.equal(pole.disabled, false);
  setViewControls(controls, "globe");
  assert.equal(globe.getAttribute("aria-pressed"), "true");
  assert.equal(pole.getAttribute("aria-pressed"), "false");
});

test("no-WebGL fallback disables inert view controls and describes their unavailable mode", () => {
  const globe = button(), pole = button(), controls = { globe, pole };
  setViewControls(controls, "pole", true);
  for (const b of [globe, pole]) {
    assert.equal(b.disabled, true);
    assert.equal(b.getAttribute("aria-pressed"), "false");
    assert.equal(b.getAttribute("aria-describedby"), "loading");
  }
  // A late success after the 45-second watchdog must reenable actual scene controls.
  setViewControls(controls, "pole", false);
  assert.equal(pole.disabled, false);
  assert.equal(pole.getAttribute("aria-pressed"), "true");
  assert.equal(pole.getAttribute("aria-describedby"), null);
});

test("boot checks view query before loading WebGL and keeps observing after fallback", async () => {
  const script = await readFile(new URL("../moon-hd/bootstrap.js", import.meta.url), "utf8");
  assert.match(script, /get\('view'\) === 'pole'/);
  assert.match(script, /setViewControls\(viewControls, requested\)/);
  assert.match(script, /setViewControls\(viewControls, requested, true\)/);
  assert.match(script, /if \(box\.classList\.contains\('done'\)\)/);
  assert.match(script, /fallbackApplied = true/);
});
