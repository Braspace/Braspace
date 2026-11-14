// BR61 / issues 123, 124 and next_transitions: behaviour of the pure helpers (no hard-coded limits).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const L = require("../live.js");
const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const r422 = { ok: false, status: 422, error: JSON.stringify({ code: "WINDOW_TOO_LONG", error: "candidates[0]: 720 samples exceed the onboard limit of 480" }) };

test("422 body: code and message come from the API", () => {
  assert.deepEqual(L.parseApiError(r422), { code: "WINDOW_TOO_LONG", message: "candidates[0]: 720 samples exceed the onboard limit of 480" });
  const t = L.refusalText(r422);
  assert.match(t, /HTTP 422/); assert.match(t, /WINDOW_TOO_LONG/); assert.match(t, /720 samples exceed/);
  assert.doesNotMatch(t, /indispon/i);
});
test("non-JSON refusal keeps the raw text", () => {
  assert.equal(L.parseApiError({ status: 400, error: "bad" }).message, "bad");
  assert.equal(L.parseApiError({ status: 400, error: "bad" }).code, null);
});
test("limit is read from the API text, absent => null", () => {
  assert.equal(L.limitFromMessage("x: 720 samples exceed the onboard limit of 480", "samples"), 480);
  assert.equal(L.limitFromMessage("site_ids must contain 1 to 3 sites", "sites"), 3);
  assert.equal(L.limitFromMessage("other", "samples"), null);
});
test("pickSites: user picks, deduplicated, capped; empty => current site", () => {
  assert.deepEqual(L.pickSites(["a", "b", "c", "d", "e"], "z", 3), ["a", "b", "c"]);
  assert.deepEqual(L.pickSites(["a", "a", "b"], "z", 3), ["a", "b"]);
  assert.deepEqual(L.pickSites([], "z", 3), ["z"]);
  assert.deepEqual(L.pickSites(undefined, "z", 3), ["z"]);
});
test("transitionRows shows time, resolution and the null reason", () => {
  const nt = { sun: { kind: "sunset", hours_from_start: 12.5, resolution_seconds: 3600, epoch_utc: "2026-12-01T12:30:00Z", last_unchanged_utc: "2026-12-01T11:30:00Z" }, sun_null_reason: null,
    earth: null, earth_null_reason: "NO_CHANGE_IN_WINDOW: visible at every stored sample" };
  const rows = L.transitionRows(nt);
  assert.match(rows[0].text, /pôr do Sol em 12,5 h/); assert.match(rows[0].text, /resolução 3600 s/);
  assert.match(rows[1].text, /NO_CHANGE_IN_WINDOW/);
  assert.equal(L.transitionRows(null), null);
});
test("sky response carries next_transitions through", () => {
  const nt = { sun: null, sun_null_reason: "x", earth: null, earth_null_reason: "y" };
  const k = L.skyFromResponse({ ok: true, data: { samples: [{}], terrain_horizon: null, science_status: "SYNTHETIC", step_seconds: 3600, next_transitions: nt } });
  assert.deepEqual(k.next_transitions, nt);
});
test("cockpit wires the helpers: no fixed 480, no 15-site list, next-transitions panel in Janelas", () => {
  const c = src("cockpit.js");
  assert.doesNotMatch(c, /Math\.min\(S\.durationH, 480\)/);
  assert.match(c, /L\.pickSites\(S\.compareSel/);
  assert.match(c, /L\.refusalText\(res\)/);
  assert.match(c, /nextTransitionsPanel\(\)/);
});
test("site-evaluate panel does not print the combined_decision object as [object Object]", () => {
  const c = src("cockpit.js");
  assert.match(c, /decisionText\(r\.data\.combined_decision\)/);
  assert.doesNotMatch(c, /r\.data\.combined_decision \|\| /);
});
