# Local, pinned BRASPACE metadata embeddings

Metadata search is optional and is **not** a lunar physics, terrain, ephemeris,
visibility, landing-safety or scientific validation mechanism. The API does not
generate embeddings or accept an arbitrary model. This utility builds a reviewed
ingestion manifest from the exact `api/sitedata/layers.json` bytes.

## Pinned model and license

- Model: [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/tree/1110a243fdf4706b3f48f1d95db1a4f5529b4d41)
- Immutable revision: `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`
- Configured model ID: `sentence-transformers/all-MiniLM-L6-v2:1110a243fdf4706b3f48f1d95db1a4f5529b4d41`
- License: Apache-2.0 (model card); English sentence similarity, 384 dimensions
- CPU ONNX inference, 256-token max length, attention-mask-aware mean pooling,
  L2 normalization; no generated/fake vectors.

The application does not download the model or send queries to any third party.
Retrieve the assets once from the pinned public model snapshot and keep them in
an operator-controlled directory outside the Git repository. The ONNX blob SHA
was verified against Hugging Face's pinned model API LFS metadata; the tokenizer
Git blob ID and SHA-256 were independently verified from downloaded bytes.

```bash
# Run from repository root, Python 3.12 recommended.
python -m venv /tmp/braspace-vector-venv
source /tmp/braspace-vector-venv/bin/activate
python -m pip install -r scripts/requirements-vector.txt

MODEL_DIR="$(mktemp -d)"
REV=1110a243fdf4706b3f48f1d95db1a4f5529b4d41
BASE="https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/$REV"
curl -fL "$BASE/onnx/model.onnx" -o "$MODEL_DIR/model.onnx"
curl -fL "$BASE/tokenizer.json" -o "$MODEL_DIR/tokenizer.json"
sha256sum "$MODEL_DIR/model.onnx" "$MODEL_DIR/tokenizer.json"
# Expect model.onnx:      6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452
# Expect tokenizer.json:  be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037
```

The utility verifies both SHA-256 values again and exits without inference on
mismatch. Check package/image advisories and the model license before deploying;
Python/model dependencies are optional operator tooling, not server dependencies.

## Generate a reviewed manifest and query

```bash
python scripts/vector_embeddings.py --model-dir "$MODEL_DIR" \
  --registry api/sitedata/layers.json --output /tmp/braspace-source-embeddings.json

python scripts/vector_embeddings.py --model-dir "$MODEL_DIR" \
  --query "NASA Lunar Orbiter Laser Altimeter south pole digital elevation model for terrain" \
  --limit 4 --output /tmp/braspace-source-query.json
```

The manifest schema `braspace.vector-ingest.v1` includes the exact pinned
model, license identifier, registry SHA-256 and each layer's ID, source SHA-256
and 384-component embedding. Input to each embedding is a fixed-order combination
of the layer's existing English title, kind, scientific role, attribution and
note. No numerical lunar data or media is embedded.

Review the manifest and the registry before applying the optional database
ingestion procedure. Query output has the API's exact `model_id`, `vector`
and `limit` fields and can be supplied to the compatible metadata search UI/API.
An English query is recommended because the model card reports English.

## Reproducibility gate

```bash
BRASPACE_VECTOR_MODEL_DIR="$MODEL_DIR" python -m unittest discover -s scripts -p 'test_vector_embeddings.py' -v
```

The real-inference test checks the same-model manifest/query contract, finite
normalized vectors, repeatability and the expected top source for the reviewed
example search. Without the verified assets, that test is explicitly skipped;
the pure validation tests still run.

Never commit the ONNX/tokenizer artifacts, generated manifests, query output,
or credentials. The embeddings are informational retrieval only; the Go/Rust
mission APIs remain independent and must retain scientific provenance.
