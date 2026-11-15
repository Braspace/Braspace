import { test } from "node:test";
import assert from "node:assert/strict";
import { embedProvenanceText, VECTOR_DIMENSIONS, VECTOR_MODEL_ID } from "../vector-embed.js";
import { backendVectorAvailability, backendVectorSearch } from "../lab/backend-bridge.js";

test("embedProvenanceText is deterministic, 384-d unit-normalized, and rejects empty text", () => {
  const v1 = embedProvenanceText("LOLA DEM south pole");
  const v2 = embedProvenanceText("LOLA DEM south pole");
  assert.equal(v1.length, VECTOR_DIMENSIONS);
  assert.deepEqual(v1, v2);
  const normSq = v1.reduce((acc, x) => acc + x * x, 0);
  assert.ok(Math.abs(normSq - 1) < 1e-9, `expected unit norm, got ${normSq}`);
  assert.throws(() => embedProvenanceText("   ---   "));
});

test("backendVectorAvailability and backendVectorSearch enforce contract and fail closed", async () => {
  const okStatus = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ enabled: true, available: true, dimension: 384, model_id: VECTOR_MODEL_ID, scientifically_validated: false })
  });
  const avail = await backendVectorAvailability(okStatus);
  assert.equal(avail.enabled, true);
  assert.equal(avail.available, true);
  assert.equal(avail.modelID, VECTOR_MODEL_ID);

  const okSearch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model_id, VECTOR_MODEL_ID);
    assert.equal(body.vector.length, 384);
    assert.equal(body.limit, 3);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model_id: VECTOR_MODEL_ID,
        dimension: 384,
        scientifically_validated: false,
        limitations: ["Metadata only"],
        results: [{ source_ref: "nasa-lro-lola-ldem-80s-80m", title: "LOLA", source_url: "https://pds-geosciences.wustl.edu/", sha256: "a".repeat(64), similarity: 0.91 }]
      })
    };
  };
  const res = await backendVectorSearch("LOLA DEM", { limit: 3 }, okSearch);
  assert.equal(res.results.length, 1);
  assert.equal(res.scientificallyValidated, false);

  const unavailable = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: "disabled", code: "VECTOR_UNAVAILABLE" })
  });
  await assert.rejects(() => backendVectorSearch("LOLA DEM", {}, unavailable));
});
