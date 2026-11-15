// Kit screens (plan, present, activity) must not use a CSS variable that neither core/ defines nor the rule falls back on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dir = new URL("../", import.meta.url);
const read = f => readFile(new URL(f, dir), "utf8");
const core = (await read("core/tokens.css")) + (await read("core/components.css"));
const defined = new Set([...core.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));

for (const f of ["plan", "present", "activity"]) test(`${f}.css: every var() is defined in core or has a fallback`, async () => {
  const css = await read(`screens/${f}.css`);
  const local = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const bad = [...css.matchAll(/var\((--[a-z0-9-]+)\s*([,)])/g)].filter(m => m[2] === ")" && !defined.has(m[1]) && !local.has(m[1])).map(m => m[1]);
  assert.deepEqual([...new Set(bad)], [], `${f}.css uses undefined variables without fallback`);
});
