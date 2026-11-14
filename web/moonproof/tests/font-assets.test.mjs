import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer, moonproofFile} from "../../dev-server.mjs";

const names=[
  ...[400,500,600,700,800].map(weight=>`manrope-latin-${weight}-normal.woff2`),
  ...[400,600].map(weight=>`ibm-plex-mono-latin-${weight}-normal.woff2`)
];

test("seven Manrope/Plex WOFF2 files are real, licensed, and referenced in CSS",async()=>{
 const css=await readFile(new URL("../core/tokens.css",import.meta.url),"utf8");
 for(const name of names){
  const blob=await readFile(new URL("../fonts/"+name,import.meta.url));
  assert.ok(blob.length>1000,name+" looks truncated");
  assert.equal(blob.toString("ascii",0,4),"wOF2",name+" is not WOFF2");
  assert.ok(css.includes('../fonts/'+name),name+" is not wired into the visual design");
  assert.deepEqual(moonproofFile("/moonproof/fonts/"+name),
   {name:"moonproof/fonts/"+name,type:"font/woff2"});
 }
 for(const license of ["OFL-Manrope.txt","OFL-IBMPlexMono.txt"]){
  const text=await readFile(new URL("../fonts/"+license,import.meta.url),"utf8");
  assert.match(text,/SIL Open Font License/i);
 }
 assert.match(css,/--fib-6:55px/,"preserve Fibonacci spacing");
 assert.match(css,/--jade:#2EC4A0/,"preserve Heloísa jade accent");
});

test("MoonProof font route is restricted to reviewed exact asset names",()=>{
 for(const pathname of [
  "/moonproof/fonts/unknown.woff2",
  "/moonproof/fonts/OFL-Manrope.txt",
  "/moonproof/fonts/../core/shell.js",
  "/moonproof/fonts/manrope-latin-900-normal.woff2",
  "/moonproof/fonts/manrope-latin-400-normal.woff2.js"
 ]) assert.equal(moonproofFile(pathname),null,pathname+" must be blocked");
});

test("self-hosted Manrope is served with WOFF2 MIME and defensive CSP",async()=>{
 const server=createServer();
 await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",resolve);
 });
 try{
  const {port}=server.address();
  const response=await fetch(`http://127.0.0.1:${port}/moonproof/fonts/manrope-latin-400-normal.woff2`);
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")??"",/font\/woff2/);
  assert.match(response.headers.get("content-security-policy")??"",/font-src 'self'/);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString("ascii",0,4),"wOF2");
  const invalid=await fetch(`http://127.0.0.1:${port}/moonproof/fonts/not-a-font.woff2`);
  assert.equal(invalid.status,404);
 }finally{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 }
});
