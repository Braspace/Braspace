// FE-07: Polar Lab durations must be finite, positive, supported and covered by the series.
import test from "node:test";
import assert from "node:assert/strict";
import { SiteSeries, HOUR_MS, parseEntryHash } from "../lab/data.js";

const n = 24 * 400; // 400 days, covers 365 d
const ones = Float32Array.from({ length: n }, () => 1), z = new Float32Array(n);
const meta = { series: { start_utc: "2026-01-01T00:00:00Z", count: n }, terrain_horizon: [{ az: 0, el: 0 }, { az: 180, el: 0 }] };
const s = new SiteSeries(meta, { sunAz: z, sunEl: ones, earthAz: z, earthEl: ones });
const T0 = Date.parse("2026-01-01T00:00:00Z");
const sites = [{ id: "a" }];
const start = T0, end = T0 + (n - 1) * HOUR_MS;
const hash = d => parseEntryHash(`#site=a&d=${d}`, sites, start, end);

test("window: invalid hour counts are rejected, never a percentage above 100", () => {
  for (const h of [0.001, 0, -1, NaN, Infinity, 1.5]) {
    const w = s.window(T0, h);
    assert.equal(w.status, "INVALID_DURATION", `h=${h}`);
    assert.ok(w.reason && !("sunPct" in w));
  }
});

test("window: valid durations stay within 0..100", () => {
  for (const d of [2, 7, 14, 28, 56, 365]) {
    const w = s.window(T0, d * 24);
    assert.equal(w.status, "COMPUTED"); assert.equal(w.sunPct, 100); assert.equal(w.bothPct, 100);
  }
});

test("window: beyond the series coverage is NOT_COMPUTED", () => {
  assert.equal(s.window(T0, n + 1).status, "NOT_COMPUTED");
});

test("hash d: junk durations keep the default and report why", () => {
  for (const d of ["0.001", "0", "-1", "NaN", "Infinity", "-Infinity", "3", "abc"]) {
    const e = hash(d);
    assert.equal(e.compareH, undefined, `d=${d}`);
    assert.equal(e.durationNotice.kind, "invalid", `d=${d}`);
  }
});

test("hash d: 56 is accepted (covered) and 365 as well", () => {
  assert.equal(hash("56").compareH, 56 * 24); assert.equal(hash("56").durationNotice, undefined);
  assert.equal(hash("365").compareH, 365 * 24);
});

test("hash d: longer than anything supported is clamped with the numbers", () => {
  const e = hash("5000");
  assert.equal(e.compareH, 365 * 24);
  assert.deepEqual({ k: e.durationNotice.kind, r: e.durationNotice.requestedDays, u: e.durationNotice.usedDays }, { k: "clamped", r: 5000, u: 365 });
});
