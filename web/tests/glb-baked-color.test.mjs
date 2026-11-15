import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  bakedNASAColorMaterial,GLB_MARKER_RADIUS,MARKER_RADIUS,
  SURFACE_RADIUS,visualMarkerRadius
} from "../moon3d.js";

class BasicMaterial {
  constructor(properties){Object.assign(this,properties);this.kind="MeshBasicMaterial";}
}

test("NASA GLB baked color texture is shown unlit, preserving map/color/transparency",()=>{
  const map={id:"embedded-NASA-baseColorTexture"};
  const color={hex:0xffffff};
  const original={map,color,side:2,transparent:false,opacity:1,alphaTest:0,depthWrite:true,clearcoat:1,roughness:0.1};
  const output=bakedNASAColorMaterial({MeshBasicMaterial:BasicMaterial},original);
  assert.equal(output.kind,"MeshBasicMaterial");
  assert.equal(output.map,map,"must reuse GLTFLoader's existing decoded texture");
  assert.equal(output.color,color);
  assert.equal(output.side,2);
  assert.equal(output.depthWrite,true);
  assert.equal(output.clearcoat,undefined,"visual NASA color layer must not inherit blown-out clearcoat");
  assert.equal(original.map,map,"do not mutate original NASA glTF asset");
});

test("untextured GLB material cannot be presented as a textured NASA globe",()=>{
  assert.equal(bakedNASAColorMaterial({MeshBasicMaterial:BasicMaterial},{color:{hex:0xffffff}}),null);
  assert.equal(bakedNASAColorMaterial({MeshBasicMaterial:BasicMaterial},null),null);
});

test("beacons are outside GLB relief while preserving radial site direction",()=>{
  assert.equal(visualMarkerRadius(false),MARKER_RADIUS);
  assert.equal(visualMarkerRadius(true),GLB_MARKER_RADIUS);
  assert.ok(GLB_MARKER_RADIUS>MARKER_RADIUS);
  assert.ok(GLB_MARKER_RADIUS>SURFACE_RADIUS+0.10);
});

test("live GLB swap uses baked-color renderer, refuses missing maps and lifts pins",()=>{
  const src=readFileSync(new URL("../moon3d.js",import.meta.url),"utf8");
  assert.match(src,/gltf\.scene\.traverse\(object=>/);
  assert.match(src,/bakedNASAColorMaterial\(THREE,material\)/);
  assert.match(src,/if\(texturedMeshes===0\)throw/);
  assert.match(src,/for\(const pin of markers\.children\)pin\.position\.setLength\(visualMarkerRadius\(true\)\)/);
  assert.match(src,/pin\.position\.copy\(lonLat\(lat,lon\)\)\.setLength\(visualMarkerRadius\(Boolean\(modelRoot\)\)\)/);
  assert.doesNotMatch(src,/NASA (?:flight|landing) certified/i);
});
