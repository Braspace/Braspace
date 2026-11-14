import test from "node:test";
import assert from "node:assert/strict";
import { dict, register, setLang, t, pickLang } from "../core/i18n.js";

test("en and pt-BR have the same keys", () => {
  const a = Object.keys(dict.en).sort(), b = Object.keys(dict["pt-BR"]).sort();
  assert.deepEqual(a, b);
  for (const k of a) { assert.ok(dict.en[k].length, "empty en " + k); assert.ok(dict["pt-BR"][k].length, "empty pt-BR " + k); }
});
test("placeholders match between languages", () => {
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(dict.en)) assert.equal(ph(dict.en[k]), ph(dict["pt-BR"][k]), k);
});
test("register refuses mismatched dictionaries", () => {
  assert.throws(() => register({ en: { "x.a": "A" }, "pt-BR": {} }));
  register({ en: { "x.b": "B {n}" }, "pt-BR": { "x.b": "Bê {n}" } });
  setLang("pt-BR"); assert.equal(t("x.b", { n: 2 }), "Bê 2"); setLang("en"); assert.equal(t("x.b", { n: 2 }), "B 2");
});
test("language: query wins, then browser", () => {
  assert.equal(pickLang("pt-BR", ["en"]), "pt-BR");
  assert.equal(pickLang(null, ["pt-PT"]), "pt-BR");
  assert.equal(pickLang(null, ["de"]), "en");
});
