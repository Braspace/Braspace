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
 const result=await fetch(base+"/"),html=await result.text();
 assert.equal(result.status,200);
 assert.match(result.headers.get("content-security-policy"),/default-src 'none'/);
 assert.match(html,/NOT NASA/i); // may be satisfied by explicit non-NASA training label
 for(const word of ["Explore","Compare","Recover","Science &amp; Engineering","Evidence &amp; Learn","UNVERIFIED INPUTS","NASA Scientific Visualization Studio"])assert.ok(html.includes(word),"missing "+word);
 assert.ok(html.includes('src="./app.js"'));
});

test("JavaScript and CSS are served as MIME-safe same-origin files",async()=>{
 const entries=[["/app.js","text/javascript"],["/moon3d.js","text/javascript"],["/styles.css","text/css"]];
 for(const [route,kind]of entries){
  const r=await fetch(base+route),body=await r.text();
  assert.equal(r.status,200,route);
  assert.ok(r.headers.get("content-type").includes(kind));
  assert.ok(body.length>1000);
 }
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

test("live cockpit dependencies are served, not silently blocked by the static allowlist",async()=>{
 const page=await fetch(base+"/onboard/cockpit.html");
 assert.equal(page.status,200);
 const html=await page.text();
 for(const file of ["live.js","config.js"]){
  assert.match(html,new RegExp('<script src="'+file.replace(".","\\.")+'"></script>'));
  const response=await fetch(base+"/onboard/"+file);
  assert.equal(response.status,200,"missing required cockpit script "+file);
  assert.ok((response.headers.get("content-type")||"").startsWith("text/javascript"),file+" MIME type");
  assert.ok((await response.text()).length>50,file+" appears empty");
 }
 for(const unsafe of ["/onboard/.env","/onboard/secret.js"]){
  const response=await fetch(base+unsafe);
  assert.equal(response.status,404,"unapproved path should remain inaccessible: "+unsafe);
 }
});
