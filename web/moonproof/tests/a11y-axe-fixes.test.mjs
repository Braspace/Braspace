// Pins the WCAG fixes found by axe-core on production (15/11): before them 5 rules failed on 7 screens.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("tabs use aria-selected only (aria-pressed is not allowed on role=tab)", () => {
  assert.doesNotMatch(read("screens/mission.tsx"), /role="tab"[^>]*aria-pressed/);
});
test("focusable sheet separator exposes its value (window splitter)", () => {
  const s = read("screens/sheet.ts");
  for (const a of ["aria-valuemin", "aria-valuemax", "aria-valuenow"]) assert.match(s, new RegExp(a));
});
test("role=img bars carry a text alternative with the drawn values", () => {
  assert.match(read("core/layers.ts"), /bar\.setAttribute\("aria-label"/);
});
test("contrast: entry subtitle fully opaque; fail badge on Heloísa's --fail-fill", () => {
  assert.match(read("screens/entry.css"), /\.mp-task \.who\{font-size:14px;font-weight:600;opacity:1;color:inherit\}\.mp-task\[aria-current="true"\] \.who\{opacity:1\}/);
  assert.match(read("screens/scenario.css"), /\.mp-badge\.is-fail\{background:var\(--fail-fill\);color:#fff\}/);
});
test("scrollable regions are keyboard reachable and named", () => {
  assert.match(read("evidence.html"), /id="main" tabindex="0" role="region" aria-label=/);
  assert.match(read("screens/plan.tsx"), /class="mp-table-wrap" tabindex="0" role="region" aria-label="\$\{t\("plan\.tableRegion"\)\}"/);
});

test("explore: slope and its range are computed on demand; range scan is indexed; one Intl formatter per language", () => {
  const s = read("screens/explore.tsx");
  assert.doesNotMatch(s, /^const slope = grid\.slopeField\(\);/m);
  assert.match(s, /const getSlope = \(\): ArrayLike<number> => \(slopeArr \?\?= grid\.slopeField\(\)\);/);
  assert.match(s, /get slope\(\): \[number, number\] \{ return \[0, \(slopeMax \?\?= finiteRange\(getSlope\(\)\)\[1\]\)\]; \}/);
  assert.doesNotMatch(s, /Array\.from\(arr\)/);
  assert.match(s, /const dateFmt = \(l: string\) =>/);
});
