// The browser never calculates mission metrics from the Moon shader.
// Go /api/compare selects stored LOLA/SPICE series and invokes the Rust engine.
import { apiURL } from "../api-base.js";

export interface LunarSite { id: string; name: string; lat: number; lon: number; }
export interface Visibility { sun: number; earth: number; darkness: number; blackout: number; science: string; engine: string; }
const object = (x: unknown): Record<string, unknown> | null => x !== null && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
export function readSites(value: unknown): LunarSite[] {
  const items = object(value)?.sites;
  if (!Array.isArray(items)) throw new Error("Catálogo lunar indisponível");
  return items.flatMap(x => {
    const s = object(x);
    return s && typeof s.id === "string" && /^[a-z0-9-]+$/.test(s.id) && !s.id.startsWith("synthetic-") && typeof s.name === "string" && num(s.lat) && num(s.lon) && s.lat >= -90 && s.lat <= -80 && Math.abs(s.lon) <= 180 ? [{ id: s.id, name: s.name, lat: s.lat, lon: s.lon }] : [];
  });
}
export function utcDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value < "2025-01-01" || value > "2028-12-31") return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value + "T00:00:00Z" : null;
}
export function readVisibility(value: unknown, site: string, start: string): Visibility {
  const response = object(value), request = object(response?.request);
  if (response?.scientifically_validated !== false || request?.start_utc !== start || request?.duration_hours !== 24 || !Array.isArray(response.results)) throw new Error("Resposta científica incompatível");
  const result = response.results.map(object).find(r => object(r?.site)?.id === site);
  if (!result || result.data_status !== "AVAILABLE") throw new Error("Sem série disponível para esta janela");
  const metrics = object(object(result.evaluation)?.metrics);
  const sun = metrics?.sun_visible_fraction, earth = metrics?.earth_visible_fraction, darkness = metrics?.longest_continuous_dark_hours, blackout = metrics?.longest_continuous_comm_gap_hours;
  if (!num(sun) || sun < 0 || sun > 1 || !num(earth) || earth < 0 || earth > 1 || !num(darkness) || darkness < 0 || darkness > 24 || !num(blackout) || blackout < 0 || blackout > 24 || result.science_status !== "PRELIMINARY" || result.engine_science_status !== "UNVERIFIED_INPUTS") throw new Error("Métricas sem proveniência preliminar compatível");
  return { sun, earth, darkness, blackout, science: result.science_status, engine: result.engine_science_status };
}
export async function compareDay(site: string, day: string, signal: AbortSignal, fetcher = fetch): Promise<Visibility> {
  const start = utcDay(day);
  if (!start || !/^[a-z0-9-]+$/.test(site) || site.startsWith("synthetic-")) throw new Error("Selecione local e data UTC válidos");
  const response = await fetcher(apiURL("/api/compare"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_ids: [site], start_utc: start, duration_hours: 24, include_series: false }), signal });
  if (!response.ok) throw new Error(`API indisponível (${response.status})`);
  return readVisibility(await response.json(), site, start);
}
