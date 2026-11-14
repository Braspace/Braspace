import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {apiURL,TEXTURE_PATH,MODEL_PATH,lonLatToVector,modelLocalToGlobe,modelDirection,MODEL_YAW,MARKER_RADIUS,STATUS_TEXT} from "../moon3d.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,msg+": "+a+" vs "+b);
const close=(p,q,msg)=>{near(p.x,q.x,msg+" x");near(p.y,q.y,msg+" y");near(p.z,q.z,msg+" z");};

test("API paths use the optional base (BRASPACE_API_BASE), empty by default",()=>{
  assert.equal(apiURL(TEXTURE_PATH,{}),"/api/layers/lroc-color-2k/asset");
  assert.equal(apiURL(MODEL_PATH,{}),"/api/layers/svs-14959-moon-small-glb/asset");
  assert.equal(apiURL(MODEL_PATH,{BRASPACE_API_BASE:"https://api.example.org"}),"https://api.example.org/api/layers/svs-14959-moon-small-glb/asset");
  assert.equal(apiURL(TEXTURE_PATH,{BRASPACE_API_BASE:"https://api.example.org/"}),"https://api.example.org/api/layers/lroc-color-2k/asset","trailing slash is dropped");
  assert.equal(apiURL("/x",{BRASPACE_API_BASE:null}),"/x");
});

test("the file no longer carries a hard-coded API origin and every API path goes through apiURL",async()=>{
  const src=await readFile(path.join(root,"moon3d.js"),"utf-8");
  assert.doesNotMatch(src,/https?:\/\/[^"'\s]*braspace/i);
  for(const m of src.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)){
    const at=src.indexOf(m[0]);
    assert.match(src.slice(Math.max(0,at-40),at),/(TEXTURE_PATH|MODEL_PATH)\s*=\s*$/,"raw /api path outside the two constants: "+m[1]);
  }
  assert.match(src,/apiURL\(TEXTURE_PATH\)/);
  assert.match(src,/apiURL\(MODEL_PATH\)/);
});

// Directions measured in BR41 from the real files (moon_small.glb, SHA-256 12d3b0bb...):
//  mapping the cube-face texture onto the mesh and correlating with lroc_color_2k.jpg gave
//  north=+Y, lon 0 toward -Z, east toward -X (r=0.92).
test("model orientation: marker positions agree with the NASA GLB frame (south pole and equator at 0 deg)",()=>{
  const r=MARKER_RADIUS;
  const place=(lat,lon)=>{const d=modelDirection(lat,lon);return modelLocalToGlobe({x:d.x*r,y:d.y*r,z:d.z*r},MODEL_YAW);};
  // Equator, longitude 0: model -Z, which the globe frame shows toward +X (as the sphere texture does).
  close(modelDirection(0,0),{x:0,y:0,z:-1},"model equator lon0 is -Z in the GLB");
  close(place(0,0),lonLatToVector(0,0),"equator 0 deg");
  close(lonLatToVector(0,0),{x:r,y:0,z:0},"equator 0 deg on +X");
  // South pole: -Y in the model, and below the globe.
  close(modelDirection(-90,0),{x:0,y:-1,z:0},"model south pole is -Y in the GLB");
  close(place(-90,0),lonLatToVector(-90,0),"south pole");
  close(lonLatToVector(-90,0),{x:0,y:-r,z:0},"south pole on -Y");
  // A real documented south-pole site (Shackleton rim area, about -89.9 / 129 deg) and east longitude 90 on the equator.
  for(const [lat,lon] of [[-89.9,129],[0,90],[0,-90],[0,180],[45,-30],[-60,170]])close(place(lat,lon),lonLatToVector(lat,lon),`lat ${lat} lon ${lon}`);
});

test("the test would catch a wrong yaw: +90 deg instead of -90 deg puts lon 0 on the wrong side",()=>{
  const d=modelDirection(0,0),r=MARKER_RADIUS;
  const wrong=modelLocalToGlobe({x:d.x*r,y:d.y*r,z:d.z*r},Math.PI/2);
  assert.ok(Math.abs(wrong.x-r)>1,"a +90 yaw moves lon 0 away from +X");
});

test("status text keeps the honest wording and never claims validation, lighting or visibility",()=>{
  for(const [k,v] of Object.entries(STATUS_TEXT)){
    assert.match(v,/visual model · not terrain science/,k);
    assert.doesNotMatch(v,/VALIDATED|illuminat|visib|lit\b/i,k);
  }
  assert.match(STATUS_TEXT.glb,/NASA SVS 14959 Moon GLB/);
  assert.match(STATUS_TEXT.sphere,/Sphere/);
  assert.notEqual(STATUS_TEXT.glb,STATUS_TEXT.sphere,"the caption must say which of the two is on screen");
});

test("the GLB loads on demand from the same three version and CDN already allowed by the CSP",async()=>{
  const src=await readFile(path.join(root,"moon3d.js"),"utf-8");
  assert.match(src,/three@0\.181\.0\/\+esm/);
  assert.match(src,/three@0\.181\.0\/examples\/jsm\/loaders\/GLTFLoader\.js\/\+esm/);
  const hosts=new Set([...src.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map(m=>m[1]));
  assert.deepEqual([...hosts],["cdn.jsdelivr.net"]);
  assert.doesNotMatch(src,/VALIDATED/);
});
