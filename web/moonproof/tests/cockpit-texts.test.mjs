import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEXTS as CK } from "../screens/cockpit-texts.js";
import { TEXTS as EV } from "../screens/evidence-texts.js";
test("en and pt-BR carry the same keys, none empty", () => {
  for (const T of [CK, EV]) { assert.deepEqual(Object.keys(T.en).sort(), Object.keys(T["pt-BR"]).sort());
    for (const l of ["en", "pt-BR"]) for (const [k, v] of Object.entries(T[l])) assert.ok(v && v.length, k); }
});
test("texts of the sheet come from docs/design/i18n-rotulos.json when the file is there", async () => {
  let dict; try { dict = JSON.parse(await readFile(new URL("../../../docs/design/i18n-rotulos.json", import.meta.url), "utf8")); } catch { return; }
  for (const T of [CK, EV]) for (const [k, v] of Object.entries(dict)) if (k in T.en && /^(cockpit|evidence)\./.test(k) && dict[k]) { assert.equal(T.en[k], v.en, k); assert.equal(T["pt-BR"][k], v["pt-BR"], k); }
});
