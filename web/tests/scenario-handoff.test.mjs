import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEntryHash } from "../lab/data.js";

const sites = [{ id: "peak-near-shackleton" }, { id: "connecting-ridge" }];
const H = 3600e3, start = Date.parse("2025-01-01T00:00Z"), end = Date.parse("2028-12-31T23:00Z");

test("BR-02: lab reads site, UTC and window from the SPA hash", () => {
  const e = parseEntryHash("#site=connecting-ridge&t=2027-03-14T06%3A00%3A00Z&d=14", sites, start, end);
  assert.equal(e.siteId, "connecting-ridge");
  assert.equal(new Date(e.t).toISOString(), "2027-03-14T06:00:00.000Z");
  assert.equal(e.compareH, 336);
});
test("BR-02: unknown site and bad time keep defaults; out-of-coverage time is clamped", () => {
  assert.deepEqual(parseEntryHash("#site=nope&t=xx", sites, start, end), {});
  assert.equal(parseEntryHash("#t=2030-01-01T00:00Z", sites, start, end).t, end);
  assert.deepEqual(parseEntryHash("", sites, start, end), {});
});

test("BR-01: Explore→Compare keeps the originating site as A; explicit letters win", async () => {
  const { pickedSites } = await import("../shell/views/common.js");
  const data = { sites: ["mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton"].map(id => ({ id })) };
  const ids = q => pickedSites(data, q).map(s => s.id);
  assert.deepEqual(ids({ site: "connecting-ridge" }), ["connecting-ridge", "mons-mouton-im2", "malapert-massif"]);
  assert.deepEqual(ids({ site: "peak-near-shackleton" })[0], "peak-near-shackleton");
  assert.deepEqual(ids({ a: "nobile-rim-1", b: "malapert-massif", c: "mons-mouton-im2", site: "connecting-ridge" }), ["nobile-rim-1", "malapert-massif", "mons-mouton-im2"]);
  assert.deepEqual(ids({ b: "mons-mouton-im2" }), ["malapert-massif", "mons-mouton-im2", "nobile-rim-1"]);
  assert.deepEqual(ids({}), ["mons-mouton-im2", "malapert-massif", "nobile-rim-1"]);
});
