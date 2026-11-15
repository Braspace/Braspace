"""Tests for optional local metadata embeddings. No fake production manifest."""
import json
import math
import os
from pathlib import Path
import tempfile
import unittest

from vector_embeddings import (
    MODEL_ID, MODEL_FILES, DIMENSION, build_manifest, new_embedder,
    read_registry, validate_embedding, verify_assets,
)


ROOT = Path(__file__).resolve().parent.parent
REGISTRY = Path(os.environ.get("BRASPACE_VECTOR_REGISTRY", ROOT / "api/sitedata/layers.json"))


class GeneratorContracts(unittest.TestCase):
    def test_registry_requires_exact_layer_identity_and_metadata(self):
        sha256, entries = read_registry(REGISTRY)
        self.assertRegex(sha256, r"^[a-f0-9]{64}$")
        self.assertGreaterEqual(len(entries), 1)
        self.assertEqual(len({entry[0] for entry in entries}), len(entries))
        for layer_id, source_sha256, text in entries:
            self.assertRegex(source_sha256, r"^[a-f0-9]{64}$")
            self.assertEqual(len(text.splitlines()), 5, layer_id)
            self.assertNotIn("latitude_min_deg", text)

    def test_duplicate_layer_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "layers.json"
            raw = json.loads(REGISTRY.read_bytes())
            raw["layers"].append(raw["layers"][0])
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate layer ID"):
                read_registry(path)

    def test_model_pin_refuses_unverified_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            with self.assertRaisesRegex(ValueError, "mismatched pinned model asset"):
                verify_assets(path)
            for name in MODEL_FILES:
                (path / name).write_text("not a model", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "mismatched pinned model asset"):
                verify_assets(path)

    def test_embedding_contract_rejects_bad_values(self):
        # Test vectors exercise the validator only, never the manifest output.
        with self.assertRaises(ValueError):
            validate_embedding([])
        with self.assertRaises(ValueError):
            validate_embedding([0.0] * DIMENSION)
        with self.assertRaises(ValueError):
            validate_embedding([float("nan")] * DIMENSION)
        with self.assertRaises(ValueError):
            validate_embedding([True] * DIMENSION)


@unittest.skipUnless(os.environ.get("BRASPACE_VECTOR_MODEL_DIR"), "pinned assets not configured")
class RealModelInference(unittest.TestCase):
    def test_all_metadata_rows_and_query_use_same_model(self):
        embed = new_embedder(Path(os.environ["BRASPACE_VECTOR_MODEL_DIR"]))
        manifest = build_manifest(REGISTRY, embed)
        self.assertEqual(manifest["model_id"], MODEL_ID)
        self.assertEqual(manifest, build_manifest(REGISTRY, embed))
        self.assertEqual(len(manifest["entries"]), len(read_registry(REGISTRY)[1]))
        query = embed(["NASA Lunar Orbiter Laser Altimeter south pole digital elevation model for terrain"])[0]
        self.assertEqual(len(query), DIMENSION)
        similarities = []
        for row in manifest["entries"]:
            vector = row["embedding"]
            self.assertEqual(len(vector), DIMENSION)
            self.assertTrue(all(math.isfinite(x) for x in vector))
            similarities.append((sum(x * y for x, y in zip(vector, query)), row["layer_id"]))
        # Regression for this reviewed registry and this specific English query.
        if "lola-ldem-80s-80m" in {row["layer_id"] for row in manifest["entries"]}:
            self.assertEqual(max(similarities)[1], "lola-ldem-80s-80m")


if __name__ == "__main__":
    unittest.main()
