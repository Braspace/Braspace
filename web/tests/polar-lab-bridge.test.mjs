import {test,after} from "node:test";
import assert from "node:assert/strict";
import {createServer,labFile} from "../dev-server.mjs";
import {backendStatus,backendSky,backendCompare,backendVectorAvailability,presentationStatus} from "../lab/backend-bridge.js";

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("Heloísa lab, linked from classic MoonProof, serves same-origin NASA assets",async()=>{
 const home=await (await fetch(origin+"/")).text();
 assert.match(home,/href="\.\/lab\.html"/);
 const paths=[
  ["/lab.html","text/html"],["/lab/app.js","text/javascript"],
  ["/lab/backend-bridge.js","text/javascript"],["/lab/backend-widget.js","text/javascript"],
  ["/lab/lab.css","text/css"],["/data/sites.json","application/json"],
  ["/data/region/south_pole_400m.bin","application/octet-stream"],
  ["/data/moon/lroc_color_2k.jpg","image/jpeg"],
  ["/data/validation/validation_horizons.json","application/json"]
 ];
 for(const [path,ct] of paths){
  const r=await fetch(origin+path);
  assert.equal(r.status,200,path);
  assert.match(r.headers.get("content-type"),new RegExp(ct),path);
  assert.match(r.headers.get("content-security-policy"),/default-src 'none'/,path);
  assert.equal(r.headers.get("x-content-type-options"),"nosniff",path);
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
