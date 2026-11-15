// MoonProof Cloudflare Worker entrypoint: static ASSETS + same-origin proxy to the Go API.
//
// Why: on *.workers.dev the frontend resolves the API base to "" (web/api-base.ts) and calls
// /api/* on its own origin. Without this proxy those calls 404, and the Go API correctly refuses
// the cross-origin preflight (CORS_FORBIDDEN). Same-origin keeps CSP/CORS strict on both sides.
//
// Contract: the allowlist mirrors api/openapi.json exactly (see moonproof-worker.test.mjs, which
// fails if they drift). The upstream is pinned; callers cannot choose it. Cookies, Authorization,
// Origin and client IP headers are never forwarded. No wildcard CORS is emitted.
export const DEFAULT_UPSTREAM = "https://braspace-api.srv1898743.hstgr.cloud";
const BODY_LIMIT = 128 << 10; // matches the Go API request bound
const QUERY_LIMIT = 2048;
const TIMEOUT_MS = 24000;
const SEG = "[A-Za-z0-9][A-Za-z0-9._-]{0,127}"; // {id} path parameter

// [method, path template, response kind]. Kinds list the success media types api/openapi.json declares.
export const ROUTES = [
  ["GET", "/api/health", "json"],
  ["GET", "/api/sites", "json"],
  ["GET", "/api/sites/{id}", "json"],
  ["GET", "/api/sites/{id}/sky", "json"],
  ["GET", "/api/sites/{id}/media", "json"],
  ["GET", "/api/layers", "json"],
  ["GET", "/api/layers/{id}", "json"],
  ["GET", "/api/layers/{id}/asset", "asset"],
  ["GET", "/api/openapi.json", "json"],
  ["GET", "/api/vector/status", "json"],
  ["GET", "/healthz", "json"],
  ["GET", "/readyz", "json"],
  ["GET", "/v1/capabilities", "json"],
  ["POST", "/api/compare", "json"],
  ["POST", "/api/scenarios/delay", "json"],
  ["POST", "/api/onboard/evaluate", "json"],
  ["POST", "/api/onboard/site-evaluate", "json"],
  ["POST", "/api/onboard/navigation", "json"],
  ["POST", "/api/onboard/report", "report"],
  ["POST", "/api/onboard/site-report", "report"],
  ["POST", "/api/vector/search", "json"],
  ["POST", "/v1/visibility", "json"],
];

const compiled = ROUTES.map(([method, template, kind]) => ({
  method, template, kind,
  re: new RegExp("^" + template.replace(/[.]/g, "\\.").replace("{id}", SEG) + "$"),
}));

const API_PREFIX = /^\/(?:api\/|v1\/|healthz$|readyz$)/;

const error = (status, code, extra = {}) =>
  Response.json({ code, error: code }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });

/** Returns the matching route for a pathname, or null when the path is not an API path at all. */
export function matchRoute(pathname) {
  if (!API_PREFIX.test(pathname)) return null;
  const hits = compiled.filter((r) => r.re.test(pathname));
  return { pathname, hits };
}

async function readBoundedJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) return { err: error(415, "INVALID_MEDIA_TYPE") };
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > BODY_LIMIT) return { err: error(413, "REQUEST_TOO_LARGE") };
  const reader = request.body?.getReader();
  if (!reader) return { err: error(400, "INVALID_JSON") };
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BODY_LIMIT) { await reader.cancel(); return { err: error(413, "REQUEST_TOO_LARGE") }; }
      chunks.push(value);
    }
  } catch { return { err: error(400, "INVALID_BODY") }; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return { err: error(400, "INVALID_JSON") }; }
  // Go owns the full request contract; the edge only guarantees a bounded JSON object.
  if (!data || typeof data !== "object" || Array.isArray(data)) return { err: error(400, "INVALID_JSON") };
  return { body: JSON.stringify(data) };
}

/** Media types each kind may return on success (mirrors the OpenAPI response content; see the drift test). */
export const KIND_TYPES = {
  json: ["application/json"],
  asset: ["application/json", "image/jpeg", "image/png", "image/webp", "model/gltf-binary"],
  report: ["application/json", "text/html"],
};
const mediaType = (ct) => ct.split(";")[0].trim().toLowerCase();

/**
 * Proxies one API request. Returns null when the path is not an API path, so the existing
 * Worker router / ASSETS keep ownership of every other route.
 */
export async function handleAPI(request) {
  const url = new URL(request.url);
  const m = matchRoute(url.pathname);
  if (!m) return null;
  const route = m.hits.find((r) => r.method === request.method || (request.method === "HEAD" && r.method === "GET"));
  if (!route) {
    if (!m.hits.length) return error(404, "ROUTE_NOT_FOUND");
    const allow = [...new Set(m.hits.map((r) => r.method))].join(", ");
    // A same-origin client never needs CORS preflight; answer OPTIONS without granting cross-origin access.
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow, "Cache-Control": "no-store" } });
    return error(405, "METHOD_NOT_ALLOWED", { Allow: allow });
  }
  if (url.search.length > QUERY_LIMIT) return error(414, "QUERY_TOO_LONG");
  if (route.method === "POST" && url.search) return error(400, "QUERY_NOT_SUPPORTED");

  const headers = new Headers({ Accept: KIND_TYPES[route.kind].join(", ") });
  let body;
  if (route.method === "POST") {
    const r = await readBoundedJSON(request);
    if (r.err) return r.err;
    body = r.body; headers.set("Content-Type", "application/json");
  }
  let upstream;
  try {
    // Upstream is pinned on purpose; neither env nor the request can redirect it. workerd only accepts
    // redirect "follow" | "manual" ("error" throws TypeError at runtime), so redirects are refused below.
    upstream = await fetch(DEFAULT_UPSTREAM + url.pathname + (route.method === "GET" ? url.search : ""), {
      method: request.method === "HEAD" ? "HEAD" : route.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return e?.name === "TimeoutError" ? error(504, "API_TIMEOUT") : error(502, "API_UNAVAILABLE");
  }
  if (upstream.status >= 300 && upstream.status < 400) return error(502, "UPSTREAM_REDIRECT");
  const type = upstream.headers.get("content-type") || "";
  if (!KIND_TYPES[route.kind].includes(mediaType(type))) {
    // Go's mux and a few handlers answer errors as text/plain (e.g. "404 page not found" when the
    // deployed API lacks a route). Keep the real status; never turn it into a success or a vague 502.
    if (upstream.status >= 400) {
      const text = (await upstream.text()).slice(0, 200).trim();
      return Response.json({ code: upstream.status === 404 ? "UPSTREAM_ROUTE_NOT_FOUND" : "UPSTREAM_ERROR", error: text || "upstream error", upstream_status: upstream.status },
        { status: upstream.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return error(502, "INVALID_UPSTREAM_RESPONSE");
  }
  const out = new Headers({ "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": upstream.headers.get("cache-control") || "no-store" });
  // The Go API's CSP (default-src 'none') must travel with HTML reports served from this origin.
  for (const h of ["etag", "last-modified", "retry-after", "vary", "content-security-policy", "content-disposition"]) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
}

// Back-compat with PR #309's export name.
export const handleMoonAPI = handleAPI;
