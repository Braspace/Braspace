import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker,{handleMoonAPI,routes} from './moonproof-worker.mjs';

const base='https://moonproof.example.test';
const upstream='https://braspace-api.srv1898743.hstgr.cloud';
// Run against the real checkout's spec when copied into deploy/cloudflare/.
// Isolated candidate worktree falls back to the exact hash-pinned inventory.
// An explicitly provided path is mandatory, not silently replaced.
const spec=await (async()=>{
  const explicit=process.env.BRASPACE_OPENAPI_SPEC;
  try {
    const raw=JSON.parse(await readFile(explicit||new URL('../../api/openapi.json',import.meta.url),'utf8'));
    return {operations:Object.entries(raw.paths).flatMap(([path,item])=>Object.keys(item).filter(method=>['get','post','put','patch','delete','head','options'].includes(method)).map(method=>({method:method.toUpperCase(),path})))};
  } catch(e) {
    if(explicit||e.code!=='ENOENT')throw e;
    return JSON.parse(await readFile(new URL('./openapi-operations.json',import.meta.url),'utf8'));
  }
})();
const request=(path,opts)=>new Request(base+path,opts);
const unreachable=()=>{assert.fail('upstream must not execute')};
const json=(status=200,body={ok:true})=>Response.json(body,{status});
const html=()=>new Response('<html><body>report</body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
const options=(method,body='{}',headers={})=>({method,...(method==='POST'?{body,headers:{'Content-Type':'application/json',...headers}}:{headers})});

test('exact coverage of all 22 pinned main OpenAPI operations (including parameterized paths)',async t=>{
  assert.equal(spec.operations.length,22);
  assert.deepEqual(routes.map(x=>x.method+' '+x.template).sort(),spec.operations.map(x=>x.method+' '+x.path).sort());
  for (const op of spec.operations) await t.test(op.method+' '+op.path,async()=>{
    let path=op.path.replace('{id}','connecting-ridge');
    if(path.endsWith('/sky')) path+='?start=2026-11-15T00%3A00%3A00Z&hours=24&step=60';
    const r=await handleMoonAPI(request(path,options(op.method)),async(url,opts)=>{
      assert.equal(url,upstream+path); assert.equal(opts.method,op.method);
      assert.equal(opts.redirect,'error'); assert.equal(opts.cache,'no-store');
      if(path.endsWith('/report')||path.endsWith('/site-report'))return html();
      if(path.endsWith('/asset'))return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}});
      return json();
    });
    assert.equal(r.status,200); assert.equal(r.headers.get('Cache-Control'),'no-store');
  });
});

test('asset and HTML routes must remain typed and not be rewritten into JSON or SPA HTML',async()=>{
  const report=await handleMoonAPI(request('/api/onboard/site-report',options('POST')),html);
  assert.equal(report.status,200); assert.match(report.headers.get('Content-Type'),/^text\/html/);
  assert.match(report.headers.get('Content-Security-Policy'),/sandbox/); assert.match(report.headers.get('Content-Security-Policy'),/default-src 'none'/);
  const unexpected=await handleMoonAPI(request('/api/health'),html);
  assert.equal(unexpected.status,502);assert.equal((await unexpected.json()).code,'INVALID_UPSTREAM_RESPONSE');
  const badReport=await handleMoonAPI(request('/api/onboard/report',options('POST')),()=>new Response('<html>Cloudflare error</html>',{status:502,headers:{'Content-Type':'text/html'}}));
  assert.equal(badReport.status,502);assert.equal((await badReport.json()).code,'INVALID_UPSTREAM_RESPONSE');
});

