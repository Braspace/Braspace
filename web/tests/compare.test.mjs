import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, rulesFromQuery, rulesToQuery, RULE_DEFAULTS, METRICS, bestIndex } from "../shell/compare.js";

const w = (o) => ({ status: "COMPUTED", sunPct: 60, earthPct: 70, bothPct: 40, longestDarkH: 50, longestBlackoutH: 30, ...o });

test("rules come from the query and fall back to the defaults", () => {
  assert.deepEqual(rulesFromQuery({}), RULE_DEFAULTS);
  assert.deepEqual(rulesFromQuery({ rs: "40", rn: "abc", re: "-3" }), { ...RULE_DEFAULTS, minSunPct: 40 });
  assert.deepEqual(rulesFromQuery(rulesToQuery({ minSunPct: 1, maxNightH: 2, maxEarthLossH: 3 })), { minSunPct: 1, maxNightH: 2, maxEarthLossH: 3 });
});

test("best is the passing site with most Sun+Earth; none passing gives a closest site, not a winner", () => {
  const r = evaluate([{ id: "a", w: w({ bothPct: 10 }) }, { id: "b", w: w({ bothPct: 20 }) }, { id: "c", w: w({ longestDarkH: 500 }) }], RULE_DEFAULTS);
  assert.equal(r.best.id, "b");
  assert.equal(r.rows[2].passAll, false);
  const none = evaluate([{ id: "a", w: w({ longestDarkH: 500 }) }, { id: "b", w: w({ longestDarkH: 500, sunPct: 1 }) }], RULE_DEFAULTS);
  assert.equal(none.best, null);
  assert.equal(none.closest.id, "a");
});

test("a site without computed data is N/D: never passes, never best, margin NaN", () => {
  const r = evaluate([{ id: "x", w: { status: "NOT_COMPUTED" } }], RULE_DEFAULTS);
  assert.equal(r.rows[0].passAll, false);
  assert.equal(r.best, null);
  assert.equal(r.closest, null);
  assert.ok(r.rows[0].checks.every(c => c.pass === null && Number.isNaN(c.margin)));
  assert.equal(bestIndex(r.rows, METRICS[0]), -1);
});

test("bestIndex picks the lowest value for limit metrics and the highest otherwise", () => {
  const rows = evaluate([{ id: "a", w: w({ longestDarkH: 80, sunPct: 30 }) }, { id: "b", w: w({ longestDarkH: 20, sunPct: 90 }) }], RULE_DEFAULTS).rows;
  assert.equal(bestIndex(rows, METRICS.find(m => m.key === "longestDarkH")), 1);
  assert.equal(bestIndex(rows, METRICS.find(m => m.key === "sunPct")), 1);
});
