// Local preview for the dashboard shell only (new file; web/dev-server.mjs is untouched).
// Serves this folder at / and forwards /api, /readyz, /healthz, /v1 to BRASPACE_API_URL
// (default http://127.0.0.1:8080). Same CSP as web/dev-server.mjs, tightened for this page.
import http from "node:http";
import https from "node:https";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const dir=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([["/",["index.html","text/html; charset=utf-8"]],["/index.html",["index.html","text/html; charset=utf-8"]],["/dashboard.css",["dashboard.css","text/css; charset=utf-8"]],["/dashboard.js",["dashboard.js","text/javascript; charset=utf-8"]]]);
const csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export function createServer(upstreamUrl=process.env.BRASPACE_API_URL||"http://127.0.0.1:8080"){
 const up=new URL(upstreamUrl),lib=up.protocol==="https:"?https:http;
 return http.createServer(async(req,res)=>{
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("Content-Security-Policy",csp);res.setHeader("Cache-Control","no-store");
  const p=new URL(req.url,"http://x").pathname;
  if(p.startsWith("/api/")||p==="/readyz"||p==="/healthz"||p.startsWith("/v1/")){
   if(!["GET","POST"].includes(req.method)){res.writeHead(405);res.end();return}
   const u=lib.request({hostname:up.hostname,port:up.port||undefined,method:req.method,path:req.url,headers:{"content-type":req.headers["content-type"]||"application/json"},timeout:25000},r=>{res.writeHead(r.statusCode||502,{"content-type":r.headers["content-type"]||"application/json"});r.pipe(res)});
   u.on("error",()=>{if(!res.headersSent)res.writeHead(502,{"content-type":"application/json"});res.end(JSON.stringify({error:"API unavailable",code:"API_UNAVAILABLE"}))});
   req.pipe(u);return;
  }
  const f=files.get(p);if(!f){res.writeHead(404);res.end("Not found");return}
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);res.end();return}
  res.writeHead(200,{"content-type":f[1]});res.end(await readFile(path.join(dir,f[0])));
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const port=Number(process.env.BRASPACE_DASH_PORT||5180);
 createServer().listen(port,"127.0.0.1",()=>console.log("Mission Computer shell: http://127.0.0.1:"+port+"/"));
}
