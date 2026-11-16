import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const file of ["cockpit.tsx", "cockpit.js"]) {
  test(`${file}: missing or null metrics fail before dereferencing the series`, () => {
    const source = readFileSync(new URL("../screens/" + file, import.meta.url), "utf8");
    const start = source.indexOf("async function compute()");
    assert.ok(start >= 0, "cockpit compute entrypoint must exist");
    const compute = source.slice(start);
    const guard = /if\s*\(!m\s*\|\|\s*!m\.series\)\s*throw new Error\("MoonProof: stored series metrics unavailable"\);/m.exec(compute);
    const access = compute.indexOf("const series = m.series, i0 =");
    assert.ok(guard, "explicit fail-closed contract guard must appear in runtime and source");
    assert.ok(access > guard.index, "guard must precede series dereference");
    const revision = compute.indexOf("if (!current())");
    assert.ok(revision >= 0 && revision < guard.index, "stale async computations must abort first");
  });
}
