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

test("zero-hour darkness/earth limit and 0% battery floor round-trip; invalid ranges fail closed",()=>{
 const s=parseState("?night=0&blackout=0&battery=0&hours=24");
 assert.equal(s.night,0);assert.equal(s.blackout,0);assert.equal(s.battery,0);
 assert.equal(s.hours,24);
 const back=parseState("?"+toQuery(s));
 assert.equal(back.night,0);assert.equal(back.blackout,0);assert.equal(back.battery,0);
 const invalid=parseState("?hours=721&night=-1&blackout=721&battery=101");
 assert.equal(invalid.hours,null);
 assert.equal(invalid.night,DEFAULT_RULES.night);
 assert.equal(invalid.blackout,DEFAULT_RULES.blackout);
 assert.equal(invalid.battery,DEFAULT_RULES.battery);
});
