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
 await desktop.locator("#tabs button[data-view='compare']").click();
 await desktop.locator("#tabs button[data-view='recover']").click();
 await desktop.locator("#tabs button[data-view='evidence']").click();
 assert((await desktop.locator("#panel-body").innerText()).length>60,"evidence panel is empty");
 await desktop.screenshot({path:path.join(out,"polar-lab-desktop.png"),fullPage:true});
 await desktop.getByRole("link",{name:"Mission computer"}).click();
 assert(desktop.url().endsWith("/index.html"),"classic UI navigation failed");
 assert((await desktop.locator("body").innerText()).includes("UNVERIFIED INPUTS"),"classic scientific disclaimer absent");
 await desktop.screenshot({path:path.join(out,"moonproof-classic-desktop.png"),fullPage:true});
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 mobile.on("pageerror",error=>errors.push("mobile: "+error.message));
 const mobileResponse=await mobile.goto(base+"/lab.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert(mobileResponse?.status()===200,"mobile lab status");
 await mobile.locator("#tabs button[data-view='evidence']").click();
 assert((await mobile.locator("#panel-body").innerText()).length>60,"mobile evidence empty");
 await mobile.screenshot({path:path.join(out,"polar-lab-mobile.png"),fullPage:true});
 const overflow=await mobile.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert(overflow.width<=overflow.viewport+4,"mobile horizontal overflow: "+JSON.stringify(overflow));
 assert(errors.length===0,"browser JS errors: "+errors.join(" | "));
 console.log("PASS Chromium Polar Lab desktop+mobile navigation, disclaimers, evidence and screenshots",out);
}catch(e){console.error("FAIL Chromium QA",e?.stack||e);console.error(diagnostics);process.exitCode=1;}
finally{if(browser)await browser.close();child.kill("SIGTERM");}
