// Rules page (V3 Camadas): integrity of rules.html / screens/rules.tsx, the source of rules.js (rules of core/README.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");

test("rules.html loads the shell screen module and the core styles", async () => {
  const h = await read("rules.html");
  assert.match(h, /src="screens\/rules\.js"/); assert.match(h, /core\/tokens\.css/); assert.match(h, /core\/components\.css/);
});
test("en and pt-BR carry the same rules.* keys (register would throw otherwise)", async () => {
  const js = await read("screens/rules.tsx");
  const keys = lang => [...(js.match(new RegExp(`${lang === "en" ? "en" : '"pt-BR"'}: \\{([\\s\\S]*?)\\n  \\}`))?.[1] ?? "").matchAll(/"(rules\.[\w.]+)":/g)].map(m => m[1]).sort();
  const en = keys("en"), pt = keys("pt-BR");
  assert.ok(en.length > 40); assert.deepEqual(en, pt);
});
test("seals only through the core; no hard-coded VAL, no design numbers", async () => {
  const js = await read("screens/rules.tsx"), css = await read("screens/rules.css");
  assert.doesNotMatch(js, /["'>]VAL["'<]|validated/i, "no hard-coded VAL seal");
  assert.match(js, /createLayerCard\(/); assert.match(js, /longestDarkH/);
  for (const n of ["46 h", "14 h", "71%", "a41c9e2", "1.832", "SR-0", "20 m/px"]) assert.ok(!js.includes(n) && !css.includes(n), n);
  assert.match(js, /\.night/, "limit comes from the editable state, labelled assumed");
});
test("kit and task links carry the scenario and the task opens its own layer", async () => {
  const js = await read("screens/rules.tsx");
  for (const p of ["present.html", "activity.html", "plan.html", "mission.html"]) assert.ok(js.includes(p), p);
  assert.match(js, /layer: TASKS\[/);
});
