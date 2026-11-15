// Browser QA: actual Chromium navigation, asset loading, fallback and mobile.
// Run with: npm --prefix web install --no-save playwright@1.56.1
//           npx --prefix web playwright install chromium
//           node web/browser/e2e.mjs
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const port=Number(process.env.BRASPACE_BROWSER_PORT||"5377");
const base="http://127.0.0.1:"+port;
const out=path.resolve(process.env.BRASPACE_BROWSER_ARTIFACTS||"/tmp/braspace-browser-artifacts");
const child=spawn(process.execPath,["web/dev-server.mjs"],{cwd:root,env:{...process.env,BRASPACE_WEB_PORT:String(port)},stdio:"pipe"});
let diagnostics="";
for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{diagnostics+=String(chunk).slice(0,900);});
let browser;
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
async function ready(){
 for(let i=0;i<80;i++){try{const r=await fetch(base+"/lab.html",{signal:AbortSignal.timeout(500)});if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw new Error("web unavailable: "+diagnostics);
}
const errors=[];
try{
 await mkdir(out,{recursive:true});await ready();
 browser=await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-webgl"]});
 const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 desktop.on("pageerror",error=>errors.push("desktop: "+error.message));
 const r=await desktop.goto(base+"/lab.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert(r?.status()===200,"desktop lab page failed");
 assert((await desktop.locator("body").innerText()).includes("PRELIMINARY"),"missing scientific disclaimer");
 await desktop.locator("#api-feedback").waitFor({state:"visible",timeout:30000});
 await desktop.waitForFunction(()=>{const status=document.querySelector("#api-feedback")?.textContent||"";return !status.includes("not yet checked")&&!status.includes("checking…");},null,{timeout:30000});
 if(process.env.BRASPACE_REQUIRE_BACKEND==="1"){
  const status=await desktop.locator("#api-feedback").innerText();
  assert(status.includes("Go/Rust engine ready"),"browser did not confirm connected Go/Rust backend: "+status);
 }
 if(process.env.BRASPACE_REQUIRE_BACKEND==="1"){
  await desktop.locator("#api-simulate").click();
  await desktop.waitForFunction(()=>document.querySelector("#api-sim-result")?.textContent?.includes("UNVERIFIED_INPUTS"),null,{timeout:30000});
  assert((await desktop.locator("#api-sim-result").innerText()).includes("TRAINING ONLY"),"Go onboard incorrectly treated as science");
 }
 await desktop.locator("#tabs button[data-view='compare']").click();
 await desktop.locator("#tabs button[data-view='recover']").click();
 await desktop.locator("#tabs button[data-view='evidence']").click();
 // The panel first shows a "Loading provenance…" placeholder and fills in asynchronously: wait for the real content.
 await desktop.waitForFunction(()=>{const ev=document.querySelector("#ev");return !!ev&&!ev.textContent.includes("Loading provenance")&&ev.textContent.trim().length>200;},null,{timeout:30000});
 assert((await desktop.locator("#panel-body").innerText()).length>260,"evidence panel is empty");
 await desktop.screenshot({path:path.join(out,"polar-lab-desktop.png"),fullPage:true});
 await desktop.getByRole("link",{name:"Mission computer"}).click();
 assert(desktop.url().endsWith("/classic.html"),"classic UI navigation failed");
 assert((await desktop.locator("body").innerText()).includes("UNVERIFIED INPUTS"),"classic scientific disclaimer absent");
 await desktop.screenshot({path:path.join(out,"moonproof-classic-desktop.png"),fullPage:true});
 const onboardResponse=await desktop.goto(base+"/onboard/cockpit.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert(onboardResponse?.status()===200,"onboard cockpit HTTP");
 const tabs=desktop.locator("nav.tabs button[data-tab]");
 // Exact tab set (14 since the Navigation panel, b964c27); a count alone hid that the expectation was stale.
 const tabNames=await tabs.evaluateAll(els=>els.map(e=>e.dataset.tab));
 assert(JSON.stringify(tabNames)===JSON.stringify(["visao","entrada","geometria","horizonte","janelas","navegacao","energia","vida","replan","visual","sens","historico","lanc","status"]),"onboard cockpit tabs differ: "+tabNames.join(","));
 await desktop.waitForFunction(()=>{
  const text=document.querySelector("#badges")?.textContent||"";
  return text.includes("UNVERIFIED_INPUTS")&&text.includes("No flight recommendation");
 },null,{timeout:15000});
 const scienceBadges=await desktop.locator("#badges").innerText();
 assert(!scienceBadges.includes("validated: true"),"onboard falsely claims scientific validation: "+scienceBadges);
 await desktop.locator("nav.tabs button[data-tab='energia']").click();
 await desktop.locator("nav.tabs button[data-tab='replan']").click();
 const replanText=await desktop.locator("#views").innerText();
 assert(replanText.length>80,"onboard replan panel empty: "+JSON.stringify(replanText.slice(0,500))+"; page errors: "+errors.join(" | "));
 await desktop.screenshot({path:path.join(out,"onboard-cockpit-desktop.png"),fullPage:true});
 const trainingResponse=await desktop.goto(base+"/onboard/index.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert(trainingResponse?.status()===200,"onboard training form HTTP");
 await desktop.locator("#run").click();
 await desktop.locator("#results-card").waitFor({state:"visible",timeout:30000});
 assert((await desktop.locator("body").innerText()).includes("UNVERIFIED_INPUTS"),"onboard training lost disclaimer");
 await desktop.screenshot({path:path.join(out,"onboard-training-desktop.png"),fullPage:true});

 // Role-based Mission Studio must open and preserve fail-closed science states.
 const studioResponse=await desktop.goto(base+"/studio/",{waitUntil:"domcontentloaded",timeout:30000});
 assert(studioResponse?.status()===200,"Mission Studio desktop HTTP status");
 assert(await desktop.locator("#screens button[data-screen]").count()===7,"seven Studio screens missing");
 assert((await desktop.locator("#science-seal").innerText()).includes("NOT SCIENTIFICALLY CERTIFIED"),"studio scientific disclaimer absent");
 await desktop.locator("#role").selectOption("researcher");
 assert(await desktop.locator('[data-view="compare"]').isVisible(),"researcher experience did not open comparison");
 assert((await desktop.locator("#compare-layers [data-layer='proof']").getAttribute("aria-pressed"))==="true","researcher should start in Proof layer");
 await desktop.locator("#compare-layers [data-layer='why']").click();
 assert((await desktop.locator("#compare-layers [data-layer='why']").getAttribute("aria-pressed"))==="true","manual per-card disclosure did not respond");
 await desktop.locator('#screens button[data-screen="explore"]').click();
 assert(await desktop.locator('[data-view="explore"]').isVisible(),"explore screen unreachable");
 if(process.env.BRASPACE_REQUIRE_BACKEND==="1"){
  await desktop.waitForFunction(()=>document.querySelector("#connection")?.textContent?.includes("connected"),null,{timeout:30000});
  await desktop.locator("#load-sky").click();
  await desktop.waitForFunction(()=>{
   const text=document.querySelector("#feedback")?.textContent||"";
   return text.includes("stored samples")||text.startsWith("No result:");
  },null,{timeout:30000});
  assert((await desktop.locator("#feedback").innerText()).includes("stored samples"),"live sky read failed: "+await desktop.locator("#feedback").innerText());
  await desktop.locator('#screens button[data-screen="compare"]').click();
  await desktop.locator("#run-compare").click();
  await desktop.waitForFunction(()=>{
   const text=document.querySelector("#feedback")?.textContent||"";
   return text.includes("compared")||text.startsWith("No result:");
  },null,{timeout:30000});
  assert((await desktop.locator("#feedback").innerText()).includes("compared"),"live compare API failed: "+await desktop.locator("#feedback").innerText());
 }
 await desktop.screenshot({path:path.join(out,"mission-studio-desktop.png"),fullPage:true});
 // MoonProof v3: every screen opens, numbers carry PRE/SIM/N/D, never VAL outside a seal legend.
 for(const page of ["index.html","mission.html","explore.html","compare.html","recover.html","cockpit.html","landing.html","debrief.html","evidence.html","plan.html","present.html","activity.html","rules.html"]){
  const r=await desktop.goto(base+"/moonproof/"+page+"?lang=en",{waitUntil:"domcontentloaded",timeout:30000});
  assert(r?.status()===200,"v3 HTTP "+page);
  await desktop.waitForTimeout(1500);
  const seals=await desktop.locator(".mp-seal:not([data-mp-legend] .mp-seal)").allInnerTexts();
  assert(!seals.some(s=>s.trim()==="VAL"),"VAL seal without validated origin on "+page);
 }
 await desktop.goto(base+"/moonproof/mission.html?lang=en",{waitUntil:"domcontentloaded",timeout:30000});
 await desktop.waitForFunction(()=>document.querySelectorAll(".mp-marker").length===5,null,{timeout:30000});
 if(process.env.BRASPACE_REQUIRE_BACKEND==="1"){
  await desktop.waitForFunction(()=>(document.querySelector(".mp-context")?.textContent||"").includes("live API"),null,{timeout:30000});
  await desktop.goto(base+"/moonproof/recover.html?lang=en",{waitUntil:"domcontentloaded",timeout:30000});
  await desktop.waitForFunction(()=>(document.querySelector(".mp-context")?.textContent||"").includes("live API"),null,{timeout:30000});
 }

 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 mobile.on("pageerror",error=>errors.push("mobile: "+error.message));
 const mobileResponse=await mobile.goto(base+"/lab.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert(mobileResponse?.status()===200,"mobile lab status");
 await mobile.locator("#tabs button[data-view='evidence']").click();
 // Same as desktop: wait for the provenance to load instead of racing the "Loading provenance…" placeholder.
 await mobile.waitForFunction(()=>{const ev=document.querySelector("#ev");return !!ev&&!ev.textContent.includes("Loading provenance")&&ev.textContent.trim().length>200;},null,{timeout:30000});
 assert((await mobile.locator("#panel-body").innerText()).length>260,"mobile evidence empty");
 await mobile.screenshot({path:path.join(out,"polar-lab-mobile.png"),fullPage:true});
 const overflow=await mobile.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert(overflow.width<=overflow.viewport+4,"mobile horizontal overflow: "+JSON.stringify(overflow));
 const studioMobile=await mobile.goto(base+"/studio/",{waitUntil:"domcontentloaded",timeout:30000});
 assert(studioMobile?.status()===200,"Studio mobile HTTP");
 await mobile.locator("#role").selectOption("educator");
 assert(await mobile.locator('[data-view="learn"]').isVisible(),"educator screen not visible");
 await mobile.locator("#reveal-answer").scrollIntoViewIfNeeded();
 await mobile.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const geometry=await mobile.locator("#reveal-answer").evaluate(button=>{
  const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  return {x,y,rect:{top:r.top,left:r.left,width:r.width,height:r.height},scrollY:scrollY,viewport:{innerWidth,innerHeight},atPoint:document.elementsFromPoint(x,y).slice(0,5).map(node=>({tag:node.tagName,id:node.id,className:String(node.className).slice(0,70)}))};
 });
 console.log("STUDIO MOBILE REVEAL GEOMETRY",JSON.stringify(geometry));
 await mobile.locator("#reveal-answer").click();
 assert(await mobile.locator("#lesson-answer").isVisible(),"classroom answer not revealed");
 await mobile.locator("#next-question").click();
 assert(await mobile.locator("#lesson-answer").isHidden(),"next classroom question must conceal previous answer");
 await mobile.screenshot({path:path.join(out,"mission-studio-mobile.png"),fullPage:true});
 const studioOverflow=await mobile.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert(studioOverflow.width<=studioOverflow.viewport+4,"Mission Studio mobile overflow: "+JSON.stringify(studioOverflow));
 for(const page of ["explore.html","mission.html","compare.html","recover.html","cockpit.html","evidence.html"]){
  const r=await mobile.goto(base+"/moonproof/"+page+"?lang=en",{waitUntil:"domcontentloaded",timeout:30000});
  assert(r?.status()===200,"v3 mobile HTTP "+page);
  await mobile.waitForTimeout(1500);
  const o=await mobile.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(o.viewport===390&&o.width<=o.viewport+4,"v3 mobile overflow on "+page+": "+JSON.stringify(o));
  // iPhone review geometry: marker clear of the context bar, dock pill text fits, stat circle / delay dial whole inside the sheet.
  await mobile.waitForTimeout(2500);
  const g=await mobile.evaluate(()=>{const R=q=>{const e=document.querySelector(q);return e&&e.getBoundingClientRect();};
   const ctx=R(".mp-context"),mk=R(".mp-marker[aria-pressed=true]"),sheet=R(".mp-sheet")||R(".mc-panels"),sel=document.querySelector(".mp-scn-dock .mp-sel");
   const circ=[...document.querySelectorAll(".mp-sheet .mp-stat .mp-sat,.mp-sheet .mp-dial .mp-sat,.mp-sheet .mp-stat-core")].map(e=>e.getBoundingClientRect());
   return {markerHitsCtx:!!(ctx&&mk&&!ctx.hidden&&ctx.height>0&&mk.top<ctx.bottom&&mk.bottom>ctx.top),
    pillOverflow:sel?sel.scrollWidth-sel.clientWidth:0,
    circleOut:sheet?circ.filter(c=>c.top<sheet.top||c.bottom>sheet.bottom+1||c.left<sheet.left||c.right>sheet.right).length:0};});
  assert(!g.markerHitsCtx&&g.pillOverflow<=0&&g.circleOut===0,"v3 phone geometry on "+page+": "+JSON.stringify(g));
 }
 const mobileCockpit=await mobile.goto(base+"/onboard/cockpit.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert(mobileCockpit?.status()===200,"mobile cockpit HTTP status");
 await mobile.locator("nav.tabs button[data-tab='status']").click();
 assert((await mobile.locator("#views").innerText()).length>80,"mobile cockpit status empty");
 await mobile.screenshot({path:path.join(out,"onboard-cockpit-mobile.png"),fullPage:true});
 assert(errors.length===0,"browser JS errors: "+errors.join(" | "));
 console.log("PASS Chromium Polar Lab desktop+mobile navigation, disclaimers, evidence and screenshots",out);
}catch(e){console.error("FAIL Chromium QA",e?.stack||e);console.error(diagnostics);process.exitCode=1;}
finally{if(browser)await browser.close();child.kill("SIGTERM");}
