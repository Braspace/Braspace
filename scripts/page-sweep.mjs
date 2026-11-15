// BR101: every web page at 1440x900 and 390x844: console errors, failed requests, horizontal scroll.
// Usage: BASE=http://127.0.0.1:5380 node scripts/page-sweep.mjs [--json out.json]
// Needs playwright-core (or playwright) and a Chrome: CHROME_PATH=/usr/bin/google-chrome
import {readdirSync,statSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
let chromium;
try{({chromium}=await import("playwright"));}catch{({chromium}=await import("playwright-core"));}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const base=(process.env.BASE||"http://127.0.0.1:5380").replace(/\/$/,"");
const pages=process.env.PAGES?process.env.PAGES.split(","):(()=>{
 const out=[];
 const walk=(dir,rel)=>{for(const n of readdirSync(dir)){const p=path.join(dir,n),r=rel?rel+"/"+n:n;
  if(statSync(p).isDirectory()){if(!["node_modules","tests","test","data","assets","lab","browser","designer"].includes(n))walk(p,r);}
  else if(n.endsWith(".html"))out.push("/"+r);}};
 walk(path.join(root,"web"),"");return out.sort();})();
const sizes=[[1440,900],[390,844]];
const exe=process.env.CHROME_PATH||undefined;
const browser=await chromium.launch({headless:true,executablePath:exe,args:["--use-angle=swiftshader","--enable-webgl","--no-sandbox"]});
const results=[];
for(const p of pages)for(const [w,h] of sizes){
 const ctx=await browser.newContext({viewport:{width:w,height:h}});
 const page=await ctx.newPage();
 const row={page:p,viewport:`${w}x${h}`,status:null,console:[],pageerrors:[],bad:[],hscroll:null};
 page.on("console",m=>{if(m.type()==="error")row.console.push(m.text().slice(0,200));});
 page.on("pageerror",e=>row.pageerrors.push(String(e.message).slice(0,200)));
 page.on("response",r=>{if(r.status()>=400)row.bad.push(r.status()+" "+r.request().method()+" "+r.url().replace(base,"").slice(0,120));});
 page.on("requestfailed",r=>row.bad.push("FAILED "+r.url().replace(base,"").slice(0,120)+" "+(r.failure()?.errorText||"")));
 try{
  const r=await page.goto(base+p,{waitUntil:"load",timeout:30000});row.status=r?.status();
  await page.waitForTimeout(2500);
  row.hscroll=await page.evaluate(()=>({scrollW:document.documentElement.scrollWidth,clientW:document.documentElement.clientWidth}));
 }catch(e){row.pageerrors.push("NAV "+String(e.message).slice(0,160));}
 results.push(row);await ctx.close();
}
await browser.close();
let fail=0;
console.log("page | viewport | status | console | pageerr | 4xx/5xx/failed | hscroll");
for(const r of results){
 const hs=r.hscroll&&r.hscroll.scrollW>r.hscroll.clientW+1;
 const bad=r.status!==200||r.console.length||r.pageerrors.length||r.bad.length||hs;
 if(bad)fail++;
 console.log(`${r.page} | ${r.viewport} | ${r.status} | ${r.console.length} | ${r.pageerrors.length} | ${r.bad.length} | ${hs?"YES "+r.hscroll.scrollW+">"+r.hscroll.clientW:"no"}`+(bad?"  <-- "+JSON.stringify({c:r.console.slice(0,2),e:r.pageerrors.slice(0,2),b:r.bad.slice(0,4)}):""));
}
if(process.argv[2]==="--json")writeFileSync(process.argv[3],JSON.stringify(results,null,1));
console.log(fail?`FAIL: ${fail} of ${results.length} page/viewport combinations`:`OK: ${results.length} page/viewport combinations clean`);
process.exit(fail?1:0);
