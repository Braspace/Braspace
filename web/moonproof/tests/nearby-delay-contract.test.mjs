// P0-01: API nearby alternatives must share the actual delayed UTC window.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nearbyAtDelay } from "../screens/scenario-data.js";

const baseline = "2026-12-01T00:00:00Z";
const delayed = "2026-12-03T00:00:00Z";
const option = (kind, delay, start, site = "nobile-rim-2") => ({
  kind, delay_hours: delay, start_utc: start, site_id: site,
  distance_km: 74.4, data_status: "AVAILABLE", admissible: true,
  science_status: "SYNTHETIC",
});

test("only API neighbors at the selected delay AND UTC start are shown", () => {
  const opts = [
    option("nearby_site", 0, baseline, "baseline-only"),
    option("nearby_site", 48, baseline, "wrong-start"),
    option("nearby_site", 24, "2026-12-02T00:00:00Z", "wrong-delay"),
    option("delay", 48, delayed, "base-site"),
    option("nearby_site", 48, delayed),
  ];
  const got = nearbyAtDelay(opts, baseline, 48);
  assert.equal(got.length, 1);
  assert.equal(got[0].siteId, "nobile-rim-2");
  assert.equal(got[0].admissible, true);
  assert.equal(got[0].status, "SYNTHETIC");
  assert.deepEqual(nearbyAtDelay(opts, "not-a-date", 48), []);
});

test("missing or invalid API timestamps never masquerade as valid nearby decisions", () => {
  const opts = [
    option("nearby_site", 48, undefined),
    option("nearby_site", 48, "invalid"),
    option("nearby_site", 48, delayed, "unavailable"),
  ];
  opts[2].data_status = "OUTSIDE_COVERAGE";
  opts[2].admissible = false;
  const got = nearbyAtDelay(opts, baseline, 48);
  assert.equal(got.length, 1);
  assert.equal(got[0].admissible, null);
  assert.equal(got[0].available, false);
});

test("MoonProof explicitly requests one nearby delay and does not treat a stale backend as delayed", async () => {
  const ts = await readFile(new URL("../screens/scenario-data.ts", import.meta.url), "utf8");
  assert.match(ts, /nearby_delay_hours:\s*delayH/);
  assert.match(ts, /nearbyAtDelay\(opts, startIso, delayH\)/);
});

test("an older API that rejects nearby_delay_hours (400) is retried without it, not shown as offline", async () => {
  for (const p of ["../screens/scenario-data.ts", "../screens/scenario-data.js"]) {
    const src = await readFile(new URL(p, import.meta.url), "utf8");
    assert.match(src, /r\.error === "HTTP 400"/);
    assert.match(src, /nearby_delay_hours: _omit, \.\.\.legacy/);
    assert.match(src, /body: legacy/);
  }
});
