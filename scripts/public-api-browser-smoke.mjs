// Public UI integration smoke: actual browser, real configured API, no mocks.
import assert from "node:assert/strict";
import {chromium} from "playwright";
const front=(process.env.FRONT||"https://braspace.github.io").replace(/\/$/,"");
const api=(process.env.API||"https://braspace-api.srv1898743.hstgr.cloud").replace(/\/$/,"");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
const apiResponse=(path,method="GET")=>page.waitForResponse(r=>new URL(r.url()).origin===new URL(api).origin&&new URL(r.url()).pathname===path&&r.request().method()===method&&r.status()===200,{timeout:30000});
try {
 const catalog=apiResponse("/api/sites");
 await page.goto(front+"/studio/");
 await catalog;
 await page.waitForFunction(()=>document.querySelector("#connection")?.textContent?.includes("connected"),null,{timeout:30000});
 await page.locator('[data-screen="explore"]').click();
 const sky=apiResponse("/api/sites/"+await page.locator("#site").inputValue()+"/sky");
 await page.locator("#load-sky").click(); await sky;
 await page.waitForFunction(()=>document.querySelector("#feedback")?.textContent?.includes("stored samples"),null,{timeout:30000});
 await page.locator('[data-screen="compare"]').click();
 await page.locator("#site-two").selectOption("nobile-rim-1");
 const compare=apiResponse("/api/compare","POST");
 await page.locator("#run-compare").click();
 assert.equal((await (await compare).json()).scientifically_validated,false);
 await page.waitForFunction(()=>document.querySelector("#feedback")?.textContent?.includes("compared"),null,{timeout:30000});
 await page.locator('[data-screen="recover"]').click();
 await page.locator("#dark-limit").fill("12"); await page.locator("#earth-limit").fill("24");
 const recover=apiResponse("/api/scenarios/delay","POST");
 await page.locator("#run-recover").click();
 assert.equal((await (await recover).json()).scientifically_validated,false);
 await page.waitForFunction(()=>document.querySelector("#feedback")?.textContent?.includes("Replanning response received"),null,{timeout:30000});
 const health=apiResponse("/api/health");
 await page.goto(front+"/onboard/cockpit.html"); await health;
 await page.waitForFunction(()=>document.querySelector("#badges")?.textContent?.includes("readyz: ready")||document.body.innerText.includes("ENGINE READY"),null,{timeout:30000});
 const energy=page.waitForResponse(r=>r.url().startsWith(api+"/api/onboard/")&&r.request().method()==="POST"&&r.status()===200,{timeout:30000});
 await page.locator("#fab").click(); await energy;
 await page.waitForFunction(()=>document.body.innerText.includes("UNVERIFIED_INPUTS")&&document.body.innerText.includes("Carga mínima"),null,{timeout:30000});
 // Polar Lab: its live health/catalogue/sky/status are separate from its
 // preliminary static terrain data. Keep vector readiness honest.
 const labHealth=apiResponse("/api/health"),labSites=apiResponse("/api/sites"),labVector=apiResponse("/api/vector/status");
 await page.goto(front+"/lab.html");
 const [healthRes,catRes,vectorRes]=await Promise.all([labHealth,labSites,labVector]);
 assert.equal((await healthRes.json()).engine,"ready");
 assert.ok((await catRes.json()).sites.length>0);
 const vector=await vectorRes.json();
 assert.equal(typeof vector.enabled,"boolean");assert.equal(typeof vector.available,"boolean");
 await page.waitForFunction(()=>document.querySelector("#api-feedback")?.textContent?.includes("Go/Rust engine ready")&&document.querySelector("#api-feedback")?.textContent?.includes("pgvector metadata"));
 const training=apiResponse("/api/onboard/evaluate","POST");
 await page.locator("#api-simulate").click();
 const trainingData=await (await training).json();
 assert.equal(trainingData.science_status,"UNVERIFIED_INPUTS");assert.equal(trainingData.no_flight_recommendation,true);
 await page.waitForFunction(()=>document.querySelector("#api-sim-result")?.textContent?.includes("TRAINING ONLY"));
 // Root shell and the MoonProof screens must show real API results, not only
 // make a background health request while using an unrelated static response.
 const rootCompare=apiResponse("/api/compare","POST");
 await page.goto(front+"/#/comparar?t=2026-11-15&d=7&a=connecting-ridge&b=nobile-rim-1&c=mons-mouton-im2");
 assert.equal((await (await rootCompare).json()).scientifically_validated,false);
 await page.getByText("API Go ao vivo · métricas preliminares",{exact:true}).waitFor();
 const scenario="?site=connecting-ridge&start=2026-11-15T00%3A00%3A00Z&hours=24&lang=en&layer=proof";
 const moonCompare=apiResponse("/api/compare","POST");
 await page.goto(front+"/moonproof/compare.html"+scenario);
 assert.equal((await (await moonCompare).json()).scientifically_validated,false);
 await page.locator(".mp-context").waitFor();
 const moonRecover=apiResponse("/api/scenarios/delay","POST");
 await page.goto(front+"/moonproof/recover.html"+scenario);
 const recovery=await (await moonRecover).json();
 assert.equal(recovery.scientifically_validated,false);
 await page.locator(".mp-context").waitFor();
 if(recovery.options.some(o=>o.kind==="nearby_site")){
  await page.locator(".mp-nearby").waitFor();
  assert.match(await page.locator(".mp-nearby").innerText(),/stated start/);
 }
 // For every successful cockpit simulation, the independently printed report
 // must use the same API and match the exact submitted payload.
 const siteEval=apiResponse("/api/onboard/site-evaluate","POST");
 await page.goto(front+"/moonproof/cockpit.html"+scenario);
 const siteRes=await siteEval, siteBody=siteRes.request().postDataJSON(), siteData=await siteRes.json();
 assert.equal(siteData.onboard.science_status,"UNVERIFIED_INPUTS");
 await page.waitForFunction(()=>globalThis.__cockpit?.report?.path==="/api/onboard/site-report");
 async function checkReport(path,body,button){
  const reportResponse=apiResponse(path,"POST");
  const popupP=page.waitForEvent("popup",{timeout:30000});
  await button.click();
  const res=await reportResponse;
  assert.deepEqual(res.request().postDataJSON(),body);
  assert.match(res.headers()["content-type"],/^text\/html/);
  assert.match(await res.text(),/UNVERIFIED_INPUTS/);
  const popup=await popupP;
  await popup.waitForURL(/^blob:/);assert.match(await popup.locator("body").innerText(),/UNVERIFIED_INPUTS/);
  await popup.close();
 }
 await checkReport("/api/onboard/site-report",siteBody,page.locator("#report"));
 const antenna=apiResponse("/api/onboard/evaluate","POST");
 await page.locator('[data-fault="antenna"]').click();
 const antRes=await antenna, antBody=antRes.request().postDataJSON(), antData=await antRes.json();
 assert.ok(antBody.candidates[0].samples.every(s=>s.earth_visible===false));
 assert.equal(antBody.candidates[0].samples.length,24);
 assert.equal(antData.options[0].metrics.longest_earth_obstruction_hours,24);
 await page.waitForFunction(()=>globalThis.__cockpit?.report?.path==="/api/onboard/report");
 await checkReport("/api/onboard/report",antBody,page.locator("#report"));
 assert.deepEqual(errors,[],"browser JS errors");
 console.log("PASS live browser: studio, legacy onboard, Polar Lab health/metadata/training, root compare, MoonProof compare/replan/cockpit reports and antenna fault (not flight-certified)");
} finally {await browser.close();}

