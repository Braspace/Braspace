import test from "node:test";
import assert from "node:assert/strict";
import { parseState, toQuery, DEFAULT_RULES, TASKS } from "../core/state.js";

test("scenario round-trips through the URL", () => {
  const s = { site: "malapert-massif", start: "2025-03-01T00:00:00Z", hours: 240, layer: "proof", task: "plan", lang: "pt-BR", night: 50, blackout: 72, battery: 25 };
  const back = parseState("?" + toQuery(s));
  assert.deepEqual(back, s);
  assert.equal(toQuery(back), toQuery(s));
});
test("defaults are not written and invalid values are dropped", () => {
  const s = parseState("?hours=-3&start=nope&layer=zzz&task=hack");
  assert.equal(s.hours, null); assert.equal(s.start, null); assert.equal(s.task, null); assert.equal(s.layer, "answer");
  assert.equal(s.night, DEFAULT_RULES.night);
  assert.equal(toQuery(s), "layer=answer");
});
test("task sets the opening layer unless layer is explicit", () => {
  for (const [task, layer] of Object.entries(TASKS)) assert.equal(parseState("?task=" + task).layer, layer);
  assert.equal(parseState("?task=plan&layer=why").layer, "why");
});
