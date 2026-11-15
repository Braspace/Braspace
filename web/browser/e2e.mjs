// Browser QA for the only product surface, MoonProof (web/moonproof/, Preact TSX) and the Three.js
// viewer (moon-hd.html), against the real Go API + Rust engine when BRASPACE_REQUIRE_BACKEND=1.
// Run with: npm --prefix web install --no-save playwright@1.56.1
//           npx --prefix web playwright install chromium
//           node web/browser/e2e.mjs
import {chromium} from "playwright";
import {verifyCockpitPanels} from "./cockpit-panels.e2e.mjs";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const port=Number(process.env.BRASPACE_BROWSER_PORT||"5377");
const base="http://127.0.0.1:"+port;
const out=path.resolve(process.env.BRASPACE_BROWSER_ARTIFACTS||"/tmp/braspace-browser-artifacts");
const requireBackend=process.env.BRASPACE_REQUIRE_BACKEND==="1";
const child=spawn(process.execPath,["web/dev-server.mjs"],{cwd:root,env:{...process.env,BRASPACE_WEB_PORT:String(port)},stdio:"pipe"});
let diagnostics="";
for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{diagnostics+=String(chunk).slice(0,900);});
let browser;
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
async function ready(){
 for(let i=0;i<80;i++){try{const r=await fetch(base+"/moonproof/",{signal:AbortSignal.timeout(500)});if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw new Error("web unavailable: "+diagnostics);
}
const errors=[];
async function open(page,url,ready){
 const r=await page.goto(base+url,{waitUntil:"domcontentloaded",timeout:30000});
 assert(r?.status()===200,url+" HTTP "+r?.status());
 await page.locator(ready).filter({visible:true}).first().waitFor({state:"visible",timeout:35000});
}
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
try{
 await mkdir(out,{recursive:true});await ready();
 browser=await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-webgl","--enable-unsafe-swiftshader"]});
 const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 desktop.on("pageerror",error=>errors.push("desktop: "+error.message));

 // / redirects to the product.
 const home=await desktop.goto(base+"/",{waitUntil:"load",timeout:30000});
 assert(home?.status()===200,"root HTTP status");
 await desktop.waitForURL(/\/moonproof\/$/,{timeout:15000});
 await desktop.locator("#cards [role=listitem], #cards > *").first().waitFor({state:"visible",timeout:20000});
 await desktop.screenshot({path:path.join(out,"moonproof-entry.png")});

 // Mission: every catalogue site is a marker on the shared map.
 await open(desktop,"/moonproof/mission.html","#dock .mp-marker, .mp-marker");
 assert(await desktop.locator(".mp-marker").count()>=5,"mission markers");
 assert(["moonhd","lola-2d"].includes(await desktop.locator(".mp-terrain").getAttribute("data-relief")),"mission relief state");
 await desktop.screenshot({path:path.join(out,"moonproof-mission.png")});

 // Explore: one analysis layer at a time (radio group).
 await open(desktop,"/moonproof/explore.html","#left [role=radio][data-layer]");
 await desktop.locator('#left [role=radio][data-layer="slope"]').click();
 // The layer redraw is async (state → render); under SwiftShader WebGL it lands a few frames later. Wait for it.
 assert(await desktop.waitForFunction(()=>document.querySelector('#left [role=radio][data-layer="slope"]')?.getAttribute("aria-checked")==="true",null,{timeout:10000}).then(()=>true,()=>false),"explore layer switch");

 // Cockpit: the onboard computer runs on the Go API (site-evaluate, falling back to evaluate).
 const onboard=requireBackend?desktop.waitForResponse(r=>/\/api\/onboard\/(site-)?evaluate$/.test(new URL(r.url()).pathname),{timeout:40000}):null;
 await open(desktop,"/moonproof/cockpit.html","#player");
 if(onboard){const r=await onboard;assert(r.status()===200||r.status()===422,"onboard API status "+r.status());}
 assert(await desktop.locator('a[href*="onboard/"]').count()===0,"cockpit must not link the archived onboard panel");
 await verifyCockpitPanels(desktop);
 await desktop.screenshot({path:path.join(out,"moonproof-cockpit.png")});

 for(const [page,sel] of [["compare","#left"],["recover","#right"],["evidence","#sources"],["plan","#plan-table"],["rules","#rules-core"],["present","#present-question"],["activity","#act-steps"],["debrief","#actions a, .deb-none"]])
  await open(desktop,"/moonproof/"+page+".html",sel);

 // Landing Lab: Three.js scene over the LOLA site tile and the educational 3DOF simulator.
 await open(desktop,"/moonproof/landing.html","#bar");
 assert(await desktop.locator("canvas").count()>=1,"landing canvas");
 await desktop.screenshot({path:path.join(out,"moonproof-landing.png")});

 // Three.js Moon HD viewer: either the live scene or the canonical poster fallback.
 await desktop.goto(base+"/moon-hd.html?view=pole",{waitUntil:"domcontentloaded",timeout:30000});
 await desktop.waitForFunction(()=>{const l=document.querySelector("#loading");return !l||l.hidden||l.classList.contains("done")||l.classList.contains("error")||getComputedStyle(l).display==="none";},null,{timeout:60000});

 // Archived surfaces are gone.
 for(const p of ["/classic.html","/lab.html","/studio/","/onboard/cockpit.html","/dashboard/","/polar-map-demo.html"])
  assert((await fetch(base+p)).status===404,p+" should be archived (404)");

 // Close the desktop tab first: a software-WebGL viewer left running shares Chromium's GPU process with the next tab.
 await desktop.close();
 // Phone: no horizontal scroll on the main screens.
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 mobile.on("pageerror",error=>errors.push("mobile: "+error.message));
 for(const [page,sel] of [["mission","#dock .mp-marker, .mp-marker"],["explore","#sheet, #left [role=radio][data-layer]"],["cockpit","#player"],["activity","#act-steps"],["landing","#bar"]]){
  await open(mobile,"/moonproof/"+page+".html",sel);
  const o=await overflow(mobile);assert(o<=1,"mobile "+page+" horizontal overflow "+o);
 }
 await mobile.screenshot({path:path.join(out,"moonproof-landing-mobile.png")});

 assert(errors.length===0,"browser JS errors: "+errors.join(" | "));
 console.log("PASS Chromium MoonProof desktop+mobile, Go API onboard call"+(requireBackend?"":" (backend not required)")+", Three.js landing/viewer, archived routes 404",out);
}catch(e){console.error("FAIL Chromium QA",e?.stack||e);console.error(diagnostics);process.exitCode=1;}
finally{if(browser)await browser.close();child.kill("SIGTERM");}
