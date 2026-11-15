import {test} from "node:test";
import assert from "node:assert/strict";
import {apiBase,apiURL,PUBLIC_API} from "../api-base.js";
import {api} from "../studio/api.js";
import {backendStatus} from "../lab/backend-bridge.js";
import {createLive} from "../lab/live.js";
test("official Pages, explicit override and exact-host routing",()=>{
 const publicScope={location:{hostname:"braspace.github.io"}};
 assert.equal(apiURL("/api/sites",publicScope),PUBLIC_API+"/api/sites");
 assert.equal(apiURL("/readyz",publicScope),PUBLIC_API+"/readyz");
 assert.equal(apiURL("/v1/visibility",publicScope),PUBLIC_API+"/v1/visibility");
 assert.equal(apiBase({location:{hostname:"braspace.github.io.evil.test"}}),"");
 assert.equal(apiURL("/api/sites",{location:{hostname:"localhost"}}),"/api/sites");
 assert.equal(apiBase({...publicScope,BRASPACE_API_BASE:"https://custom.test/"}),"https://custom.test");
});
test("Studio and Lab bridge use the resolved public API, not the static Pages origin",async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,"location");
 Object.defineProperty(globalThis,"location",{configurable:true,value:{hostname:"braspace.github.io"}});
 const urls=[];
 const fetcher=async url=>{urls.push(url);return {ok:true,json:async()=>url.endsWith("/api/health")?{engine:"ready"}:{sites:[]}};};
 try{
  await api.sites(fetcher);
  await backendStatus(fetcher);
  assert.deepEqual(urls,[PUBLIC_API+"/api/sites",PUBLIC_API+"/api/health",PUBLIC_API+"/api/sites"]);
 }finally{if(previous)Object.defineProperty(globalThis,"location",previous);else delete globalThis.location;}
});
test("Lab explicit empty base uses same-origin proxy, omitted base remains offline",async()=>{
 const urls=[];
 const live=createLive({base:"",fetchImpl:async url=>{urls.push(url);return {ok:true,json:async()=>({sites:[]})};}});
 assert.equal(await live.probe(),true);
 assert.deepEqual(urls,["/api/sites"]);
 assert.equal(createLive({}).enabled,false);
});
