// Same-origin local preview for the private BRASPACE hackathon repository.
// The API stays on 127.0.0.1:8080; this server never exposes it via a
// wildcard CORS rule or open proxy. Use a reviewed reverse proxy for production.
import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";
import path from "node:path";

const directory=path.dirname(fileURLToPath(import.meta.url));
const upstreamHost="127.0.0.1",upstreamPort=Number.parseInt(process.env.BRASPACE_API_PORT||"8080",10);
const staticFiles=new Map([
  ["/",{name:"index.html",type:"text/html; charset=utf-8"}],
  ["/index.html",{name:"index.html",type:"text/html; charset=utf-8"}],
  ["/api-base.js",{name:"api-base.js",type:"text/javascript; charset=utf-8"}],
  ["/vector-embed.js",{name:"vector-embed.js",type:"text/javascript; charset=utf-8"}],
  ["/favicon.ico",{name:"favicon.ico",type:"image/x-icon"}],
  ["/config.js",{name:"config.js",type:"text/javascript; charset=utf-8"}],
  ["/vendor/three/three.module.min.js",{name:"vendor/three/three.module.min.js",type:"text/javascript; charset=utf-8"}],
  ["/vendor/three/three.core.min.js",{name:"vendor/three/three.core.min.js",type:"text/javascript; charset=utf-8"}],
  ["/vendor/three/addons/controls/OrbitControls.js",{name:"vendor/three/addons/controls/OrbitControls.js",type:"text/javascript; charset=utf-8"}],
  ["/vendor/preact/preact.module.js",{name:"vendor/preact/preact.module.js",type:"text/javascript; charset=utf-8"}],
]);
// Shared lab modules (physics, scene, coords, terrain, data) used by MoonProof and the NASA-derived data.
// Only fixed prefixes, a strict character set and known extensions are served.
const labTypes={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
 ".json":"application/json; charset=utf-8",".bin":"application/octet-stream",".jpg":"image/jpeg"};
// File names are POSIX ("moonproof/x.html") on every OS: path.join() below accepts "/" on Windows,
// and tests compare these names as strings (path.normalize would give "\\" on Windows).
export function labFile(pathname){
 if(!/^\/(lab|data)\/[A-Za-z0-9_\-\/]+\.(js|css|json|bin|jpg)$/.test(pathname)||pathname.includes(".."))return null;
 const ext=pathname.slice(pathname.lastIndexOf("."));
 if(pathname.startsWith("/lab/")&&![".js",".css"].includes(ext))return null;
 const name=path.posix.normalize(pathname.slice(1));
 if(!name.startsWith("lab/")&&!name.startsWith("data/"))return null;
 return {name,type:labTypes[ext]};
}
// MoonProof v3 front (web/moonproof/): pages, core and screen modules/styles only.
export function moonproofFile(pathname){
 if(pathname==="/moonproof/")return {name:"moonproof/index.html",type:labTypes[".html"]};
 // Clean URLs like the Cloudflare Worker (assets html_handling): /moonproof/cockpit serves cockpit.html. Same allowlist.
 if(/^\/moonproof\/[A-Za-z0-9_\-]+$/.test(pathname))return moonproofFile(pathname+".html");
 // Self-hosted OFL fonts (CSP font-src 'self'): woff2 only, flat folder.
 if(/^\/moonproof\/fonts\/(?:manrope-latin-(?:400|500|600|700|800)-normal|ibm-plex-mono-latin-(?:400|600)-normal)\.woff2$/.test(pathname))return {name:path.posix.normalize(pathname.slice(1)),type:"font/woff2"};
 // IAU/USGS feature names: one fixed file, no folder is served.
 if(pathname==="/moonproof/data/features.json")return {name:path.posix.normalize(pathname.slice(1)),type:labTypes[".json"]};
 if(!/^\/moonproof\/(?:(?:core|screens)\/)?[A-Za-z0-9_\-]+\.(html|js|css)$/.test(pathname))return null;
 const ext=pathname.slice(pathname.lastIndexOf("."));
 const sub=pathname.slice("/moonproof/".length);
 if(ext===".html"&&sub.includes("/"))return null;
 if(ext!==".html"&&!sub.includes("/"))return null;
 return {name:path.posix.normalize(pathname.slice(1)),type:labTypes[ext]};
}
// Moon HD viewer (web/moon-hd.html): one page, its modules and stylesheet. Its data is under /data/moonhd/ (labFile).
export function moonHdFile(pathname){
 if(pathname==="/moon-hd.html")return {name:"moon-hd.html",type:labTypes[".html"]};
 if(pathname==="/moon-hd/pole-preview.webp")return {name:"moon-hd/pole-preview.webp",type:"image/webp"};
 // GPU captures of the pole scene (renders/manifest.json): three fixed files, nothing else in that folder.
 if(/^\/moon-hd\/renders\/pole-gpu-(?:desktop|tablet|portrait)\.webp$/.test(pathname))return {name:pathname.slice(1),type:"image/webp"};
 if(!/^\/moon-hd\/[a-z0-9\-]+\.(js|css)$/.test(pathname))return null;
 return {name:path.posix.normalize(pathname.slice(1)),type:labTypes[pathname.slice(pathname.lastIndexOf("."))]};
}
const csp=[
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://svs.gsfc.nasa.gov data: blob:",
  "connect-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");

