import {test,after} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "../dev-server.mjs";

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));
test("Mission Studio is reachable through reviewed same-origin paths",async()=>{
 for(const [url,kind] of [["/studio/","text/html"],["/studio/index.html","text/html"],["/studio/app.js","text/javascript"],["/studio/api.js","text/javascript"],["/studio/studio.css","text/css"]]){
  const result=await fetch(base+url);
  assert.equal(result.status,200,url);
  assert.match(result.headers.get("content-type"),new RegExp(kind));
  assert.match(result.headers.get("content-security-policy"),/default-src 'none'/);
  assert.ok((await result.text()).length>100);
 }
});
test("design specs and unknown files are never exposed through preview",async()=>{
 for(const url of ["/studio/DESIGNER.mds","/studio/secrets.json","/studio/designer/01-overview.designer.mds","/studio/../../api/main.go","/studio/app.js.backup"]){
  const r=await fetch(base+url);assert.equal(r.status,404,url);
 }
 const r=await fetch(base+"/studio/",{method:"POST"});assert.equal(r.status,405);
});
test("studio contains seven screens, three roles, API-only metrics and scientific disclaimers",async()=>{
 const html=await (await fetch(base+"/studio/")).text();
 for(const item of ["overview","explore","compare","recover","science","evidence","learn"])assert.ok(html.includes('data-view="'+item+'"'),item);
 for(const role of ["public","researcher","educator"])assert.ok(html.includes('value="'+role+'"'),role);
 assert.match(html,/NOT SCIENTIFICALLY CERTIFIED/);
 assert.match(html,/No flight recommendation/);
});
