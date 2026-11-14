// Crew, consumables and power inputs for the v3 Cockpit (replaces the "Entrada" and "Vida" tabs of the legacy onboard panel).
// Everything is computed by the API (POST /api/onboard/site-evaluate with `crew` and `power`) on the stored series of the site;
// the inputs are declared assumptions, never NASA values. Rates default to the repo example and keep their source text.
export const CREW_DEFAULT = Object.freeze({ size: 2, o2_stock_kg: 6, food_stock_kg: 13, o2_kg_per_person_day: 0.84, food_kg_per_person_day: 1.76,
  reserve_hours: 12, aboard_during_delay: true,
  rate_source: "Example planning values (O2 0.84, food 1.76 kg/person/day); verify against NASA BVAD NASA/TP-2015-218570 before use" });
export const POWER_FIELDS = ["battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"];
export const CREW_FIELDS = ["size", "o2_stock_kg", "food_stock_kg", "o2_kg_per_person_day", "food_kg_per_person_day", "reserve_hours"];

/** Validates the form values; returns { ok, errors } (finite, >= 0, size an integer >= 1, initial <= capacity, reserve <= capacity). */
export function validateInputs(power, crew) {
  const errors = [];
  for (const k of POWER_FIELDS) if (!(Number.isFinite(power[k]) && power[k] >= 0)) errors.push(k);
  for (const k of CREW_FIELDS) if (!(Number.isFinite(crew[k]) && crew[k] >= 0)) errors.push(k);
  if (!(Number.isInteger(crew.size) && crew.size >= 1)) errors.push("size");
  if (power.initial_charge_wh > power.battery_capacity_wh) errors.push("initial_charge_wh");
  if (power.reserve_wh > power.battery_capacity_wh) errors.push("reserve_wh");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/** Request body for POST /api/onboard/site-evaluate with crew (schema SiteOnboardRequest). */
export function crewRequest({ siteId, startIso, hours, maxBlackoutH, delayH = 0, power, crew }) {
  return { mission_id: "moonproof-cockpit-crew", start_utc: startIso, duration_hours: hours, max_comm_blackout_hours: maxBlackoutH,
    candidates: [{ id: "cockpit", site_id: siteId, delay_hours: delayH }], power: { ...power }, crew: { ...crew } };
}

/** Reads the API answer: consumables rows + combined decision; missing values stay null (never 0). */
export function readCrewAnswer(data) {
  const c = data?.candidates?.[0] || null, cons = c?.consumables || null;
  const rows = (cons?.items || []).map(i => ({ resource: i.resource, unit: i.unit, autonomyH: i.autonomy_hours ?? null, marginH: i.margin_hours ?? null,
    remaining: i.remaining_at_end_kg ?? null, depletion: i.depletion_utc ?? null, status: i.status || null }));
  return { decision: data?.combined_decision?.status ?? data?.combined_decision ?? null, status: cons?.status ?? null, rateSource: cons?.rate_source ?? null,
    rows, risks: cons?.risks || [], science: c?.science_status ?? null };
}
