#!/usr/bin/env node
// Disposable CI lane: real pgvector + Go HTTP API + Node web proxy. The
// vectors are orthogonal QA fixtures only; this script never uses a production
// model, DATABASE_URL, or a production endpoint.
import assert from "node:assert/strict";
import {spawn,execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const db=process.env.TEST_VECTOR_DATABASE_URL;
const bin=process.env.BRASPACE_VECTOR_E2E_API_BIN;
if(!db||!bin)throw Error("disposable TEST_VECTOR_DATABASE_URL and BRASPACE_VECTOR_E2E_API_BIN required");
const revision=randomBytes(16).toString("hex");
const model="qa-braspace-vector-e2e:"+revision;
const temp=await mkdtemp(join(tmpdir(),"braspace-vector-e2e-"));
const children=[];
const vector=(axis)=>Array.from({length:384},(_,i)=>i===axis?1:0);
const sha=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const exec=promisify(execFile);
async function port(){
 const server=createServer();
 await new Promise((ok,fail)=>{server.once("error",fail);server.listen(0,"127.0.0.1",ok);});
 const p=server.address().port;
 await new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()));
 return p;
}
function launch(cmd,args,options){
 const child=spawn(cmd,args,{stdio:["ignore","pipe","pipe"],...options});children.push(child);
 child.stdout.on("data",b=>process.stdout.write(b));
 child.stderr.on("data",b=>process.stderr.write(b));
 child.on("error",e=>console.error(e.message));return child;
}
async function ready(base,child){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)break;
  try{if((await fetch(base+"/healthz",{signal:AbortSignal.timeout(250)})).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error("backend or proxy did not become live: "+base);
}
async function json(base,path,status,body){
 const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:body===undefined?{}:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,status,path);
 assert.match(response.headers.get("content-type")||"",/application\/json/);
 return response.json();
}
try{
 const raw=await readFile(join(root,"api/sitedata/layers.json"));
 const layers=JSON.parse(raw).layers.slice(0,2);
 assert.equal(layers.length,2);
 const manifest={schema:"braspace.vector-ingest.v1",model_id:model,model_revision:revision,model_license:"QA-only",source_registry_sha256:sha(raw),
  entries:layers.map((l,i)=>({layer_id:l.id,source_sha256:l.sha256,embedding:vector(i)}))};
 const path=join(temp,"qa-only-manifest.json");await writeFile(path,JSON.stringify(manifest));
 const common={...process.env,DATABASE_URL:"",VECTOR_DATABASE_URL:db,BRASPACE_VECTOR_ENABLED:"1",BRASPACE_VECTOR_MODEL_ID:model};
 const validation=JSON.parse((await exec(bin,["vector-ingest","-input",path],{cwd:join(root,"api"),env:common})).stdout);
 assert.equal(validation.applied,false);assert.equal(validation.entries,2);
 const result=JSON.parse((await exec(bin,["vector-ingest","-input",path,"-apply"],{cwd:join(root,"api"),env:common})).stdout);
 assert.equal(result.applied,true);assert.equal(result.scientifically_validated,false);
 const apiPort=await port();let webPort;do{webPort=await port();}while(webPort===apiPort);
 const bases=[`http://127.0.0.1:${apiPort}`,`http://127.0.0.1:${webPort}`];
 const server=launch(bin,[],{cwd:join(root,"api"),env:{...common,LISTEN_ADDR:`127.0.0.1:${apiPort}`}});
 await ready(bases[0],server);
 const web=launch(process.execPath,["web/dev-server.mjs"],{cwd:root,env:{...process.env,BRASPACE_WEB_PORT:String(webPort),BRASPACE_API_PORT:String(apiPort)}});
 await ready(bases[1],web);
 const outputs=[];
 for(const base of bases){
  const status=await json(base,"/api/vector/status",200);
  assert.equal(status.enabled,true);assert.equal(status.available,true);assert.equal(status.dimension,384);assert.equal(status.model_id,model);
  assert.equal(status.scientifically_validated,false);
  const query={model_id:model,vector:vector(0),limit:2};
  const hits=await json(base,"/api/vector/search",200,query);
  assert.equal(hits.scientifically_validated,false);assert.equal(hits.results.length,2);
  assert.equal(hits.results[0].source_ref,layers[0].registry_ref);
  assert.equal(hits.results[0].sha256,layers[0].sha256);
  assert.ok(hits.results[0].similarity>.999);
  assert.equal(hits.results[1].source_ref,layers[1].registry_ref);
  assert.ok(Math.abs(hits.results[1].similarity)<.001);
  assert.equal((await json(base,"/api/vector/search",422,{...query,model_id:"wrong-model"})).code,"MODEL_MISMATCH");
  const invalid=vector(0);invalid[1]=null;
  assert.equal((await json(base,"/api/vector/search",422,{...query,vector:invalid})).code,"INVALID_VECTOR");
  assert.equal((await json(base,"/api/vector/search",422,{...query,limit:0})).code,"INVALID_LIMIT");
  assert.ok((await json(base,"/api/sites",200)).sites.length>0);
  outputs.push(hits);
 }
 assert.deepEqual(outputs[0],outputs[1]);
 console.log("PASS real pgvector + Go + web proxy: reviewed registry rows (QA vectors only), matching ranking, bad inputs, source hashes, catalog unaffected");
}finally{
 for(const c of children.reverse())if(c.exitCode===null&&c.signalCode===null)c.kill("SIGTERM");
 await rm(temp,{recursive:true,force:true});
}
