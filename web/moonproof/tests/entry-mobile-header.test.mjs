import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("entry header fits 320px without shrinking Skip below a 44px touch target", async () => {
  const css = await read("../screens/entry.css");
  assert.match(css, /@media\s*\(max-width:480px\)/);
  assert.match(css, /\.mp-entry-top\{gap:8px\}/);
  assert.match(css, /\.mp-entry-top \.mp-brand\{font-size:16px;min-width:0\}/);
  assert.match(css, /\.mp-entry-actions\{gap:5px;min-width:0\}/);
  assert.match(css, /\.mp-entry-actions #lang\{padding-inline:8px\}/);
  assert.match(css, /\.mp-entry-skip\{min-width:44px;justify-content:center;padding-inline:0\}/);
});

test("shared entry stylesheet and 320px overflow browser gate remain connected", async () => {
  const [tasks, home, matrix, cases] = await Promise.all([
    read("../tasks.html"),
    read("../index.html"),
    read("../../browser/route-matrix.mjs"),
    read("../../browser/route-matrix-config.mjs"),
  ]);
  assert.match(tasks, /href="screens\/entry\.css"/);
  if (home.includes('src="screens/entry.js"'))
    assert.match(home, /href="screens\/entry\.css"/);
  assert.match(matrix, /r\.overflow>1/);
  assert.match(cases, /width:320/);
  assert.match(cases, /tasks:/);
});
