import {test} from "node:test";
import assert from "node:assert/strict";
import {compareLive} from "../shell/live-compare.js";
const start=Date.parse("2026-12-01T00:00:00Z");
const item={site:{id:"test"},data_status:"AVAILABLE",science_status:"PRELIMINARY",evaluation:{start_utc:new Date(start).toISOString(),end_utc:new Date(start+3600000).toISOString(),metrics:{sun_visible_fraction:0.1,earth_visible_fraction:0.5,simultaneous_fraction:0.1,longest_continuous_dark_hours:1,longest_continuous_comm_gap_hours:0}}};
const fetchResult=(results)=>async()=>({ok:true,json:async()=>({results,request_sha256:"test"})});
test("only exact preliminary API results drive the shell comparison",async()=>{
 const entries=await compareLive(["test"],start,1,fetchResult([item]));
 assert.equal(entries.get("test").sunPct,10);
 assert.equal(entries.get("test").origin,"POST /api/compare");
});
test("missing, synthetic, misaligned, and HTTP failed results retain static fallback",async()=>{
 for(const change of [{data_status:"NO_SERIES_DATA"},{science_status:"SYNTHETIC"},{evaluation:{...item.evaluation,end_utc:new Date(start).toISOString()}}]){
  assert.equal(await compareLive(["test"],start,1,fetchResult([{...item,...change}])),null);
 }
 assert.equal(await compareLive(["test"],start,1,async()=>({ok:false})),null);
});
