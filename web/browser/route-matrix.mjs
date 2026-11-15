// Against a running full-stack dev server: BASE=http://127.0.0.1:5380 npm run test:matrix
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {cases,sizes} from "./route-matrix-config.mjs";
const base=(process.env.BASE||"http://127.0.0.1:5380").replace(/\/$/,"");
const out=process.env.MATRIX_OUT||"browser/artifacts/joel-matrix";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.env.MATRIX_GPU?["--enable-gpu","--ignore-gpu-blocklist","--use-angle=vulkan"]:["--disable-webgl"],executablePath:process.env.CHROME_PATH||undefined});
const results=[];
try{
 for(const size of sizes){
  const ctx=await browser.newContext({viewport:size,reducedMotion:"reduce"});
  try{
   for(const entry of cases){
    if(process.env.MATRIX_FAMILY&&entry.family!==process.env.MATRIX_FAMILY)continue;
    const page=await ctx.newPage(),name=entry.family+"-"+entry.id+"-"+size.width+"x"+size.height;
    const r={name,url:entry.url,viewport:size,errors:[],console:[],httpErrors:[],failedRequests:[]};
    page.on("pageerror",e=>r.errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")r.console.push(m.text())});
    page.on("response",res=>{if(res.status()>=400)r.httpErrors.push(res.status()+" "+res.url())});
    page.on("requestfailed",req=>{if(!entry.blockMoon||!req.url().endsWith("/moon-hd/app.js"))r.failedRequests.push(req.url()+" "+req.failure()?.errorText)});
    try{
     if(entry.blockMoon)await page.route("**/moon-hd/app.js",route=>route.abort());
     const response=await page.goto(base+entry.url,{waitUntil:"domcontentloaded",timeout:30000});
     r.status=response?.status();if(r.status!==200)throw Error("HTTP "+r.status);
     if(entry.click)await page.locator(entry.click).first().click({timeout:15000});
     if(entry.active)await page.locator(entry.active).first().waitFor({state:"visible",timeout:15000});
     await page.locator(entry.ready).filter({visible:true}).first().waitFor({state:"visible",timeout:35000});
     if(entry.blockMoon){
      const image=await page.locator("#loading").evaluate(el=>getComputedStyle(el).backgroundImage);
      if(!image.includes("pole-preview.webp"))throw Error("Moon HD failure lost canonical poster");
      await page.locator("#loading .moon-preview-actions a").waitFor({state:"visible"});
     }
     r.overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
     if(r.overflow>1)throw Error("Horizontal document overflow: "+r.overflow);
    }catch(e){r.errors.push(e.message)}
    try{await page.screenshot({path:path.join(out,name+".png"),animations:"disabled",timeout:10000})}catch(e){r.errors.push("Screenshot: "+e.message)}
    r.pass=r.status===200&&r.errors.length===0&&r.httpErrors.length===0&&r.failedRequests.length===0&&r.console.filter(x=>!(entry.blockMoon&&/ERR_FAILED|ERR_ABORTED/.test(x))).length===0;
    results.push(r);console.log(r.pass?"PASS":"FAIL",name,r.errors.join(" | "));
    await page.close();
   }
  }finally{await ctx.close()}
 }
}finally{await browser.close();await writeFile(path.join(out,"results.json"),JSON.stringify(results,null,2))}
if(results.some(r=>!r.pass))process.exitCode=1;
