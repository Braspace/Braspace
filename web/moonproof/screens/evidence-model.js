// H · Evidências — pure model (no DOM). Seals come from the origin state only (sealFor); a missing origin is N/D.
import { sealFor } from "../core/data.js";

/** Our own trust scale, by seal of the origin (documented on screen; not a probability). */
export const TRUST_LEVEL = Object.freeze({ VAL: 4, PRE: 3, EST: 2, SIM: 1, "N/D": 0, FALHA: 0 });
export const TRUST_BLOCKS = 4;
export const trustOf = seal => TRUST_LEVEL[seal] ?? 0;

/** Registry state → chip text. This is a registry state, never a data seal (so never VAL/PRE). */
export function registryChip(asset) {
  const s = String(asset?.redistribution_status || "").trim();
  return s || null;
}

/** Four trust rows with the seal derived from each origin. */
export function trustRows({ sitesStatus, slopeAvailable = false }) {
  const real = sealFor(sitesStatus);
  return [
    { id: "sun", seal: real, level: trustOf(real) },
    { id: "earth", seal: real, level: trustOf(real) },
    { id: "tilt", seal: slopeAvailable ? "EST" : "N/D", level: trustOf(slopeAvailable ? "EST" : "N/D") },
    { id: "battery", seal: "SIM", level: trustOf("SIM") },
  ];
}

/**
 * Data-source rows. Each row: {id, seal, origin, detail}. A row without an origin is N/D.
 * Inputs are the loaded documents; nothing numeric is typed here.
 */
export function sourceRows({ sites, region, series, layers }) {
  const rows = [];
  const status = sites?.science_status;
  rows.push({ id: "terrain", seal: region ? sealFor(status) : "N/D", origin: region ? "web/data/region/south_pole_400m.json" : null,
    detail: region ? { spacing_m: region.spacing_m, native_resolution_m: region.native_resolution_m, source: region.source, sha256: region.sha256, source_sha256: region.source_sha256 } : null });
  const surf = (layers || []).find(l => l.kind === "global_albedo_visualization");
  rows.push({ id: "surface", seal: surf ? "N/D" : "N/D", origin: surf ? "GET /api/layers → " + surf.id : null, detail: surf ? { source: surf.source_url, redistribution: surf.redistribution_status, role: surf.scientific_role, resolution_km_px_equator: surf.resolution_km_per_px_equator } : null, registryOnly: !!surf });
  const pv = series?.provenance;
  rows.push({ id: "ephemeris", seal: pv ? sealFor(series.science_status || status) : "N/D", origin: pv ? "web/data/sites/<id>.json · provenance" : null,
    detail: pv ? { ephemeris: pv.ephemeris, kernel_sha256: pv.kernel_sha256, aberration: pv.aberration_correction, nasa_certified: pv.nasa_certified } : null });
  rows.push({ id: "horizon", seal: pv ? sealFor(series.science_status || status) : "N/D", origin: pv ? "web/data/sites/<id>.json · provenance.ray_parameters" : null,
    detail: pv ? { ...pv.ray_parameters, observer_height_m: series.site?.observer_height_m } : null });
  rows.push({ id: "battery", seal: "SIM", origin: "POST /api/onboard/* (declared H1 profile)", detail: null });
  rows.push({ id: "landing", seal: "SIM", origin: "web/lab/physics.js (educational model)", detail: null });
  rows.push({ id: "rocks", seal: "N/D", origin: null, detail: null });
  return rows;
}

/** The passport: scenario, version, origin of every number. Pure; `now` and `version` are injected. */
export function buildPassport({ state, site, sites, series, version, api, rows, rules, layers, nowIso }) {
  return {
    schema: "moonproof.passport.v1",
    generated_at: nowIso,
    version: version ? { value: version.value, source: version.source } : { value: null, source: null },
    scenario: { site: site ? { id: site.id, n: site.n, name: site.name, lat: site.lat, lon: site.lon, source: site.source } : null,
      start: state.start || null, hours: state.hours || null, link: state.link || null },
    rules: { night_h: state.night, blackout_h: state.blackout, battery_floor_pct: state.battery, label: "assumed limit" },
    data: { science_status: sites?.science_status || null, seal: sealFor(sites?.science_status), generated_utc: sites?.generated_utc || null, series_window: sites?.series_window || null,
      series_sha256: series?.series?.sha256 || null },
    api: api ? { online: !!api.online, ready_state: api.state || null, source: "/readyz" } : { online: false, ready_state: null, source: "/readyz" },
    numbers: rows.map(r => ({ id: r.id, seal: r.seal, origin: r.origin, state: r.seal === "N/D" ? "NO_DATA" : undefined })),
    registry: (layers || []).map(l => ({ id: l.id, registry_ref: l.registry_ref, redistribution_status: l.redistribution_status, scientific_role: l.scientific_role, sha256: l.sha256 })),
    notes: ["Battery and landing are simulations; no number here counts as independently checked unless its origin says so."],
  };
}

/** Version: the config.js commit when the deployment publishes one, else /api/health; else null (shown as N/D). */
export function pickVersion({ configCommit, health }) {
  if (configCommit) return { value: String(configCommit), source: "config.js" };
  const v = health?.api_version || health?.version;
  return v ? { value: String(v), source: "/api/health" } : null;
}

/** Parse the config.js text served by the deployment: `const BRASPACE_COMMIT = "…"` or window.BRASPACE_COMMIT. */
export function parseConfigCommit(text) {
  const m = /BRASPACE_COMMIT\s*=\s*["']([0-9a-f]{7,40})["']/i.exec(text || ""); return m ? m[1] : null;
}
export const SECTIONS = Object.freeze(["passport", "sources", "assumptions", "limits", "lessons", "missions"]);
