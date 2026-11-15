// P0 handoffs: Explorar -> Comparar keeps the selected site; shell -> Polar Lab keeps site and time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickedSites } from "../shell/views/common.js";
import { scenarioFromHash } from "../lab/data.js";

const sites = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url))).sites;
const ids = sites.map(s => s.id);
const data = { sites };

test("every catalog site entering Comparar via ?site= is slot A, with no duplicates", () => {
  for (const id of ids) {
    const got = pickedSites(data, { site: id }).map(s => s.id);
    assert.equal(got[0], id);
    assert.equal(got.length, Math.min(3, ids.length));
    assert.equal(new Set(got).size, got.length);
  }
});
test("explicit ?a=&b=&c= still win; unknown ?site= falls back to the catalog order", () => {
  assert.deepEqual(pickedSites(data, { a: ids[4], b: ids[3], c: ids[2], site: ids[0] }).map(s => s.id), [ids[4], ids[3], ids[2]]);
  assert.deepEqual(pickedSites(data, { site: "nope" }).map(s => s.id), ids.slice(0, 3));
  assert.deepEqual(pickedSites(data, { b: ids[0] }).map(s => s.id), [ids[1], ids[0], ids[2]]);
});
test("lab reads site and time from the hash, and names what it rejects", () => {
  const start = Date.parse("2025-01-01T00:00Z"), end = Date.parse("2028-12-31T23:00Z");
  const ok = scenarioFromHash("#site=" + ids[1] + "&t=2027-01-12T06:00", ids, start, end);
  assert.equal(ok.siteId, ids[1]);
  assert.equal(ok.t, Date.parse("2027-01-12T06:00Z"));
  assert.deepEqual(ok.rejected, []);
  const bad = scenarioFromHash("#site=nope&t=1990-01-01", ids, start, end);
  assert.equal(bad.siteId, null); assert.equal(bad.t, null);
  assert.deepEqual(bad.rejected, ["site nope", "time 1990-01-01"]);
  assert.deepEqual(scenarioFromHash("", ids, start, end), { siteId: null, t: null, rejected: [] });
});
test("shell Terreno 3D route forwards t and d to the lab", () => {
  const app = readFileSync(new URL("../shell/app.js", import.meta.url), "utf8");
  assert.match(app, /lab\.html" \+ labHash\(ctx\.query\)/);
  assert.match(app, /p\.set\("t", q\.t\)/);
});
