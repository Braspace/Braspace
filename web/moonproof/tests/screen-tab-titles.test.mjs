import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("Class Kit owns its localized tab title after the shared Compare nav renders", async () => {
  const [ts, js, html] = await Promise.all([
    read("../screens/activity.tsx"),
    read("../screens/activity.js"),
    read("../activity.html"),
  ]);
  for (const source of [ts, js]) {
    assert.match(source, /mountShell\(\{ screen: "compare", context: null, onLang: draw \}\)/);
    assert.match(source, /function draw\(\) \{[\s\S]*?document\.title = "MoonProof · " \+ t\("act\.kit"\)/);
    assert.match(source, /"act\.kit": "Class Kit"/);
    assert.match(source, /"act\.kit": "Kit Aula"/);
  }
  assert.match(html, /<title>MoonProof · Kit Aula · Montar atividade<\/title>/);
});

test("Rules owns its localized tab title after the shared Evidence nav renders", async () => {
  const [ts, js, html] = await Promise.all([
    read("../screens/rules.tsx"),
    read("../screens/rules.js"),
    read("../rules.html"),
  ]);
  for (const source of [ts, js]) {
    assert.match(source, /mountShell\(\{ screen: "evidence", onLang: draw \}\)/);
    assert.match(source, /function draw\(\) \{[\s\S]*?document\.title = "MoonProof · " \+ t\("rules\.tabTitle"\)/);
    assert.match(source, /"rules\.tabTitle": "Rules"/);
    assert.match(source, /"rules\.tabTitle": "Regras"/);
  }
  assert.match(html, /<title>MoonProof · Regras<\/title>/);
});
