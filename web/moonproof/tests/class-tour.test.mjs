import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOUR_STEPS, tourStorageKey, bestTarget } from "../screens/tour.js";
const read = p => readFile(new URL(p,import.meta.url),"utf8");
test("each mode has five short user-facing steps and a separate completion key",()=>{
 for(const mode of ["explore","class"]) {
   assert.equal(TOUR_STEPS[mode].length,5);
   for(const step of TOUR_STEPS[mode]){
     assert.ok(step.targets.length);
     for(const locale of ["pt","en"]) {
       assert.equal(step[locale].length,2);
       assert.ok(step[locale][0].length>3 && step[locale][1].length>15);
       assert.ok(step[locale][1].length<220, "keep lessons concise");
     }
   }
 }
 assert.notEqual(tourStorageKey("class"),tourStorageKey("explore"));
});
test("tour supports dismiss, reopen, per-mode storage, animation and reduced motion",async()=>{
 const s=await read("../screens/tour.js"),css=await read("../screens/tour.css");
 for(const feature of ["localStorage.setItem","localStorage.getItem","mp-tour-close","mp-tour-skip","mp-tour-next","mp-tour-prev","aria-modal","Escape","Tab","mp-tour-help","resize","scroll"]) assert.ok(s.includes(feature),feature);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.mp-tour-spotlight/);
 assert.match(css,/@keyframes mpTourIn/);
});
test("Explore and Activity load their own optional shared tutorial",async()=>{
 for(const [file,mode] of [["explore.html","explore"],["activity.html","class"]]){
   const html=await read("../"+file);
   assert.ok(html.includes('src="screens/tour.js" data-moon-tour="'+mode+'"'));
   assert.ok(html.includes('href="screens/tour.css"'));
 }
});
test("spotlight skips hidden targets and finds the mobile fallback",()=>{
 const hidden={getBoundingClientRect:()=>({width:0,height:0})};
 const shown={getBoundingClientRect:()=>({width:200,height:40})};
 const old=globalThis.getComputedStyle;
 globalThis.getComputedStyle=()=>({display:"block",visibility:"visible"});
 try{
   const hit=bestTarget({targets:["#hidden","#shown"]},{querySelector:x=>x==="#hidden"?hidden:shown});
   assert.strictEqual(hit.node,shown);
 }finally{if(old)globalThis.getComputedStyle=old;else delete globalThis.getComputedStyle;}
});
test("classroom share URL targets presentation, not teacher editor; copy errors are visible",async()=>{
 const src=await read("../screens/activity.tsx"),html=await read("../present.html");
 assert.match(src,/new URL\(hrefTo\("present\.html"\), location\.href\)/);
 assert.match(src,/href=\{url\}/);
 assert.match(src,/act\.copyError/);
 assert.match(src,/scrollIntoView/);
 assert.ok(html.includes('id="btn-none"'));
 assert.ok(html.includes('id="present-feedback"'));
});
