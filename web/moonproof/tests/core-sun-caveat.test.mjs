// Sunlight shown as an upper bound where our series exceeds NASA PGDA by more than the review tolerance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { sunCaveat, PGDA_SUN_TOLERANCE_PP } from "../core/data.js";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const sites = JSON.parse(read("../../data/sites.json")).sites;

test("the rule is data-driven: only sites over the PGDA tolerance are flagged, and today that is one site", () => {
  assert.equal(PGDA_SUN_TOLERANCE_PP, 5);
  const flagged = sites.filter(s => sunCaveat(s)).map(s => s.id);
  assert.deepEqual(flagged, ["peak-near-shackleton"]);
  const c = sunCaveat(sites.find(s => s.id === "peak-near-shackleton"));
  assert.equal(c.kind, "SUN_UPPER_BOUND");
  assert.ok(Math.abs(c.diff - (c.ours - c.pgda)) < 1e-12 && c.diff > 8.9 && c.diff < 9.1, "difference " + c.diff);
  assert.ok(Object.isFrozen(c));
});

// The web stage of the Docker gate copies web/ only; there the science gate pins the same values itself.
const gateFile = new URL("../../../science/tests/test_reference_tolerances.py", import.meta.url);
test("same tolerance and same set of sites as the science gate", { skip: !existsSync(gateFile) && "science/ not in this build context" }, () => {
  const gate = readFileSync(gateFile, "utf8");
  assert.match(gate, /PGDA_SUN_TOLERANCE_PP = 5\.0/);
  assert.match(gate, /PGDA_SUN_OUTSIDE = \{"peak-near-shackleton"\}/);
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
  for (const key of ["ctx.sunCap", "ctx.sunCapWhy"]) assert.equal(i18n.split(`"${key}"`).length - 1, 2, key + " in en and pt-BR");
  assert.ok(i18n.includes("Sun: upper bound") && i18n.includes("Sol: teto"));
  assert.ok(css.includes(".mp-caveat{"));
  const hd = read("../../moon-hd/app.js");
  assert.match(hd, /m\.mean_solar_disc_visible_pct - site\.pgda_sun_pct > 5/);
  assert.ok(hd.includes('"≤ "') && read("../../moon-hd.html").includes('id="site-caveat"'));
});
