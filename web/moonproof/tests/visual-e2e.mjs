// Integration QA: actual fullscreen NASA-derived terrain, nine visual routes,
// class/plan controls, responsive 390px layout and source labels.
import {chromium} from "playwright";
import assert from "node:assert/strict";

const base=process.env.BRASPACE_V3_URL||"http://127.0.0.1:5173";
const screens=["explore","compare","recover","cockpit","evidence","landing","debrief","learn","plan"];
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on("pageerror",err=>errors.push("desktop "+err.message));
try{
 const entry=await page.goto(base+"/moonproof/",{waitUntil:"domcontentloaded",timeout:30000});
 assert.equal(entry.status(),200,"MoonProof V3 task entry route");
 assert.equal(await page.locator(".mp-task").count(),3,"three user-selected tasks");
 const mission=await page.goto(base+"/moonproof/mission.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert.equal(mission.status(),200,"Mission Control");
 await page.locator("#terrain canvas").first().waitFor({timeout:30000});
 assert.ok(await page.locator(".mp-marker").count()>=3,"Mission Control numbered NASA site markers");
 await page.screenshot({path:"/tmp/moonproof-v3-mission-desktop.png",fullPage:true});
 for(const name of screens){
  const resp=await page.goto(base+"/moonproof/"+name+".html",{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(resp.status(),200,"route "+name);
  await page.locator("#terrain canvas").first().waitFor({timeout:30000});
  await page.locator("#screen-title").waitFor({timeout:30000});
  assert.ok(await page.locator(".mp-marker").count()>=3,"site markers "+name);
  const origin=await page.locator(".mp-seal").allTextContents();
  assert.ok(!origin.some(x=>x==="VAL"),"V3 incorrectly promotes preliminary to VAL on "+name);
 }
 await page.goto(base+"/moonproof/compare.html",{waitUntil:"domcontentloaded"});
 await page.locator("#screen-title").waitFor();
 assert.equal(await page.locator(".mp-scenario").count(),3,"A/B/C comparison must be selectable");
 await page.locator(".mp-scenario").nth(2).click();
 assert.equal(await page.locator(".mp-scenario").nth(2).getAttribute("aria-pressed"),"true");
 await page.screenshot({path:"/tmp/moonproof-v3-compare-desktop.png",fullPage:true});
 await page.goto(base+"/moonproof/recover.html",{waitUntil:"domcontentloaded"});
 await page.locator("#screen-title").waitFor();
 assert.equal(await page.locator(".mp-candidate-grid button").count(),6,"real delay options missing");
 await page.locator(".mp-candidate-grid button").nth(3).click();
 assert.equal(await page.locator(".mp-candidate-grid button").nth(3).getAttribute("aria-pressed"),"true");
 await page.screenshot({path:"/tmp/moonproof-v3-replan-desktop.png",fullPage:true});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 mobile.on("pageerror",err=>errors.push("mobile "+err.message));
 for(const name of ["explore","compare","recover","learn","plan"]){
  const resp=await mobile.goto(base+"/moonproof/"+name+".html",{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(resp.status(),200,name+" mobile route");
  await mobile.locator("#screen-title").waitFor({timeout:30000});
  const dims=await mobile.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  assert.ok(dims.width<=dims.viewport+4,name+" unexpected horizontal overflow "+JSON.stringify(dims));
  if(name==="learn"){
   const reveal=mobile.locator(".mp-reveal");
   assert.ok(await reveal.isHidden(),"classroom answer must start hidden");
   await mobile.getByRole("button",{name:"Revelar resposta"}).click();
   assert.ok(await reveal.isVisible(),"answer reveal must be interactive");
   await mobile.getByRole("button",{name:"Próxima pergunta"}).click();
   assert.ok(await mobile.locator(".mp-reveal").isHidden(),"next question must conceal answer");
  }
  if(name==="compare")await mobile.screenshot({path:"/tmp/moonproof-v3-compare-mobile.png",fullPage:true});
  if(name==="explore")await mobile.screenshot({path:"/tmp/moonproof-v3-explore-mobile.png",fullPage:true});
 }
 assert.deepEqual(errors,[],"uncaught JS errors");
 console.log("PASS MoonProof original-design V3, 11 routes, NASA terrain, source states, desktop+390px QA");
}finally{await browser.close();}
