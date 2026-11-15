// Run: node --test web/onboard/test/
// Tests for the synthetic navigation-availability geometry (nav.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const N = require("../nav.js");

const P = N.PREMISES;
const R = P.moonRadiusKm;
const START = Date.parse("2026-12-01T00:00:00Z");

test("GDOP matches a hand-computed geometry (axes +x, -x, +y, +z gives GDOP 2)", () => {
  const g = N.gdop([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.ok(Math.abs(g - 2) < 1e-9, "got " + g);
});

test("GDOP is infinite with fewer than four satellites or a singular geometry", () => {
  assert.equal(N.gdop([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), Infinity);
  assert.equal(N.gdop([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]), Infinity);
});

test("4x4 inverse returns the identity for the identity matrix", () => {
  const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  assert.deepEqual(N.invert4(I), I);
});

test("satellite overhead is usable; near the horizon it is rejected by the mask", () => {
  const site = N.sitePosition(90, 0, P); // north pole: zenith is +z
  const overhead = [site[0], site[1], site[2] + 20000];
  const u = N.usable(overhead, site, [0, 0, 1e9], P);
  assert.ok(u && Math.abs(u[2] - 1) < 1e-9);
  const horizon = [site[0] + 1e5, site[1], site[2]]; // elevation 0 degrees
  assert.equal(N.usable(horizon, site, [0, 0, 1e9], P), null);
});

test("a satellite behind the Earth is occulted by the Earth", () => {
  const site = N.sitePosition(90, 0, P);
  const E = [P.earthMoonKm * Math.cos(40 * Math.PI / 180), 0, P.earthMoonKm * Math.sin(40 * Math.PI / 180)];
  const d = [E[0] - site[0], E[1] - site[1], E[2] - site[2]];
  const len = Math.hypot(...d);
  // Same line of sight as the Earth, but 30 000 km beyond it.
  const behind = [site[0] + d[0] * (1 + 30000 / len), site[1] + d[1] * (1 + 30000 / len), site[2] + d[2] * (1 + 30000 / len)];
  assert.equal(N.usable(behind, site, E, P), null);
});

test("track is deterministic, has one record per sample and only valid fields", () => {
  const opts = { startMs: START, stepMin: 60, count: 48, lat: 0, lon: 0 };
  const a = N.track(opts);
  const b = N.track(opts);
  assert.equal(a.length, 48);
  assert.deepEqual(a, b);
  for (const s of a) {
    assert.ok(Number.isInteger(s.satellites) && s.satellites >= 0 && s.satellites <= 24);
    assert.equal(typeof s.nav_available, "boolean");
    assert.ok(s.gdop === Infinity || s.gdop > 0);
  }
});

test("a site that faces the Earth sees more satellites than a polar site", () => {
  const equator = N.track({ startMs: START, stepMin: 60, count: 240, lat: 0, lon: 0 });
  const pole = N.track({ startMs: START, stepMin: 60, count: 240, lat: -89.5, lon: 45 });
  const mean = a => a.reduce((s, x) => s + x.satellites, 0) / a.length;
  assert.ok(mean(equator) > mean(pole), `equator ${mean(equator)} vs pole ${mean(pole)}`);
});

test("availability requires both the satellite count and the GDOP limit", () => {
  const fake = [
    { satellites: 6, gdop: 2, nav_available: true },
    { satellites: 3, gdop: 1, nav_available: false },
    { satellites: 5, gdop: 9, nav_available: false },
    { satellites: 0, gdop: Infinity, nav_available: false }
  ];
  const s = N.summary(fake, 60);
  assert.equal(s.availability, 0.25);
  assert.equal(s.availableH, 1);
  assert.equal(s.outageCount, 1);
  assert.equal(s.longestOutageH, 3);
  assert.equal(s.minSatellites, 0);
});

test("outages list each run of unavailable samples with its duration", () => {
  const tr = [
    { nav_available: false }, { nav_available: false }, { nav_available: true },
    { nav_available: false }
  ];
  assert.deepEqual(N.outages(tr, 30), [
    { from: 0, to: 1, hours: 1 },
    { from: 3, to: 3, hours: 0.5 }
  ]);
});

test("availabilityAt counts samples under a GDOP limit and a satellite minimum", () => {
  const tr = [
    { satellites: 5, gdop: 3 },
    { satellites: 5, gdop: 40 },
    { satellites: 3, gdop: 1 },
    { satellites: 6, gdop: 900 }
  ];
  assert.equal(N.availabilityAt(tr, 6), 0.25);
  assert.equal(N.availabilityAt(tr, 50), 0.5);
  assert.equal(N.availabilityAt(tr, 1000), 0.75);
  assert.equal(N.availabilityAt([], 6), 0);
});
