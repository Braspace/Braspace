// Data access shared by C Comparar and D Replanejar: stored hourly series (web/data, via core/data.js) and the API.
// Every metric carries its own seal (from the origin's state) and source; a missing value stays null.
import { loadSeries, sealFor, api } from "../core/data.js";
import { HOUR_MS } from "../../lab/data.js";
export { HOUR_MS };

export async function loadAll(doc) {
  const m = new Map();
  await Promise.all(doc.sites.map(async s => m.set(s.id, await loadSeries(s))));
  return m;
}

/** Metrics of [startMs, +hours) from the stored series; null when the window is outside the computed range. */
export function staticMetrics(series, startMs, hours, status, siteId = "") {
  const w = series.window(startMs, hours);
  if (w.status !== "COMPUTED") return null;
  return { dark: w.longestDarkH, blackout: w.longestBlackoutH, sunPct: w.sunPct, earthPct: w.earthPct, bothPct: w.bothPct,
    seal: sealFor(status), status, origin: "static", src: `web/data/sites/${siteId || series.meta?.site?.id || ""}.bin`, sha: series.meta.series.sha256 };
}

/** Hourly booleans (Sun / Earth above the local horizon) for the window. */
export function flagsOf(series, startMs, hours) {
  const i0 = Math.ceil((startMs - series.start) / HOUR_MS), sun = [], earth = [];
  for (let h = 0; h < hours; h++) {
    const i = i0 + h;
    if (i < 0 || i >= series.count) { sun.push(null); earth.push(null); continue; }
    sun.push(series.sunMargin[i] >= 0); earth.push(series.earthMargin[i] >= 0);
  }
  return { sun, earth };
}

/** API metrics → the same shape as staticMetrics. null unless the API returned numbers (data_status AVAILABLE). */
export function mapApiMetrics(m, scienceStatus, src, sha = null) {
  if (!m) return null;
  const p = x => (typeof x === "number" && Number.isFinite(x) ? 100 * x : null);
  const n = x => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return { dark: n(m.longest_continuous_dark_hours), blackout: n(m.longest_continuous_comm_gap_hours), sunPct: p(m.sun_visible_fraction),
    earthPct: p(m.earth_visible_fraction), bothPct: p(m.simultaneous_fraction), seal: sealFor(scienceStatus), status: scienceStatus || null,
    origin: "api", src, sha };
}

const cache = new Map();
// Keep only in-flight requests; a transient error must not be cached forever.
const once = (key, fn) => {
 if (!cache.has(key)) {
  const pending=Promise.resolve().then(fn).finally(()=>{if(cache.get(key)===pending)cache.delete(key);});
  cache.set(key,pending);
 }
 return cache.get(key);
};

/** POST /api/compare for one site. {online, metrics|null}. */
export function apiCompareMetrics(siteId, startIso, hours) {
  return once(`c|${siteId}|${startIso}|${hours}`, async () => {
    const r = await api("/api/compare", { method: "POST", body: { site_ids: [siteId], start_utc: startIso, duration_hours: hours } });
    if (!r.ok) return { online: !r.offline, metrics: null };
    const x = r.data?.results?.[0];
    if (!x || x.data_status !== "AVAILABLE" || !x.evaluation?.metrics) return { online: true, metrics: null };
    return { online: true, metrics: mapApiMetrics(x.evaluation.metrics, x.science_status, "POST /api/compare", x.site?.series_sha256 || null) };
  });
}

/** POST /api/scenarios/delay. {online, base, delayed} (each null without numbers). */
export function apiDelayMetrics({ siteId, startIso, hours, delayH, rules }) {
  return once(`d|${siteId}|${startIso}|${hours}|${delayH}|${rules.night}|${rules.blackout}`, async () => {
    const r = await api("/api/scenarios/delay", { method: "POST", body: { site_id: siteId, start_utc: startIso, duration_hours: hours,
      delays_hours: [delayH], include_nearby: true, max_nearby: 3,
      constraints: { max_continuous_dark_hours: rules.night, max_continuous_comm_gap_hours: rules.blackout } } });
    if (!r.ok) return { online: !r.offline, base: null, delayed: null, nearby: [] };
    const pick = o => (o && o.data_status === "AVAILABLE" && o.metrics ? mapApiMetrics(o.metrics, o.science_status, "POST /api/scenarios/delay") : null);
    const opts = r.data?.options || [];
    // Nearby catalog sites the API evaluated at the delayed start (from the Polar Lab / onboard replan, now in v3).
    const nearby = opts.filter(o => o.kind === "nearby_site").map(o => ({ siteId: o.site_id, km: o.distance_km ?? null,
      available: o.data_status === "AVAILABLE", admissible: o.data_status === "AVAILABLE" ? !!o.admissible : null, reason: o.reason || o.data_status, status: o.science_status || null }));
    return { online: true, base: pick(opts.find(o => o.kind === "baseline")), delayed: pick(opts.find(o => o.kind === "delay" && o.delay_hours === delayH)), nearby };
  });
}
