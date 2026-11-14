// Regression for the 14/11 product audit (AUD-10, AUD-14). Each fails on the code before the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictKey } from "../screens/landing-model.js";
import { dailyFractions } from "../screens/scenario-calc.js";

test("AUD-10: a rule with no data never yields a 'safe' verdict", () => {
  const rules = [{ id: "zone", state: "ok" }, { id: "sun", state: "nd" }, { id: "fuel", state: "ok" }];
  assert.equal(verdictKey({ result: "LANDED" }, rules), "partial");
  assert.equal(verdictKey({ result: "LANDED" }, rules.map(r => ({ ...r, state: "ok" }))), "safe");
});

test("AUD-14: samples outside the series are not counted as darkness", () => {
  const day = [...Array(12).fill(true), ...Array(12).fill(null)];
  assert.deepEqual(dailyFractions(day), [1]);
  assert.deepEqual(dailyFractions(Array(24).fill(null)), [null]);
});
