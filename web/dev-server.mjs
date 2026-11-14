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
// Joao Victor's onboard screens remain an independent, explicitly allowlisted
// educational frontend. No generic directory serving or client-controlled path.
export function onboardFile(pathname){
 if(!/^\/onboard\/[A-Za-z0-9_-]+\.(html|js|css)$/.test(pathname))return null;
 const filename=pathname.slice("/onboard/".length);
 const allowed=new Set(["index.html","cockpit.html","sim.js","request.js","model.js","features.js","api.js","cockpit.js","app.js"]);
 if(!allowed.has(filename))return null;
 const type=filename.endsWith(".html")?"text/html; charset=utf-8":filename.endsWith(".css")?"text/css; charset=utf-8":"text/javascript; charset=utf-8";
 return {name:"onboard/"+filename,type};
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
export function createServer(){
 const server=http.createServer(async(req,res)=>{
  securityHeaders(res);
  let parsed;
  try{parsed=new URL(req.url,"http://127.0.0.1");}catch{res.writeHead(400);res.end("invalid URL");return;}
  const pathname=parsed.pathname;
  if((pathname.startsWith("/api/")||pathname==="/healthz"||pathname==="/readyz")){
   // Printable HTML report intentionally carries a strictly scoped inline stylesheet.
   if(pathname==="/api/onboard/report"||pathname==="/api/onboard/site-report")res.setHeader("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
   if(!["GET","POST","HEAD","OPTIONS"].includes(req.method)){res.writeHead(405);res.end("Method not allowed");return;}
   proxyAPI(req,res);
   return;
  }
  const onboard=onboardFile(pathname);
  // Existing onboard HTML embeds CSS; only these two fixed HTML pages get
  // inline STYLE permission. Scripts remain external and constrained to self.
  if(onboard&&pathname.endsWith(".html")){
   res.setHeader("Content-Security-Policy",csp.replace("style-src 'self'","style-src 'self' 'unsafe-inline'"));
  }
  const file=staticFiles.get(pathname)||labFile(pathname)||onboard;
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
