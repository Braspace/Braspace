import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const entry = await read("../screens/entry.js");
const entrySource = await read("../screens/entry.tsx");
const shell = await read("../core/shell.js");
const shellSource = await read("../core/shell.ts");
const compare = await read("../screens/compare.js");
const compareSource = await read("../screens/compare.tsx");
const css = await read("../screens/scenario.css");
const landing = await read("../screens/landing.js");
const landingSource = await read("../screens/landing.tsx");

test("entry routes each task to a distinct existing module in source and build", () => {
  for (const source of [entry, entrySource]) {
    assert.match(source, /explore: "explore\.html", class: "activity\.html", plan: "plan\.html"/);
    assert.match(source, /hrefTo\(TASK_PAGES\[task\]/);
    assert.doesNotMatch(source, /hrefTo\("mission\.html", \{ \.\.\.st, task/);
    assert.match(source, /entry\.destination\./);
    assert.match(source, /hrefTo\("explore\.html"\)/);
  }
});
test("global class/plan mode toggles and top-level layer switch are absent", () => {
  for (const source of [shell, shellSource]) {
    assert.doesNotMatch(source, /const lab = document\.createElement\("label"\)/);
    assert.doesNotMatch(source, /setState\(\{ task: st\.task === "class"/);
    assert.match(source, /st\.task === "plan"/);
    assert.match(source, /ctx\.replaceChildren\(\.\.\.parts, seal, net\)/);
  }
});
test("Compare honours selected site and only uses jade when rules pass", () => {
  for (const source of [compare, compareSource]) {
    assert.match(source, /const selectedSite = getState\(\)\.site/);
    assert.match(source, /const first = selectedSite && ids\.includes\(selectedSite\)/);
    assert.match(source, /judged\[sel\]\.status === "pass"/);
    assert.match(source, /is-eligible/);
    assert.match(source, /cmp\.viewFailures/);
  }
  assert.match(css, /\.mp-scn\[aria-checked="true"\]:not\(\.is-eligible\)/);
});
test("Landing Lab returns only to recognised same-origin screen", () => {
  for (const source of [landing, landingSource]) {
    assert.match(source, /u\.origin === location\.origin/);
    assert.match(source, /back\.href = returnHref\(\)/);
    assert.match(source, /const fallback = hrefTo\("compare\.html"\)/);
  }
});
