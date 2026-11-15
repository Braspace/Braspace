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

