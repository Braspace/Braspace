import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foldOpen, foldSave, splitRules, RULES_SHOWN } from "../screens/cockpit-fold.js";
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
test("default state is collapsed (no storage, empty storage, throwing storage)", () => {
  assert.equal(foldOpen(null, "faults"), false);
  assert.equal(foldOpen(mem(), "faults"), false);
  assert.equal(foldOpen({ getItem() { throw new Error("blocked"); }, setItem() {} }, "faults"), false);
});
test("opened state is remembered per accordion for the session", () => {
  const s = mem(); foldSave(s, "crew", true);
  assert.equal(foldOpen(s, "crew"), true); assert.equal(foldOpen(s, "faults"), false);
  foldSave(s, "crew", false); assert.equal(foldOpen(s, "crew"), false);
  assert.doesNotThrow(() => foldSave({ getItem() { return null; }, setItem() { throw new Error("quota"); } }, "x", true));
});
test("rules: first 3 stay visible, the rest go behind +N", () => {
  const { head, more } = splitRules(["a", "b", "c", "d", "e", "f"]);
  assert.equal(RULES_SHOWN, 3); assert.deepEqual(head, ["a", "b", "c"]); assert.deepEqual(more, ["d", "e", "f"]);
});
test("cockpit builds the three secondary cards as closed-by-default accordions", () => {
  const src = readFileSync(new URL("../screens/cockpit.tsx", import.meta.url), "utf8");
  for (const id of ["sun-days", "faults"]) assert.match(src, new RegExp(`accordion\\("${id}"`));
  assert.match(src, /foldOpen\(foldStore, "crew"\)/); assert.match(src, /ck-crew ck-acc/);
  const css = readFileSync(new URL("../screens/cockpit.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width:420px\)\{\s*\.ck-crew-form\{grid-template-columns:minmax\(0,1fr\)\}/);
});
