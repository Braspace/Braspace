import test from "node:test";
import assert from "node:assert/strict";
import { parseEmbedding, getVectorStatus, searchMetadata, VECTOR_DIMENSION, LEXICAL_MODEL_ID, lexicalQuery } from "../core/vector-search.js";

// Explicit synthetic vectors exercise the API contract; they are not source embeddings.
const model = "fixture/test-v1";
const vector = [1, ...Array(VECTOR_DIMENSION - 1).fill(0)];
const json = (data = { model_id: model, vector }) => JSON.stringify(data);
const ready = { state: "ready", modelId: model };
const status = { enabled: true, available: true, model_id: model, dimension: VECTOR_DIMENSION, scientifically_validated: false };
const result = { model_id: model, dimension: VECTOR_DIMENSION, scientifically_validated: false, limitations:["metadata only"], results: [{ source_ref: "fixture", title: "Synthetic source metadata", source_url: "https://example.org/test", sha256: "a".repeat(64), similarity: 1 }] };
const fake = (data, status = 200) => async () => new Response(JSON.stringify(data), { status });

test("natural-language query uses the exact lexical projection only when that model is ready", () => {
  const s = {state: "ready", modelId: LEXICAL_MODEL_ID};
  const q = lexicalQuery("LOLA DEM terrain", s);
  assert.equal(lexicalQuery("LOLA DEM terrain", s), q);
  const body = parseEmbedding(q, LEXICAL_MODEL_ID, 4);
  assert.ok(Math.abs(body.vector.reduce((n, v) => n + v*v, 0)-1) < 1e-9);
  assert.throws(() => lexicalQuery("LOLA DEM", ready), /MODEL_MISMATCH/);
  assert.throws(() => lexicalQuery("---", s), /INVALID_VECTOR/);
  assert.throws(() => lexicalQuery("x".repeat(513), s), /INVALID_VECTOR/);
});

test("accept exact model, 384 numeric dimensions and explicit bounded result count", () => {
  assert.deepEqual(parseEmbedding(json(), model, 3), { model_id: model, vector, limit: 3 });
  assert.deepEqual(parseEmbedding(json({ model_id: model, vector, limit: 5 }), model, 3), { model_id: model, vector, limit: 3 });
  assert.throws(() => parseEmbedding(json({ model_id: model, vector, limit: 0 }), model, 3), /INVALID_LIMIT/);
});
test("reject null, strings, malformed JSON, zero, wrong dimensions/limits and float32 underflow", () => {
  for (const text of ["null", "[]", "{", json({ model_id: model, vector: [1] }), json({ model_id: model, vector: Array(384).fill(0) }), json({ model_id: model, vector: Array(384).fill(1e-120) }), json({ model_id: model, vector: [null, ...vector.slice(1)] }), json({ model_id: model, vector: ["1", ...vector.slice(1)] }), json({ model_id: model, vector: [1e7, ...vector.slice(1)] }), json({ model_id: model, vector, other: true })]) assert.throws(() => parseEmbedding(text, model));
  assert.throws(() => parseEmbedding(json({ model_id: "older/model", vector }), model), /MODEL_MISMATCH/);
  for (const limit of [0, 11, 1.5, "3"]) assert.throws(() => parseEmbedding(json(), model, limit), /INVALID_LIMIT/);
  assert.throws(() => parseEmbedding(" ".repeat(17*1024), model), /REQUEST_TOO_LARGE/);
});
test("status distinguishes ready, disabled, enabled-unavailable and incompatible/offline", async () => {
  assert.deepEqual(await getVectorStatus(fake(status)), { state: "ready", modelId: model, reason: null });
  assert.equal((await getVectorStatus(fake({ ...status, enabled: false, available: false, model_id: "" }))).state, "disabled");
  assert.equal((await getVectorStatus(fake({ ...status, available: false }))).state, "unavailable");
  assert.equal((await getVectorStatus(fake({ ...status, enabled: false }))).state, "offline");
  assert.equal((await getVectorStatus(fake({ ...status, scientifically_validated: true }))).state, "offline");
  assert.equal((await getVectorStatus(fake({}, 503))).state, "offline");
});
test("disabled and invalid embedding do not cause API traffic", async () => {
  let calls = 0; const fetcher = async () => { calls++; throw Error("unexpected call"); };
  assert.deepEqual(await searchMetadata(json(), { state: "disabled" }, 5, fetcher), { ok: false, code: "VECTOR_UNAVAILABLE" });
  assert.deepEqual(await searchMetadata("null", ready, 5, fetcher), { ok: false, code: "INVALID_JSON" });
  assert.equal(calls, 0);
});
test("POST exact model and vector and parse source metadata, including empty results", async () => {
  const found = await searchMetadata(json(), ready, 5, async (url, req) => {
    assert.ok(url.endsWith("/api/vector/search")); assert.equal(req.method, "POST");
    assert.deepEqual(JSON.parse(req.body), { model_id: model, vector, limit: 5 });
    return new Response(JSON.stringify(result));
  });
  assert.equal(found.ok, true); assert.deepEqual(found.results, result.results);
  assert.deepEqual(await searchMetadata(json(), ready, 5, fake({ ...result, results: [] })), { ok: true, results: [], modelId: model });
});
test("fail closed for non-HTTPS or malformed metadata, forged science and wrong model", async () => {
  for (const update of [{ source_url: "javascript:alert(1)" }, { source_url: "https://user:pass@example.org/x" }, { sha256: "0".repeat(63)+"z" }, { similarity: 2 }, { title: "" }]) {
    const r = await searchMetadata(json(), ready, 5, fake({ ...result, results: [{ ...result.results[0], ...update }] }));
    assert.deepEqual(r, { ok: false, code: "INVALID_VECTOR_CONTRACT" });
  }
  for (const data of [{ ...result, scientifically_validated: true }, { ...result, model_id:"other" }, { ...result, results: Array(6).fill(result.results[0]) }]) assert.deepEqual(await searchMetadata(json(), ready, 5, fake(data)), { ok:false, code:"INVALID_VECTOR_CONTRACT" });
  assert.deepEqual(await searchMetadata(json(), ready, 5, fake({ code:"VECTOR_UNAVAILABLE" }, 503)), { ok:false, code:"VECTOR_UNAVAILABLE" });
});
