import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOUR_STEPS, tourStorageKey, bestTarget, SITE_WELCOME_KEY, hasCompletedSiteWelcome, shouldAutoOpenTour } from "../screens/tour.js";
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
test("present mode has on-demand, non-interrupting help for the quiz",()=>{
 assert.equal(TOUR_STEPS.present.length,4);
 assert.ok(TOUR_STEPS.present.every(step=>step.targets.length && step.pt && step.en));
 assert.notEqual(tourStorageKey("present"),tourStorageKey("class"));
});
test("tour supports dismiss, reopen, per-mode storage, animation and reduced motion",async()=>{
 const s=await read("../screens/tour.js"),css=await read("../screens/tour.css");
 for(const feature of ["localStorage.setItem","localStorage.getItem","mp-tour-close","mp-tour-skip","mp-tour-next","mp-tour-prev","aria-modal","Escape","Tab","mp-tour-help","resize","scroll"]) assert.ok(s.includes(feature),feature);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.mp-tour-spotlight/);
 assert.match(css,/@keyframes mpTourIn/);
});
test("Explore and Activity load their own optional shared tutorial",async()=>{
 for(const [file,mode] of [["explore.html","explore"],["activity.html","class"],["present.html","present"]]){
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

test("Cockpit onboarding uses the shared tour and can reopen independently",async()=>{
 const html=await read("../cockpit.html"), js=await read("../screens/tour.js");
 assert.equal(TOUR_STEPS.cockpit.length,7);
 assert.notEqual(tourStorageKey("cockpit"),tourStorageKey("explore"));
 assert.notEqual(tourStorageKey("cockpit"),tourStorageKey("class"));
 assert.match(html,/src="screens\/tour\.js" data-moon-tour="cockpit"/);
 assert.match(html,/href="screens\/tour\.css"/);
 assert.match(js,/shouldAutoOpenTour\(mode, alreadyWelcomed\)/,"Cockpit auto-onboards on first visit");
 assert.match(js,/help\.addEventListener\("click", \(\) => open\(false\)\)/,"help can always reopen");
 for(const step of TOUR_STEPS.cockpit){
   assert.ok(step.targets.length>0);
   for(const lang of ["pt","en"]){
     assert.equal(step[lang].length,2);
     assert.ok(step[lang][0].length>3);
     assert.ok(step[lang][1].length>20&&step[lang][1].length<220);
   }
 }
});
test("Cockpit tour references actual page controls, not removed/stale selectors",async()=>{
 const html=await read("../cockpit.html");
 const shell=await read("../core/shell.js"), cockpit=await read("../screens/cockpit.js"), panels=await read("../screens/cockpit-panels.js");
 assert.match(html,/id="terrain"/);
 assert.match(shell,/className = "mp-context"/);
 assert.match(html,/id="ck-panel-controls"/);
 assert.match(panels,/ck-panel-menu/);
 assert.match(cockpit,/mp-visrow/);
 assert.match(cockpit,/mp-rules/);
 assert.match(html,/id="player"/);
 const js=await read("../../moon-hd/backdrop.js");
 assert.match(js,/moon-open/);
});

test("site root redirects to the Cockpit where first-visit onboarding is mounted",async()=>{
 const root=await read("../../index.html"),entry=await read("../index.html");
 const cockpit=await read("../cockpit.html"),script=await read("../screens/tour.js");
 assert.match(root,/url=moonproof\//);
 assert.match(entry,/screens\/cockpit-entry\.js/);
 assert.match(cockpit,/data-moon-tour="cockpit"/);
 assert.match(script,/setTimeout\(\(\) => \{/);
 assert.doesNotMatch(script,/attempts\+\+ > 65/,"slow API must not suppress first-site welcome");
 assert.doesNotMatch(script,/!document\.documentElement\.classList\.contains\("mp-ready"\)/,"welcome does not need science data");
});
test("one site-wide welcome on first entry, but guide can always be manually reopened",()=>{
 const storage=new Map();
 const mock={getItem:key=>storage.get(key)??null};
 assert.equal(SITE_WELCOME_KEY,"moonproof.tour.welcome.v1");
 assert.equal(hasCompletedSiteWelcome(mock),false);
 assert.equal(shouldAutoOpenTour("cockpit",hasCompletedSiteWelcome(mock)),true);
 assert.equal(shouldAutoOpenTour("explore",hasCompletedSiteWelcome(mock)),true);
 assert.equal(shouldAutoOpenTour("present",false),false,"projector never interrupts a lesson");
 storage.set(SITE_WELCOME_KEY,"done");
 for(const mode of ["cockpit","explore","class"])
   assert.equal(shouldAutoOpenTour(mode,hasCompletedSiteWelcome(mock)),false);
 storage.clear();
 storage.set(tourStorageKey("explore"),"done");
 assert.equal(hasCompletedSiteWelcome(mock),true,"old per-screen completions still count");
 storage.clear();
 storage.set(tourStorageKey("cockpit"),"done");
 assert.equal(hasCompletedSiteWelcome(mock),true);
});
test("dismiss or finish stores both site-wide and per-mode completion",async()=>{
 const js=await read("../screens/tour.js");
 assert.match(js,/localStorage\.setItem\(SITE_WELCOME_KEY, "done"\)/);
 assert.match(js,/localStorage\.setItem\(key, "done"\)/);
 assert.match(js,/help\.addEventListener\("click", \(\) => open\(false\)\)/);
});
