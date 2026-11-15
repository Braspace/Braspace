#!/usr/bin/env python3
"""Generate BRASPACE source metadata embeddings with a pinned local model.

No network, API keys, lunar geometry, or synthetic vectors are used. Model
assets are supplied separately and verified byte-for-byte before inference.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys

MODEL_REPOSITORY = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
MODEL_ID = f"{MODEL_REPOSITORY}:{MODEL_REVISION}"
MODEL_LICENSE = "Apache-2.0"
DIMENSION = 384
MAX_SEQUENCE_LENGTH = 256
MODEL_FILES = {
    "model.onnx": "6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452",
    "tokenizer.json": "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037",
}
SHA_PATTERN = re.compile(r"[a-f0-9]{64}")
LAYER_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")


def file_sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_assets(model_dir):
    for name, expected in MODEL_FILES.items():
        path = model_dir / name
        if not path.is_file() or file_sha256(path) != expected:
            raise ValueError(f"Missing or mismatched pinned model asset: {name}")


def read_registry(path):
    raw = path.read_bytes()
    registry = json.loads(raw)
    if not isinstance(registry, dict) or registry.get("schema") != "braspace.layers.v1":
        raise ValueError("Invalid source registry schema")
    layers = registry.get("layers")
    if not isinstance(layers, list) or not layers:
        raise ValueError("Registry requires a nonempty layers list")
    seen = set()
    entries = []
    for layer in layers:
        if not isinstance(layer, dict):
            raise ValueError("Invalid layer entry")
        layer_id = layer.get("id", "")
        sha256 = layer.get("sha256", "")
        if not isinstance(layer_id, str) or not LAYER_PATTERN.fullmatch(layer_id) or layer_id in seen:
            raise ValueError("Invalid or duplicate layer ID")
        if not isinstance(sha256, str) or not SHA_PATTERN.fullmatch(sha256):
            raise ValueError(f"Layer {layer_id}: invalid source SHA-256")
        # Fixed descriptive metadata fields only. Never use numerical
        # position, terrain, direction, coverage or safety inputs.
        fields = ("title", "kind", "scientific_role", "attribution", "note")
        values = []
        for field in fields:
            value = layer.get(field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"Layer {layer_id}: invalid metadata field {field}")
            values.append(value.strip())
        seen.add(layer_id)
        entries.append((layer_id, sha256, "\n".join(values)))
    return hashlib.sha256(raw).hexdigest(), entries


def new_embedder(model_dir):
    # Imports stay lazy so schema and pin tests do not require model packages.
    verify_assets(model_dir)
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer

    tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=MAX_SEQUENCE_LENGTH)
    tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        str(model_dir / "model.onnx"), sess_options=options, providers=["CPUExecutionProvider"]
    )
    expected_inputs = {"input_ids", "attention_mask", "token_type_ids"}
    if {item.name for item in session.get_inputs()} != expected_inputs:
        raise ValueError("Unexpected pinned model input contract")
    if "last_hidden_state" not in {item.name for item in session.get_outputs()}:
        raise ValueError("Pinned model lacks last_hidden_state")

    def embed(texts):
        encoded = tokenizer.encode_batch(texts, add_special_tokens=True)
        ids = np.asarray([e.ids for e in encoded], dtype=np.int64)
        mask = np.asarray([e.attention_mask for e in encoded], dtype=np.int64)
        type_ids = np.asarray([e.type_ids for e in encoded], dtype=np.int64)
        hidden = session.run(
            ["last_hidden_state"],
            {"input_ids": ids, "attention_mask": mask, "token_type_ids": type_ids},
        )[0]
        if hidden.shape != (*mask.shape, DIMENSION):
            raise ValueError(f"Unexpected hidden-state shape: {hidden.shape}")
        # Model card: attention-mask mean pooling, then L2 normalization.
        weights = mask[:, :, None].astype(np.float32)
        pooled = (hidden * weights).sum(axis=1) / weights.sum(axis=1)
        norm = np.linalg.norm(pooled, axis=1, keepdims=True)
        if not np.isfinite(norm).all() or np.any(norm <= 0):
            raise ValueError("Non-finite or zero embedding norm")
        vectors = (pooled / norm).tolist()
        for vector in vectors:
            validate_embedding(vector)
        return vectors

    return embed


def validate_embedding(vector):
    if not isinstance(vector, list) or len(vector) != DIMENSION:
        raise ValueError(f"Expected {DIMENSION} embedding dimensions")
    if not all(type(x) in (float, int) and math.isfinite(x) for x in vector):
        raise ValueError("Non-numeric or non-finite embedding")
    if not math.isclose(math.sqrt(sum(x * x for x in vector)), 1.0, abs_tol=1e-5):
        raise ValueError("Embedding must be L2-normalized")


def build_manifest(registry_path, embed):
    sha, entries = read_registry(registry_path)
    vectors = embed([entry[2] for entry in entries])
    if len(vectors) != len(entries):
        raise ValueError("Model did not return one vector per registry layer")
    for vector in vectors:
        validate_embedding(vector)
    return {
        "schema": "braspace.vector-ingest.v1",
        "model_id": MODEL_ID,
        "model_revision": MODEL_REVISION,
        "model_license": MODEL_LICENSE,
        "source_registry_sha256": sha,
        "entries": [
            {"layer_id": entry[0], "source_sha256": entry[1], "embedding": vector}
            for entry, vector in zip(entries, vectors, strict=True)
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path, help="Directory with pinned model assets")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--registry", type=Path, help="api/sitedata/layers.json to ingest")
    mode.add_argument("--query", help="Query text for compatible local metadata search")
    parser.add_argument("--limit", type=int, default=5, choices=range(1, 11))
    parser.add_argument("--output", type=Path, help="Write JSON to this file instead of stdout")
    args = parser.parse_args()
    try:
        embed = new_embedder(args.model_dir)
        if args.registry:
            result = build_manifest(args.registry, embed)
        else:
            query = args.query.strip()
            if not query:
                raise ValueError("Query text cannot be empty")
            vector = embed([query])[0]
            result = {"model_id": MODEL_ID, "vector": vector, "limit": args.limit}
        output = json.dumps(result, allow_nan=False, indent=2) + "\n"
        if args.output:
            # Exclusive creation avoids overwriting an independently reviewed manifest.
            with args.output.open("x", encoding="utf-8") as stream:
                stream.write(output)
        else:
            sys.stdout.write(output)
    except (OSError, ValueError, ImportError) as exc:
        parser.exit(1, f"Embedding generation failed: {exc}\n")


if __name__ == "__main__":
    main()
