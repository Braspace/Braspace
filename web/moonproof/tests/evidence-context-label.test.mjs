// The Evidence screen replaces the "<days> dias" slot of the context bar with the plan version. It must target the
// text slot (.mp-ctx-text), not a positional child of .mp-context, whose 5th child is the primary action pill
// ("Baixar JSON"): that pill showed the version string instead of its label.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const js = await readFile(new URL("../screens/evidence.tsx", import.meta.url), "utf8");

test("evidence.js does not overwrite a positional child of the context bar", () => {
  assert.doesNotMatch(js, /ctxEl\.childNodes\[\d+\]\.textContent/);
});
test("evidence.js writes the version into the .mp-ctx-text slot", () => {
  assert.match(js, /\.mp-ctx-text/);
  assert.match(js, /ctxText\.lastChild\.textContent = t\("evidence\.version"/);
});
