// Responsive pointer smoke for the three modes; separate from the 53 behavioral cases.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=process.env.MATRIX_OUT||'/tmp/issue471-layout';await mkdir(out,{recursive:true});
const port='5379',base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,[fileURLToPath(new URL('../dev-server.mjs',import.meta.url))],{env:{...process.env,BRASPACE_WEB_PORT:port},stdio:'ignore'});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--disable-webgl']});
const results=[];
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/moonproof/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 for(const width of [320,390,768,1024,1440,1920])for(const lang of ['pt-BR','en']){
  const context=await browser.newContext({viewport:{width,height:width<700?844:1080},hasTouch:width<700,reducedMotion:'reduce'});
  await context.addInitScript(()=>{for(const m of ['welcome','entry','explore','class','plan'])localStorage.setItem(`moonproof.tour.${m}.v1`,'done')});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  try{for(const mode of ['explore','class','plan']){
   const id=`${width}-${lang}-${mode}`,r={id,width,lang,mode,status:'PASS',pageErrors:[]};page.removeAllListeners('pageerror');page.on('pageerror',e=>r.pageErrors.push(e.message));
   try{
    await page.goto(base+'/moonproof/?lang='+lang,{waitUntil:'domcontentloaded'});
    await page.locator(`[data-task="${mode}"]`).waitFor();
    r.entryOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    await page.screenshot({path:path.join(out,id+'-before.png'),animations:'disabled'});
    await page.locator(`[data-task="${mode}"]`).click();
    await page.waitForURL(new RegExp(mode==='class'?'activity.html':mode+'.html'));
    await page.locator(mode==='class'?'#act-steps':mode==='plan'?'#btn-recalc':'#left [data-layer], #sheet').first().waitFor({state:'visible'});
    r.overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(r.overflow>1||r.entryOverflow>1)throw Error(`Horizontal overflow: entry ${r.entryOverflow}px, mode ${r.overflow}px`);
    if(r.pageErrors.length)throw Error(r.pageErrors.join('; '));
   }catch(e){r.status='FAIL';r.reason=e.message}
   r.url=page.url();await page.screenshot({path:path.join(out,id+'-after.png'),animations:'disabled'}).catch(()=>{});
   results.push(r);console.log(r.status,id,r.reason||'');await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
  }}finally{await context.close()}
 }
}finally{await browser.close();server.kill()}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
