// Integration tests on the generated NASA-derived web products (web/data).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SiteSeries, decodeSeries, horizonAt, rankSites, HOUR_MS } from "../lab/data.js";
import { TerrainGrid } from "../lab/terrain.js";
import { southStereoForward } from "../lab/coords.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async p => JSON.parse(await readFile(path.join(root, p), "utf-8"));
const bin = async p => { const b = await readFile(path.join(root, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const sha = buf => createHash("sha256").update(Buffer.from(buf)).digest("hex");
const index = await json("data/sites.json");

async function loadSeries(id) {
  const meta = await json(`data/sites/${id}.json`), buf = await bin(`data/sites/${id}.bin`);
  assert.equal(sha(buf), meta.series.sha256, `${id} series checksum`);
  return new SiteSeries(meta, decodeSeries(buf, meta.series.count));
}
async function loadTile(base) {
  const h = await json(base + ".json"), buf = await bin(base + ".bin");
  assert.equal(sha(buf), h.sha256, `${base} checksum`);
  return new TerrainGrid(h, new Int16Array(buf));
}

test("site index: five sites with provenance and LOLA-confirmed crater labels", () => {
  assert.equal(index.sites.length, 5);
  assert.equal(index.science_status, "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED");
  for (const s of index.sites) { assert.ok(s.source.length > 10, s.id); assert.ok(s.lat < -84 && s.lat > -90, s.id); }
  for (const f of index.features) { assert.equal(f.dem_check, "DEPRESSION_CONFIRMED", f.id); assert.equal(f.landing_site, false); }
  assert.ok(index.features.some(f => f.id === "shackleton"));
});

test("browser window metrics reproduce the Python pipeline over the full 2025–2028 window", async () => {
  for (const s of index.sites) {
    const ser = await loadSeries(s.id);
    const w = ser.window(ser.start, ser.count);
    // 0.01° quantisation can flip only samples within 0.01° of the horizon
    assert.ok(Math.abs(w.sunPct - s.metrics.sun_center_visible_pct) < 0.3, `${s.id} sun ${w.sunPct} vs ${s.metrics.sun_center_visible_pct}`);
    assert.ok(Math.abs(w.earthPct - s.metrics.earth_center_visible_pct) < 0.3, `${s.id} earth ${w.earthPct} vs ${s.metrics.earth_center_visible_pct}`);
    assert.ok(Math.abs(w.longestDarkH - s.metrics.longest_darkness_h) <= 2, `${s.id} longest dark`);
  }
});

test("outside the computed ephemeris window the app answers NOT_COMPUTED", async () => {
  const ser = await loadSeries(index.sites[0].id);
  assert.equal(ser.window(ser.start - 10 * HOUR_MS, 24).status, "NOT_COMPUTED");
  assert.equal(ser.window(ser.end, 48).status, "NOT_COMPUTED");
  assert.equal(ser.at(ser.end + HOUR_MS), null);
  assert.equal(ser.nextChange(ser.start - HOUR_MS, "sun").status, "NOT_COMPUTED");
});

test("horizon interpolation wraps around north", () => {
  const h = Array.from({ length: 360 }, (_, i) => ({ az: i, el: i === 359 ? 2 : i === 0 ? 4 : 0 }));
  assert.equal(horizonAt(h, 359.5), 3);
  assert.equal(horizonAt(h, -0.5), 3);
});

test("ranking puts constraint violations last", async () => {
  const entries = await Promise.all(index.sites.map(async site => ({ site, series: await loadSeries(site.id) })));
  const t0 = Date.parse("2027-01-01T00:00:00Z");
  const r = rankSites(entries, t0, 336, { minSunPct: 101 });
  assert.ok(r.every(x => x.violations.length > 0));
  const ok = rankSites(entries, t0, 336, {});
  for (let i = 1; i < ok.length; i++) assert.ok(ok[i - 1].w.bothPct >= ok[i].w.bothPct);
});

test("regional LOLA grid: heights, georeference and known features", async () => {
  const g = await loadTile("data/region/south_pole_400m");
  assert.equal(g.nx, 850); assert.equal(g.missing, 0);
  assert.ok(g.min < -3000 && g.max > 5000, `range ${g.min}..${g.max}`);
  const [sx, sy] = southStereoForward(-89.67, 129.78);
  const [mx, my] = southStereoForward(-85.9948, -0.23578);
  assert.ok(g.height(sx, sy) < -2000, "Shackleton floor is deep");
  assert.ok(g.height(mx, my) > 4000, "Malapert is high");
});

test("local tiles are centred on the site and include lunar curvature", async () => {
  for (const s of index.sites) {
    const t = await loadTile(`data/terrain/${s.id}_local`);
    assert.ok(Math.abs(t.height(0, 0)) < 1, `${s.id} origin at surface (${t.height(0, 0)})`);
    assert.equal(t.h.native_resolution_m, 80);
    assert.ok(Math.abs(t.h.site_height_m - s.site_height_m) < 0.1);
  }
});
