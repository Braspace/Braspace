import test from "node:test";
import assert from "node:assert/strict";
import { latLonToBodyFixed, bodyFixedToLatLon, normalizeLon, southStereoForward, southStereoInverse,
  stereoToPixel, bodyToEnu, enuToBody, azElToEnu, enuToAzEl, surfaceDistance, R_REF } from "../lab/coords.js";
import { TerrainGrid } from "../lab/terrain.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);

test("equator / prime meridian maps to +X", () => {
  const p = latLonToBodyFixed(0, 0);
  near(p[0], R_REF, 1e-6); near(p[1], 0, 1e-6); near(p[2], 0, 1e-6);
});

test("poles map to ±Z", () => {
  near(latLonToBodyFixed(-90, 123)[2], -R_REF, 1e-6);
  near(latLonToBodyFixed(90, -45)[2], R_REF, 1e-6);
});

test("longitude normalisation: ±180 and wrap-around", () => {
  assert.equal(normalizeLon(180), 180);
  assert.equal(normalizeLon(-180), 180);
  assert.equal(normalizeLon(190), -170);
  assert.equal(normalizeLon(-190), 170);
  assert.equal(normalizeLon(360), 0);
  const a = latLonToBodyFixed(-89, 180), b = latLonToBodyFixed(-89, -180);
  a.forEach((v, i) => near(v, b[i], 1e-6));
});

test("body-fixed round trip at many points", () => {
  for (const [lat, lon] of [[-89.4632, -137.49], [-84.78, 29.13], [0, 0], [45, 179.9], [-30, -179.9]]) {
    const r = bodyFixedToLatLon(latLonToBodyFixed(lat, lon, R_REF + 1234));
    near(r.lat, lat, 1e-9); near(r.lon, normalizeLon(lon), 1e-9); near(r.r, R_REF + 1234, 1e-6);
  }
});

test("south polar stereographic: pole at origin, round trip, true scale near pole", () => {
  const [x0, y0] = southStereoForward(-90, 0);
  near(x0, 0, 1e-9); near(y0, 0, 1e-9);
  for (const [lat, lon] of [[-89.67, 129.78], [-85.9948, -0.23578], [-80, 90], [-84.78, 29.13]]) {
    const [x, y] = southStereoForward(lat, lon);
    const r = southStereoInverse(x, y);
    near(r.lat, lat, 1e-9); near(r.lon, normalizeLon(lon), 1e-9);
  }
  const [, y] = southStereoForward(-89, 0);
  near(y, 2 * R_REF * Math.tan(Math.PI / 360), 1e-6);
  near(y, 30323, 5, "1° of colatitude ≈ 30.3 km");
});

test("pixel convention matches LDEM_80S_80M (pole at 3799.5, PR #86)", () => {
  const grid = { sampleOffset: 3799.5, lineOffset: 3799.5, mapScale: 80 };
  const [c, r] = stereoToPixel(0, 0, grid);
  assert.equal(c, 3799.5); assert.equal(r, 3799.5);
  const [c2, r2] = stereoToPixel(...southStereoForward(-80, 90), grid);
  near(c2, 7599.5, 0.6, "80°S, 90°E reaches the right edge");
  near(r2, 3799.5, 1e-6);
});

test("ENU basis: round trip and azimuth convention (clockwise from north)", () => {
  const v = [123, -456, 789];
  const back = enuToBody(bodyToEnu(v, -85, 30), -85, 30);
  back.forEach((x, i) => near(x, v[i], 1e-9));
  near(enuToAzEl([0, 1, 0]).az, 0, 1e-9);
  near(enuToAzEl([1, 0, 0]).az, 90, 1e-9);
  near(enuToAzEl([0, -1, 0]).az, 180, 1e-9);
  near(enuToAzEl([-1, 0, 0]).az, 270, 1e-9);
  const d = enuToAzEl(azElToEnu(213.4, -1.7));
  near(d.az, 213.4, 1e-9); near(d.el, -1.7, 1e-9);
});

test("near the south pole on the 0° meridian, local north points along +X (toward the near side)", () => {
  const n = enuToBody([0, 1, 0], -89.999999, 0);
  near(n[0], 1, 1e-6);
});

test("surface distance: Shackleton centre (89.67°S) to the pole ≈ 10 km", () => {
  near(surfaceDistance(-89.67, 129.78, -90, 0), 0.33 * Math.PI / 180 * R_REF, 1);
});

test("terrain grid: bilinear height, slope and missing data", () => {
  const nx = 5, ny = 5, slope = 0.2;
  const raw = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) raw[j * nx + i] = Math.round((i * 10 * slope) / 0.5);
  raw[24] = -32768;
  const g = new TerrainGrid({ nx, ny, spacing_m: 10, origin_x_m: -20, origin_y_m: -20, scale_m: 0.5, offset_m: 0, nodata: -32768 }, raw);
  near(g.height(-20, -20), 0, 1e-9);
  near(g.height(-15, -10), 1, 1e-9);
  near(g.normal(0, 0).slopeDeg, Math.atan(slope) * 180 / Math.PI, 1e-6);
  assert.ok(Number.isNaN(g.height(100, 0)), "outside grid is NaN, not invented");
  assert.ok(Number.isNaN(g.height(19, 19)), "next to missing pixel is NaN");
  assert.equal(g.missing, 1);
});
