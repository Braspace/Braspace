// GPU captures of Joel's exact Moon HD pole scene: provenance must match the published files.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const root = new URL("../../", import.meta.url);
const sha = p => createHash("sha256").update(readFileSync(new URL(p, root))).digest("hex");
const m = JSON.parse(readFileSync(new URL("web/moon-hd/renders/manifest.json", root), "utf8"));

test("GPU render manifest matches its files and the canonical terrain", () => {
  assert.equal(m.status, "CANDIDATE_PENDING_FIDELITY_APPROVAL");
  assert.equal(m.wired_into_ui, false);
  assert.equal(m.utc, "2025-03-06T12:00:00Z");
  assert.equal(m.terrain_source.sha256, "a1244e43cb392feb55aa63ee2289de5a7a098847f2511ce5fba2fcafceccf23c");
  assert.equal(sha(m.terrain_source.file), m.terrain_source.sha256);
  assert.equal(sha(m.source_manifest.file), m.source_manifest.sha256);
  assert.deepEqual(Object.keys(m.variants), ["desktop", "tablet", "portrait"]);
  for (const v of Object.values(m.variants)) assert.equal(sha(v.file), v.sha256, v.file);
  assert.match(m.use, /Not a registered map/);
});
