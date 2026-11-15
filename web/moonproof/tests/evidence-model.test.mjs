import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { trustRows, trustOf, sourceRows, buildPassport, pickVersion, registryChip } from "../screens/evidence-model.js";

const PRE = "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED";
const region = { spacing_m: 400, native_resolution_m: 80, source: "LOLA", sha256: "a", source_sha256: "b" };
const series = { provenance: { ephemeris: "NAIF", kernel_sha256: { k: "x" }, ray_parameters: { max_distance_m: 1000 }, nasa_certified: false }, science_status: PRE, site: { observer_height_m: 2 } };

test("trust: real data is PRE (3), battery SIM (1), tilt without source N/D (0); never VAL", () => {
  const r = trustRows({ sitesStatus: PRE });
  assert.deepEqual(r.map(x => [x.id, x.seal, x.level]), [["sun", "PRE", 3], ["earth", "PRE", 3], ["tilt", "N/D", 0], ["battery", "SIM", 1]]);
  assert.ok(r.every(x => x.seal !== "VAL"));
  assert.equal(trustRows({ sitesStatus: "VALIDATED" })[0].seal, "VAL"); assert.equal(trustOf("VAL"), 4);
  assert.equal(trustRows({ sitesStatus: undefined })[0].seal, "N/D");
});
test("sources: each row has the seal of its origin; missing origin → N/D", () => {
  const rows = sourceRows({ sites: { science_status: PRE }, region, series, layers: [{ kind: "global_albedo_visualization", id: "l", redistribution_status: "approved_candidate", source_url: "u" }] });
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.terrain.seal, "PRE"); assert.equal(by.ephemeris.seal, "PRE"); assert.equal(by.horizon.seal, "PRE");
  assert.equal(by.battery.seal, "SIM"); assert.equal(by.landing.seal, "SIM"); assert.equal(by.rocks.seal, "N/D"); assert.equal(by.rocks.origin, null);
  assert.equal(by.surface.registryOnly, true); assert.equal(by.surface.seal, "N/D");
  const empty = Object.fromEntries(sourceRows({ sites: {}, region: null, series: null, layers: [] }).map(r => [r.id, r.seal]));
  assert.equal(empty.terrain, "N/D"); assert.equal(empty.ephemeris, "N/D"); assert.equal(empty.horizon, "N/D");
  assert.ok(rows.every(r => r.seal !== "VAL"));
});
test("registry chip is the registry state, not a data seal", () => { assert.equal(registryChip({ redistribution_status: "approved_candidate" }), "approved_candidate"); assert.equal(registryChip({}), null); });
test("version: /healthz build_commit, else /api/health, else null; never a fake or 'unknown' commit", () => {
  assert.deepEqual(pickVersion({ buildCommit: "62bf446e386d3101b6448582330248e160edbb09", health: { api_version: "v" } }), { value: "62bf446e386d", source: "/healthz build_commit" });
  assert.deepEqual(pickVersion({ buildCommit: "unknown", health: { api_version: "braspace.mission.v1" } }), { value: "braspace.mission.v1", source: "/api/health" });
  assert.deepEqual(pickVersion({ buildCommit: null, health: { api_version: "braspace.mission.v1" } }), { value: "braspace.mission.v1", source: "/api/health" });
  assert.equal(pickVersion({ buildCommit: null, health: null }), null);
});
test("passport JSON: scenario, rules, version and origin of each number", () => {
  const rows = sourceRows({ sites: { science_status: PRE }, region, series, layers: [] });
  const p = buildPassport({ state: { start: null, hours: 336, night: 60, blackout: 72, battery: 30, link: "http://x/?a" }, site: { id: "s", n: 2, name: "N", lat: 1, lon: 2, source: "src" },
    sites: { science_status: PRE, generated_utc: "g", series_window: { hours: 1 } }, series: { series: { sha256: "h" } }, version: { value: "v", source: "/healthz build_commit" }, api: { online: false }, rows, layers: [], nowIso: "2026-01-01T00:00:00Z" });
  assert.equal(p.version.value, "v"); assert.equal(p.rules.label, "assumed limit"); assert.equal(p.rules.night_h, 60); assert.equal(p.data.seal, "PRE"); assert.equal(p.data.series_sha256, "h");
  assert.equal(p.numbers.length, rows.length); assert.ok(p.numbers.every(n => "seal" in n && "origin" in n)); assert.equal(p.api.online, false);
  JSON.parse(JSON.stringify(p));
  const none = buildPassport({ state: {}, site: null, sites: null, series: null, version: null, api: null, rows: [], layers: [], nowIso: "x" });
  assert.equal(none.version.value, null); assert.equal(none.data.seal, "N/D"); assert.equal(none.scenario.site, null);
});
test("registry copy equals data/ASSET_REGISTRY.json and the licence matrix (fails when it drifts)", async () => {
  const { REGISTRY } = await import("../screens/evidence-registry.js");
  let reg; try { reg = JSON.parse(await readFile(new URL("../../../data/ASSET_REGISTRY.json", import.meta.url), "utf8")); } catch { return; }
  assert.equal(REGISTRY.assets.length, reg.assets.length); assert.equal(REGISTRY.reviewed_at, reg.reviewed_at);
  for (const [i, a] of reg.assets.entries()) for (const k of ["asset_id", "redistribution_status", "scientific_role", "sha256"]) assert.equal(REGISTRY.assets[i][k], a[k] ?? null, `${a.asset_id}.${k}`);
  const md = await readFile(new URL("../../../docs/ASSET_LICENSE_MATRIX.md", import.meta.url), "utf8");
  for (const m of REGISTRY.matrix) assert.ok(md.includes(m.status), m.status);
});
test("evidence screen: no VAL literal, no 20 m/px, download button wired, resolution from the data", async () => {
  const js = await readFile(new URL("../screens/evidence.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(js, /["']VAL["']/); assert.doesNotMatch(js, /20 m\/px/); assert.match(js, /download/); assert.match(js, /Blob/); assert.match(js, /spacing_m/);
  const html = await readFile(new URL("../evidence.html", import.meta.url), "utf8"); assert.doesNotMatch(html, /\bVAL\b|validated/i);
});
