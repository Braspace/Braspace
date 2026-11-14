import {after, test} from "node:test";
import assert from "node:assert/strict";
import {createServer, onboardFile} from "../dev-server.mjs";

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("onboard files are strictly allowlisted and never accept path traversal",()=>{
 for(const allowed of ["/onboard/index.html","/onboard/cockpit.html","/onboard/sim.js","/onboard/request.js","/onboard/app.js","/onboard/model.js","/onboard/features.js","/onboard/api.js","/onboard/cockpit.js"]){
  assert.ok(onboardFile(allowed),allowed);
 }
 for(const denied of ["/onboard/../../.env","/onboard/secrets.json","/onboard/dev-server.py","/onboard/.env","/onboard/unknown.js","/onboard/index.html/other","/onboard/foo%2fbar.js"]){
  assert.equal(onboardFile(denied),null,denied);
 }
});

test("both JV educational UI pages and scripts are served as same-origin assets",async()=>{
 for(const path of ["/onboard/index.html","/onboard/cockpit.html"]){
  const r=await fetch(base+path);
  assert.equal(r.status,200,path);
  assert.match(r.headers.get("content-type"),/text\/html/);
  const html=await r.text();
  assert.match(html,/sint[eé]tic|n[aã]o validado|educacional/i);
  assert.match(r.headers.get("content-security-policy"),/script-src 'self'/);
  assert.match(r.headers.get("content-security-policy"),/style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(r.headers.get("content-security-policy"),/script-src 'unsafe-inline'/);
 }
 for(const name of ["sim","request","model","features","api","cockpit","app"]){
  const r=await fetch(base+"/onboard/"+name+".js");
  assert.equal(r.status,200,name);
  assert.match(r.headers.get("content-type"),/text\/javascript/);
 }
});

test("new frontend routes preserve no-store, nosniff and safe methods",async()=>{
 for(const path of ["/onboard/index.html","/onboard/cockpit.html","/onboard/api.js"]){
  const r=await fetch(base+path,{method:"HEAD"});
  assert.equal(r.status,200,path);
  assert.equal(r.headers.get("cache-control"),"no-store");
  assert.equal(r.headers.get("x-content-type-options"),"nosniff");
  assert.equal((await r.text()),"");
  assert.equal((await fetch(base+path,{method:"PUT"})).status,405);
 }
 assert.equal((await fetch(base+"/onboard/dev-server.py")).status,404);
});
