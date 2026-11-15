// Run: node --test web/onboard/test/
// Tests for the cockpit model and the feature register.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../model.js");
const F = require("../features.js");

const startMs = Date.parse("2026-12-01T00:00:00Z");

test("feature register has 75 unique ids matching the checklist", () => {
  assert.equal(F.FEATURES.length, 75);
  assert.equal(new Set(F.FEATURES.map(f => f.id)).size, 75);
});

test("every feature has a valid status", () => {
  const ok = new Set(["SIM", "PARC", "PEND", "BLOQ", "ESQ"]);
  for (const f of F.FEATURES) assert.ok(ok.has(f.status), f.id + " status " + f.status);
});

test("features marked SIM have a panel", () => {
  for (const f of F.FEATURES.filter(x => x.status === "SIM")) {
    assert.ok(f.panel, f.id + " is SIM but has no panel");
  }
});

test("track returns one record per step with boolean flags", () => {
  const tr = M.track({ siteId: "synthetic-demo-a", startMs, stepMin: 120, count: 360, delayH: 0 });
  assert.equal(tr.length, 360);
  assert.ok(tr.every(s => typeof s.sun_visible === "boolean" && typeof s.earth_visible === "boolean"));
});

test("delay shifts the track start", () => {
  const a = M.track({ siteId: "synthetic-demo-a", startMs, stepMin: 60, count: 2, delayH: 0 });
  const b = M.track({ siteId: "synthetic-demo-a", startMs, stepMin: 60, count: 2, delayH: 24 });
  assert.ok(Math.abs(b[0].tH - a[0].tH - 24) < 1e-9);
});

test("summary hours are consistent with the flags", () => {
  const tr = M.track({ siteId: "synthetic-demo-a", startMs, stepMin: 120, count: 360, delayH: 0 });
  const s = M.summary(tr, 120);
  assert.equal(s.durationH, 720);
  assert.equal(s.sunlitH, tr.filter(x => x.sun_visible).length * 2);
  assert.ok(s.darkH <= s.durationH && s.blockH <= s.durationH);
});

test("transitions report the index where the flag changes", () => {
  const tr = [
    { tH: 0, sun_visible: false }, { tH: 1, sun_visible: true }, { tH: 2, sun_visible: true }, { tH: 3, sun_visible: false }
  ];
  const t = M.transitions(tr, "sun_visible", 60);
  assert.deepEqual(t.map(x => x.index), [1, 3]);
  assert.deepEqual(t.map(x => x.to), [true, false]);
});

test("violations name darkness, blockage and fuel margin", () => {
  const sum = { darkH: 40, blockH: 30, sunlitH: 0, earthH: 0, durationH: 100 };
  const v = M.violations(sum, { fuelMarginKg: -1 });
  assert.deepEqual(v.map(x => x.code), ["DARK", "BLOCK", "FUEL"]);
  assert.equal(M.verdict(v), "NAO_VIAVEL");
  assert.equal(M.verdict([], 10), "MARGEM_REDUZIDA");
  assert.equal(M.verdict([], 100), "VIAVEL");
});

test("life support values are illustrative and decrease with duration", () => {
  const a = M.lifeSupport(24), b = M.lifeSupport(720);
  assert.ok(b.fuelRemainingKg < a.fuelRemainingKg);
  assert.ok(b.foodLeftKg < a.foodLeftKg);
});

test("sensitivity variants include observer, DEM and step", () => {
  const keys = M.SENS_VARIANTS.map(v => v.key);
  for (const k of ["base", "obs", "dem_c", "dem_f", "step2"]) assert.ok(keys.includes(k), k);
});

test("roughness multiplier changes the horizon, height offset raises it", () => {
  const site = M.SITES["synthetic-demo-b"];
  const base = M.horizonAt(90, site, {});
  assert.ok(Math.abs(M.horizonAt(90, site, { roughMult: 1.5 }) - base - 0.5) < 1e-9);
  assert.ok(Math.abs(M.horizonAt(90, site, { dh: 0.5 }) - base - 0.5) < 1e-9);
});
