import test from "node:test";
import assert from "node:assert/strict";
import { readCollapsed, writeCollapsed, toggled, storageKey } from "../core/panels.js";

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("toggle flips one panel and never mutates the input", () => {
  const a = {}; const b = toggled(a, "left"); assert.deepEqual(a, {}); assert.deepEqual(b, { left: true });
  assert.deepEqual(toggled(b, "left"), {}); assert.deepEqual(toggled(b, "right"), { left: true, right: true });
});
test("state persists per screen and survives garbage or a throwing storage", () => {
  const s = mem(); writeCollapsed(s, storageKey("cockpit"), { left: true });
  assert.deepEqual(readCollapsed(s, storageKey("cockpit")), { left: true });
  assert.deepEqual(readCollapsed(s, storageKey("compare")), {});
  s.setItem("k", "[1]"); assert.deepEqual(readCollapsed(s, "k"), {});
  s.setItem("k", "{oops"); assert.deepEqual(readCollapsed(s, "k"), {});
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readCollapsed(bad, "k"), {}); assert.doesNotThrow(() => writeCollapsed(bad, "k", { a: true }));
  assert.deepEqual(readCollapsed(null, "k"), {});
});
