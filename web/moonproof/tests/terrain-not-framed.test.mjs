// A page opened hidden or at zero size never frames the map, so core/terrain.js has no scale (metres per px = 0).
// Before this guard the Mission screen wrote x1="-Infinity" into its Sun/Earth lines (12 SVG errors per redraw).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL(p, import.meta.url), "utf8");

test("the projection of an unframed map is not finite, which is why callers must ask terrain.ready", () => {
  // The same expression as toPx() in core/terrain.js with its initial state (all zeros).
  const lastW = 0, lastH = 0, lastSx = 0, lastSy = 0, lastMpp = 0;
  const toPx = (x, y) => [lastW / 2 + (x - lastSx) / lastMpp, lastH / 2 - (y - lastSy) / lastMpp];
  assert.ok(toPx(-12000, 9000).every(v => !Number.isFinite(v)));
  const terrain = read("../core/terrain.ts");
  assert.match(terrain, /let lastMpp = 0, lastSx = 0, lastSy = 0, lastW = 0, lastH = 0;/);
  assert.match(terrain, /if \(!W \|\| !H\) return;/, "draw() leaves the scale at zero for a zero-size container");
  assert.match(terrain, /get ready\(\) \{ return lastMpp > 0; \}/);
});

test("Mission draws no Sun/Earth rays and Explore no layer or pin until the map is framed", () => {
  const mission = read("../screens/mission.tsx"), explore = read("../screens/explore.tsx");
  assert.match(mission, /if \(!cur \|\| !terrain\.ready\) \{ for \(const id of \["ray-sun", "ray-earth"\]\) \$\(id\)\.hidden = true; return; \}/);
  assert.ok(mission.indexOf("!terrain.ready") < mission.indexOf("terrain.toPx(s.stereo_x_m"), "the check comes before the projection is used");
  assert.match(explore, /if \(!terrain\.ready\) \{ pin\.hidden = true; return; \}/);
  assert.ok(explore.indexOf("!terrain.ready") < explore.indexOf("terrain.toPx(grid.x0"));
  // Every other screen that places things with the map's projection must do the same.
  for (const name of ["compare", "recover", "cockpit", "landing", "debrief", "evidence", "plan", "present", "activity"]) {
    const src = read(`../screens/${name}.js`);
    assert.ok(!/terrain\.(toPx|fromPx)\(/.test(src) || src.includes("terrain.ready"), name + ".js uses the projection without checking terrain.ready");
  }
});
