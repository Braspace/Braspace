// Unit tests for SiteSeries helpers ported from PR #102 (daily, nextState, darkRuns/blackoutRuns).
// Uses a hand-built synthetic series (flat horizon), not NASA data.
import test from "node:test";
import assert from "node:assert/strict";
import { SiteSeries, HOUR_MS } from "../lab/data.js";

function make(sunEl, earthEl) {
  const n = sunEl.length, z = new Float32Array(n);
  const meta = { series: { start_utc: "2026-01-01T00:00:00Z", count: n }, terrain_horizon: [{ az: 0, el: 0 }, { az: 180, el: 0 }] };
  return new SiteSeries(meta, { sunAz: z, sunEl: Float32Array.from(sunEl), earthAz: z, earthEl: Float32Array.from(earthEl) });
}
const T0 = Date.parse("2026-01-01T00:00:00Z");

test("window counts separate dark and blackout runs", () => {
  const s = make([1, -1, -1, 1, -1, 1], [-1, 1, -1, -1, 1, 1]);
  const r = s.window(T0, 6);
  assert.equal(r.darkRuns, 2); assert.equal(r.longestDarkH, 2);
  assert.equal(r.blackoutRuns, 2); assert.equal(r.longestBlackoutH, 2);
});

test("daily returns the visible fraction per day and NaN outside the window", () => {
  const sun = Array.from({ length: 48 }, (_, i) => (i < 24 ? (i < 6 ? 1 : -1) : 1));
  const d = make(sun, sun).daily(T0, 3, "sun");
  assert.equal(d[0], 0.25); assert.equal(d[1], 1); assert.ok(Number.isNaN(d[2]));
});

test("nextState finds the next hour the body reaches the asked state", () => {
  const s = make([-1, -1, -1, 1, 1], [1, 1, 1, 1, 1]);
  assert.deepEqual(s.nextState(T0, "sun", true), { status: "COMPUTED", hours: 3, at: T0 + 3 * HOUR_MS });
  assert.equal(s.nextState(T0, "sun", false).hours, 0);
  assert.equal(s.nextState(T0, "earth", false).hours, Infinity);
  assert.equal(s.nextState(T0 - HOUR_MS, "sun", true).status, "NOT_COMPUTED");
});
