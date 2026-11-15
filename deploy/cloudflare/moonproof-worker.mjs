// Optional entrypoint for the existing MoonProof Cloudflare Worker.
// Static assets remain in ASSETS; only the two Moon console API routes are proxied.
// No caller-controlled upstream, cookies, authorization forwarding, or wildcard CORS.
const UPSTREAM = "https://braspace-api.srv1898743.hstgr.cloud";
const LIMIT = 128 << 10; // match the Go API's existing request bound
const error = (status, code) => Response.json({code, error: code}, {status, headers:{"Cache-Control":"no-store"}});
export async function handleMoonAPI(request) {
    const url = new URL(request.url);
    const method = url.pathname === "/api/compare" ? "POST" : url.pathname === "/api/health" ? "GET" : null;
    if (!method) return null; // existing Worker routes/ASSETS retain ownership
    if (request.method !== method) return error(405,"METHOD_NOT_ALLOWED");
    if (url.search) return error(400,"QUERY_NOT_SUPPORTED");
    const headers = new Headers({Accept:"application/json"});
    let body;
    if (method === "POST") {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) return error(415,"INVALID_MEDIA_TYPE");
      const reader = request.body?.getReader();
      if (!reader) return error(400,"INVALID_JSON");
      const chunks = []; let length = 0;
      try {
        for (;;) {
          const {done,value} = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > LIMIT) { await reader.cancel(); return error(413,"REQUEST_TOO_LARGE"); }
          chunks.push(value);
        }
      } catch { return error(400,"INVALID_BODY"); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      let data;
      try { data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)); } catch { return error(400,"INVALID_JSON"); }
      // Go owns the entire compare contract (including longer/multi-site windows).
      if (!data || typeof data!=="object" || Array.isArray(data)) return error(400,"INVALID_JSON");
      body = JSON.stringify(data); headers.set("Content-Type","application/json");
    }
    try {
      const upstream = await fetch(UPSTREAM + url.pathname,{method,headers,body,redirect:"error",signal:AbortSignal.timeout(24000)});
      if (!upstream.headers.get("content-type")?.startsWith("application/json")) return error(502,"INVALID_UPSTREAM_RESPONSE");
      return new Response(upstream.body,{status:upstream.status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
    } catch { return error(502,"API_UNAVAILABLE"); }
}
// Example static-assets-only entrypoint. For an existing Worker, call handleMoonAPI
// ahead of the existing router and fall through when it returns null.
export default { async fetch(request, env) { return await handleMoonAPI(request) ?? env.ASSETS.fetch(request); } };