function securityHeaders(res){
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Referrer-Policy","no-referrer");
 res.setHeader("Cross-Origin-Resource-Policy","same-origin");
 res.setHeader("Content-Security-Policy",csp);
 res.setHeader("Cache-Control","no-store");
}
function proxyAPI(req,res){
 const upstream=http.request({
  hostname:upstreamHost,port:upstreamPort,method:req.method,path:req.url,
  headers:{"content-type":req.headers["content-type"]||"application/json"},
  timeout:25000,
 },response=>{
  res.writeHead(response.statusCode||502,{
   "content-type":response.headers["content-type"]||"application/json",
   "cache-control":"no-store","x-content-type-options":"nosniff",
  });
  response.pipe(res);
 });
 upstream.on("timeout",()=>upstream.destroy(new Error("upstream timeout")));
 upstream.on("error",()=>{
  if(!res.headersSent){res.writeHead(502,{"content-type":"application/json"});}
  res.end(JSON.stringify({error:"Local Go API unavailable; start the real backend first.",code:"API_UNAVAILABLE"}));
 });
 req.on("aborted",()=>upstream.destroy());
 req.pipe(upstream);
}
// Examine the raw HTTP target before URL parsing: WHATWG URL removes
// "/onboard/../" and encoded dot segments, which can accidentally route a
// rejected static path to the /api/ reverse proxy.
function hasTraversalSegment(rawUrl){
 let candidate=rawUrl.split(/[?#]/,1)[0];
 for(let depth=0;depth<4;depth++){
  if(/(?:^|[\\/])\.{1,2}(?=[\\/]|$)/.test(candidate))return true;
  let next;
  try{next=decodeURIComponent(candidate);}catch{return true;}
  if(next===candidate)return false;
  candidate=next;
 }
 return /(?:^|[\\/])\.{1,2}(?=[\\/]|$)/.test(candidate);
}
export function createServer(){
 const server=http.createServer(async(req,res)=>{
  securityHeaders(res);
  if(hasTraversalSegment(req.url)){
   res.writeHead(404);res.end("Not found");return;
  }
  let parsed;
  try{parsed=new URL(req.url,"http://127.0.0.1");}catch{res.writeHead(400);res.end("invalid URL");return;}
  const pathname=parsed.pathname;
  if((pathname.startsWith("/api/")||pathname==="/healthz"||pathname==="/readyz"||pathname==="/v1/capabilities"||pathname==="/v1/visibility")){
   // Printable HTML report intentionally carries a strictly scoped inline stylesheet.
   if(pathname==="/api/onboard/report"||pathname==="/api/onboard/site-report")res.setHeader("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
   if(!["GET","POST","HEAD","OPTIONS"].includes(req.method)){res.writeHead(405);res.end("Method not allowed");return;}
   proxyAPI(req,res);
   return;
  }
  // /favicon.ico and /config.js are real files in web/, served like in production (no local stand-ins).
  const file=staticFiles.get(pathname)||labFile(pathname)||moonproofFile(pathname)||moonHdFile(pathname);
  if(!file){res.writeHead(404);res.end("Not found");return;}
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);res.end("Method not allowed");return;}
  try{
   const bytes=await readFile(path.join(directory,file.name));
   res.writeHead(200,{"content-type":file.type,"content-length":bytes.length});
   if(req.method==="HEAD"){res.end();return;}
   res.end(bytes);
  }catch(err){
   // An allowed pattern that matches no file (e.g. an archived module) is a plain 404, not a server error.
   if(err?.code==="ENOENT"||err?.code==="EISDIR"){res.writeHead(404);res.end("Not found");return;}
   res.writeHead(500);res.end("Static asset failed to load");
  }
 });
 server.requestTimeout=30000;
 server.headersTimeout=10000;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const port=Number.parseInt(process.env.BRASPACE_WEB_PORT||"5173",10);
 if(!(port>1023&&port<65536))throw new Error("invalid local web port");
 createServer().listen(port,"127.0.0.1",()=>{
  process.stdout.write("MoonProof web preview: http://127.0.0.1:"+port+"\n");
  process.stdout.write("Private Go API expected: http://127.0.0.1:8080\n");
 });
}
