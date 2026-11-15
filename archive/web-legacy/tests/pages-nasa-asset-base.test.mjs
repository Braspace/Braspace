import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {apiURL,TEXTURE_PATH,MODEL_PATH} from "../moon3d.js";

// Evaluate the actual first block of app.js without booting its DOM.
// This exercises the public Pages configuration in Node (no network).
const app=readFileSync(new URL("../app.ts",import.meta.url),"utf8");
const anchor="const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;";
const split=app.indexOf(anchor);
assert.ok(split>0,"API configuration must precede app boot / 3D loading");
const config=app.slice(0,split);
function configuredScope(hostname,explicit) {
  const scope={location:{hostname}};
  if(explicit!==undefined)scope.BRASPACE_API_BASE=explicit;
  runInNewContext(config,{globalThis:scope});
  return scope;
}

test("Pages NASA texture and GLB requests target the public Go API",()=>{
  const scope=configuredScope("braspace.github.io");
  assert.equal(scope.BRASPACE_API_BASE,"https://braspace-api.srv1898743.hstgr.cloud");
  assert.equal(apiURL(TEXTURE_PATH,scope),"https://braspace-api.srv1898743.hstgr.cloud/api/layers/lroc-color-2k/asset");
  assert.equal(apiURL(MODEL_PATH,scope),"https://braspace-api.srv1898743.hstgr.cloud/api/layers/svs-14959-moon-small-glb/asset");
});

test("localhost and third-party hosts stay same-origin",()=>{
  for(const hostname of ["localhost","127.0.0.1","moonproof.example.org","braspace.github.io.evil.example"]) {
    const scope=configuredScope(hostname);
    assert.equal(scope.BRASPACE_API_BASE,undefined,hostname);
    assert.equal(apiURL(TEXTURE_PATH,scope),TEXTURE_PATH,hostname);
  }
});

test("explicit API origin is not overwritten by the Pages fallback",()=>{
  const explicit="https://api.custom.example/v1/";
  const scope=configuredScope("braspace.github.io",explicit);
  assert.equal(scope.BRASPACE_API_BASE,explicit);
  assert.equal(apiURL(TEXTURE_PATH,scope),"https://api.custom.example/v1/api/layers/lroc-color-2k/asset");
});

test("Pages origin is assigned before async 3D module loading",()=>{
  assert.ok(app.includes('import("./moon-hd/classic-adapter.js")'),"Classic must load the shared Moon HD adapter");
  assert.ok(app.indexOf("BRASPACE_API_BASE") < app.indexOf('import("./moon-hd/classic-adapter.js")'));
  assert.ok(app.indexOf("BRASPACE_API_BASE") < app.indexOf("await Promise.allSettled"));
});
