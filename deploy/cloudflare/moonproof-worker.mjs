// Candidate extension to #309 (NOT deployed). Every route is explicitly declared.
// Integrate before ASSETS; retain the existing Worker configuration and routes.
// Browser uses same-origin /api, /healthz, /readyz, /v1. Upstream is not user-supplied.
export const DEFAULT_UPSTREAM = "https://braspace-api.srv1898743.hstgr.cloud";
const UPSTREAM = DEFAULT_UPSTREAM;
const NORMAL_MAX = 128 * 1024;
const SMALL_MAX = 16 * 1024;
const SEGMENT = "[a-z0-9][a-z0-9-]{0,63}";
const REPORT_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const BASIC_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const exact = (path, method, kind = "json", max = NORMAL_MAX) => ({template:path, method, pattern:new RegExp('^'+path.replaceAll('.', '\\.')+'$'), kind, max});
const parameter = (path, kind = "json", query = false) => ({template:path,method:"GET",pattern:new RegExp('^'+path.replace('{id}',SEGMENT)+'$'),kind,query});
export const routes = Object.freeze([
  exact("/api/health", "GET"), exact("/api/sites", "GET"), parameter("/api/sites/{id}"),
  parameter("/api/sites/{id}/sky", "json", true), parameter("/api/sites/{id}/media"),
  exact("/api/compare", "POST"), exact("/api/scenarios/delay", "POST"),
  exact("/api/onboard/site-evaluate", "POST"), exact("/api/onboard/site-report", "POST", "report"),
  exact("/api/onboard/evaluate", "POST"), exact("/api/onboard/report", "POST", "report"),
  exact("/api/onboard/navigation", "POST", "json", SMALL_MAX),
  exact("/api/layers", "GET"), parameter("/api/layers/{id}"), parameter("/api/layers/{id}/asset", "asset"),
  exact("/api/openapi.json", "GET"), exact("/healthz", "GET"), exact("/readyz", "GET"),
  exact("/v1/capabilities", "GET"), exact("/v1/visibility", "POST"),
  exact("/api/vector/status", "GET"), exact("/api/vector/search", "POST", "json", SMALL_MAX),
]);
// Preserve the public exports introduced by #312 (#309 used handleMoonAPI).
export const ROUTES = Object.freeze(routes.map(({method,template,kind})=>Object.freeze([method,template,kind])));
export const KIND_TYPES=Object.freeze({json:Object.freeze(["application/json"]),asset:Object.freeze(["image/jpeg","model/gltf-binary"]),report:Object.freeze(["text/html"])});
export const reserved = path => /^\/(?:api(?:\/|$)|v1(?:\/|$)|healthz(?:\/|$)|readyz(?:\/|$))/.test(path);
export function matchRoute(pathname) { return reserved(pathname) ? {pathname,hits:routes.filter(r=>r.pattern.test(pathname))} : null; }
const security = csp => ({"Cache-Control":"no-store","Content-Security-Policy":csp,"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin"});
function fail(status, code, error = code, extra = {}) { return Response.json({code,error},{status,headers:{...security(BASIC_CSP),...extra}}); }
class EdgeError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
async function boundedBody(request, limit) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > limit) throw new EdgeError(413,"REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(); // Go remains source of JSON validation.
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { void reader.cancel().catch(()=>{}); throw new EdgeError(413,"REQUEST_TOO_LARGE"); }
      chunks.push(value);
    }
  } catch (e) { if (e instanceof EdgeError) throw e; throw new EdgeError(400,"INVALID_BODY"); }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  // Never JSON.parse/stringify: duplicate keys and malformed JSON must reach Go unchanged.
  return bytes;
}
function permittedResponse(upstream, kind, method, rangeRequested) {
  const {status} = upstream;
  const mime = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (status === 304) return kind === "asset";
  if (status < 200 || status >= 600 || (status >= 300 && status < 400)) return false;
  // Go legacy errors and http.ServeContent (416) can produce text/plain.
  if (status >= 400) return mime === "application/json" || mime === "text/plain";
  if (status === 204) return false;
  if (kind === "report") return status === 200 && mime === "text/html";
  if (kind === "asset") return (status === 200 || (status === 206 && rangeRequested)) && ["image/jpeg","model/gltf-binary"].includes(mime);
  return status === 200 && mime === "application/json";
}
function safeQuery(url, route) {
  if (!url.search) return true;
  if (!route.query || url.search.length > 512) return false;
  const seen = new Set();
  for (const [name] of url.searchParams) {
    if (!['start','hours','step'].includes(name) || seen.has(name)) return false;
    seen.add(name);
  }
  return true;
}
function safeAssetHeaders(request, headers) {
  const range = request.headers.get("range");
  // No multipart ranges; support a single byte range (including suffix) only.
  if (range !== null) {
    if (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range) || range.length > 80) throw new EdgeError(416,"INVALID_RANGE");
    headers.set("Range",range);
  }
  for (const name of ["If-None-Match","If-Modified-Since","If-Range"]) {
    const value = request.headers.get(name);
    if (value && value.length <= 512) headers.set(name,value);
  }
}
// Preserve #312's structured legacy errors without buffering an unbounded upstream body.
async function legacyError(upstream) {
  const reader=upstream.body?.getReader();let text="";
  if(reader){
    const bytes=new Uint8Array(200);let n=0;
    try {while(n<bytes.length){const {done,value}=await reader.read();if(done)break;const chunk=value.subarray(0,bytes.length-n);bytes.set(chunk,n);n+=chunk.length;}}
    catch {} finally {void reader.cancel().catch(()=>{});reader.releaseLock();}
    text=new TextDecoder().decode(bytes.subarray(0,n)).trim();
  }
  return Response.json({code:upstream.status===404?"UPSTREAM_ROUTE_NOT_FOUND":"UPSTREAM_ERROR",error:text||"upstream error",upstream_status:upstream.status},{status:upstream.status,headers:security(BASIC_CSP)});
}
export async function handleMoonAPI(request, fetcher = fetch) {
  const url = new URL(request.url);
  if (!reserved(url.pathname)) return null;
  const route = routes.find(r=>r.pattern.test(url.pathname));
  if (!route) return fail(404,"API_ROUTE_NOT_FOUND"); // never return SPA HTML for API path
  const origin=request.headers.get("Origin");
  if ((origin && origin !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") return fail(403,"CORS_FORBIDDEN","same-origin API only");
  const method=request.method.toUpperCase();
  const permitted = route.method === "GET" ? ["GET","HEAD"] : ["POST"];
  if (method === "OPTIONS") return new Response(null,{status:204,headers:{...security(BASIC_CSP),Allow:permitted.join(", ")}});
  if (!permitted.includes(method)) return fail(405,"METHOD_NOT_ALLOWED","method not allowed",{Allow:permitted.join(", ")});
  if (!safeQuery(url,route)) return fail(400,"INVALID_QUERY","query not supported for this operation");
  const accept=route.kind === "report" ? "text/html, application/json" : route.kind === "asset" ? "image/jpeg, model/gltf-binary, application/json" : "application/json";
  const headers=new Headers({Accept:accept});
  let body;
  try {
    if (method === "POST") {
      const contentType=request.headers.get("Content-Type") || "";
      if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return fail(415,"INVALID_MEDIA_TYPE","application/json required");
      if (contentType.length > 256) return fail(415,"INVALID_MEDIA_TYPE");
      headers.set("Content-Type",contentType);
      body=await boundedBody(request,route.max);
    } else if (route.kind === "asset") safeAssetHeaders(request,headers);
  } catch (e) { return fail(e.status || 400,e.code || "INVALID_BODY"); }

  // Fixed origin, exact validated path, query constrained to /sky. No identity, credentials, origin, or Host copied.
  const target = UPSTREAM + url.pathname + url.search;
  const timeout=AbortSignal.timeout(route.kind === "asset" ? 120000 : 25000);
  const signal=AbortSignal.any([request.signal,timeout]);
  try {
    // workerd rejects redirect:"error" with a TypeError (seen live 15/11: every /api answered 502 API_UNAVAILABLE).
    // "manual" + permittedResponse() refusing 3xx keeps redirects blocked: one upstream request, never followed.
    const upstream=await fetcher(target,{method,headers,body,signal,redirect:"manual",cache:"no-store"});
    if (!permittedResponse(upstream,route.kind,method,headers.has("Range"))) { void upstream.body?.cancel().catch(()=>{}); return fail(502,"INVALID_UPSTREAM_RESPONSE"); }
    if(upstream.status>=400&&(upstream.headers.get("content-type")||"").split(";")[0].trim().toLowerCase()==="text/plain")return legacyError(upstream);
    const output=new Headers(security(route.kind === "report" && upstream.ok ? REPORT_CSP : BASIC_CSP));
    if(route.kind === "report" && upstream.ok) {
      const policy=upstream.headers.get("Content-Security-Policy");
      if(policy)output.append("Content-Security-Policy",policy); // both policies enforced; upstream cannot weaken ours
      const disposition=upstream.headers.get("Content-Disposition");if(disposition)output.set("Content-Disposition",disposition);
    }
    const retry=upstream.headers.get("Retry-After");if(retry&&retry.length<=128)output.set("Retry-After",retry);
    const mime=upstream.headers.get("Content-Type");
    if (mime) output.set("Content-Type",mime);
    if (route.kind === "asset" && (upstream.status===200 || upstream.status===206 || upstream.status===304)) {
      // ETag/byte ranges remain usable. Conservatively no-store; upstream verifies bytes and SHA.
      for (const name of ["ETag","Content-Range","Accept-Ranges","Last-Modified"]) {
        const value=upstream.headers.get(name); if(value) output.set(name,value);
      }
    }
    const hasBody=method!=="HEAD" && upstream.status!==304;
    return new Response(hasBody?upstream.body:null,{status:upstream.status,headers:output});
  } catch (e) {
    return timeout.aborted||e?.name==="TimeoutError"?fail(504,"API_TIMEOUT"):request.signal.aborted?fail(499,"REQUEST_CANCELED"):fail(502,"API_UNAVAILABLE");
  }
}
export const handleAPI=handleMoonAPI;

// Illustrative binding adapter only. Use handleMoonAPI BEFORE existing routes.
// Cloudflare assets must run Worker first for /api/*, /v1/*, /healthz, /readyz.
export default {async fetch(request,env) { return await handleMoonAPI(request) ?? env.ASSETS.fetch(request); }};
