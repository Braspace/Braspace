// #385: two draws starting together (initial load + onState, or a fast site change) must never read S.light
// before a calculation finished. compute() is extracted from the generated cockpit.js and run with a slow API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const text = readFileSync(new URL("../screens/cockpit.js", import.meta.url), "utf8");
const src = text.slice(text.indexOf("let computeRevision"), text.indexOf("async function skyTransition"));

function harness() {
  const series = { start: Date.parse("2025-01-01T00:00:00Z"), count: 100, sunMargin: new Float32Array(100), earthMargin: new Float32Array(100) };
  const gates = [];
  const c = { state: { site: "A", start: "2025-01-01T00:00:00Z", battery: 30, blackout: 20 }, doc: { sites: [{ id: "A" }, { id: "B" }] },
    hoursOf: () => 24, S: { fault: null, noSiteRoute: new Set(), t: 0, light: null, run: null, siteKey: "" }, HOUR_MS: 3600000,
    H1_PROFILE: { battery_capacity_wh: 20000 }, applyFault: (f, b) => ({ ...b, delayH: 0 }), online: true,
    siteEvaluateBody: x => x, api: () => {}, longestRun: () => 0, countRises: () => 0 };
  c.getState = () => c.state;
  // slow metrics: each call waits until the test releases it
  c.apiWindowMetrics = (doc, site) => new Promise(resolve => gates.push(() => resolve({ series, t0: series.start, id: site.id })));
  c.runScenario = async (call, request) => ({ route: "site", request });
  vm.createContext(c); vm.runInContext(src, c);
  return { c, gates };
}
const tick = () => new Promise(setImmediate);

test("compute() is the guarded version (no early return before the series is loaded)", () => {
  assert.ok(src.includes("computeRevision"), "cockpit.js must carry the revision guard");
  assert.match(src, /S\.siteKey = key;[\s\S]*S\.light = /, "siteKey is published together with S.light, after the awaits");
});

test("two concurrent draws for the same site: none reports ready while S.light is still null", async () => {
  const { c, gates } = harness();
  const a = c.compute(); await tick();
  const b = c.compute(); await tick(); // second draw while the first is still waiting for the series
  assert.equal(c.S.light, null);
  gates[1](); const rb = await b;
  gates[0](); const ra = await a;
  assert.equal(rb, true); assert.equal(ra, false, "the older run is dropped, never drawn");
  assert.ok(c.S.light && c.S.light.m.id === "A");
});

test("draw during a site change only becomes ready with that site's data", async () => {
  const { c, gates } = harness();
  const a = c.compute(); await tick();
  c.state = { ...c.state, site: "B" };
  const b = c.compute(); await tick();
  gates[0](); assert.equal(await a, false);
  assert.equal(c.S.light, null, "a late result for A must not fill the panel while B is selected");
  gates[1](); assert.equal(await b, true);
  assert.equal(c.S.light.m.id, "B"); assert.equal(c.S.reportReq.siteId, "B");
});

test("drawNow() stops when compute() says the run is stale", () => {
  const ts = readFileSync(new URL("../screens/cockpit.tsx", import.meta.url), "utf8");
  assert.match(ts, /async function drawNow\(\) \{\s*if \(!await compute\(\)\) return;/);
  assert.match(ts, /await skyTransition\(site, at\) : null;\s*if \(drawKey !== scenarioKey\(\)\) return;/);
});
