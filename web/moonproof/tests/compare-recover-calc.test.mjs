import test from "node:test";
import assert from "node:assert/strict";
import { judge, slack, verdictOf, computeExits, longestRun, dailyFractions, parseHash, buildHash, ruleHeadlineKind } from "../screens/scenario-calc.js";
const R = { night: 60, blackout: 72 };

test("judge: rule breaks are reported with the reason, never fixed text", () => {
  assert.equal(judge({ dark: 61, blackout: 0 }, R).reasons[0].key, "night");
  assert.equal(judge({ dark: 60, blackout: 72 }, R).status, "pass");
  assert.equal(judge({ dark: 10, blackout: 73 }, R).reasons[0].key, "blackout");
  const r2 = judge({ dark: 10, blackout: 73 }, { night: 60, blackout: 80 }); assert.equal(r2.status, "pass"); // follows the declared rule
});
test("missing value is no-data, never a pass (rule: no zero)", () => {
  assert.equal(judge({ dark: null, blackout: 0 }, R).status, "nd");
  assert.equal(judge(null, R).status, "nd");
  assert.equal(slack({ dark: undefined, blackout: 1 }, R), null);
});
test("verdict is computed from the judged scenarios", () => {
  const j = [judge({ dark: 70, blackout: 1 }, R), judge({ dark: 40, blackout: 1 }, R), judge({ dark: 10, blackout: 100 }, R)];
  assert.deepEqual(verdictOf(j, [1, 2, 3]), { kind: "single", winners: [1], best: 1 });
  const same = [judge({ dark: 1, blackout: 1 }, R), judge({ dark: 2, blackout: 1 }, R)];
  assert.equal(verdictOf(same, [10, 30]).best, 1);
  assert.equal(verdictOf([judge({ dark: 99, blackout: 1 }, R)], [1]).kind, "none");
  assert.equal(verdictOf([judge(null, R)], [null]).kind, "nodata");
});
test("slack is the tighter margin", () => { assert.equal(slack({ dark: 50, blackout: 70 }, R), 2); assert.equal(slack({ dark: 70, blackout: 1 }, R), -10); });
test("exits: only computed ones, sorted by slack, and an exit that fails a rule is dropped", () => {
  const table = { "a|0": { dark: 80, blackout: 0 }, "a|1": { dark: 50, blackout: 0 }, "a|2": { dark: 10, blackout: 0 }, "b|1": { dark: 40, blackout: 0 }, "a|s": { dark: 20, blackout: 0 } };
  const D = 3600e3;
  const metricsAt = (id, s, h) => { if (h < 48) return table["a|s"]; const k = Math.round(s / (24 * D)); return table[`${id}|${k}`] ?? null; };
  const ex = computeExits({ metricsAt, siteId: "a", siteIds: ["a", "b"], startMs: 0, hours: 96, delayH: 24, rules: R, searchDays: 3 });
  assert.ok(ex.length >= 2); for (let i = 1; i < ex.length; i++) assert.ok(ex[i - 1].slack >= ex[i].slack);
  assert.ok(ex.every(e => e.slack != null && e.slack >= 0));
  assert.deepEqual(computeExits({ metricsAt: () => null, siteId: "a", siteIds: ["a", "b"], startMs: 0, hours: 96, delayH: 24, rules: R, searchDays: 3 }), []);
});
test("longestRun and dailyFractions", () => {
  assert.deepEqual(longestRun([true, false, false, true, false]), { start: 1, len: 2 });
  const f = dailyFractions(Array(24).fill(true).concat(Array(12).fill(false)));
  assert.deepEqual(f, [1, 0]);
});
test("hash round trip", () => {
  const h = buildHash({ sc: [{ site: "x", start: "2026-01-01T00:00:00Z", hours: 336 }], d: 48, x: "wait" });
  const p = parseHash("#" + h); assert.equal(p.sc[0].site, "x"); assert.equal(p.d, 48); assert.equal(p.x, "wait");
  assert.equal(parseHash("#sc=a,b,c,d,e").sc.length, 3);
});

test("replan headline reason is exact for night, blackout, both, no data and pass", () => {
  const cases = [
    [{ dark: 20, blackout: 100 }, "blackout"],
    [{ dark: 100, blackout: 20 }, "night"],
    [{ dark: 100, blackout: 100 }, "both"],
    [{ dark: 20, blackout: 20 }, "pass"],
    [{ dark: null, blackout: 20 }, "nd"],
  ];
  for (const [metrics, expected] of cases) {
    const judged = judge(metrics, R);
    assert.equal(ruleHeadlineKind(judged), expected, JSON.stringify(metrics));
  }
  assert.equal(ruleHeadlineKind(judge({ dark: 60, blackout: 72 }, R)), "pass", "boundary is allowed");
});
