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
  assert.ok(validateInputs({ ...power, battery_capacity_wh: 0 }, CREW_DEFAULT).errors.includes("battery_capacity_wh"));
  for (const [key,value] of [["size",13],["o2_kg_per_person_day",0],["reserve_hours",721],["rate_source",""],["aboard_during_delay",null]]) assert.ok(validateInputs(power,{...CREW_DEFAULT,[key]:value}).errors.includes(key));
});
test("missing consumables stay null, not zero", () => {
  const a = readCrewAnswer({ candidates: [{ consumables: { status: "OK", items: [{ resource: "oxygen", unit: "kg", autonomy_hours: 85.7, margin_hours: null }] } }] });
  assert.equal(a.rows[0].autonomyH, 85.7); assert.equal(a.rows[0].marginH, null);
  assert.deepEqual(readCrewAnswer(null).rows, []);
});

import { sensitivityVariants, readEnergy, loadSaved, saveScenario, savedExport, SAVED_KEY } from "../screens/cockpit-crew.js";
test("sensitivity varies one input at a time by 20 % and keeps charge <= capacity", () => {
  const v = sensitivityVariants({ battery_capacity_wh: 20000, initial_charge_wh: 18000, reserve_wh: 4000, solar_generation_w: 1500, load_w: 600 });
  assert.deepEqual(v.map(x => x.id), ["base", "battery-20", "solar-20", "load+20"]);
  assert.equal(v[1].power.battery_capacity_wh, 16000); assert.equal(v[1].power.initial_charge_wh, 16000);
  assert.equal(v[2].power.solar_generation_w, 1200); assert.equal(v[3].power.load_w, 720);
});
test("energy readout keeps missing values null", () => {
  assert.deepEqual(readEnergy({ onboard: { options: [{ end_mode: "POWER_LOSS", metrics: { minimum_charge_wh: 0 } }] } }), { minWh: 0, unservedWh: null, endMode: "POWER_LOSS", status: null });
  assert.equal(readEnergy(null).minWh, null);
});
test("saved scenarios survive a broken store and export as versioned JSON", () => {
  const mem = new Map(); const st = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadSaved(st), []);
  saveScenario(st, { id: "a", query: "?site=x" }); saveScenario(st, { id: "b", query: "?site=y" }); saveScenario(st, { id: "a", query: "?site=z" });
  assert.deepEqual(loadSaved(st).map(x => x.id + x.query), ["a?site=z", "b?site=y"]);
  mem.set(SAVED_KEY, "{not json"); assert.deepEqual(loadSaved(st), []);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadSaved(broken), []); assert.equal(saveScenario(broken, { id: "c" }).ok, false);
  assert.equal(saveScenario(null, {id:"d"}).ok, false);
  const e = savedExport([{ id: "a" }], new Date("2025-01-01T00:00:00Z")); assert.equal(e.schema, "braspace.cockpit-scenarios"); assert.equal(e.version, 1);
});

