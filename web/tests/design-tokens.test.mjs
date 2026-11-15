import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build, parseTokens, contrast } from "../scripts/tokens.mjs";

const css = readFileSync(new URL("../ds/tokens.css", import.meta.url), "utf8");
const t = parseTokens(css);

test("DESIGN_TOKENS.json is generated from tokens.css and not stale", () => {
  const committed = JSON.parse(readFileSync(new URL("../../docs/design/DESIGN_TOKENS.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, build(css));
});

test("contrast ratios claimed in tokens.css comments hold (WCAG AA 4.5:1 for text)", () => {
  const pairs = [["c-t1", "c-bg", 18.1], ["c-t2", "c-bg", 10.8], ["c-t3", "c-bg", 6.9],
    ["c-jade-ink", "c-jade", 8.7], ["c-ink-2", "c-white", 8.6]];
  for (const [fg, bg, claimed] of pairs) {
    const r = contrast(t[fg], t[bg]);
    assert.ok(r >= 4.5, `${fg} on ${bg} = ${r.toFixed(2)} < 4.5`);
    assert.ok(Math.abs(r - claimed) < 0.3, `${fg} on ${bg} is ${r.toFixed(2)}, comment claims ${claimed}`);
  }
});

test("status inks are readable on their status fills", () => {
  for (const [fg, bg] of [["c-ok-ink", "c-ok"], ["c-warn-ink", "c-warn"], ["c-sun-ink", "c-sun"], ["c-earth-ink", "c-earth"], ["c-bad-ink", "c-bad"]])
    assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg} = ${contrast(t[fg], t[bg]).toFixed(2)}`);
});

test("touch target token meets the 44px goal", () => assert.equal(t.touch, "44px"));
