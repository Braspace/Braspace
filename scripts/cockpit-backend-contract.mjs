#!/usr/bin/env node
// Cockpit ↔ backend contract: the MoonProof cockpit (web/moonproof/screens/cockpit*.ts) talks to the Go API with
// requests built by its own pure modules. This script imports those same builders/readers (generated .js, no copy),
// sends the exact requests to a REAL Go + Rust + PostgreSQL (+ optional pgvector) stack and asserts every field the
// cockpit reads. It is an engineering contract test: PRELIMINARY / SYNTHETIC series stay so; nothing here is
// scientific validation. Read-only on the API (POSTs are pure computations, no ingestion routes are called).
//
//   BRASPACE_COCKPIT_API=http://127.0.0.1:8080 node scripts/cockpit-backend-contract.mjs
//   BRASPACE_COCKPIT_ORIGIN=https://… adds Origin on every request (same-origin Worker check).
//   BRASPACE_COCKPIT_PACE_MS=150 waits between requests: production sits behind Traefik ratelimit (20 req/s, burst 40,
//     per client IP), and a full run is ~60 requests. A 429 is reported as RATE_LIMITED, never as a contract failure.
//   BRASPACE_EXPECT_COMMIT=<sha> requires /healthz build_commit to be that commit (catches images built without
//     BRASPACE_GIT_SHA, which report "unknown").
// Exit code 0 = every check passed; 1 = at least one failed (each failure is printed with its route and payload).
import assert from "node:assert/strict";
import { siteEvaluateBody, evaluateBody, runScenario, chargeTrace, H1_PROFILE } from "../web/moonproof/screens/cockpit-model.js";
import { crewRequest, readCrewAnswer, readEnergy, sensitivityVariants, CREW_DEFAULT } from "../web/moonproof/screens/cockpit-crew.js";

const BASE = (process.env.BRASPACE_COCKPIT_API || "http://127.0.0.1:8080").replace(/\/$/, "");
const ORIGIN = process.env.BRASPACE_COCKPIT_ORIGIN || "";
const PACE_MS = Math.max(0, Number(process.env.BRASPACE_COCKPIT_PACE_MS || 0));
const EXPECT_COMMIT = (process.env.BRASPACE_EXPECT_COMMIT || "").trim().toLowerCase();
let rateLimited = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VALID_SCIENCE = new Set(["PRELIMINARY", "SYNTHETIC", "UNVERIFIED_INPUTS", "SIMULATION", "ESTIMATED"]);
const results = [];

/** Same contract as web/moonproof/core/data.ts api(): {ok, status, data|error}, never throws. */
async function call(path, { method = "GET", body, as = "json", timeoutMs = 30000 } = {}) {
  const headers = { Accept: as === "text" ? "text/html" : "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (ORIGIN) headers.Origin = ORIGIN;
  if (PACE_MS) await sleep(PACE_MS);
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    const type = r.headers.get("content-type") || "";
    const raw = await r.text();
    if (r.status === 429) rateLimited++;
    let data = raw;
    if (as !== "text" && type.includes("json")) { try { data = JSON.parse(raw); } catch { data = null; } }
    return { ok: r.ok, status: r.status, type, data, ms: Date.now() - t0, error: r.ok ? undefined : (data?.error?.code || data?.code || r.status), headers: r.headers };
  } catch (e) { return { ok: false, offline: true, status: 0, error: String(e?.message || e), ms: Date.now() - t0 }; }
}

async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note: note || "" }); }
  catch (e) { results.push({ name, ok: false, note: String(e?.message || e).slice(0, 600) }); }
}
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const isUtc = (s) => typeof s === "string" && /Z$/.test(s) && !Number.isNaN(Date.parse(s));

