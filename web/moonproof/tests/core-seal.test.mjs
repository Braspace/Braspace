// The seal VAL may only come from an origin that says exactly VALIDATED.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sealFor, sourced, SEALS } from "../core/data.js";

test("VAL only for VALIDATED", () => {
  assert.equal(sealFor("VALIDATED"), "VAL");
  for (const s of ["PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", "PRELIMINARY not NASA-reviewed", "NOT_VALIDATED", "validated?",
    "UNVERIFIED_INPUTS", "SYNTHETIC", "NO_SERIES_DATA", "", null, undefined, "VALIDATED_LATER", "ERROR"])
    assert.notEqual(sealFor(s), "VAL", String(s));
});
test("known states map to their seals", () => {
  assert.equal(sealFor("PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"), "PRE");
  assert.equal(sealFor("SYNTHETIC"), "SIM");
  assert.equal(sealFor("UNVERIFIED_INPUTS"), "EST");
  assert.equal(sealFor("NO_SERIES_DATA"), "N/D");
  assert.equal(sealFor("ERROR"), "FALHA");
  for (const s of ["X", "PRELIMINARY", "SYNTHETIC", "UNVERIFIED_INPUTS", "ERROR"]) assert.ok(SEALS.includes(sealFor(s)));
});
test("missing value is N/D, never 0 and never VAL", () => {
  for (const v of [null, undefined, NaN, Infinity]) {
    const x = sourced(v, { status: "VALIDATED" });
    assert.equal(x.value, null); assert.equal(x.seal, "N/D");
  }
  assert.equal(sourced(0, { status: "VALIDATED" }).seal, "VAL");
});
test("the layer card takes its seal from sealFor(status) only", async () => {
  const src = await readFile(new URL("../core/layers.ts", import.meta.url), "utf8");
  assert.match(src, /sealEl\(sealFor\(status\)\)/);
  assert.doesNotMatch(src, /["']VAL["']/, "layers.ts must not hard-code VAL");
});
test("no screen or page hard-codes the VAL seal or the word validated", async () => {
  const { readdir } = await import("node:fs/promises");
  const root = new URL("../", import.meta.url);
  for (const dir of ["screens/", ""]) {
    for (const f of await readdir(new URL(dir, root))) {
      if (!/\.(js|html)$/.test(f)) continue;
      const s = await readFile(new URL(dir + f, root), "utf8");
      assert.doesNotMatch(s, /["'>]VAL["'<]|\bvalidated\b/i, dir + f);
    }
  }
});
