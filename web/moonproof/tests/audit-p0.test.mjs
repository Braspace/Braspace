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

test("AUD-15: only whole hours and on-the-hour starts are accepted from the URL", async () => {
  const { parseState } = await import("../core/state.js");
  assert.equal(parseState("?hours=36.5").hours, null);
  assert.equal(parseState("?hours=36").hours, 36);
  assert.equal(parseState("?start=2025-01-01T00:30:00Z").start, null);
  assert.equal(parseState("?start=2025-01-01T03:00:00Z").start, "2025-01-01T03:00:00Z");
});

test("AUD-17: a landing attempt exports as versioned JSON marked as local simulation", async () => {
  const { attemptExport } = await import("../screens/landing-model.js");
  const e = attemptExport({ site: "x", result: "LANDED" }, new Date("2025-01-01T00:00:00Z"));
  assert.equal(e.schema, "braspace.landing-attempt"); assert.equal(e.version, 1);
  assert.equal(e.science_status, "SIMULATION"); assert.equal(e.attempt.site, "x");
});

import { readFile } from "node:fs/promises";
const src = f => readFile(new URL("../screens/" + f, import.meta.url), "utf8");
test("AUD-12/13: replan search horizon does not depend on the mission length, and coverage/source is shown", async () => {
  const r = await src("recover.js");
  assert.doesNotMatch(r, /searchDays:\s*Math\.floor\(sc\.hours/);
  assert.match(r, /const SEARCH_DAYS = \d+;/);
  assert.match(r, /t\("rec\.coverage"/);
});
test("AUD-03: a free point's light block is labelled as the PGDA long-term mean", async () => {
  const e = await src("explore.js");
  assert.match(e, /point \? t\("ex\.pgdaLong"\)/);
});
test("AUD-19: SCIENTIFIC_ACCEPTANCE states built/validated/published and promotes nothing to validated", async () => {
  const d = await readFile(new URL("../../../docs/SCIENTIFIC_ACCEPTANCE.md", import.meta.url), "utf8");
  assert.match(d, /built vs validated vs published/i);
  const rows = d.split("\n").filter(l => /^\| G\d/.test(l) && l.includes("|"));
  const table = rows.slice(0, 7);
  assert.equal(table.length, 7);
  for (const r of table) assert.match(r.split("|")[3], /\bNo\b/, r);
});
