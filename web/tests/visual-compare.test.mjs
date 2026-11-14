import test from "node:test";
import assert from "node:assert/strict";
import {compareImages, iou, encodePng, decodePng, panelBox} from "../../scripts/visual-compare.mjs";
const img = (fn) => { const data = Buffer.alloc(1440 * 900 * 4); for (let y = 0; y < 900; y++) for (let x = 0; x < 1440; x++) { const v = fn(x, y), o = (y * 1440 + x) * 4; data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255; } return {w: 1440, h: 900, data}; };
const panels = img((x, y) => (x > 28 && x < 358 && y > 150 && y < 757) || (x > 1071 && x < 1411 && y > 150 && y < 757) ? 8 : 120);
test("identical image scores 100 in every region", () => {
  const r = compareImages(panels, panels);
  assert.equal(r.score, 100); for (const v of Object.values(r.regions)) assert.equal(v.score, 100);
});
test("a different screen scores clearly lower", () => {
  assert.ok(compareImages(img(() => 200), panels).score < 50);
});
test("panel box and IoU by threshold", () => {
  const b = panelBox(panels, {x: 0, y: 142, w: 380, h: 638});
  assert.ok(b && Math.abs(b.x - 29) <= 1 && Math.abs(b.w - 329) <= 2);
  assert.equal(iou(b, b), 1); assert.equal(iou(b, null), 0);
});
test("PNG codec round trip", () => {
  const back = decodePng(encodePng(panels)); assert.deepEqual(back.data, panels.data);
});