test('unknown paths, bad methods, malformed IDs fail closed; static frontend falls through',async()=>{
  for(const path of ['/api','/api/unknown','/api/sites/a%2Fb','/api/sites/%252e%252e','/api/sites/_bad','/api/sites/'+ 'a'.repeat(65),'/api/sites/UPPER','/api/sites/ok/sky/extra','/v1/anything','/readyz/extra']) {
    assert.equal((await handleMoonAPI(request(path),unreachable)).status,404,path);
  }
  for (const [path,method] of [['/api/sites','POST'],['/api/compare','GET'],['/api/sites','DELETE']]) {
    const r=await handleMoonAPI(request(path,options(method)),unreachable);
    assert.equal(r.status,405);assert.ok(r.headers.get('Allow'));
  }
  const sameOriginOptions=await handleMoonAPI(request('/api/sites',{method:'OPTIONS'}),unreachable);
  assert.equal(sameOriginOptions.status,204);assert.equal(sameOriginOptions.headers.get('Access-Control-Allow-Origin'),null);
  for(const path of ['/','/moonproof/','/moonproof/screens/entry.js','/config.js','/data/sites.json']) assert.equal(await handleMoonAPI(request(path),unreachable),null);
  const r=await worker.fetch(request('/moonproof/'),{ASSETS:{fetch:()=>new Response('static asset')}});assert.equal(await r.text(),'static asset');
});

test('passes only known sky query keys, preserves encoded values and rejects duplicate keys',async()=>{
  for(const path of ['/api/health?x=1','/api/sites/a/sky?x=1','/api/sites/a/sky?hours=1&hours=2','/api/sites/a/sky?start='+'x'.repeat(513),'/api/sites/a?start=1'])assert.equal((await handleMoonAPI(request(path),unreachable)).status,400);
  const path='/api/sites/connecting-ridge/sky?hours=12&start=2026-11-15T00%3A00%3A00Z';
  assert.equal((await handleMoonAPI(request(path),async target=>{assert.equal(target,upstream+path);return json()})).status,200);
});

test('raw JSON is preserved byte-for-byte; Go can reject duplicate keys, unknown values and malformed JSON',async()=>{
  // #309 parsed then JSON.stringify()d these requests, masking duplicate keys and changing number encodings.
  for(const body of [' {"duration_hours":1,"duration_hours":2} ','{"site_ids": [null], "q":1e0}','{bad json','[]','']){
    const r=await handleMoonAPI(request('/api/compare',options('POST',body)),async(url,opts)=>{
      assert.equal(new TextDecoder().decode(opts.body),body);
      return json(400,{code:'INVALID_JSON'});
    });
    assert.equal(r.status,400);assert.deepEqual(await r.json(),{code:'INVALID_JSON'});
  }
});

test('method-specific body bounds are enforced with and without Content-Length',async()=>{
  const bad=await handleMoonAPI(request('/api/compare',{method:'POST',body:'{}',headers:{'Content-Type':'text/plain'}}),unreachable);assert.equal(bad.status,415);
  for (const [path,limit] of [['/api/compare',131072],['/api/vector/search',16384],['/api/onboard/navigation',16384]]) {
    const r=await handleMoonAPI(request(path,options('POST','x'.repeat(limit+1))),unreachable);assert.equal(r.status,413,path);
    const lied=await handleMoonAPI(request(path,options('POST','{}',{'Content-Length':String(limit+1)})),unreachable);assert.equal(lied.status,413,path);
    const okay=await handleMoonAPI(request(path,options('POST','x'.repeat(limit))),async(_,opts)=>{assert.equal(opts.body.length,limit);return json(400)});assert.equal(okay.status,400,path);
  }
});

