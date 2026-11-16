import test from "node:test";
import assert from "node:assert/strict";
import { validateRuleInputs } from "../screens/plan-model.js";
const raw = { night: "60", blackout: "72", battery: "30", mast: "2", slope: "8", sunMode: "center", step: "1" };
test("rules are applied atomically only after every numeric field is valid", () => {
  for (const key of ["night", "blackout", "battery", "mast", "slope"]) {
    for (const value of ["", " ", "-1", "NaN", "Infinity", "abc"]) assert.equal(validateRuleInputs({ ...raw, [key]: value }), null, `${key}=${value}`);
  }
  for (const patch of [{battery:"101"}, {slope:"91"}, {step:"1.5"}, {sunMode:"unknown"}]) assert.equal(validateRuleInputs({...raw,...patch}),null);
  assert.equal(validateRuleInputs({...raw,night:"1.5"}).night,1.5, "a fractional assumed limit is valid; durations still use the hourly grid");
  assert.equal(validateRuleInputs({...raw,battery:"0",slope:"90"}).battery,0);
  assert.equal(raw.night,"60", "validation never mutates the previous input");
});
