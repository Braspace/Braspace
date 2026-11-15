import {test,after} from "node:test";
import assert from "node:assert/strict";
import {createServer,labFile} from "../dev-server.mjs";
import {backendStatus,backendSky,backendCompare,backendVectorAvailability,backendOnboardTraining,presentationStatus} from "../lab/backend-bridge.js";

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("MoonProof is the product; shared lab modules and NASA-derived data stay same-origin",async()=>{
 const home=await fetch(origin+"/");assert.equal(home.status,200);assert.match(await home.text(),/url=moonproof\//);
 const paths=[
  ["/moonproof/","text/html"],["/moonproof/landing.html","text/html"],
  ["/lab/physics.js","text/javascript"],["/lab/scene.js","text/javascript"],["/lab/backend-bridge.js","text/javascript"],
  ["/data/sites.json","application/json"],["/data/region/south_pole_400m.bin","application/octet-stream"],
  ["/data/moonhd/manifest.json","application/json"],["/moon-hd.html","text/html"]
 ];
 for(const [path,ct] of paths){
  const r=await fetch(origin+path);
  assert.equal(r.status,200,path);
  assert.match(r.headers.get("content-type"),new RegExp(ct),path);
  assert.match(r.headers.get("content-security-policy"),/default-src 'none'/,path);
  assert.equal(r.headers.get("x-content-type-options"),"nosniff",path);
 }
});
test("archived surfaces are no longer served (archive/web-legacy)",async()=>{
 for(const path of ["/classic.html","/lab.html","/lab/app.js","/studio/","/onboard/","/onboard/cockpit.html","/dashboard/","/shell/app.js","/ds/router.js","/polar-map-demo.html","/app.js","/moon3d.js","/styles.css"]){
  const r=await fetch(origin+path);assert.equal(r.status,404,path);
 }
});
test("strict allowlist denies file access and sensitive extensions",async()=>{
 for(const path of ["/lab/.env","/data/private.env","/data/notlisted.mjs","/lab/sites.json",
   "/api/config/.env","/lab/_secret.txt","/.git/config","/data/..%2fpackage.json"]){
  if(path.startsWith("/api/"))continue;
  const r=await fetch(origin+path);
  assert.equal(r.status,404,path);
 }
 for(const path of ["/lab/app.js","/data/sites.json"]){
  assert.ok(labFile(path));
  const r=await fetch(origin+path,{method:"PUT"});
  assert.equal(r.status,405,path);
 }
});
test("backend bridge uses actual Go API response, never merges synthetic data",async()=>{
 const calls=[];
 const mock=async (url,opts)=>{
  calls.push({url,method:opts.method||"GET"});
  const value=url==="/api/health"?{engine:"ready",data_source:"postgres"}:
   url==="/api/sites"?{sites:[{id:"peak-near-shackleton"},{id:"synthetic-demo-a",series:{science_status:"SYNTHETIC"}}]}:
   {error:"no series",code:"NO_SERIES_DATA"};
  const status=url.endsWith("/sky?start=2026-12-01T00%3A00%3A00Z&hours=6")?404:200;
  return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
 };
 const status=await backendStatus(mock);
 assert.equal(status.engine,"ready");
 assert.equal(status.dataSource,"postgres");
 assert.equal(status.sites[0].scienceStatus,"NO_SERIES_DATA");
 assert.equal(status.sites[1].scienceStatus,"SYNTHETIC");
 await assert.rejects(backendSky("peak-near-shackleton","2026-12-01T00:00:00Z",6,mock),{code:"NO_SERIES_DATA",status:404});
 assert.deepEqual(calls.map(c=>c.url).slice(0,2),["/api/health","/api/sites"]);
});
test("bad sky request, invalid compare and science-label escalation fail closed",async()=>{
 const forbidden=()=>{throw new Error("unexpected network call")};
 await assert.rejects(backendSky("../secret","2026-12-01T00:00:00Z",6,forbidden),/invalid site/);
 await assert.rejects(backendSky("peak-near-shackleton","yesterday",6,forbidden),/expected UTC/);
 await assert.rejects(backendSky("peak-near-shackleton","2026-12-01T00:00:00Z",721,forbidden),/invalid site or hours/);
 await assert.rejects(backendCompare({site_ids:[],start_utc:"2026-12-01T00:00:00Z",duration_hours:6},forbidden),/invalid sites/);
 assert.match(presentationStatus({science_status:"VALIDATED",scientifically_validated:false}),/UNVERIFIED/);
 assert.match(presentationStatus({science_status:"SYNTHETIC",scientifically_validated:true}),/UNVERIFIED/);
 assert.match(presentationStatus({science_status:"VALIDATED"}),/UNVERIFIED/);
 assert.match(presentationStatus({science_status:"VALIDATED",scientifically_validated:true}),/SOURCE-VALIDATED/);
});

test("pgvector availability is optional and never certifies lunar physics",async()=>{
 const healthy=await backendVectorAvailability(async ()=>new Response(JSON.stringify({
  enabled:true,available:true,dimension:384,model_id:"qa-synthetic-384",scientifically_validated:false
 }),{status:200,headers:{"content-type":"application/json"}}));
 assert.equal(healthy.available,true);
 assert.equal(healthy.modelID,"qa-synthetic-384");
 const disabled=await backendVectorAvailability(async ()=>new Response(JSON.stringify({
  enabled:false,available:false,dimension:384,model_id:"",scientifically_validated:false
 }),{status:200,headers:{"content-type":"application/json"}}));
 assert.equal(disabled.enabled,false);
 const absent=await backendVectorAvailability(async ()=>new Response(JSON.stringify({code:"NOT_FOUND"}),{status:404}));
 assert.equal(absent.available,false);
 assert.equal(absent.enabled,false);
});

test("Go onboard integration runs labelled synthetic risk inputs only",async()=>{
 let called=false;
 const mock=async(path,opts)=>{
  assert.equal(path,"/api/onboard/evaluate");
  assert.equal(opts.method,"POST");
  const request=JSON.parse(opts.body);
  assert.equal(request.candidates.length,1);
  assert.equal(request.candidates[0].source_claim,"SYNTHETIC-NOT-NASA");
  called=true;
  return new Response(JSON.stringify({
   science_status:"UNVERIFIED_INPUTS",no_flight_recommendation:true,
   decision:"NO_OPTION_PASSES_ASSUMED_LIMITS",
   options:[{end_mode:"POWER_LOSS",simulation_status:"CONSTRAINTS_BREACHED",risks:[{category:"ENERGY_LOSS"}]}]
  }),{status:200});
 };
 const result=await backendOnboardTraining(mock);
 assert.equal(called,true);
 assert.equal(result.trainingOnly,true);
 assert.equal(result.risks,1);
 assert.equal(result.mode,"POWER_LOSS");
 await assert.rejects(backendOnboardTraining(async()=>new Response(JSON.stringify({
  science_status:"VALIDATED",no_flight_recommendation:false,options:[{}]
 }),{status:200})),/INVALID_ONBOARD_CONTRACT/);
});
