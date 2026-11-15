// Kit screens: one h1 per page and the language comes from ?lang= / the browser, not a hardcoded <html lang>.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dir = new URL("../", import.meta.url);
const read = f => readFile(new URL(f, dir), "utf8");

test("plan.html has a (screen-reader) h1 that plan.js translates", async () => {
  assert.match(await read("plan.html"), /<h1 class="sr-only" id="plan-h1">/);
  const js = await read("screens/plan.tsx");
  assert.match(js, /getElementById\("plan-h1"\)\.textContent = t\("plan\.h1"\)/);
});

test("present.js picks the language itself (no shell on this page)", async () => {
  assert.match(await read("screens/present.js"), /setLang\(pickLang\(getState\(\)\.lang\)\)/);
});
