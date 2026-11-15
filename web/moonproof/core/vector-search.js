// Optional provenance-linked metadata retrieval. Not a source of physics or validation.
import { apiURL } from "../../api-base.js";
import { embedProvenanceText, VECTOR_MODEL_ID } from "../../vector-embed.js";
export { VECTOR_MODEL_ID as LEXICAL_MODEL_ID };

export const VECTOR_DIMENSION = 384;
const MAX_BYTES = 16 * 1024;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/;
const SHA256 = /^[a-fA-F0-9]{64}$/;
const fail = code => { throw new Error(code); };

// Only the exact lexical model already shipped in BRASPACE can generate a
// local text projection. A trained model such as MiniLM still requires its
// separately generated, same-model JSON envelope.
export function lexicalQuery(text, status) {
  if (status?.state !== "ready" || status.modelId !== VECTOR_MODEL_ID) fail("MODEL_MISMATCH");
  if (typeof text !== "string" || text.length > 512 || !text.trim()) fail("INVALID_VECTOR");
  try { return JSON.stringify({ model_id: VECTOR_MODEL_ID, vector: embedProvenanceText(text) }); }
  catch { fail("INVALID_VECTOR"); }
}

/** No browser-generated embeddings, no implicit model conversion, no coercion. */
export function parseEmbedding(text, modelId, limit = 5) {
  if (!MODEL.test(modelId || "")) fail("INVALID_MODEL");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) fail("INVALID_LIMIT");
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) fail("REQUEST_TOO_LARGE");
  let input;
  try { input = JSON.parse(text); } catch { fail("INVALID_JSON"); }
  if (!input || typeof input !== "object" || Array.isArray(input) || !["model_id,vector", "limit,model_id,vector"].includes(Object.keys(input).sort().join(","))) fail("INVALID_JSON");
  if (Object.hasOwn(input, "limit") && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10)) fail("INVALID_LIMIT");
  if (input.model_id !== modelId) fail("MODEL_MISMATCH");
  const vector = input.vector;
  if (!Array.isArray(vector) || vector.length !== VECTOR_DIMENSION || vector.some(x => typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1e6)) fail("INVALID_VECTOR");
  // pgvector stores float32. A vector containing only underflowed values is zero.
  const norm = vector.reduce((total, x) => total + Math.fround(x) ** 2, 0);
  if (!(norm > 0) || !Number.isFinite(norm)) fail("INVALID_VECTOR");
  const request = { model_id: modelId, vector, limit };
  if (new TextEncoder().encode(JSON.stringify(request)).length > MAX_BYTES) fail("REQUEST_TOO_LARGE");
  return request;
}

const unavailable = (state, reason = null, modelId = null) => ({ state, modelId, reason });
export async function getVectorStatus(fetcher = fetch) {
  try {
    const response = await fetcher(apiURL("/api/vector/status"), { redirect: "error", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return unavailable("offline", "HTTP_" + response.status);
    const data = await response.json();
    if (typeof data?.enabled !== "boolean" || typeof data.available !== "boolean" || typeof data.model_id !== "string" || data.dimension !== VECTOR_DIMENSION || data.scientifically_validated !== false || (data.available && (!data.enabled || !MODEL.test(data.model_id)))) return unavailable("offline", "INVALID_VECTOR_CONTRACT");
    if (!data.enabled) return unavailable("disabled");
    if (!data.available) return unavailable("unavailable", null, MODEL.test(data.model_id) ? data.model_id : null);
    return unavailable("ready", null, data.model_id);
  } catch { return unavailable("offline", "VECTOR_UNAVAILABLE"); }
}

function safeSourceURL(value) {
  if (typeof value !== "string" || !value.startsWith("https://") || /\s/.test(value)) return null;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function checkedResults(data, request) {
  if (data?.model_id !== request.model_id || data?.dimension !== VECTOR_DIMENSION || data?.scientifically_validated !== false || !Array.isArray(data.limitations) || !data.limitations.length || !data.limitations.every(x => typeof x === "string") || !Array.isArray(data.results) || data.results.length > request.limit) fail("INVALID_VECTOR_CONTRACT");
  return data.results.map(hit => {
    const url = safeSourceURL(hit?.source_url);
    if (!url || typeof hit.source_ref !== "string" || !hit.source_ref.trim() || typeof hit.title !== "string" || !hit.title.trim() || typeof hit.sha256 !== "string" || !SHA256.test(hit.sha256) || typeof hit.similarity !== "number" || !Number.isFinite(hit.similarity) || Math.abs(hit.similarity) > 1.000001) fail("INVALID_VECTOR_CONTRACT");
    return { source_ref: hit.source_ref, title: hit.title, source_url: url, sha256: hit.sha256, similarity: hit.similarity };
  });
}

/** Searches only when the pinned backend model is ready and the caller supplies its vector. */
export async function searchMetadata(text, status, limit = 5, fetcher = fetch) {
  if (status?.state !== "ready") return { ok: false, code: "VECTOR_UNAVAILABLE" };
  try {
    const request = parseEmbedding(text, status.modelId, limit);
    const response = await fetcher(apiURL("/api/vector/search"), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), redirect: "error", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, code: typeof body?.code === "string" ? body.code : "HTTP_" + response.status };
    }
    const data = await response.json();
    return { ok: true, results: checkedResults(data, request), modelId: request.model_id };
  } catch (error) {
    const code = String(error?.message || "");
    return { ok: false, code: /^[A-Z_]+$/.test(code) ? code : "VECTOR_UNAVAILABLE" };
  }
}
