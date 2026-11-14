import {test} from "node:test";
import assert from "node:assert/strict";
import {safeID,toUTC,compareRequest,recoverRequest,metricsFor,validationBadge,api} from "../studio/api.js";

test("site ids and UTC are validated; no silent client timezone conversions",()=>{
 assert.equal(safeID("connecting-ridge"),"connecting-ridge");
 assert.throws(()=>safeID("../api/main.go"),/INVALID_SITE_ID/);
 assert.equal(toUTC("2026-11-15T04:00"),"2026-11-15T04:00:00Z");
 assert.throws(()=>toUTC("2026-02-30T02:00"));
 assert.throws(()=>toUTC("2026-11-15"));
});
test("equal-window comparison requires unique sites",()=>{
 assert.deepEqual(compareRequest(["connecting-ridge","peak-near-shackleton"],"2026-11-15T04:00",24),{
  site_ids:["connecting-ridge","peak-near-shackleton"],start_utc:"2026-11-15T04:00:00Z",duration_hours:24,include_series:false
 });
 assert.throws(()=>compareRequest(["connecting-ridge","connecting-ridge"],"2026-11-15T04:00",24),/SELECT_DISTINCT_SITES/);
 assert.throws(()=>compareRequest(["connecting-ridge"],"2026-11-15T04:00",721),/INVALID_DURATION/);
});
test("recovery requires explicit limits, never defaults or invented risk thresholds",()=>{
 assert.throws(()=>recoverRequest("connecting-ridge","2026-11-15T04:00",24,"",12),/SET_EXPLICIT_LIMITS/);
 assert.throws(()=>recoverRequest("connecting-ridge","2026-11-15T04:00",24,14,-1),/SET_EXPLICIT_LIMITS/);
 const r=recoverRequest("connecting-ridge","2026-11-15T04:00",24,14,12);
 assert.deepEqual(r.delays_hours,[24,48,72]);
 assert.equal(r.constraints.max_continuous_dark_hours,14);
 assert.equal(r.constraints.max_continuous_comm_gap_hours,12);
 assert.equal(r.power,undefined);
});
test("comparison numbers appear ONLY when data_status is AVAILABLE",()=>{
 const metrics={sun_visible_fraction:0.45,earth_visible_fraction:0.9,longest_continuous_dark_hours:4,longest_continuous_comm_gap_hours:6};
 assert.equal(metricsFor({data_status:"NO_SERIES_DATA",evaluation:{metrics}}),null);
 assert.equal(metricsFor({data_status:"AVAILABLE",evaluation:{metrics}})?.sun_visible_fraction,0.45);
 assert.equal(metricsFor({data_status:"AVAILABLE",evaluation:{metrics:{sun_visible_fraction:0.45}}}),null);
});
test("forged VALIDATED and missing provenance cannot promote the badge",()=>{
 const p={terrain_sha256:"a".repeat(64),ephemeris_id:"DE440",frame:"MOON_ME"};
 assert.match(validationBadge({scientifically_validated:false,science_status:"VALIDATED",provenance:p}),/UNVERIFIED/);
 assert.match(validationBadge({scientifically_validated:true,science_status:"UNVERIFIED",provenance:p}),/UNVERIFIED/);
 assert.match(validationBadge({scientifically_validated:true,science_status:"VALIDATED",provenance:{...p,terrain_sha256:"x"}}),/UNVERIFIED/);
 assert.match(validationBadge({science_status:"VALIDATED",provenance:p}),/UNVERIFIED/);
 assert.match(validationBadge({scientifically_validated:true,science_status:"VALIDATED",provenance:p}),/REVIEW REQUIRED/);
});
test("API path remains same origin, strict JSON, and does not fake unavailable data",async()=>{
 const requests=[];
 const mock=async(path,options)=>{requests.push([path,options]);return {ok:true,status:200,json:async()=>({sites:[]})};};
 assert.deepEqual(await api.sites(mock),{sites:[]});
 assert.equal(requests[0][0],"/api/sites");
 const bad=async()=>({ok:false,status:503,json:async()=>({code:"ENGINE_UNAVAILABLE"})});
 await assert.rejects(()=>api.sites(bad),/ENGINE_UNAVAILABLE/);
});
