import test from "node:test";
import assert from "node:assert/strict";
import { createLive, sealFor, compareRow, OFFLINE_SEAL, SITE_MAP } from "../lab/live.js";

const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
const catalogue = { sites: [{ id: "connecting-ridge", series: { start_utc: "2026-11-15T00:00:00Z", end_utc: "2026-11-18T00:00:00Z", science_status: "UNVERIFIED" } }, { id: "malapert-massif" }] };
const cmp = (status) => ({ results: [{ site: { id: "connecting-ridge" }, data_status: "AVAILABLE", science_status: status, engine_science_status: "UNVERIFIED_INPUTS", evaluation: { metrics: { sun_visible_fraction: 0.5, earth_visible_fraction: 0.25, simultaneous_fraction: 0.125, longest_continuous_dark_hours: 7, longest_continuous_comm_gap_hours: 9 }, simultaneous_windows: [{ start_utc: "2026-11-15T00:00:00Z", end_utc: "2026-11-15T03:00:00Z", duration_hours: 3 }] } }] });

function fakeFetch(routes) { const calls = []; const f = async (url, init) => { calls.push({ url, init }); for (const [k, v] of Object.entries(routes)) if (url.includes(k)) return typeof v === "function" ? v(init) : json(v); return json({}, 404); }; f.calls = calls; return f; }

test("with API: uses the response (sites, compare percentages)", async () => {
  const f = fakeFetch({ "/api/sites": catalogue, "/api/compare": cmp("UNVERIFIED") });
  const live = createLive({ base: "http://api.test/", fetchImpl: f });
  assert.equal(await live.probe(), true);
  assert.equal(f.calls[0].url, "http://api.test/api/sites");
  assert.equal(live.apiId("connecting-ridge"), "connecting-ridge");
  assert.equal(live.covers("connecting-ridge", Date.parse("2026-11-15T00:00:00Z"), 24), true);
  assert.equal(live.covers("connecting-ridge", Date.parse("2026-11-17T12:00:00Z"), 24), false);
  assert.equal(live.coverage("malapert-massif"), null);
  const r = await live.compare(["connecting-ridge"], "2026-11-15T00:00:00Z", 24);
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(f.calls.at(-1).init.body), { site_ids: ["connecting-ridge"], start_utc: "2026-11-15T00:00:00Z", duration_hours: 24 });
  const row = compareRow(r.data.results[0]);
  assert.equal(row.sunPct, 50); assert.equal(row.earthPct, 25); assert.equal(row.bothPct, 12.5); assert.equal(row.longestBlackoutH, 9);
  assert.equal(r.seal.text, "live API · unverified inputs (UNVERIFIED_INPUTS)");
});

