import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(path.join(root, f), "utf8");
const phone = css => css.slice(css.indexOf("@media (max-width: 860px)"));

test("shell bottom nav is near-opaque and respects the iPhone safe area", () => {
  const css = phone(read("shell/shell.css"));
  assert.match(css, /\.bottomnav\.glass \{ background: #0b0e11; -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  assert.match(css, /\.bottomnav::before \{[^}]*bottom: 100%; height: 24px/);
  assert.match(css, /bottom: calc\(10px \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.foot \{ padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom/);
});

test("the provenance strip is a card (not a pill) and chips may wrap on phones", () => {
  const css = read("ds/components.css");
  assert.match(css, /@media \(max-width: 860px\) \{ \.pstrip \{ border-radius: var\(--r-card\)/);
  assert.match(css, /\.chipa, \.chipg \{ white-space: normal/);
});

test("cockpit on phones: tabs and the calculate button are in flow, nothing floats over text", () => {
  const src = read("onboard/cockpit.css"), css = src.slice(src.lastIndexOf("@media (max-width: 860px)"));
  assert.match(css, /aside\.side \{ position: static/);
  assert.match(css, /\.fab \{ position: static/);
  assert.doesNotMatch(css, /position: fixed/);
  assert.match(read("onboard/cockpit.js"), /placeFab/);
});
