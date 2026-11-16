// LUA3D L1: shared polar map (moon-hd/polar-map.js). Pure parts run in node; the DOM part is checked on the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteStereo, posterLayout, clampSpan, zoomSpan, atMaxZoom, atMinZoom, MIN_SPAN, MAX_SPAN, ZOOM_STEP, emitSelect, pickMode, overlayBounds, TEXTS, SHIP_SVG } from "../moon-hd/polar-map.js";
import { latLonToStereo } from "../moon-hd/polar-math.js";
// @ts-ignore
import { southStereoForward } from "../lab/coords.js";

const src = readFileSync(new URL("../moon-hd/polar-map.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../moon-hd/polar-map.css", import.meta.url), "utf8");

test("projection: lat/lon -> stereographic metres matches lab/coords (south pole, grid north up)", () => {
  for (const [lat, lon] of [[-89.45, 222.0], [-84.79, 29.2], [-88.5, -36.85], [-90, 0], [-85.3, 90]]) {
    const [x, y] = siteStereo({ lat, lon }), [ex, ey] = southStereoForward(lat, lon);
    assert.ok(Math.abs(x - ex) < 1e-3 && Math.abs(y - ey) < 1e-3, `${lat},${lon}: ${x},${y} vs ${ex},${ey}`);
    assert.deepEqual([x, y], latLonToStereo(lat, lon));
  }
  // the pole is the origin; 0°E points to +y (up on screen), 90°E to +x (right)
  assert.deepEqual(siteStereo({ lat: -90, lon: 0 }).map(v => Math.round(v)), [0, 0]);
  const [x0, y0] = siteStereo({ lat: -85, lon: 0 }), [x90, y90] = siteStereo({ lat: -85, lon: 90 });
  assert.ok(Math.abs(x0) < 1e-6 && y0 > 0 && x90 > 0 && Math.abs(y90) < 1e-6);
  // explicit catalogue x/y win over lat/lon (the catalogue's own stereo_x_m / stereo_y_m)
  assert.deepEqual(siteStereo({ lat: -85, lon: 0, x: 12, y: -34 }), [12, -34]);
});

test("zoom: limits, step, and button states at both ends", () => {
  assert.equal(clampSpan(1), MIN_SPAN); assert.equal(clampSpan(1e9), MAX_SPAN); assert.equal(clampSpan(NaN), MAX_SPAN);
  assert.equal(zoomSpan(140000, 1), 100000); assert.ok(Math.abs(zoomSpan(100000, -1) - 100000 * ZOOM_STEP) < 1e-6);
  let s = MAX_SPAN; for (let i = 0; i < 40; i++) s = zoomSpan(s, 1);
  assert.equal(s, MIN_SPAN); assert.ok(atMaxZoom(s));
  for (let i = 0; i < 40; i++) s = zoomSpan(s, -1);
  assert.equal(s, MAX_SPAN); assert.ok(atMinZoom(s));
  assert.equal(zoomSpan(50000, 0), 50000);
});

test("selection: onSelect and a bubbling CustomEvent polarmap:select {detail:{id}}", () => {
  const target = new EventTarget(), got = [];
  target.addEventListener("polarmap:select", e => got.push(["event", e.detail.id, e.bubbles]));
  emitSelect(target, "mons-mouton", id => got.push(["cb", id]));
  assert.deepEqual(got, [["cb", "mons-mouton"], ["event", "mons-mouton", true]]);
  emitSelect(target, "b"); // onSelect optional
  assert.equal(got.at(-1)[1], "b");
  // the ship click is the same function as the API select (user = true) for every renderer
  assert.match(src, /b\.onclick = \(\) => api\.select\(s\.id, true\)/);
  assert.match(src, /if \(user\) emitSelect\(container, id, opts\.onSelect\)/);
});

test("fallback without WebGL: LOLA 2D relief; without the heights: poster with clickable ships laid out in the same projection", () => {
  assert.equal(pickMode({ webgl2: true, heights: true }), "moonhd");
  assert.equal(pickMode({ webgl2: false, heights: true }), "lola-2d");
  assert.equal(pickMode({ webgl2: false, heights: false }), "poster");
  const sites = [{ id: "a", lat: -89.5, lon: 0 }, { id: "b", lat: -85, lon: 90 }, { id: "c", lat: -85, lon: 270 }];
  const pos = posterLayout(sites, 1000, 600);
  for (const id of ["a", "b", "c"]) { const [x, y] = pos[id]; assert.ok(x >= 56 && x <= 944 && y >= 56 && y <= 544, id); }
  assert.ok(pos.b[0] > pos.a[0] && pos.c[0] < pos.a[0], "90°E right, 270°E left (grid north up)");
  assert.deepEqual(posterLayout(sites, 0, 0), {});
  assert.match(src, /import\("\.\/poster-fallback\.js"\)/, "poster-fallback.ts is the no-heights background");
  assert.match(src, /onUnavailable: \(\) =>/, "a failed LOLA load switches to the poster");
});

test("overlay bounds: stereographic metres only; unknown shapes are ignored", () => {
  assert.deepEqual(overlayBounds({ x0: -1, y0: -2, x1: 3, y1: 4 }), { x0: -1, y0: -2, x1: 3, y1: 4 });
  assert.equal(overlayBounds({ x0: 3, y0: 0, x1: 1, y1: 1 }), null);
  assert.equal(overlayBounds([1, 2, 3, 4]), null); assert.equal(overlayBounds(null), null);
});

test("controls: 44 px buttons with pt-BR/en labels; ships keep 44 px targets; one renderer", () => {
  for (const L of [TEXTS.pt, TEXTS.en]) for (const k of ["zin", "zout", "center", "ship", "map"]) assert.ok(L[k] && L[k].length > 3, k);
  assert.match(css, /\.pm-btn \{ width: 44px; height: 44px;/);
  assert.match(css, /\.mp-marker\.pm-ship \{ width: 44px; height: 44px;/);
  assert.match(SHIP_SVG, /^<svg class="pm-ship-ico"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(src, /new\s+\S*WebGLRenderer|from "\.\.\/vendor\/three/, "no second renderer or THREE import here: the relief engine owns the only one");
  assert.match(src, /setSites\(s: PolarSite\[\]\)/); assert.match(src, /setOverlay\(o: PolarOverlay \| null\)/);
  for (const k of ["zoomIn()", "zoomOut()", "center(id?: string)", "destroy()", "select(id: string"]) assert.ok(src.includes(k), k);
  assert.doesNotMatch(src + css, /validated/i);
});
