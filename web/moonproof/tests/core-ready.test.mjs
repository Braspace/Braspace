import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("ready.js loads without a DOM (core tests import state.js in Node)", async () => {
  await import("../core/ready.js");
});

test("the gate hides the page until mp-ready and has a no-script-failure fallback", () => {
  const css = readFileSync(path.join(root, "core/components.css"), "utf8");
  assert.match(css, /html:not\(\.mp-ready\)\s*body\{[^}]*visibility:hidden[^}]*mp-reveal 0s 2s forwards/);
  assert.match(css, /@keyframes mp-reveal\{to\{visibility:visible\}\}/);
});

test("every screen reaches ready.js through state.js", () => {
  assert.match(readFileSync(path.join(root, "core/state.js"), "utf8"), /import "\.\/ready\.js"/);
  for (const f of readdirSync(root).filter(n => n.endsWith(".html"))) {
    const html = readFileSync(path.join(root, f), "utf8");
    // Canonical entry is a CSP-safe navigation shell, not a stateful screen.
    if (f === "index.html") {
      assert.match(html, /src="screens\/cockpit-entry\.js"/);
      assert.match(html, /id="cockpit-entry" href="cockpit\.html"/);
      continue;
    }
    const sources = [...html.matchAll(/screens\/[a-z-]+\.js/g)].map(m => m[0]);
    assert.ok(sources.some(src => /core\/state\.js/.test(readFileSync(path.join(root, src), "utf8"))), `${f} must load a screen that imports core/state.js`);
  }
});
