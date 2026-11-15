// Canonical API routing for standalone Pages, local preview and self-hosting.
// Explicit deployment config wins; only the official Pages host gets a default.
export const PUBLIC_API = "https://braspace-api.srv1898743.hstgr.cloud";
export function apiBase(scope=globalThis) {
 const configured=scope?.BRASPACE_API_BASE ?? scope?.window?.BRASPACE_API_BASE;
 if(typeof configured==="string" && configured.trim()) return configured.trim().replace(/\/+$/, "");
 const hostname=scope?.location?.hostname ?? scope?.window?.location?.hostname;
 return hostname==="braspace.github.io" ? PUBLIC_API : "";
}
export function apiURL(path,scope=globalThis) {
 if(typeof path!=="string" || !/^\/(?:api\/|v1\/|healthz(?:$|\?)|readyz(?:$|\?))/.test(path) || path.includes("..")) throw new TypeError("INVALID_API_PATH");
 return apiBase(scope)+path;
}
