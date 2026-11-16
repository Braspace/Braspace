// Adversarial time-window tests: a 1 h binary series cannot represent fractional
// durations or a shifted start without inventing data. Invalid inputs are N/D.
import test from "node:test";
import assert from "node:assert/strict";
import { SiteSeries, HOUR_MS } from "../../lab/data.js";
import { parseHash, buildHash } from "../screens/scenario-calc.js";
import { flagsOf } from "../screens/scenario-data.js";
import { compareScenarios, compareBody } from "../screens/plan-model.js";
import { classroomWindows } from "../screens/class-scenarios.js";

const START = Date.parse("2026-01-01T00:00:00Z");
function fullyLitSeries() {
  const series = Object.create(SiteSeries.prototype);
  series.start = START;
  series.count = 4;
  series.sunMargin = Float32Array.from([1, 1, 1, 1]);
  series.earthMargin = Float32Array.from([1, 1, 1, 1]);
  series.s = { sunEl: Float32Array.from([1, 1, 1, 1]) };
  return series;
}

test("invalid durations cannot create percentages over 100% or a fake window", () => {
  const series = fullyLitSeries();
  for (const hours of [-1, 0, 0.5, 1.5, NaN, Infinity, 2 ** 53]) {
    const window = series.window(START, hours);
    assert.equal(window.status, "NOT_COMPUTED", String(hours));
    assert.ok(!("sunPct" in window), "no estimated percentage for a bad duration");
  }
  const valid = series.window(START, 2);
  assert.equal(valid.status, "COMPUTED");
  for (const metric of ["sunPct", "earthPct", "bothPct"]) assert.equal(valid[metric], 100);
  assert.deepEqual([valid.longestDarkH, valid.longestBlackoutH], [0, 0]);
});

test("hourly series refuses off-grid start, invalid dates and out-of-coverage windows", () => {
  const series = fullyLitSeries();
  for (const time of [START + 1, START + HOUR_MS / 2, NaN, Infinity, -Infinity]) {
    assert.equal(series.window(time, 2).status, "NOT_COMPUTED", String(time));
  }
  assert.equal(series.window(START - HOUR_MS, 2).status, "NOT_COMPUTED");
  assert.equal(series.window(START + 3 * HOUR_MS, 2).status, "NOT_COMPUTED");
  assert.equal(series.window(START + 3 * HOUR_MS, 1).status, "COMPUTED");
});

test("deep links refuse fractional hours and UTC starts outside the hourly grid", () => {
  const bad = parseHash("#sc=site~2026-01-01T00%3A30%3A00Z~1.5");
  assert.equal(bad.sc[0].site, "site");
  assert.equal(bad.sc[0].start, null);
  assert.equal(bad.sc[0].hours, null);
  assert.equal(bad.sc[0].invalid, true, "invalid values must not turn into an apparently valid default");
  assert.equal(parseHash(buildHash({sc:bad.sc})).sc[0].invalid, true, "sharing must preserve invalidity");
  const good = parseHash("#sc=site~2025-12-31T21%3A00%3A00-03%3A00~2");
  assert.equal(good.sc[0].start, "2025-12-31T21:00:00-03:00");
  assert.equal(good.sc[0].hours, 2);
  assert.equal(parseHash("#sc=site~~Infinity").sc[0].hours, null);
  assert.equal(parseHash("#sc=site~~0").sc[0].hours, null);
  assert.equal(parseHash("#sc=site~~-4").sc[0].hours, null);
});

test("invalid-window markers survive handoff to planning and classroom grading", () => {
  const hash = "#sc=site~2026-01-01T00%3A30%3A00Z~1.5";
  const sites = [{ id: "site" }];
  assert.equal(compareScenarios({ hash, sites, start: null, hours: 336, windowStart: "2026-01-01T00:00:00Z" })[0].invalid, true);
  assert.equal(classroomWindows(sites, hash, { start: null, hours: 336 })[0].invalid, true);
  assert.deepEqual(flagsOf(fullyLitSeries(), START + HOUR_MS / 2, 2), { sun: [], earth: [] });
  assert.equal(compareBody({siteIds:["site"],startIso:"2026-01-01T00:00:00Z",hours:1.5}),null);
  assert.equal(compareBody({siteIds:["site"],startIso:"2026-01-01T00:30:00Z",hours:1}),null);
});
