// Sunlight caveat from the PGDA review and the 100 km horizon reach study.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { sunCaveat, PGDA_SUN_TOLERANCE_PP } from "../core/data.js";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const sites = JSON.parse(read("../../data/sites.json")).sites;

test("the two 100 km reach cases are flagged, including Malapert below the PGDA tolerance", () => {
  assert.equal(PGDA_SUN_TOLERANCE_PP, 5);
  const flagged = sites.filter(s => sunCaveat(s)).map(s => s.id);
  assert.deepEqual(flagged, ["malapert-massif", "peak-near-shackleton"]);
  const malapert = sunCaveat(sites.find(s => s.id === "malapert-massif"));
  assert.deepEqual(malapert.reach, { sun100: 38.44, sun200: 33.84, dark100: 670, dark200: 3389 });
  const c = sunCaveat(sites.find(s => s.id === "peak-near-shackleton"));
  assert.equal(c.kind, "SUN_UPPER_BOUND");
  // 80.43 - 71.9 = 8.53 after the solar-disc fix (9.0 with the inverted fraction); still the only site over 5 pp.
  assert.ok(Math.abs(c.diff - (c.ours - c.pgda)) < 1e-12 && c.diff > 8.4 && c.diff < 8.7, "difference " + c.diff);
  assert.ok(Object.isFrozen(c));
  assert.deepEqual(c.reach, { sun100: 80.38, sun200: 75.52, dark100: 345, dark200: 381 });
  const updated = structuredClone(sites.find(s => s.id === "malapert-massif"));
  updated.metrics.sun_center_visible_pct = 33.84;
  assert.equal(sunCaveat(updated), null, "a warning for the old series must not attach to regenerated data");
});

// The web stage of the Docker gate copies web/ only; there the science gate pins the same values itself.
const gateFile = new URL("../../../api/cmd/validatehorizons/reference_tolerances_test.go", import.meta.url);
test("the independent PGDA tolerance still matches the science gate", { skip: !existsSync(gateFile) && "science/ not in this build context" }, () => {
  const gate = readFileSync(gateFile, "utf8");
  assert.match(gate, /pgdaSunTolerancePP = 5\.0/);
  assert.match(gate, /pgdaSunOutside = \[\]string\{"peak-near-shackleton"\}/);
});

test("no flag without both numbers, at the tolerance, or when PGDA shows more sunlight than we do", () => {
  const site = (ours, pgda) => ({ metrics: { mean_solar_disc_visible_pct: ours }, pgda_sun_pct: pgda });
  assert.equal(sunCaveat(site(50, 45)), null, "exactly 5 points is inside the tolerance");
  assert.notEqual(sunCaveat(site(50.01, 45)), null);
  assert.equal(sunCaveat(site(40, 60)), null, "less sunlight than PGDA is not an upper-bound case");
  for (const s of [null, undefined, {}, { metrics: {} }, site(80, undefined), site(undefined, 70), site(NaN, 70), site("80", 70)])
    assert.equal(sunCaveat(s), null);
});

test("the shell shows the flag for the selected site, in both languages, and the Moon HD card applies the same rule", () => {
  const shell = read("../core/shell.ts"), i18n = read("../core/i18n.ts"), css = read("../core/components.css");
  assert.match(shell, /sunCaveat\(catalogue\?\.sites\.find\(s => s\.id === st\.site\)\)/);
  assert.match(shell, /t\("ctx\.sunCapWhy", \{ ours: .*pgda: .*diff: /);
  for (const key of ["ctx.sunCap", "ctx.sunCapWhy", "ctx.reachCap", "ctx.reachCapWhy"]) assert.equal(i18n.split(`"${key}"`).length - 1, 2, key + " in en and pt-BR");
  assert.ok(i18n.includes("Sun: upper bound") && i18n.includes("Sol: teto"));
  assert.ok(css.includes(".mp-caveat{"));
  const hd = read("../../moon-hd/app.js");
  assert.match(hd, /sunCaveat\(site\)/);
  assert.ok(hd.includes('"≤ "') && read("../../moon-hd.html").includes('id="site-caveat"'));
});
