declare var module: { exports: unknown } | undefined;
interface Window { BRASPACE_API_BASE?: string }
type ApiRoot = { BRASPACE_API_BASE?: string; location?: { hostname?: string }; OnboardApi?: unknown };
// data is the parsed JSON of the Go API (schema owned by the API), so it stays untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResult = { ok: boolean; status: number; data?: any; error?: string; windowNote?: string; coverage?: { hours: number; of: number; startMs: number; endMs: number } };
interface OnboardApiClient {
  base(): string;
  evaluate(body?: unknown): Promise<ApiResult>; readyz(): Promise<ApiResult>; capabilities(): Promise<ApiResult>;
  sky(id: string, query?: string): Promise<ApiResult>; health(): Promise<ApiResult>; sites(): Promise<ApiResult>;
  compare(body?: unknown): Promise<ApiResult>; scenarioDelay(body?: unknown): Promise<ApiResult>;
  navigation(body?: unknown): Promise<ApiResult>; siteEvaluate(body?: unknown): Promise<ApiResult>;
  report(body?: unknown): Promise<ApiResult>; site(id: string): Promise<ApiResult>; media(id: string): Promise<ApiResult>;
  layers(): Promise<ApiResult>; siteReport(body?: unknown): Promise<ApiResult>;
}
declare var OnboardApi: OnboardApiClient;
(function (root: ApiRoot) {
  "use strict";

  function base() {
    const b = (typeof window !== "undefined" && window.BRASPACE_API_BASE) || (root && root.BRASPACE_API_BASE) ||
      (root?.location?.hostname === "braspace.github.io" ? "https://braspace-api.srv1898743.hstgr.cloud" : "");
    return String(b).replace(/\/+$/, "");
  }

  async function call(method: string, path: string, body?: unknown, asText?: boolean): Promise<ApiResult> {
    try {
      const opts: { method: string; headers: Record<string, string>; body?: string } = { method, headers: {} };
      if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(base() + path, opts);
      const text = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 300) };
      if (asText) return { ok: true, status: res.status, data: text };
      return { ok: true, status: res.status, data: JSON.parse(text) };
    } catch (err) {
      return { ok: false, status: 0, error: "sem conexão com a API (" + (err as Error).message + ")" };
    }
  }

  const api: OnboardApiClient = {
    base,
    evaluate: (body?: unknown) => call("POST", "/api/onboard/evaluate", body),
    readyz: () => call("GET", "/readyz"),
    capabilities: () => call("GET", "/v1/capabilities"),
    // 404 means the route does not exist in this API build (PR 97 not deployed): callers fall back.
    sky: (id: string, query?: string) => call("GET", "/api/sites/" + encodeURIComponent(id) + "/sky" + (query ? "?" + query : "")),
    health: () => call("GET", "/api/health"),
    sites: () => call("GET", "/api/sites"),
    compare: (body?: unknown) => call("POST", "/api/compare", body),
    scenarioDelay: (body?: unknown) => call("POST", "/api/scenarios/delay", body),
    navigation: (body?: unknown) => call("POST", "/api/onboard/navigation", body),
    siteEvaluate: (body?: unknown) => call("POST", "/api/onboard/site-evaluate", body),
    // Printable report: returns HTML text, rendered by the caller in a new tab.
    report: (body?: unknown) => call("POST", "/api/onboard/report", body, true),
    // Per-place endpoints (ids are catalog ids, encoded as path segments)
    site: (id: string) => call("GET", "/api/sites/" + encodeURIComponent(id)),
    media: (id: string) => call("GET", "/api/sites/" + encodeURIComponent(id) + "/media"),
    layers: () => call("GET", "/api/layers"),
    // Printable report for the place: same input as site-evaluate, HTML text back
    siteReport: (body?: unknown) => call("POST", "/api/onboard/site-report", body, true)
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardApi = api;
})((typeof window !== "undefined" ? window : globalThis) as unknown as ApiRoot);
