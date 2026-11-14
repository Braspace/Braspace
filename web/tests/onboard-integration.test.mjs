import {test,after} from "node:test";
import assert from "node:assert/strict";
import {createServer,onboardFile} from "../dev-server.mjs";

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const root="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("12-tab cockpit is navigable from classic and Polar Lab",async()=>{
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
 assert.equal((html.match(/data-tab="/g)||[]).length,12);
});
test("same-origin onboard static allowlist serves only exact required assets",async()=>{
 for(const path of ["/onboard/","/onboard/index.html","/onboard/cockpit.html",
 "/onboard/api.js","/onboard/app.js","/onboard/cockpit.js","/onboard/features.js",
 "/onboard/model.js","/onboard/request.js","/onboard/sim.js"]){
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
 "/onboard/test/front.test.mjs","/onboard/.env","/onboard/../api/main.go"]){
  const response=await fetch(root+path);assert.equal(response.status,404,path);
 }
 const r=await fetch(root+"/onboard/cockpit.html",{method:"POST"});
 assert.equal(r.status,405);
});
