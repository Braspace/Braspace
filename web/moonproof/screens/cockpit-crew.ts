// Crew, consumables and power inputs for the v3 Cockpit (replaces the "Entrada" and "Vida" tabs of the legacy onboard panel).
// Everything is computed by the API (POST /api/onboard/site-evaluate with `crew` and `power`) on the stored series of the site;
// the inputs are declared assumptions, never NASA values. Rates default to the repo example and keep their source text.
export const CREW_DEFAULT = Object.freeze({ size: 2, o2_stock_kg: 6, food_stock_kg: 13, o2_kg_per_person_day: 0.84, food_kg_per_person_day: 1.76,
  reserve_hours: 12, aboard_during_delay: true,
  rate_source: "Example planning values (O2 0.84, food 1.76 kg/person/day); verify against NASA BVAD NASA/TP-2015-218570 before use" });
export const POWER_FIELDS = ["battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"];
export const CREW_FIELDS = ["size", "o2_stock_kg", "food_stock_kg", "o2_kg_per_person_day", "food_kg_per_person_day", "reserve_hours"];

/** Validates the form values; returns { ok, errors } (finite, >= 0, size an integer >= 1, initial <= capacity, reserve <= capacity). */
export type Num = Record<string, number>;
/** Crew inputs: the numeric fields plus the declared rate source and the "aboard during delay" flag. */
export type Crew = Record<string, number | string | boolean>;
export function validateInputs(power: Num, crewIn: Crew) {
  const crew = crewIn as Num;
  const errors: string[] = [];
  for (const k of POWER_FIELDS) if (!(Number.isFinite(power[k]) && power[k] >= 0)) errors.push(k);
  for (const k of CREW_FIELDS) if (!(Number.isFinite(crew[k]) && crew[k] >= 0)) errors.push(k);
  if (!(Number.isInteger(crew.size) && crew.size >= 1)) errors.push("size");
  if (power.initial_charge_wh > power.battery_capacity_wh) errors.push("initial_charge_wh");
  if (power.reserve_wh > power.battery_capacity_wh) errors.push("reserve_wh");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/** Request body for POST /api/onboard/site-evaluate with crew (schema SiteOnboardRequest). */
export function crewRequest({ siteId, startIso, hours, maxBlackoutH, delayH = 0, power, crew }: { siteId: string; startIso: string | null; hours: number; maxBlackoutH: number; delayH?: number; power: Num; crew: Crew }) {
  return { mission_id: "moonproof-cockpit-crew", start_utc: startIso, duration_hours: hours, max_comm_blackout_hours: maxBlackoutH,
    candidates: [{ id: "cockpit", site_id: siteId, delay_hours: delayH }], power: { ...power }, crew: { ...crew } };
}

/** Reads the API answer: consumables rows + combined decision; missing values stay null (never 0). */
export function readCrewAnswer(data: any) {
  const c = data?.candidates?.[0] || null, cons = c?.consumables || null;
  const rows = ((cons?.items || []) as any[]).map(i => ({ resource: i.resource, unit: i.unit, autonomyH: i.autonomy_hours ?? null, marginH: i.margin_hours ?? null,
    remaining: i.remaining_at_end_kg ?? null, depletion: i.depletion_utc ?? null, status: i.status || null }));
  return { decision: data?.combined_decision?.status ?? data?.combined_decision ?? null, status: cons?.status ?? null, rateSource: cons?.rate_source ?? null,
    rows, risks: cons?.risks || [], science: c?.science_status ?? null };
}

// ---- Sensitivity (legacy onboard "Sensibilidade", now on the real API instead of the synthetic model.js)
/** One-at-a-time variations of the declared power inputs (±20 %). Pure. */
export function sensitivityVariants(power: Num) {
  return [
    { id: "base", power: { ...power } },
    { id: "battery-20", power: { ...power, battery_capacity_wh: power.battery_capacity_wh * 0.8, initial_charge_wh: Math.min(power.initial_charge_wh, power.battery_capacity_wh * 0.8) } },
    { id: "solar-20", power: { ...power, solar_generation_w: power.solar_generation_w * 0.8 } },
    { id: "load+20", power: { ...power, load_w: power.load_w * 1.2 } },
  ];
}
/** Energy result of the first onboard option; missing values stay null. */
export function readEnergy(data: any) {
  const o = data?.onboard?.options?.[0] || null, m = o?.metrics || {};
  return { minWh: m.minimum_charge_wh ?? null, unservedWh: m.total_unserved_energy_wh ?? null, endMode: o?.end_mode ?? null, status: o?.simulation_status ?? null };
}

// ---- Saved scenarios (legacy onboard "Registro"): local to this browser, exportable as versioned JSON.
export const SAVED_KEY = "braspace.cockpit.saved.v1";
export function loadSaved(storage: Storage | null | undefined): any[] { try { const v = JSON.parse(storage?.getItem(SAVED_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveScenario(storage: Storage | null | undefined, entry: { id: string; [k: string]: unknown }, max = 20) {
  const list = [entry, ...loadSaved(storage).filter((x: { id: string }) => x.id !== entry.id)].slice(0, max);
  try { storage?.setItem(SAVED_KEY, JSON.stringify(list)); return { ok: true, list }; } catch { return { ok: false, list }; }
}
export function savedExport(list: unknown[], now = new Date()) {
  return { schema: "braspace.cockpit-scenarios", version: 1, exported_utc: now.toISOString(), storage: "localStorage (this browser only)", science_status: "SIMULATION", scenarios: list };
}
