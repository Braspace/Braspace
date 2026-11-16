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
 for(const feature of ["localStorage.setItem","storage.getItem","mp-tour-close","mp-tour-skip","mp-tour-next","mp-tour-prev","aria-modal","Escape","Tab","mp-tour-help","resize","scroll"]) assert.ok(s.includes(feature),feature);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.mp-tour-spotlight/);
 assert.match(css,/@keyframes mpTourIn/);
});
test("every interactive MoonProof screen loads its contextual tutorial", async () => {
 const files = ["index", "cockpit", "explore", "activity", "present", "compare", "debrief", "evidence",
   "landing", "mission", "plan", "recover", "rules", "tasks"];
 for (const file of files) {
   const mode = ({ index: "entry", activity: "class" })[file] ?? file;
   const html = await read("../" + file + ".html");
   assert.ok(html.includes('src="screens/tour.js" data-moon-tour="' + mode + '"'), file);
   assert.ok(html.includes('href="screens/tour.css"'), file);
   assert.ok(TOUR_STEPS[mode].every(step => step.targets.length && step.pt.length === 2 && step.en.length === 2), file);
 }
 const viewer = await read("../../moon-hd.html");
 assert.match(viewer, /src="\.\/moonproof\/screens\/tour\.js" data-moon-tour="moonhd"/);
 assert.ok(TOUR_STEPS.moonhd.every(step => step.targets.length && step.pt.length === 2 && step.en.length === 2));
 const css = await read("../screens/tour.css");
 const buttonStyles = [...css.matchAll(/\.mp-tour-help\s*\{([^}]*)\}/g)];
 assert.ok(buttonStyles.length);
 for (const [, declarations] of buttonStyles) {
   assert.doesNotMatch(declarations, /position\s*:\s*(fixed|absolute|sticky)/);
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
 assert.match(js,/function onOpen\(\) \{ open\(false\); \}/,"help can always reopen");
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

test("site root opens the three-mode chooser and first-visit tutorial is on that page",async()=>{
 const root=await read("../../index.html"),entry=await read("../index.html");
 const script=await read("../screens/tour.js");
 assert.match(root,/url=moonproof\//);
 assert.match(entry,/screens\/entry\.js/);
 assert.match(entry,/data-moon-tour="entry"/);
 assert.match(entry,/id="cards" role="list"/);
 assert.doesNotMatch(entry,/screens\/cockpit-entry\.js/);
 assert.equal(TOUR_STEPS.entry.length,4);
 for(const step of TOUR_STEPS.entry){
   assert.ok(step.targets.length);
   for(const locale of ["pt","en"]){
     assert.equal(step[locale].length,2);
     assert.ok(step[locale][1].length>20 && step[locale][1].length<220);
   }
 }
 assert.match(script,/setTimeout\(\(\) => \{/);
 assert.doesNotMatch(script,/attempts\+\+ > 65/,"slow API must not suppress first-site welcome");
 assert.doesNotMatch(script,/!document\.documentElement\.classList\.contains\("mp-ready"\)/,"welcome does not need science data");
});
test("each screen opens once independently of visits to other screens", async () => {
 const source = await read("../screens/tour.js");
 assert.match(source, /localStorage\.getItem\(key\) === "done"/);
 assert.match(source, /localStorage\.setItem\(key, "done"\)/);
 assert.match(source, /function onOpen\(\) \{ open\(false\); \}/);
 for (const mode of Object.keys(TOUR_STEPS)) {
   assert.ok(TOUR_STEPS[mode].length >= 4, mode + " needs a complete walkthrough");
   assert.notEqual(tourStorageKey(mode), SITE_WELCOME_KEY);
 }
});

test("shared tutorial Back button has an arrow, a localized label and stays hidden at the start",async()=>{
 const js=await read("../screens/tour.js"), css=await read("../screens/tour.css");
 assert.match(js,/prev\.textContent\s*=\s*"← "\s*\+\s*w\.prev/,"the button must never render as an empty pill");
 assert.match(js,/prev\.setAttribute\("aria-label", w\.prev\)/,"assistive technology gets a localized label");
 assert.match(js,/prev\.hidden\s*=\s*index\s*<=\s*0/,"there is no Back button on welcome or step one");
 assert.match(css,/\.mp-tour-prev\[hidden\][^{]*\{display:none!important\}/,"CSS must respect the hidden attribute");
 assert.match(js,/prev:"Voltar"/,"pt-BR label");
 assert.match(js,/prev:"Back"/,"English label");
});