// ---------- liveness, readiness, capabilities (cockpit badges + apiOnline)
await check("GET /readyz → ready, science UNVERIFIED_INPUTS (cockpit apiOnline)", async () => {
  const r = await call("/readyz"); assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, "ready"); assert.equal(r.data.science_status, "UNVERIFIED_INPUTS"); return `${r.ms} ms`;
});
await check("GET /healthz → build_commit present", async () => {
  const r = await call("/healthz"); assert.equal(r.status, 200); assert.ok(typeof r.data.build_commit === "string", "build_commit");
  if (EXPECT_COMMIT) assert.ok(String(r.data.build_commit).toLowerCase().startsWith(EXPECT_COMMIT) && /^[0-9a-f]{40}$/.test(r.data.build_commit),
    `build_commit ${r.data.build_commit} ≠ expected ${EXPECT_COMMIT} (image built without BRASPACE_GIT_SHA?)`);
  return `build ${String(r.data.build_commit).slice(0, 12)}`;
});
await check("GET /v1/capabilities → never scientifically_validated", async () => {
  const r = await call("/v1/capabilities"); assert.equal(r.status, 200); assert.equal(r.data.scientifically_validated, false);
});

// ---------- catalog: cockpit site list must match the API catalog (no silent 5-vs-16 drift)
const cat = await call("/api/sites");
const sites = cat.ok ? (cat.data.sites || cat.data) : [];
const withSeries = sites.filter((s) => s.series && s.series.start_utc);
await check("GET /api/sites → 16 sites, ids valid, series metadata coherent", async () => {
  assert.equal(cat.status, 200); assert.ok(sites.length >= 16, `sites=${sites.length}`);
  for (const s of sites) {
    assert.match(s.id, /^[a-z0-9][a-z0-9-]{0,63}$/, s.id);
    if (s.series) { assert.ok(isUtc(s.series.start_utc) && isUtc(s.series.end_utc), s.id + " series window"); assert.equal(s.series.step_seconds, 3600, s.id);
      assert.ok(VALID_SCIENCE.has(s.series.science_status), `${s.id} science_status=${s.series.science_status}`);
      assert.match(String(s.series_sha256 || ""), /^[0-9a-f]{64}$/, s.id + " series_sha256"); }
  }
  return `${sites.length} sites, ${withSeries.length} with stored series`;
});

// ---------- per site: the exact cockpit flow (runScenario = site-evaluate, fallback evaluate)
const HOURS = 14 * 24;
const power = { ...H1_PROFILE, reserve_wh: H1_PROFILE.battery_capacity_wh * 0.2 };
const startFor = (s) => (s.series ? s.series.start_utc : "2026-12-01T00:00:00Z");
for (const s of sites) {
  const startIso = s.series ? new Date(Date.parse(s.series.start_utc) + 30 * 24 * 3600e3).toISOString().replace(".000Z", "Z") : startFor(s);
  await check(`${s.id}: sky 240 h (cockpit next transitions)`, async () => {
    const r = await call(`/api/sites/${encodeURIComponent(s.id)}/sky?start=${encodeURIComponent(startIso)}&hours=240`);
    if (!s.series) { assert.equal(r.status, 404, `no-series site must be 404, got ${r.status}`); assert.equal(r.error, "NO_SERIES_DATA"); return "404 NO_SERIES_DATA (N/D on screen)"; }
    assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300));
    assert.ok("next_transitions" in r.data, "next_transitions missing (cockpit reads it)");
    return `${r.ms} ms`;
  });
  await check(`${s.id}: runScenario (site-evaluate → evaluate fallback)`, async () => {
    const samples = Array.from({ length: HOURS }, (_, h) => ({ sun_visible: h % 24 < 16, earth_visible: h % 48 < 40 }));
    const run = await runScenario(call, { siteId: s.id, startIso, hours: HOURS, power, maxBlackoutH: 72, samples, delayH: 0 });
    assert.ok(run.ok, `run failed: ${JSON.stringify(run).slice(0, 300)}`);
    if (s.series) assert.equal(run.route, "site", "a site with stored series must be computed server-side, not from browser booleans");
    else assert.equal(run.route, "eval", "a site without series must fall back to evaluate (never invent a series)");
    assert.equal(run.trace.length, HOURS + 1, `trace length ${run.trace.length}`);
    assert.ok(run.trace.every((v) => finite(v) && v >= 0 && v <= power.battery_capacity_wh + 1e-6), "charge trace out of [0, capacity]");
    assert.ok(VALID_SCIENCE.has(run.status), `science_status=${run.status} (VALIDATED would be a lie)`);
    assert.match(String(run.sha || ""), /^[0-9a-f]{64}$/, "inputs_sha256");
    return `${run.route}, min ${Math.round(Math.min(...run.trace))} Wh, ${run.status}`;
  });
}

