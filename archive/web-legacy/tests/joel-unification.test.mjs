import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {cameraDirection,sceneEpoch} from "../moon-hd/classic-adapter.js";
import {cases,sizes} from "../browser/route-matrix-config.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("camera orbits the original Moon frame and preserves radius",()=>{
 const sat=cameraDirection(-90,0,2.65);
 assert.ok(sat[1]<-2.64);assert.ok(Math.abs(Math.hypot(...sat)-2.65)<1e-10);
 const a=cameraDirection(0,90,3);assert.ok(Math.abs(a[2]+3)<1e-10);
});
test("visual time reports the ephemeris sample rather than falsely claiming requested epoch",()=>{
 const startMs=Date.UTC(2025,0,1),eph={startMs,stepMs:3600000,count:3};
 assert.deepEqual(sceneEpoch(eph,"2030-01-01T00:00:00Z"),{index:2,iso:"2025-01-01T02:00:00.000Z"});
});
test("Classic shares Joel scene, not old procedural renderer and not a second backdrop canvas",()=>{
 assert.match(read("app.js"),/import\("\.\/moon-hd\/classic-adapter\.js"\)/);
 assert.doesNotMatch(read("classic.html"),/data-moon-backdrop/);
 assert.match(read("moon-hd/classic-adapter.js"),/S\.createCap/);
 assert.match(read("styles.css"),/\.fallback-sphere\{[^}]+pole-preview\.webp/);
 assert.match(read("studio/studio.css"),/\.orb div\{[^}]+pole-preview\.webp/);
 assert.match(read("lab/lab.css"),/#stage \{[^}]+pole-preview\.webp/);
});
test("five viewports × 56 distinct route/mode cases, including all 14 cockpit tabs",()=>{
 assert.equal(sizes.length,5);assert.equal(cases.length,56);
 assert.equal(new Set(cases.map(c=>c.family+":"+c.id)).size,cases.length);
 assert.equal(cases.filter(c=>c.family==="cockpit").length,14);
 assert.ok(cases.some(c=>c.id==="navegacao"));
});

test('Lab globe uses shared cap and does not replace registered region or landing terrain',()=>{
 const source=read('lab/scene.js');assert.match(source,/import\("\.\.\/moon-hd\/scene\.js"\)/);assert.match(source,/S\.createCap/);assert.match(source,/group\.scale\.setScalar\(R\)/);assert.match(source,/showRegion\(/);assert.match(source,/showSite\(/);assert.doesNotMatch(source,/lroc_color_2k\.jpg/);
});
