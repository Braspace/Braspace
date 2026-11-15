import test from "node:test";
import assert from "node:assert/strict";
import {createMediaLoader,validateMedia} from "../core/media-client.js";

const site="malapert-massif";
const item={title:"LROC photo",credit:"NASA / ASU",page_url:"https://lroc.example.org/photo",illustrative_only:true};
test("only matching labelled HTTPS illustrative cards accepted",()=>{
  assert.deepEqual(validateMedia({site_id:site,media:[item]},site),[item]);
  assert.equal(validateMedia({site_id:"other",media:[item]},site),null);
  assert.deepEqual(validateMedia({site_id:site,media:[]},site),[]);
  for(const change of [{page_url:"javascript:alert(1)"},{page_url:"https://a:secret@example.org"},{page_url:"http://example.org"},{page_url:"https://"},{illustrative_only:false},{credit:null}]) assert.equal(validateMedia({site_id:site,media:[{...item,...change}]},site),null);
});
test("transient failures not cached; valid concurrent desktop/mobile request shares cached source",async()=>{
  let n=0;
  const load=createMediaLoader(async path=>{assert.equal(path,`/api/sites/${site}/media`);n++;return n===1?{ok:false}:{ok:true,data:{site_id:site,media:[item]}};});
  assert.equal(await load(site),null);
  assert.deepEqual(await Promise.all([load(site),load(site)]),[[item],[item]]);
  assert.deepEqual(await load(site),[item]);
  assert.equal(n,2);
  assert.equal(await load("../bad"),null);assert.equal(n,2);
});
test("valid empty media retained; rejected malformed metadata retries",async()=>{
  let n=0;const load=createMediaLoader(async()=>({ok:true,data:{site_id:site,media:++n===1?[{...item,page_url:"data:text/html,invalid"}]:[]}}));
  assert.equal(await load(site),null);assert.deepEqual(await load(site),[]);assert.deepEqual(await load(site),[]);assert.equal(n,2);
});
