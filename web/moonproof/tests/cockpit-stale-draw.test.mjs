import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const file of ["cockpit.tsx", "cockpit.js"]) {
  test(`${file}: stale draw completions cannot overwrite newer UI status`, () => {
    const source = readFileSync(new URL("../screens/" + file, import.meta.url), "utf8");
    const start = source.indexOf("function draw(");
    const end = source.indexOf("async function drawNow()", start);
    assert.ok(start >= 0 && end > start, "draw boundary must exist");
    const draw = source.slice(start, end);
    assert.match(source.slice(Math.max(0, start - 100), start), /let drawRevision = 0;/);
    assert.match(draw, /const revision = \+\+drawRevision;/);
    assert.match(draw, /if \(revision === drawRevision\)[\s\S]*?\.mp-ck-loaderr/);
    const stale = draw.indexOf("if (revision !== drawRevision)");
    const reset = draw.indexOf('S.siteKey = ""');
    assert.ok(stale >= 0 && reset > stale, "reject obsolete failures before resetting cache key");
    assert.match(draw, /note\.dataset\.error/);
  });
}
