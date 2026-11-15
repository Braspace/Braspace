// 2D map: colliding site names become "quiet" (hover/focus), the selected one always stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quietSiteLabels } from "../core/terrain.js";

const rect = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
function marker(id, x, y, { pressed = false, labelW = 80 } = {}) {
  const cls = new Set(), label = { getBoundingClientRect: () => rect(x - labelW / 2, y + 30, labelW, 20) };
  return { dataset: { site: id }, classList: { add: c => cls.add(c), remove: c => cls.delete(c), has: c => cls.has(c) },
    getAttribute: k => (k === "aria-pressed" ? String(pressed) : null), getBoundingClientRect: () => rect(x - 22, y - 22, 44, 44),
    querySelector: () => label, cls };
}
const layer = ms => ({ querySelectorAll: () => ms });

test("far apart: every name shown", () => {
  const ms = [marker("a", 100, 100), marker("b", 400, 100)];
  assert.deepEqual(quietSiteLabels(layer(ms)), []);
});
test("overlapping names: the selected keeps its name, the other goes quiet", () => {
  const ms = [marker("a", 100, 100), marker("b", 130, 100, { pressed: true })];
  assert.deepEqual(quietSiteLabels(layer(ms)), ["a"]);
  assert.equal(ms[0].cls.has("is-quiet"), true); assert.equal(ms[1].cls.has("is-quiet"), false);
});
test("a name covering another marker goes quiet; re-running clears stale state", () => {
  const ms = [marker("a", 100, 100), marker("b", 100, 140)];
  assert.deepEqual(quietSiteLabels(layer(ms)), ["a"]);
  ms[1] = marker("b", 600, 600);
  assert.deepEqual(quietSiteLabels(layer(ms)), []);
  assert.equal(ms[0].cls.has("is-quiet"), false);
});
