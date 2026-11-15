import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "../dev-server.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port,base="http://127.0.0.1:"+port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("homepage is a five-module MoonProof scientific-honesty shell",async()=>{
 const result=await fetch(base+"/classic.html"),html=await result.text();
 assert.equal(result.status,200);
 assert.match(result.headers.get("content-security-policy"),/default-src 'none'/);
 assert.match(html,/NOT NASA/i); // may be satisfied by explicit non-NASA training label
 for(const word of ["Explore","Compare","Recover","Science &amp; Engineering","Evidence &amp; Learn","UNVERIFIED INPUTS","NASA Scientific Visualization Studio"])assert.ok(html.includes(word),"missing "+word);
 assert.ok(html.includes('src="./app.js"'));
});

test("JavaScript and CSS are served as MIME-safe same-origin files",async()=>{
 const entries=[["/app.js","text/javascript"],["/moon3d.js","text/javascript"],["/styles.css","text/css"],["/vector-embed.js","text/javascript"]];
 for(const [route,kind]of entries){
  const r=await fetch(base+route),body=await r.text();
  assert.equal(r.status,200,route);
  assert.ok(r.headers.get("content-type").includes(kind));
  assert.ok(body.length>1000);
 }
});

test("onboard cockpit serves live.js and config.js without opening arbitrary files",async()=>{
 const page=await fetch(base+"/onboard/cockpit.html");
 assert.equal(page.status,200);
 const html=await page.text();
 for(const asset of ["live.js","config.js"]){
  assert.ok(html.includes('src="'+asset+'"'),"cockpit script missing: "+asset);
  const response=await fetch(base+"/onboard/"+asset);
  assert.equal(response.status,200,"missing onboard dependency: "+asset);
  assert.ok((response.headers.get("content-type")||"").includes("text/javascript"));
  assert.ok((await response.text()).length>50,"empty onboard dependency: "+asset);
 }
 const denied=await fetch(base+"/onboard/dev-server.py");
 assert.equal(denied.status,404,"internal Python source must remain inaccessible");
});

test("prohibit directory traversal and unexpected methods",async()=>{
 const missing=await fetch(base+"/not-a-file.js");assert.equal(missing.status,404);
 const unsafe=await fetch(base+"/admin/config.json");assert.equal(unsafe.status,404);
 const post=await fetch(base+"/",{method:"POST"});assert.equal(post.status,405);
});

test("training code explicitly refuses to synthesize NASA source status",async()=>{
 const app=await readFile(path.join(root,"app.js"),"utf-8");
 const moon=await readFile(path.join(root,"moon3d.js"),"utf-8");
 assert.match(app,/SYNTHETIC-NOT-NASA/);
 assert.match(app,/UNVERIFIED_INPUTS/);
 assert.match(app,/site_id:"SYNTHETIC-SOUTH-POLE-TRAINING"/);
 assert.match(moon,/NASA SVS/);
 assert.match(moon,/not terrain science|NOT precision/);
});

test("v3 home is the task-first shell; design system and views are served; traversal refused",async()=>{
 const r=await fetch(base+"/"),html=await r.text();
 assert.equal(r.status,200);
 assert.match(html,/shell\/app\.js/);assert.match(html,/ds\/tokens\.css/);assert.match(html,/classic\.html/);
 for(const [route,kind] of [["/shell/app.js","text/javascript"],["/shell/views/escolha.js","text/javascript"],["/ds/router.js","text/javascript"],["/ds/tokens.css","text/css"],["/ds/fonts/Manrope-400-800-latin.woff2","font/woff2"],["/assets/polar-elevation-87s.webp","image/webp"],["/classic.html","text/html"]]){
  const x=await fetch(base+route);assert.equal(x.status,200,route);assert.ok(x.headers.get("content-type").includes(kind),route);
 }
 for(const bad of ["/ds/../dev-server.mjs","/shell/x.webp","/assets/x.js","/ds/%2e%2e/package.json"]){const x=await fetch(base+bad);assert.equal(x.status,404,bad);}
});

test("every relative import reachable from the bridge and screen entry modules is served",async()=>{
 // A module the dev-server does not serve breaks the whole page at import time (e.g. /vector-embed.js was 404).
 const entries=["/lab/backend-bridge.js","/moonproof/screens/evidence.js","/shell/views/evidencias.js"];
 const seen=new Set(),queue=[...entries],missing=[];
 while(queue.length){
  const route=queue.shift(); if(seen.has(route))continue; seen.add(route);
  const r=await fetch(base+route); if(r.status!==200){missing.push(route+" -> "+r.status);continue;}
  const src=await r.text();
  for(const m of src.matchAll(/(?:^|[;\s])(?:import|export)\s[^"'`]*?from\s*["'](\.{1,2}\/[^"']+)["']|(?:^|[;\s])import\s*["'](\.{1,2}\/[^"']+)["']/gm)){
   queue.push(new URL(m[1]||m[2],"http://x"+route).pathname);
  }
 }
 assert.deepEqual(missing,[],"modules imported but not served");
 assert.ok(seen.has("/vector-embed.js"),"walk reached vector-embed.js");
});
