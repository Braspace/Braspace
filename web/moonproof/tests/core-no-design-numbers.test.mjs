// Design numbers are illustrative ("Números ilustrativos") and must never reach the code.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const FORBIDDEN = ["1.832", "1,832", "a41c9e2", "SR-01", "SR-02", "SR-03", "SR-04", "SR-05", "20 m/px", "71%", "46 h", "+14 h", "moonproof.app", "Bateria H1", "battery H1"];
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) { if (!["tests", "designer"].includes(e.name)) out.push(...await walk(p)); }
    else if (/\.(js|html|css|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
test("no illustrative design number in web/moonproof code", async () => {
  const files = await walk(new URL("../", import.meta.url));
  assert.ok(files.length >= 10, "expected the core files");
  for (const f of files) {
    const s = await readFile(f, "utf8");
    for (const n of FORBIDDEN) assert.ok(!s.includes(n), `${f.pathname.split("/moonproof/")[1]} contains "${n}"`);
  }
});
