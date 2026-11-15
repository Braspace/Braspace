// Joel Moon HD relief under every MoonProof map (core/terrain): same stereographic projection as the
// 2D markers, illustrative light without cast shadows, on-demand drawing and a 2D fallback.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const scene = read("../moon-hd/scene.ts"), relief = read("../moon-hd/stereo-relief.ts"), terrain = read("../moonproof/core/terrain.ts");

test("stereo cap vertex lands on the same pixel as core/terrain toPx", () => {
  assert.match(scene, /gl_Position = vec4\(\(vSt - stereoView\.xy\) \/ stereoView\.zw, 0\.0, 1\.0\)/);
  assert.match(relief, /stereoView\.value\.set\(sx, sy, W \* mpp \/ 2, H \* mpp \/ 2\)/);
  // core/terrain: toPx = [W/2 + (x - sx)/mpp, H/2 - (y - sy)/mpp]; NDC -> CSS px with y down.
  for (const [sx, sy, W, H, mpp, x, y] of [[0, 0, 1440, 900, 120, 15000, -8000], [-42000, 61000, 390, 844, 55.5, -40500, 60000], [9e4, -3e4, 1280, 800, 400, 1.2e5, -1e4]]) {
    const ndc = [(x - sx) / (W * mpp / 2), (y - sy) / (H * mpp / 2)];
    const px = [(ndc[0] + 1) / 2 * W, (1 - ndc[1]) / 2 * H];
    assert.ok(Math.abs(px[0] - (W / 2 + (x - sx) / mpp)) < 1e-9 && Math.abs(px[1] - (H / 2 - (y - sy) / mpp)) < 1e-9);
  }
});

test("map relief has no cast shadows and no animation loop; hardware WebGL only", () => {
  assert.match(relief, /moon\.shared\.realLight\.value = 0;/);
  assert.match(relief, /moon\.shared\.relief\.value = 2\.2;/);
  assert.match(relief, /probeWebGL\(/);
  assert.doesNotMatch(relief, /requestAnimationFrame|setAnimationLoop/);
  assert.match(relief, /webglcontextlost[\s\S]*onLost\(\)/);
});

test("core/terrain keeps the LOLA 400 m hillshade as fallback and honours ?relief=2d", () => {
  assert.match(terrain, /const RELIEF_2D = [^\n]*get\("relief"\) === "2d"/);
  assert.match(terrain, /if \(hd\) \{ hd\.draw\(sx, sy, W, H, mpp\); g\.clearRect\(0, 0, w, h\); \}/);
  assert.match(terrain, /renderRelief\(grid, w, h/);
  assert.match(terrain, /container\.dataset\.relief = "lola-2d"/);
});

