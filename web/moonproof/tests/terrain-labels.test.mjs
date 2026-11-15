// IAU/USGS names on the terrain (core/terrain.js): placement and the projection they use.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { placeLabels } from "../core/terrain.js";
import { southStereoForward } from "../../lab/coords.js";

const rect = (x, y, w, h) => ({ left: x - w / 2, top: y - h / 2, width: w, height: h });
const lab = (name, x, y) => ({ name, x, y, w: 60, h: 16 });

test("placeLabels: free spot keeps the anchor, a collision moves the label, a full block drops it", () => {
  assert.deepEqual(placeLabels([lab("a", 100, 100)]).map(p => [p.x, p.y]), [[100, 100]]);
  const two = placeLabels([lab("a", 100, 100), lab("b", 105, 100)]);
  assert.equal(two.length, 2);
  assert.notDeepEqual([two[1].x, two[1].y], [105, 100], "second label must move off the first");
  const hitsFirst = (p, q) => Math.abs(p.x - q.x) * 2 < p.w + q.w && Math.abs(p.y - q.y) * 2 < p.h + q.h;
  assert.ok(!hitsFirst(two[0], two[1]), "placed labels never overlap");
  assert.equal(placeLabels([lab("a", 100, 100)], [rect(100, 100, 400, 400)]).length, 0, "label under a panel is dropped");
});

test("placeLabels: a blocked rect (panel, marker) pushes the label to a free side, never under it", () => {
  const panel = rect(100, 100, 60, 16);
  const out = placeLabels([lab("a", 100, 100)], [panel]);
  assert.equal(out.length, 1);
  assert.ok(!(Math.abs(out[0].x - 100) * 2 < 120 && Math.abs(out[0].y - 100) * 2 < 32));
});

test("labels use the sites' own stereographic transform (lat/lon -> metres)", async () => {
  const sites = JSON.parse(await readFile(new URL("../../data/sites.json", import.meta.url), "utf8")).sites;
  for (const s of sites) {
    const [x, y] = southStereoForward(s.lat, s.lon);
    assert.ok(Math.hypot(x - s.stereo_x_m, y - s.stereo_y_m) < 1, `${s.id} stereo drifts`);
  }
  // Same crater in the older sites.json "features" and in the IAU file: Shackleton agrees to the metre.
  const feats = JSON.parse(await readFile(new URL("../data/features.json", import.meta.url), "utf8")).features;
  const old = JSON.parse(await readFile(new URL("../../data/sites.json", import.meta.url), "utf8")).features.find(f => f.name.startsWith("Shackleton"));
  const sh = feats.find(f => f.name === "Shackleton"), [x, y] = southStereoForward(sh.lat, sh.lon_e);
  assert.ok(Math.hypot(x - old.stereo_x_m, y - old.stereo_y_m) < 1);
});

test("terrain.js draws names from features.json as DOM text, not canvas, and no longer reads sites.json features", async () => {
  const js = await readFile(new URL("../core/terrain.ts", import.meta.url), "utf8");
  assert.match(js, /data\/features\.json/); assert.match(js, /mp-terrain-labels/); assert.match(js, /mp-feature/);
  assert.doesNotMatch(js, /fillText/); assert.doesNotMatch(js, /loadSites/);
  assert.match(js, /southStereoForward/, "one projection: the sites' transform from lab/coords.js");
  const css = await readFile(new URL("../core/components.css", import.meta.url), "utf8");
  assert.match(css, /\.mp-terrain-labels\{[^}]*pointer-events:none/); assert.match(css, /\.mp-feature\{/);
});
