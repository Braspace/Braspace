// Mobile LCP (perf/mobile-lcp): Mission and Cockpit paint the context bar and the loading state before any heavy file
// (1.4 MB LOLA heights, 706 KB PGDA layers, 280 KB hourly series) is requested, and independent requests run together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiWindowMetrics, loadRegion, loadRegionHeader, afterPaint } from "../core/data.js";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const HEAVY = /loadRegion\(|loadRegionHeader\(|loadSeries\(|mountTerrain\(|compute\(|apiWindowMetrics\(|pgda_/;

for (const name of ["mission", "cockpit"]) test(`${name}: the context is painted before any heavy request starts`, () => {
  const src = read(`../screens/${name}.tsx`);
  const sites = src.indexOf("await loadSites()"), paint = src.indexOf("paintContext(", sites), gate = src.indexOf("await afterPaint(");
  assert.ok(sites > 0 && paint > sites && gate > paint, "loadSites → paintContext → afterPaint");
  // Statements that run before the gate (function bodies declared above it only run when called).
  const before = src.slice(sites, gate).split("\n").filter(l => !/^\s/.test(l) && !/^(function|async function|\/\/)/.test(l)).join("\n");
  assert.doesNotMatch(before, HEAVY, "no heavy load is started before the first paint");
  assert.doesNotMatch(before.replace("await loadSites()", ""), /\bawait\b/, "nothing else is awaited before the first paint");
  assert.match(src.slice(gate), /mountTerrain\([^;]*progressive: true/, "the map draws its relief when the heights arrive");
  assert.match(src.slice(gate, gate + 400), /afterPaint\(document\.querySelector\("\.mp-ctx-text"\)\)/);
});

test("afterPaint() resolves without a frame loop (hidden tab / Node) instead of blocking the screen", async () => {
  const t0 = Date.now(); await afterPaint(null); assert.ok(Date.now() - t0 < 500);
});

function mockFetch(gate) {
  const seen = [];
  const file = u => readFileSync(new URL(u));
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); seen.push({ u, priority: opts.priority, at: seen.length });
    if (u.includes("/api/compare")) return new Response(JSON.stringify({ results: [{ data_status: "AVAILABLE", science_status: "PRELIMINARY",
      evaluation: { metrics: { sun_visible_fraction: 0.5, earth_visible_fraction: 0.25, longest_continuous_dark_hours: 7, longest_continuous_comm_gap_hours: 3 } } }] }));
    if (u.startsWith("file:")) { if (u.endsWith(".bin")) await gate; return new Response(file(u)); }
    return new Response("{}", { status: 404 });
  };
  return seen;
}

test("apiWindowMetrics asks the API while the hourly series is still downloading, and keeps the API figures", async () => {
  const old = globalThis.fetch, oldLoc = Object.getOwnPropertyDescriptor(globalThis, "location");
  let open; const gate = new Promise(r => (open = r));
  try {
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("http://127.0.0.1:8787/moonproof/mission") });
    const seen = mockFetch(gate);
    const doc = { status: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", window: { start_utc: "2025-01-01T00:00:00Z" } };
    const p = apiWindowMetrics(doc, { id: "mons-mouton-im2", series: "sites/mons-mouton-im2" }, null, 24);
    await new Promise(r => setTimeout(r, 20));
    assert.ok(seen.some(s => s.u.endsWith("/api/compare")), "the API call does not wait for the series");
    open();
    const m = await p;
    assert.equal(m.origin, "api"); assert.equal(m.sunPct.value, 50); assert.equal(m.longestDarkH.value, 7);
    assert.equal(seen.filter(s => s.u.endsWith("/api/compare")).length, 1, "the window start agreed: no second call");
  } finally { globalThis.fetch = old; if (oldLoc) Object.defineProperty(globalThis, "location", oldLoc); else delete globalThis.location; }
});

test("the region header is shared and the 1.4 MB heights are fetched at low priority, with their checksum", async () => {
  const old = globalThis.fetch;
  try {
    const seen = mockFetch(Promise.resolve());
    const [h, g] = await Promise.all([loadRegionHeader(), loadRegion()]);
    assert.equal(h.nx, g.nx); assert.ok(Number.isFinite(g.normal(77106.7, 138363.0).slopeDeg));
    assert.equal(seen.filter(s => s.u.endsWith("south_pole_400m.json")).length, 1);
    assert.equal(seen.find(s => s.u.endsWith("south_pole_400m.bin")).priority, "low");
  } finally { globalThis.fetch = old; }
});
