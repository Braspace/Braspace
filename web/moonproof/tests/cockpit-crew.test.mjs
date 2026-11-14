import { test } from "node:test";
import assert from "node:assert/strict";
import { CREW_DEFAULT, crewRequest, readCrewAnswer, validateInputs } from "../screens/cockpit-crew.js";
const power = { battery_capacity_wh: 20000, initial_charge_wh: 18000, reserve_wh: 4000, solar_generation_w: 1500, load_w: 600 };

test("crew request follows SiteOnboardRequest and keeps the rate source", () => {
  const b = crewRequest({ siteId: "mons-mouton-im2", startIso: "2025-01-01T00:00:00Z", hours: 72, maxBlackoutH: 24, power, crew: CREW_DEFAULT });
  for (const k of ["mission_id", "start_utc", "duration_hours", "candidates", "power", "max_comm_blackout_hours", "crew"]) assert.ok(k in b, k);
  assert.match(b.crew.rate_source, /BVAD/);
  assert.equal(b.candidates[0].site_id, "mons-mouton-im2");
});
test("validation refuses impossible inputs", () => {
  assert.equal(validateInputs(power, CREW_DEFAULT).ok, true);
  assert.deepEqual(validateInputs({ ...power, initial_charge_wh: 30000 }, CREW_DEFAULT).errors, ["initial_charge_wh"]);
  assert.ok(validateInputs(power, { ...CREW_DEFAULT, size: 1.5 }).errors.includes("size"));
  assert.ok(validateInputs({ ...power, load_w: NaN }, CREW_DEFAULT).errors.includes("load_w"));
});
test("missing consumables stay null, not zero", () => {
  const a = readCrewAnswer({ candidates: [{ consumables: { status: "OK", items: [{ resource: "oxygen", unit: "kg", autonomy_hours: 85.7, margin_hours: null }] } }] });
  assert.equal(a.rows[0].autonomyH, 85.7); assert.equal(a.rows[0].marginH, null);
  assert.deepEqual(readCrewAnswer(null).rows, []);
});
