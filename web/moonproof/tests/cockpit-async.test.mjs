import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { saveScenario, loadSaved } from '../screens/cockpit-crew.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
function harness() {
  const text = read('../screens/cockpit.js');
  const fn = text.slice(text.indexOf('let computeRevision'), text.indexOf('async function skyTransition'));
  const series = { start: Date.parse('2025-01-01T00:00:00Z'), count: 100, sunMargin: new Float32Array(100), earthMargin: new Float32Array(100) };
  const c = { state: { site: 'A', start: '2025-01-01T00:00:00Z', battery: 30, blackout: 20 },
    doc: { sites: [{ id: 'A' }, { id: 'B' }] }, hoursOf: () => 24,
    S: { fault: null, noSiteRoute: new Set(), t: 0 }, HOUR_MS: 3600000,
    H1_PROFILE: { battery_capacity_wh: 20000 }, applyFault: (f,b) => ({ ...b, delayH: 0 }), online: true,
    siteEvaluateBody: x => x, api: () => {}, longestRun: () => 0, countRises: () => 0 };
  c.getState = () => c.state;
  c.apiWindowMetrics = async (doc,site) => ({ series, t0: series.start, id: site.id });
  c.runScenario = async (call,request) => ({ route: 'site', request });
  vm.createContext(c); vm.runInContext(fn,c); return c;
}
test('changing blackout updates the calculation and report request', async () => {
  const c = harness(); await c.compute(); assert.equal(c.S.reportReq.maxBlackoutH,20);
  c.state = { ...c.state, blackout: 12 }; await c.compute();
  assert.equal(c.S.reportReq.maxBlackoutH,12); assert.equal(c.S.run.request.maxBlackoutH,12);
});
for (const stage of ['metrics', 'engine']) test(`late ${stage} result cannot overwrite a newer site`, async () => {
  const c = harness(), pending = [];
  if (stage === 'metrics') {
    const load = c.apiWindowMetrics;
    c.apiWindowMetrics = (d,s) => new Promise(resolve => pending.push(async () => resolve(await load(d,s))));
  } else c.runScenario = (call,request) => new Promise(resolve => pending.push(() => resolve({ route:'site',request })));
  const a = c.compute(); await new Promise(setImmediate);
  c.state = { ...c.state, site:'B' }; const b = c.compute(); await new Promise(setImmediate);
  await pending[1](); assert.equal(await b,true);
  await pending[0](); assert.equal(await a,false);
  assert.equal(c.S.light.m.id,'B'); assert.equal(c.S.run.request.siteId,'B'); assert.equal(c.S.reportReq.siteId,'B');
});
test('a failed series load is evicted and a concurrent retry shares one new load', async () => {
  const text = read('../core/data.js'), start = text.indexOf('const seriesCache'); let calls = 0;
  const c = { DATA_BASE:'/data/', SiteSeries: { load: async () => { if (++calls === 1) throw Error('temporary'); return { recovered:true }; } } };
  vm.createContext(c); vm.runInContext(text.slice(start,text.indexOf('/**',start)).replace('export function','function'),c);
  const site = { id:'A',series:'sites/A' };
  await assert.rejects(c.loadSeries(site),/temporary/);
  const a = c.loadSeries(site), b = c.loadSeries(site); assert.equal(a,b);
  assert.equal((await a).recovered,true); assert.equal(calls,2);
});
test('missing storage reports failure and never claims persistence', () => {
  for (const store of [null,undefined]) { assert.equal(saveScenario(store,{id:'x'}).ok,false); assert.deepEqual(loadSaved(store),[]); }
});
