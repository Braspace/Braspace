// Optional live API for the Polar Lab. Static precomputed products stay the default and the fallback.
// window.BRASPACE_API_BASE = "https://host" (or "" / unset => offline mode). Nothing here invents numbers:
// every value returned comes from the API response, and the state seal is derived only from its science_status.

import type { Json } from "../api-types.js";
export interface Seal { text: string; cls: string; live: boolean; }
export interface LiveResult { ok: boolean; data?: Json; error?: string; seal: Seal; }
export interface Coverage { start: number; end: number; status: string; }
export interface LiveApi {
  enabled: boolean;
  online: boolean;
  sites: Map<string, Json>;
  seal: Seal;
  probe(): Promise<boolean>;
  apiId(labId: string): string | null;
  coverage(labId: string): Coverage | null;
  covers(labId: string, t0: number, hours: number): boolean;
  sky(labId: string, startUtc: string, hours?: number): Promise<LiveResult>;
  compare(labIds: string[], startUtc: string, hours: number): Promise<LiveResult>;
  delay(labId: string, startUtc: string, hours: number, delays: number[], constraints: Json): Promise<LiveResult>;
  onboard(labId: string, startUtc: string, hours: number, power: Json, maxBlackoutH: number, delayH?: number): Promise<LiveResult>;
}

/** Lab site id -> API catalogue id. A lab id without a pair stays static-only. */
export const SITE_MAP: Readonly<Record<string, string>> = Object.freeze({
  "peak-near-shackleton": "peak-near-shackleton",
  "connecting-ridge": "connecting-ridge",
  "malapert-massif": "malapert-massif",
  "nobile-rim-1": "nobile-rim-1",
  "mons-mouton-im2": "mons-mouton-im2",
});

export const OFFLINE_SEAL: Readonly<Seal> = Object.freeze({ text: "offline · precomputed", cls: "offline", live: false });

/** Strict UI gate: a nested status string alone never certifies science.
 * Require the response-level explicit attestation and pinned provenance too. */
export function sealFor(resp: Json | null | undefined): Seal {
  const st = resp && typeof resp === "object" ? resp.science_status ?? resp.provenance?.science_status : undefined;
  const eng = resp?.engine_science_status;
  const prov=resp?.provenance;
  const certified=st==="VALIDATED" && resp?.scientifically_validated===true &&
    typeof prov?.terrain_sha256==="string" && /^[0-9a-f]{64}$/.test(prov.terrain_sha256) &&
    typeof prov?.ephemeris_id==="string" && prov.ephemeris_id.length>0 && prov.frame==="MOON_ME";
  const label = ({ SYNTHETIC: "synthetic", UNVERIFIED: "unverified inputs", PRELIMINARY: "preliminary · not independently reviewed", VALIDATED: certified ? "validated" : "unverified inputs", NO_SERIES_DATA: "no series data" } as Record<string, string | undefined>)[st];
  if (!label) return { text: "live API · status not reported", cls: "unknown", live: true };
  return { text: `live API · ${label}${eng && eng !== st ? ` (${eng})` : ""}`, cls: certified ? "validated" : "unverified", live: true };
}

const trim = (b: unknown) => String(b || "").replace(/\/+$/, "");

export function createLive({ base, fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 4000 }: { base?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): LiveApi {
  const root = trim(base);
  const api = { enabled: Boolean(typeof base === "string" && fetchImpl), online: false, sites: new Map(), seal: OFFLINE_SEAL } as LiveApi;
  async function call(path: string, body?: unknown): Promise<Json> {
    if (!api.enabled) throw new Error("API disabled");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await fetchImpl(root + path, body === undefined ? { signal: ctl?.signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl?.signal });
      if (!r.ok) { let m = ""; try { m = (await r.json()).error || ""; } catch { /* no body */ } const e: Error & { status?: number } = new Error(`API ${r.status}${m ? ": " + m : ""}`); e.status = r.status; throw e; }
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  }
  /** GET /api/sites. On failure the lab stays in offline mode. */
  api.probe = async () => {
    try {
      const d = await call("/api/sites");
      api.sites = new Map((d.sites || []).map((s: Json) => [s.id, s]));
      api.online = true; api.seal = { text: "live API · catalogue loaded", cls: "unknown", live: true };
    } catch { api.online = false; api.sites = new Map(); api.seal = OFFLINE_SEAL; }
    return api.online;
  };
  api.apiId = (labId: string) => (api.online ? SITE_MAP[labId] ?? null : null);
  /** The API only has a series for some sites (site.series). Null when unknown/absent. */
  api.coverage = (labId: string) => { const s = api.sites.get(api.apiId(labId) as string); return s?.series ? { start: Date.parse(s.series.start_utc), end: Date.parse(s.series.end_utc), status: s.series.science_status } : null; };
  api.covers = (labId: string, t0: number, hours: number) => { const c = api.coverage(labId); return Boolean(c) && t0 >= c!.start && t0 + hours * 3600e3 <= c!.end; };
  const guard = async (fn: () => Promise<Json>) => { try { return { ok: true, data: await fn() }; } catch (e) { api.seal = OFFLINE_SEAL; return { ok: false, error: (e as Error).message }; } };
  /** Each method returns {ok, data, seal}; seal is derived from the response, or offline on failure. */
  const wrap = async (fn: () => Promise<Json>): Promise<LiveResult> => { const r = await guard(fn); if (!r.ok) return { ...r, seal: OFFLINE_SEAL };
    const item = r.data?.results?.[0] ?? r.data?.candidates?.[0] ?? r.data?.options?.[0] ?? r.data;
    return { ...r, seal: sealFor({ ...item, scientifically_validated: r.data?.scientifically_validated === true }) };
  };
  api.sky = (labId: string, startUtc: string, hours = 1) => wrap(() => call(`/api/sites/${encodeURIComponent(api.apiId(labId) as string)}/sky?start=${encodeURIComponent(startUtc)}&hours=${hours}`));
  api.compare = (labIds: string[], startUtc: string, hours: number) => wrap(() => call("/api/compare", { site_ids: labIds.map(api.apiId), start_utc: startUtc, duration_hours: hours }));
  api.delay = (labId: string, startUtc: string, hours: number, delays: number[], constraints: Json) => wrap(() => call("/api/scenarios/delay", { site_id: api.apiId(labId), start_utc: startUtc, duration_hours: hours, delays_hours: delays, observer_height_m: 2, max_nearby: 0, constraints }));
  api.onboard = (labId: string, startUtc: string, hours: number, power: Json, maxBlackoutH: number, delayH = 0) => wrap(() => call("/api/onboard/site-evaluate", { mission_id: "polar-lab", start_utc: startUtc, duration_hours: hours, candidates: [{ id: "lab", site_id: api.apiId(labId), delay_hours: delayH }], power, max_comm_blackout_hours: maxBlackoutH }));
  return api;
}

/** Percent view of an API /compare site result (fractions 0..1 -> %). Returns null unless data_status === AVAILABLE. */
export function compareRow(result: Json | null | undefined, scientificallyValidated = false) {
  if (!result || result.data_status !== "AVAILABLE" || !result.evaluation) return null;
  const m = result.evaluation.metrics;
  return { sunPct: m.sun_visible_fraction * 100, earthPct: m.earth_visible_fraction * 100, bothPct: m.simultaneous_fraction * 100, longestDarkH: m.longest_continuous_dark_hours, longestBlackoutH: m.longest_continuous_comm_gap_hours, windows: result.evaluation.simultaneous_windows || [], seal: sealFor({ ...result, scientifically_validated: scientificallyValidated }) };
}