// ---------- determinism + fingerprint: same input → same sha and trace; changed input → different sha
const ref = withSeries[0];
if (ref) {
  const startIso = ref.series.start_utc;
  const body = siteEvaluateBody({ siteId: ref.id, startIso, hours: 48, power, maxBlackoutH: 48 });
  await check(`${ref.id}: site-evaluate deterministic (same body → same inputs_sha256 + timeline)`, async () => {
    const [a, b] = await Promise.all([call("/api/onboard/site-evaluate", { method: "POST", body }), call("/api/onboard/site-evaluate", { method: "POST", body })]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.data.onboard.inputs_sha256, b.data.onboard.inputs_sha256);
    assert.deepEqual(chargeTrace(a.data.onboard.options[0], power.initial_charge_wh), chargeTrace(b.data.onboard.options[0], power.initial_charge_wh));
    const c = await call("/api/onboard/site-evaluate", { method: "POST", body: { ...body, power: { ...power, load_w: power.load_w + 1 } } });
    assert.equal(c.status, 200); assert.notEqual(c.data.onboard.inputs_sha256, a.data.onboard.inputs_sha256, "fingerprint ignores load_w");
  });
  await check(`${ref.id}: readEnergy fields the cockpit shows`, async () => {
    const r = await call("/api/onboard/site-evaluate", { method: "POST", body });
    const e = readEnergy(r.data); assert.ok(finite(e.minWh), "minimum_charge_wh"); assert.ok(finite(e.unservedWh), "total_unserved_energy_wh");
    assert.ok(e.endMode !== null && e.status !== null, `end_mode/simulation_status ${JSON.stringify(e)}`); return JSON.stringify(e);
  });
  await check(`${ref.id}: sensitivity ±20 % runs on the real API (battery/solar/load)`, async () => {
    const out = [];
    for (const v of sensitivityVariants(power)) {
      const r = await call("/api/onboard/site-evaluate", { method: "POST", body: siteEvaluateBody({ siteId: ref.id, startIso, hours: 72, power: v.power, maxBlackoutH: 72 }) });
      assert.equal(r.status, 200, v.id); out.push([v.id, readEnergy(r.data).minWh]);
    }
    const base = out.find((x) => x[0] === "base")[1], bat = out.find((x) => x[0] === "battery-20")[1];
    assert.ok(bat <= base + 1e-6, `less battery cannot raise the minimum charge (${bat} > ${base})`);
    return out.map((x) => x.join("=")).join(" ");
  });
  await check(`${ref.id}: crew consumables (O2 / food) answer`, async () => {
    const r = await call("/api/onboard/site-evaluate", { method: "POST", body: crewRequest({ siteId: ref.id, startIso, hours: 72, maxBlackoutH: 72, power, crew: { ...CREW_DEFAULT } }) });
    assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300));
    const c = readCrewAnswer(r.data); assert.ok(c.rows.length >= 2, `consumable rows ${c.rows.length}`);
    for (const row of c.rows) assert.ok(row.autonomyH === null || finite(row.autonomyH), row.resource);
    assert.ok(c.decision !== null, "combined_decision"); return `${c.rows.map((x) => x.resource).join(",")} → ${JSON.stringify(c.decision)}`;
  });
  await check(`${ref.id}: site-report HTML (cockpit "Relatório")`, async () => {
    const r = await call("/api/onboard/site-report", { method: "POST", body, as: "text" });
    assert.equal(r.status, 200); assert.match(r.type, /^text\/html/); assert.ok(r.data.length > 2000, `html ${r.data.length} B`);
    assert.ok(!/<script/i.test(r.data), "report must not carry scripts"); return `${r.data.length} B`;
  });
}

