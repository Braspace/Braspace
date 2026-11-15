// Actual browser integration of both Evidence views. HTTP vector fixtures are
// synthetic and only exercise UI contracts; real PostgreSQL/pgvector is tested separately.
// Start web/dev-server.mjs from the full checkout, then run this script.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const base=(process.env.BRASPACE_VECTOR_BROWSER_BASE || "http://127.0.0.1:5173").replace(/\/$/, "");
const model="fixture/test-v1";
const vector=[1,...Array(383).fill(0)];
const status={enabled:true,available:true,model_id:model,dimension:384,scientifically_validated:false};
const hit={source_ref:"synthetic-fixture",title:"Synthetic metadata fixture",source_url:"https://example.org/source",sha256:"a".repeat(64),similarity:1};
const response={model_id:model,dimension:384,scientifically_validated:false,limitations:["metadata only"],results:[hit]};
const browser=await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-webgl"]});
try {
 for (const pagePath of ["/moonproof/evidence.html?lang=en", "/#/evidencias"]) {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  let phase="disabled", count=0, submitted=null, result=response;
  await page.route("**/api/vector/status", route=>route.fulfill({json:phase==="disabled"?{...status,enabled:false,available:false,model_id:""}:phase==="unavailable"?{...status,available:false}:status}));
  await page.route("**/api/vector/search", route=>{
    count++; submitted=route.request().postDataJSON();
    return route.fulfill({json:result});
  });
  const r=await page.goto(base+pagePath,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(r.status(),200);
  const panel=page.locator("#metadata-search");
  const awaitState=state=>panel.locator(`[data-state="${state}"]`).waitFor({state:"visible",timeout:30000});
  await awaitState("disabled");
  assert.equal(await panel.locator("textarea").isVisible(),false);
  assert.equal(count,0);
  phase="unavailable"; await panel.locator("button").first().click(); await awaitState("unavailable");
  assert.equal(await panel.locator("textarea").isVisible(),false);
  phase="ready"; await panel.locator("button").first().click(); await awaitState("ready");
  assert.ok((await panel.innerText()).includes(model));
  await panel.locator("summary").click();
  await panel.locator("textarea").fill(JSON.stringify({model_id:"different-model",vector}));
  await panel.locator("button[type=submit]").click();
  await panel.getByText(/supplied model does not match|modelo fornecido não corresponde/).waitFor({state:"visible"});
  assert.equal(count,0,"invalid model must not reach API");
  await panel.locator("textarea").fill(JSON.stringify({model_id:model,vector,limit:2}));
  await panel.locator("select").selectOption("3");
  await panel.locator("button[type=submit]").click();
  await panel.getByRole("link",{name:hit.title}).waitFor({state:"visible"});
  assert.equal(count,1);
  assert.deepEqual(submitted,{model_id:model,vector,limit:3});
  assert.equal(await panel.getByRole("link",{name:hit.title}).getAttribute("href"),hit.source_url);
  assert.ok((await panel.innerText()).includes(hit.sha256));
  result={...response,results:[]};
  await panel.locator("button[type=submit]").click();
  await panel.getByText(/No source matched|Nenhuma fonte encontrada/).waitFor({state:"visible"});
  await panel.getByRole("link",{name:hit.title}).waitFor({state:"detached"});
  assert.equal(count,2);
  console.log("PASS Evidence metadata UI (synthetic HTTP fixtures):",pagePath);
  await page.close();
 }
} finally { await browser.close(); }
