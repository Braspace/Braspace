import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("cockpit rejects absent metrics before reading series; no synthetic fallback", () => {
  const source = readFileSync(new URL("../screens/cockpit.tsx", import.meta.url), "utf8");
  const guard = source.indexOf('if (!m || !m.series) throw new Error("MoonProof: stored series metrics unavailable");');
  const access = source.indexOf("const series = m.series, i0 =");
  assert.ok(guard >= 0, "explicit fail-closed contract guard required");
  assert.ok(access > guard, "guard must precede series dereference");
  assert.match(source, /if \(!current\(\)\) return false;\s*\/\/ Fail explicitly/);
});