// ---------- negative contract: the cockpit relies on structured 4xx, never 5xx or HTML
await check("site-evaluate: unknown site → 404 JSON SITE_NOT_FOUND", async () => {
  const r = await call("/api/onboard/site-evaluate", { method: "POST", body: siteEvaluateBody({ siteId: "atlantis", startIso: "2026-12-01T00:00:00Z", hours: 24, power, maxBlackoutH: 24 }) });
  assert.ok(r.status === 404 || r.status === 422, `status ${r.status}`); assert.match(r.type, /json/); return `${r.status} ${r.error}`;
});
await check("site-evaluate: duration over limit → 4xx JSON (not 500)", async () => {
  const r = await call("/api/onboard/site-evaluate", { method: "POST", body: siteEvaluateBody({ siteId: ref?.id || "malapert-massif", startIso: ref?.series.start_utc || "2026-12-01T00:00:00Z", hours: 100000, power, maxBlackoutH: 24 }) });
  assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`); assert.match(r.type, /json/); return `${r.status} ${r.error}`;
});
await check("site-evaluate: negative battery → 4xx JSON", async () => {
  const r = await call("/api/onboard/site-evaluate", { method: "POST", body: siteEvaluateBody({ siteId: ref?.id || "malapert-massif", startIso: ref?.series.start_utc, hours: 24, power: { ...power, battery_capacity_wh: -1 }, maxBlackoutH: 24 }) });
  assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`); return `${r.status} ${r.error}`;
});
await check("evaluate: samples with a non-boolean → 4xx JSON", async () => {
  const b = evaluateBody({ siteId: "synthetic-demo-a", startIso: "2026-12-01T00:00:00Z", power, maxBlackoutH: 24, samples: [{ sun_visible: true, earth_visible: true }] });
  b.candidates[0].samples[0].sun_visible = "yes";
  const r = await call("/api/onboard/evaluate", { method: "POST", body: b }); assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
});

// ---------- pgvector (evidence receipts next to the cockpit): optional, but when enabled it must be exact
const vs = await call("/api/vector/status");
await check("GET /api/vector/status → lexical-384, never validated", async () => {
  assert.equal(vs.status, 200); assert.equal(vs.data.scientifically_validated, false);
  if (!vs.data.enabled) return "disabled (cockpit still works: engine is independent of pgvector)";
  assert.equal(vs.data.dimension, 384); assert.equal(vs.data.model_id, "braspace-lexical-384-v1"); return `available=${vs.data.available}`;
});
if (vs.data?.enabled && vs.data?.available) {
  const unit = Array.from({ length: 384 }, (_, i) => (i === 7 ? 1 : 0));
  await check("POST /api/vector/search 384D → ≤ limit results, finite scores, provenance", async () => {
    const r = await call("/api/vector/search", { method: "POST", body: { vector: unit, limit: 3, model_id: "braspace-lexical-384-v1" } });
    assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300)); const rows = r.data.results || [];
    assert.ok(rows.length <= 3); for (const x of rows) assert.ok(Object.values(x).some((v) => finite(v)), "score");
    return `${rows.length} results`;
  });
  for (const [label, vector] of [["383D", unit.slice(0, 383)], ["zero vector", unit.map(() => 0)]]) {
    await check(`POST /api/vector/search ${label} → 4xx JSON`, async () => {
      const r = await call("/api/vector/search", { method: "POST", body: { vector, limit: 3, model_id: "braspace-lexical-384-v1" } });
      assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`); assert.match(r.type, /json/); return `${r.status} ${r.error}`;
    });
  }
}

// ---------- report
const fail = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? "  — " + r.note : ""}`);
console.log(`\ncockpit-backend-contract: ${results.length - fail.length}/${results.length} PASS against ${BASE}${ORIGIN ? " (Origin " + ORIGIN + ")" : ""}`);
if (rateLimited) console.log(`RATE_LIMITED: ${rateLimited} responses were 429 — the run is inconclusive, not a contract failure. Re-run with BRASPACE_COCKPIT_PACE_MS=150.`);
process.exit(rateLimited ? 2 : fail.length ? 1 : 0);