test("without API: no base, unreachable, or HTTP error => static fallback with the offline seal", async () => {
  const none = createLive({});
  assert.equal(await none.probe(), false); assert.deepEqual(none.seal, OFFLINE_SEAL); assert.equal(none.apiId("connecting-ridge"), null);
  assert.equal(OFFLINE_SEAL.text, "offline · precomputed");
  const down = createLive({ base: "http://x", fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  assert.equal(await down.probe(), false); assert.deepEqual(down.seal, OFFLINE_SEAL);
  const err = createLive({ base: "http://x", fetchImpl: fakeFetch({ "/api/sites": () => json({}, 503) }) });
  assert.equal(await err.probe(), false); assert.deepEqual(err.seal, OFFLINE_SEAL);
  // API goes away after a successful probe: the call fails closed to the offline seal, no data.
  const flaky = fakeFetch({ "/api/sites": catalogue }); const live = createLive({ base: "http://x", fetchImpl: flaky });
  await live.probe(); const r = await live.compare(["connecting-ridge"], "2026-11-15T00:00:00Z", 24);
  assert.equal(r.ok, false); assert.deepEqual(r.seal, OFFLINE_SEAL);
});

test("the seal never says validated unless the response says VALIDATED", async () => {
  for (const st of ["UNVERIFIED", "SYNTHETIC", undefined, "", null, "validated", "PRELIMINARY", "NO_SERIES_DATA"]) {
    const s = sealFor({ science_status: st, scientifically_validated: true });
    assert.equal(/validated/i.test(s.text), false, `status ${st} -> ${s.text}`);
  }
  assert.equal(sealFor(undefined).live, true);
  assert.equal(/validated/i.test(sealFor({ science_status: "VALIDATED" }).text), false);
  assert.equal(/validated/i.test(sealFor({ science_status: "VALIDATED", scientifically_validated: false }).text), false);
  assert.equal(/validated/i.test(sealFor({ science_status: "VALIDATED", scientifically_validated: true }).text), false); // missing provenance
  const attested = { science_status: "VALIDATED", scientifically_validated: true, provenance: {terrain_sha256: "a".repeat(64), ephemeris_id: "NAIF-TEST", frame: "MOON_ME"} };
  assert.equal(sealFor(attested).cls, "validated");
  assert.equal(sealFor({...attested, provenance: {...attested.provenance, frame:"J2000"}}).cls,"unverified");
  assert.equal(/validated/i.test(OFFLINE_SEAL.text), false);
  const live = createLive({ base: "http://x", fetchImpl: fakeFetch({ "/api/sites": catalogue, "/api/compare": cmp("UNVERIFIED") }) });
  await live.probe(); assert.equal(/validated/i.test(live.seal.text), false);
  assert.equal(/validated/i.test((await live.compare(["connecting-ridge"], "2026-11-15T00:00:00Z", 24)).seal.text), false);
});

test("compareRow refuses numbers when the API has no data; ids without a pair stay static", () => {
  assert.equal(compareRow({ data_status: "NO_SERIES_DATA" }), null);
  assert.equal(compareRow({ data_status: "OUTSIDE_COVERAGE", evaluation: { metrics: {} } }), null);
  assert.equal(SITE_MAP["mons-mouton-im2"], "mons-mouton-im2"); // the API serves a series for it
  for (const id of Object.keys(SITE_MAP)) assert.ok(SITE_MAP[id] === null || typeof SITE_MAP[id] === "string", id);
});

test("PRELIMINARY (every real site series today) reads as preliminary, never as unknown or validated", () => {
  const s = sealFor({ science_status: "PRELIMINARY" });
  assert.match(s.text, /preliminary/); assert.equal(s.cls, "unverified"); assert.doesNotMatch(s.text, /not reported|validated/i);
});

test("nested VALIDATED can never override false response-level scientific attestation", async () => {
  const forged = cmp("VALIDATED");
  forged.scientifically_validated = false;
  forged.results[0].provenance = {terrain_sha256: "a".repeat(64), ephemeris_id: "NAIF-TEST", frame:"MOON_ME"};
  const fetcher=fakeFetch({"/api/sites":catalogue,"/api/compare":forged});
  const live=createLive({base:"http://x",fetchImpl:fetcher}); await live.probe();
  const r=await live.compare(["connecting-ridge"],"2026-11-15T00:00:00Z",24);
  assert.equal(r.ok,true);
  assert.equal(r.seal.cls,"unverified");
  assert.equal(compareRow(r.data.results[0],r.data.scientifically_validated).seal.cls,"unverified");
});

test("nested VALIDATED can never override false response-level scientific attestation", async () => {
  const forged = cmp("VALIDATED");
  forged.scientifically_validated = false;
  forged.results[0].provenance = {terrain_sha256: "a".repeat(64), ephemeris_id: "NAIF-TEST", frame:"MOON_ME"};
  const fetcher=fakeFetch({"/api/sites":catalogue,"/api/compare":forged});
  const live=createLive({base:"http://x",fetchImpl:fetcher}); await live.probe();
  const r=await live.compare(["connecting-ridge"],"2026-11-15T00:00:00Z",24);
  assert.equal(r.ok,true);
  assert.equal(r.seal.cls,"unverified");
  assert.equal(compareRow(r.data.results[0],r.data.scientifically_validated).seal.cls,"unverified");
});

test("sky, delay and onboard hit the documented routes with the mapped id", async () => {
  const f = fakeFetch({ "/api/sites?": 0, "/sky": { science_status: "UNVERIFIED", samples: [{ sun: { azimuth_deg: 1, elevation_deg: 2 }, sun_visible: true }] }, "/api/scenarios/delay": { options: [{ science_status: "UNVERIFIED" }] }, "/api/onboard/site-evaluate": { candidates: [{ science_status: "UNVERIFIED" }] }, "/api/sites": catalogue });
  const live = createLive({ base: "http://a", fetchImpl: f }); await live.probe();
  await live.sky("connecting-ridge", "2026-11-15T00:00:00Z", 1);
  assert.match(f.calls.at(-1).url, /\/api\/sites\/connecting-ridge\/sky\?start=2026-11-15T00%3A00%3A00Z&hours=1$/);
  await live.delay("connecting-ridge", "2026-11-15T00:00:00Z", 24, [24], { min_sun_fraction: 0.3 });
  assert.equal(JSON.parse(f.calls.at(-1).init.body).site_id, "connecting-ridge");
  const r = await live.onboard("connecting-ridge", "2026-11-15T00:00:00Z", 24, { battery_capacity_wh: 1, initial_charge_wh: 1, reserve_wh: 0, solar_generation_w: 1, load_w: 1 }, 12);
  assert.match(f.calls.at(-1).url, /site-evaluate$/); assert.equal(r.seal.text, "live API · unverified inputs");
});
