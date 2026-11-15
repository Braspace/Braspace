import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {compareDay,readVisibility,readSites,utcDay} from "../moon-hd/mission-api.js";
import {mountThree,placeSites} from "../moon-hd/three.js";

const id="connecting-ridge",day="2026-11-15",start=day+"T00:00:00Z";
const response=()=>({scientifically_validated:false,request:{start_utc:start,duration_hours:24},results:[{site:{id},data_status:"AVAILABLE",science_status:"PRELIMINARY",engine_science_status:"UNVERIFIED_INPUTS",evaluation:{metrics:{sun_visible_fraction:.5,earth_visible_fraction:.25,longest_continuous_dark_hours:12,longest_continuous_comm_gap_hours:18}}}]});

test("UTC day: rejects impossible dates, times and out-of-coverage epochs",()=>{
 assert.equal(utcDay(day),start);assert.equal(utcDay("2028-02-29"),"2028-02-29T00:00:00Z");
 for(const v of ["2026-02-29","2026-11-31","2029-01-01","2024-12-31","2026-11-15T12:00:00Z",""])assert.equal(utcDay(v),null,v);
});
test("only supplied finite south-polar catalog coordinates, never synthetic or null",()=>{
 const site={id,name:"Connecting Ridge",lat:-89.46,lon:-137.49};
 assert.deepEqual(readSites({sites:[site,{...site,id:"synthetic-demo-a"},{...site,lat:null},{...site,lat:0},{...site,lon:181},{...site,id:"../bad"}]}),[site]);
 assert.throws(()=>readSites({}),/Catálogo/);
});
test("Go adapter sends exact day and stored-site ID to compare; consumes only preliminary Rust output",async()=>{
 const control=new AbortController();let calls=0;
 const result=await compareDay(id,day,control.signal,async(url,opts)=>{
  calls++;assert.equal(url,"/api/compare");assert.equal(opts.method,"POST");assert.equal(opts.signal,control.signal);
  assert.deepEqual(JSON.parse(opts.body),{site_ids:[id],start_utc:start,duration_hours:24,include_series:false});
  return new Response(JSON.stringify(response()),{status:200});
 });
 assert.equal(calls,1);assert.deepEqual(result,{sun:.5,earth:.25,darkness:12,blackout:18,science:"PRELIMINARY",engine:"UNVERIFIED_INPUTS"});
});
test("rejects unavailable, malformed, synthetic, out-of-context or falsely validated numbers",()=>{
 for(const mutate of [r=>r.results[0].data_status="NO_SERIES_DATA",r=>r.results[0].science_status="SYNTHETIC",r=>r.results[0].engine_science_status="VALIDATED",r=>r.scientifically_validated=true,r=>r.request.start_utc="2026-11-16T00:00:00Z",r=>r.results[0].site.id="elsewhere",r=>r.results[0].evaluation.metrics.sun_visible_fraction=1.1,r=>r.results[0].evaluation.metrics.earth_visible_fraction=null,r=>r.results[0].evaluation.metrics.longest_continuous_dark_hours=25]){
  const r=response();mutate(r);assert.throws(()=>readVisibility(r,id,start));
 }
});
test("API failures never become fake metrics",async()=>{
 await assert.rejects(compareDay(id,day,new AbortController().signal,async()=>new Response("{}",{status:503})),/503/);
 await assert.rejects(compareDay("synthetic-demo-a",day,new AbortController().signal,async()=>{throw Error("must not call")}),/válidos/);
});
test("typed adapter selects catalog markers and focuses on the chosen site",()=>{
 const calls=[],site={id,name:"Connecting Ridge",lat:-89.46,lon:-137.49};
 placeSites({setSites:s=>calls.push(s),focus:(a,b)=>calls.push([a,b])},[site],site);
 assert.deepEqual(calls,[[{id,coordinate:{latitude_deg:site.lat,longitude_deg:site.lon}}],[site.lat,site.lon]]);
 assert.equal(typeof mountThree,"function");
});
test("shell keeps one persistent Preact root with no automatic backdrop or external terrain redirect",async()=>{
 const [index,shell,component,css]=await Promise.all(["../index.html","../shell/app.tsx","../moon-hd/preact.tsx","../moon-hd/preact.css"].map(p=>readFile(new URL(p,import.meta.url),"utf8")));
 assert.equal((index.match(/id="moon-console-root"/g)||[]).length,1);assert.doesNotMatch(index,/data-moon-backdrop/);
 assert.match(shell,/paintMoonConsole\(el\("moon-console-root"\)/);assert.match(shell,/path: "\/terreno", title: "Terreno 3D", render:/);
 assert.match(component,/prefers-reduced-motion/);assert.match(component,/this\.scene\?\.dispose/);assert.match(component,/role="status"/);
 assert.match(css,/pole-preview\.webp/);assert.match(css,/max-width: 720px/);assert.match(css,/min-height: 44px/);
});