test('same-origin only, no forwarding credential headers and no CORS bypass',async()=>{
  const r=await handleMoonAPI(request('/api/compare',options('POST','{}',{Origin:base,Authorization:'Bearer secret',Cookie:'secret=1',Host:'host.invalid','X-Forwarded-Host':'evil'})),async(url,opts)=>{
    assert.equal(url,upstream+'/api/compare');
    for(const key of ['Origin','Authorization','Cookie','Host','X-Forwarded-Host'])assert.equal(opts.headers.get(key),null,key);
    return new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':'leak=1','Access-Control-Allow-Origin':'*'}});
  });
  assert.equal(r.status,200);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  for(const headers of [{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{Origin:'null'}])assert.equal((await handleMoonAPI(request('/api/health',{headers}),unreachable)).status,403);
});

test('binary range GET, HEAD, If-None-Match 304 and ETag/Content-Range preserve valid asset semantics',async()=>{
  const path='/api/layers/nasa-svs-moon-glb/asset';
  const partial=await handleMoonAPI(request(path,{headers:{Range:'bytes=0-3','If-Range':'"hash"'}}),async(url,opts)=>{
    assert.equal(opts.headers.get('Range'),'bytes=0-3');assert.equal(opts.headers.get('If-Range'),'"hash"');
    return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'Content-Type':'model/gltf-binary',ETag:'"hash"','Content-Range':'bytes 0-3/100','Accept-Ranges':'bytes'}});
  });
  assert.equal(partial.status,206);assert.equal(partial.headers.get('ETag'),'"hash"');assert.equal(partial.headers.get('Content-Range'),'bytes 0-3/100');assert.deepEqual(new Uint8Array(await partial.arrayBuffer()),new Uint8Array([1,2,3,4]));
  const head=await handleMoonAPI(request(path,{method:'HEAD'}),async(_,opts)=>{assert.equal(opts.method,'HEAD');return new Response(null,{headers:{'Content-Type':'model/gltf-binary'}})});assert.equal(head.status,200);assert.equal(head.body,null);
  const cached=await handleMoonAPI(request(path,{headers:{'If-None-Match':'"hash"'}}),async(_,opts)=>{assert.equal(opts.headers.get('If-None-Match'),'"hash"');return new Response(null,{status:304,headers:{ETag:'"hash"'}})});assert.equal(cached.status,304);assert.equal(cached.body,null);assert.equal(cached.headers.get('ETag'),'"hash"');
  assert.equal((await handleMoonAPI(request(path,{headers:{Range:'bytes=0-1,2-3'}}),unreachable)).status,416);
});

test('preserves structured and legacy upstream errors; refuses redirects and unexpected MIME',async()=>{
  for(const status of [400,404,413,415,422,499,500,502,503,504]) {
    const r=await handleMoonAPI(request('/api/vector/search',options('POST')),()=>json(status,{code:'UPSTREAM'}));
    assert.equal(r.status,status);assert.equal((await r.json()).code,'UPSTREAM');
  }
  const old=await handleMoonAPI(request('/api/onboard/navigation',options('POST')),()=>new Response('404 page not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}}));assert.equal(old.status,404);assert.deepEqual(await old.json(),{code:'UPSTREAM_ROUTE_NOT_FOUND',error:'404 page not found',upstream_status:404});
  const redirect=await handleMoonAPI(request('/api/sites'),()=>Response.redirect('https://evil.test',302));assert.equal(redirect.status,502);
  const mime=await handleMoonAPI(request('/api/layers/site/asset'),()=>new Response('wrong mime',{headers:{'Content-Type':'text/html'}}));assert.equal(mime.status,502);
});

test('transport failure is distinct from cancellation and dynamic health is never cached',async()=>{
  const r=await handleMoonAPI(request('/api/health'),async()=>{throw new Error('network failed')});assert.equal(r.status,502);assert.equal((await r.json()).code,'API_UNAVAILABLE');
  const ctl=new AbortController();ctl.abort();
  const stopped=await handleMoonAPI(request('/api/health',{signal:ctl.signal}),async(_,opts)=>{assert.equal(opts.signal.aborted,true);throw Error('canceled')});assert.equal(stopped.status,499);
  const live=await handleMoonAPI(request('/api/health'),()=>new Response('{}',{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'}}));assert.equal(live.headers.get('Cache-Control'),'no-store');
});
