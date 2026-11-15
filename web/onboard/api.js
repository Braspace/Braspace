// Client for the Go API endpoints used by the cockpit.
// Base URL: window.BRASPACE_API_BASE (set in config.js) or "" (same origin, as served by dev-server.py
// or the API container). For the public API use https://braspace-api.srv1898743.hstgr.cloud:
// its CORS allows only https://braspace.github.io.
// Each call returns { ok, status, data } or { ok:false, status, error }. Nothing is parsed as HTML.
(function (root) {
  "use strict";

  function base() {
    const b = (typeof window !== "undefined" && window.BRASPACE_API_BASE) || (root && root.BRASPACE_API_BASE) ||
      (root?.location?.hostname === "braspace.github.io" ? "https://braspace-api.srv1898743.hstgr.cloud" : "");
    return String(b).replace(/\/+$/, "");
  }

  async function call(method, path, body, asText) {
    try {
      const opts = { method, headers: {} };
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
      return { ok: false, status: 0, error: "sem conexão com a API (" + err.message + ")" };
    }
  }

  const api = {
    base,
    evaluate: body => call("POST", "/api/onboard/evaluate", body),
    readyz: () => call("GET", "/readyz"),
    capabilities: () => call("GET", "/v1/capabilities"),
    // 404 means the route does not exist in this API build (PR 97 not deployed): callers fall back.
    sky: (id, query) => call("GET", "/api/sites/" + encodeURIComponent(id) + "/sky" + (query ? "?" + query : "")),
    health: () => call("GET", "/api/health"),
    sites: () => call("GET", "/api/sites"),
    compare: body => call("POST", "/api/compare", body),
    scenarioDelay: body => call("POST", "/api/scenarios/delay", body),
    navigation: body => call("POST", "/api/onboard/navigation", body),
    siteEvaluate: body => call("POST", "/api/onboard/site-evaluate", body),
    // Printable report: returns HTML text, rendered by the caller in a new tab.
    report: body => call("POST", "/api/onboard/report", body, true),
    // Per-place endpoints (ids are catalog ids, encoded as path segments)
    site: id => call("GET", "/api/sites/" + encodeURIComponent(id)),
    media: id => call("GET", "/api/sites/" + encodeURIComponent(id) + "/media"),
    layers: () => call("GET", "/api/layers"),
    // Printable report for the place: same input as site-evaluate, HTML text back
    siteReport: body => call("POST", "/api/onboard/site-report", body, true)
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardApi = api;
})(typeof window !== "undefined" ? window : globalThis);
