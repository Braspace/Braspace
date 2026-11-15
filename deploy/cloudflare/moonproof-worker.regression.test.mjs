// Reproduces concrete defects in #312; run against that exact source for RED,
// then against the amended candidate for GREEN. No external requests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const mod=await import(process.env.BRASPACE_WORKER_UNDER_TEST?pathToFileURL(resolve(process.env.BRASPACE_WORKER_UNDER_TEST)).href:new URL('./moonproof-worker.mjs',import.meta.url).href);
const handle=mod.handleAPI;
const origin='https://braspace-moonproof.example.workers.dev';
const req=(path,opts)=>new Request(origin+path,opts);
const post=(path,body='{}',headers={})=>req(path,{method:'POST',body,headers:{'Content-Type':'application/json',...headers}});
async function mock(impl,fn) { const old=globalThis.fetch;globalThis.fetch=impl;try{return await fn();}finally{globalThis.fetch=old;} }

test('two report operations return valid HTML with a restrictive CSP',async()=>{
  await mock(()=>new Response('<!doctype html><h1>Report</h1>',{headers:{'Content-Type':'text/html'}}),async()=>{
    for(const p of ['/api/onboard/report','/api/onboard/site-report']){const r=await handle(post(p));assert.equal(r.status,200);assert.match(r.headers.get('Content-Security-Policy'),/default-src 'none'/);assert.match(r.headers.get('Content-Type'),/text\/html/);}
  });
});
test('registered GLB response model/gltf-binary is not rejected',async()=>{
  await mock(()=>new Response(new Uint8Array([0x67,0x6c,0x54,0x46]),{headers:{'Content-Type':'model/gltf-binary'}}),async()=>assert.equal((await handle(req('/api/layers/svs-14959-moon-small-glb/asset'))).status,200));
});
test('conditional 304 and byte ranges are relayed',async()=>{
  let observed;
  await mock(async(url,opts)=>{observed=opts;return new Response(null,{status:304,headers:{ETag:'"pinned"'}});},async()=>{
    const r=await handle(req('/api/layers/svs-14959-moon-small-glb/asset',{headers:{'If-None-Match':'"pinned"'}}));assert.equal(r.status,304);assert.equal(observed.headers.get('If-None-Match'),'"pinned"');
  });
  await mock(async(url,opts)=>{observed=opts;return new Response(new Uint8Array([1,2]),{status:206,headers:{'Content-Type':'model/gltf-binary','Content-Range':'bytes 0-1/100'}});},async()=>{
    const r=await handle(req('/api/layers/svs-14959-moon-small-glb/asset',{headers:{Range:'bytes=0-1'}}));assert.equal(r.status,206);assert.equal(observed.headers.get('Range'),'bytes=0-1');assert.equal(r.headers.get('Content-Range'),'bytes 0-1/100');
  });
});
test('duplicate JSON keys do not disappear before Go contract validation',async()=>{
  let actual;const duplicate=' {"model_id":"wrong","model_id":"right","vector":[]} ';
  await mock(async(url,opts)=>{actual=typeof opts.body==='string'?opts.body:new TextDecoder().decode(opts.body);return Response.json({code:'INVALID_JSON'},{status:400});},async()=>{await handle(post('/api/vector/search',duplicate));assert.equal(actual,duplicate);});
});
test('vector and navigation enforce 16KiB before upstream work',async()=>{
  let calls=0;await mock(async()=>{calls++;return Response.json({ok:true});},async()=>{
    for(const p of ['/api/vector/search','/api/onboard/navigation'])assert.equal((await handle(post(p,JSON.stringify({x:'x'.repeat(16384)})))).status,413);
    assert.equal(calls,0);
  });
});
test('only documented sky query parameters pass; duplicate/unknown query rejected',async()=>{
  let calls=0;await mock(async()=>{calls++;return Response.json({ok:true});},async()=>{
    for(const p of ['/api/sites/connecting-ridge/sky?at=2026-11-15','/api/sites/connecting-ridge/sky?hours=1&hours=2','/api/health?x=1'])assert.equal((await handle(req(p))).status,400);
    assert.equal(calls,0);
  });
});
test('cross-origin POST is denied at the same-origin edge',async()=>{
  let calls=0;await mock(async()=>{calls++;return Response.json({ok:true});},async()=>{assert.equal((await handle(post('/api/compare','{}',{Origin:'https://other.test'}))).status,403);assert.equal(calls,0);});
});
test('deployed navigation 404 text/plain remains a 404, not disguised as upstream 502',async()=>{
  await mock(async()=>new Response('404 page not found',{status:404,headers:{'Content-Type':'text/plain'}}),async()=>assert.equal((await handle(post('/api/onboard/navigation'))).status,404));
});
