import {test} from "node:test";
import assert from "node:assert/strict";
import worker,{handleMoonAPI} from "./moonproof-worker.mjs";

const origin="https://example.test";
test("only exact Moon API routes; remaining existing Worker routes fall through",async()=>{
 assert.equal(await handleMoonAPI(new Request(origin+"/api/sites")),null);
 assert.equal((await handleMoonAPI(new Request(origin+"/api/compare"))).status,405);
 assert.equal((await handleMoonAPI(new Request(origin+"/api/health?x=1"))).status,400);
 assert.equal(await (await worker.fetch(new Request(origin+"/"),{ASSETS:{fetch:()=>new Response("static")}})).text(),"static");
});
test("body size, MIME and JSON are bounded before upstream is consulted",async()=>{
 const run=(body,type="application/json")=>handleMoonAPI(new Request(origin+"/api/compare",{method:"POST",body,headers:{"Content-Type":type}}));
 assert.equal((await run("{}","text/plain")).status,415);
 assert.equal((await run("!invalid")).status,400);
 assert.equal((await run("[]")).status,400);
 assert.equal((await run("x".repeat(131073))).status,413);
});
test("server-side fetch is pinned, strips credentials and keeps the Go JSON status",async()=>{
 const original=globalThis.fetch;let observed;
 try{
  globalThis.fetch=async(url,opts)=>{observed={url,opts};return Response.json({code:"OUTSIDE_COVERAGE"},{status:422});};
  const body={site_ids:["connecting-ridge"],start_utc:"2026-11-15T00:00:00Z",duration_hours:24,include_series:false};
  const r=await handleMoonAPI(new Request(origin+"/api/compare",{method:"POST",body:JSON.stringify(body),headers:{"Content-Type":"application/json","Authorization":"Bearer test","Cookie":"test=1","Origin":origin}}));
  assert.equal(observed.url,"https://braspace-api.srv1898743.hstgr.cloud/api/compare");
  assert.equal(observed.opts.redirect,"error");assert.deepEqual(JSON.parse(observed.opts.body),body);
  for(const h of ["Authorization","Cookie","Origin"])assert.equal(observed.opts.headers.get(h),null);
  assert.equal(r.status,422);assert.equal(r.headers.get("cache-control"),"no-store");assert.deepEqual(await r.json(),{code:"OUTSIDE_COVERAGE"});
 }finally{globalThis.fetch=original;}
});
