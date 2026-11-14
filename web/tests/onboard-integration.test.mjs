import {test,after} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {readFileSync} from "node:fs";
import {createServer,onboardFile} from "../dev-server.mjs";

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const root="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("13-tab cockpit is navigable from classic and Polar Lab",async()=>{
 const home=await (await fetch(root+"/")).text();
 const lab=await (await fetch(root+"/lab.html")).text();
 assert.match(home,/href="\.\/onboard\/cockpit\.html"/);
 assert.match(lab,/href="\.\/onboard\/cockpit\.html"/);
 const r=await fetch(root+"/onboard/cockpit.html");
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/PROTÓTIPO · sintético/);
 assert.match(html,/Não validado/);
 assert.match(html,/Sem recomendação de voo/);
 assert.equal((html.match(/<button[^>]*data-tab="/g)||[]).length,13);
});
test("every script the cockpit and the training form load is on the allowlist",()=>{
 for(const f of ["cockpit.html","index.html"]){
  const html=readFileSync(new URL("../onboard/"+f,import.meta.url),"utf8");
  for(const m of html.matchAll(/<script src="([^"]+)"/g))assert.ok(onboardFile("/onboard/"+m[1]),f+" loads "+m[1]+" but dev-server.mjs would answer 404");
 }
});
test("same-origin onboard static allowlist serves only exact required assets",async()=>{
 assert.equal(onboardFile("/onboard/../api/main.go"),null);
 for(const path of ["/onboard/","/onboard/index.html","/onboard/cockpit.html",
 "/onboard/api.js","/onboard/app.js","/onboard/cockpit.js","/onboard/features.js",
 "/onboard/model.js","/onboard/live.js","/onboard/config.js","/onboard/request.js","/onboard/sim.js"]){
  const response=await fetch(root+path);
  assert.equal(response.status,200,path);
  assert.ok(onboardFile(path),path);
  assert.match(response.headers.get("content-type"),/text\/(html|javascript)/);
  assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  if(path.endsWith(".html")||path==="/onboard/"){
   assert.match(response.headers.get("content-security-policy"),/style-src 'self' 'unsafe-inline'/);
  }else{
   assert.doesNotMatch(response.headers.get("content-security-policy"),/style-src 'self' 'unsafe-inline'/);
  }
 }
 for(const path of ["/onboard/dev-server.py","/onboard/package.json","/onboard/README.md",
 "/onboard/test/front.test.mjs","/onboard/.env","/onboard/%2e%2e%2fapi%2fmain.go"]){
  const response=await fetch(root+path);assert.equal(response.status,404,path);
 }
 const r=await fetch(root+"/onboard/cockpit.html",{method:"POST"});
 assert.equal(r.status,405);
});

function requestRawPath(rawPath){
 return new Promise((resolve,reject)=>{
  // node:http preserves the request-target; fetch() would normalize "../"
  // and never exercise the server's raw-path rejection.
  const req=http.request({hostname:"127.0.0.1",port:server.address().port,path:rawPath,method:"GET"},res=>{
   res.resume();
   res.on("end",()=>resolve(res.statusCode));
   res.on("error",reject);
  });
  req.on("error",reject);
  req.end();
 });
}

test("query parameters with dot segments do not affect legitimate static routing",async()=>{
 const response=await fetch(root+"/onboard/cockpit.html?next=../../api/..");
 assert.equal(response.status,200);
});

test("raw HTTP traversal cannot escape onboard allowlist into Go API proxy",async()=>{
 for(const target of [
  "/onboard/../api/main.go",
  "/onboard/%2e%2e/api/main.go",
  "/onboard/%2e%2e%2fapi%2fmain.go",
  "/onboard/%252e%252e%252fapi%2fmain.go",
  "/onboard\\..\\api/main.go"
 ]){
  assert.equal(await requestRawPath(target),404,target);
 }
});
