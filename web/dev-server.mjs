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
  ["/styles.css",{name:"styles.css",type:"text/css; charset=utf-8"}],
  ["/app.js",{name:"app.js",type:"text/javascript; charset=utf-8"}],
  ["/moon3d.js",{name:"moon3d.js",type:"text/javascript; charset=utf-8"}],
  ["/polar-map-demo.html",{name:"polar-map-demo.html",type:"text/html; charset=utf-8"}],
  ["/polar-map.css",{name:"polar-map.css",type:"text/css; charset=utf-8"}],
  ["/polar-map.js",{name:"polar-map.js",type:"text/javascript; charset=utf-8"}],
  ["/assets/polar-elevation-87s.json",{name:"assets/polar-elevation-87s.json",type:"application/json; charset=utf-8"}],
  ["/assets/polar-elevation-87s.webp",{name:"assets/polar-elevation-87s.webp",type:"image/webp"}],
]);
// Polar Lab / Landing Lab: static page, modules and precomputed NASA-derived data.
// Only fixed prefixes, a strict character set and known extensions are served.
const labTypes={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
 ".json":"application/json; charset=utf-8",".bin":"application/octet-stream",".jpg":"image/jpeg"};
export function labFile(pathname){
 if(pathname==="/lab.html")return {name:"lab.html",type:labTypes[".html"]};
 if(!/^\/(lab|data)\/[A-Za-z0-9_\-\/]+\.(js|css|json|bin|jpg)$/.test(pathname)||pathname.includes(".."))return null;
 const ext=pathname.slice(pathname.lastIndexOf("."));
 if(pathname.startsWith("/lab/")&&![".js",".css"].includes(ext))return null;
 const name=path.normalize(pathname.slice(1));
 if(!name.startsWith("lab"+path.sep)&&!name.startsWith("data"+path.sep))return null;
 return {name,type:labTypes[ext]};
}
// MoonProof v3 front (web/moonproof/): pages, core and screen modules/styles only.
export function moonproofFile(pathname){
 if(pathname==="/moonproof/")return {name:"moonproof/index.html",type:labTypes[".html"]};
 // Self-hosted OFL fonts (CSP font-src 'self'): woff2 only, flat folder.
 if(/^\/moonproof\/fonts\/(?:manrope-latin-(?:400|500|600|700|800)-normal|ibm-plex-mono-latin-(?:400|600)-normal)\.woff2$/.test(pathname))return {name:path.normalize(pathname.slice(1)),type:"font/woff2"};
 if(!/^\/moonproof\/(?:(?:core|screens)\/)?[A-Za-z0-9_\-]+\.(html|js|css)$/.test(pathname))return null;
 const ext=pathname.slice(pathname.lastIndexOf("."));
 const sub=pathname.slice("/moonproof/".length);
 if(ext===".html"&&sub.includes("/"))return null;
 if(ext!==".html"&&!sub.includes("/"))return null;
 return {name:path.normalize(pathname.slice(1)),type:labTypes[ext]};
}
// Restrict Onboard Cockpit static access to reviewed HTML and JS files.
// No arbitrary directory traversal, Python server source or local secrets.
const onboardTypes=new Map([
 ["index.html","text/html; charset=utf-8"],
 ["cockpit.html","text/html; charset=utf-8"],
 ...["app.js","api.js","cockpit.js","config.js","features.js","live.js","model.js","request.js","sim.js"].map(name=>[name,"text/javascript; charset=utf-8"])
]);
export function onboardFile(pathname){
 if(pathname==="/onboard/")return {name:"onboard/index.html",type:onboardTypes.get("index.html")};
 if(!pathname.startsWith("/onboard/"))return null;
 const name=pathname.slice("/onboard/".length);
 const type=onboardTypes.get(name);
 return type?{name:"onboard/"+name,type}:null;
}
// Mission Studio has a fixed allowlist; source specs, secrets and local files
// are deliberately inaccessible through this same-origin preview.
const studioTypes=new Map([
 ["index.html","text/html; charset=utf-8"],
 ["app.js","text/javascript; charset=utf-8"],
 ["api.js","text/javascript; charset=utf-8"],
 ["studio.css","text/css; charset=utf-8"]
]);
export function studioFile(pathname){
 if(pathname==="/studio/")return {name:"studio/index.html",type:studioTypes.get("index.html")};
 if(!pathname.startsWith("/studio/"))return null;
 const name=pathname.slice("/studio/".length);
 const type=studioTypes.get(name);
 return type?{name:"studio/"+name,type}:null;
}
const csp=[
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
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
  if((pathname.startsWith("/api/")||pathname==="/healthz"||pathname==="/readyz"||pathname==="/v1/capabilities")){
   // Printable HTML report intentionally carries a strictly scoped inline stylesheet.
   if(pathname==="/api/onboard/report"||pathname==="/api/onboard/site-report")res.setHeader("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
   if(!["GET","POST","HEAD","OPTIONS"].includes(req.method)){res.writeHead(405);res.end("Method not allowed");return;}
   proxyAPI(req,res);
   return;
  }
  if(pathname==="/favicon.ico"){
   if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);res.end("Method not allowed");return;}
   res.writeHead(204,{"cache-control":"no-store"});
   res.end();
   return;
  }
  if(pathname==="/config.js"){
   if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);res.end("Method not allowed");return;}
   const body="// local dev-server\n";
   res.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store","content-length":body.length});
   if(req.method==="HEAD"){res.end();return;}
   res.end(body);
   return;
  }
  // Cockpit HTML uses scoped inline CSS; do not relax the global CSP.
  if(pathname==="/onboard/"||pathname==="/onboard/index.html"||pathname==="/onboard/cockpit.html"){
   res.setHeader("Content-Security-Policy",csp.replace("style-src 'self'","style-src 'self' 'unsafe-inline'"));
  }
  const file=staticFiles.get(pathname)||labFile(pathname)||onboardFile(pathname)||studioFile(pathname)||moonproofFile(pathname);
  if(!file){res.writeHead(404);res.end("Not found");return;}
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);res.end("Method not allowed");return;}
  try{
   const bytes=await readFile(path.join(directory,file.name));
   res.writeHead(200,{"content-type":file.type,"content-length":bytes.length});
   if(req.method==="HEAD"){res.end();return;}
   res.end(bytes);
  }catch{res.writeHead(500);res.end("Static asset failed to load");}
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
