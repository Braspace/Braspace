package main

import (
	"encoding/json"
	"math"
	"testing"
)

func cosineSim(a, b []float64) float64 {
	var dot float64
	for i := range a {
		dot += a[i] * b[i]
	}
	return dot
}

func TestEmbedProvenanceTextDeterministicAndNormalized(t *testing.T) {
	v1, err := embedProvenanceText("LOLA DEM south pole")
	if err != nil {
		t.Fatal(err)
	}
	v2, err := embedProvenanceText("LOLA DEM south pole")
	if err != nil {
		t.Fatal(err)
	}
	if len(v1) != vectorDimensions {
		t.Fatalf("got %d dims, want %d", len(v1), vectorDimensions)
	}
	var normSq float64
	for i := range v1 {
		if v1[i] != v2[i] {
			t.Fatalf("non-deterministic at %d: %v != %v", i, v1[i], v2[i])
		}
		normSq += v1[i] * v1[i]
	}
	if math.Abs(normSq-1.0) > 1e-9 {
		t.Fatalf("expected unit norm, got %v", normSq)
	}
	if _, err := embedProvenanceText("   ---   "); err == nil {
		t.Fatal("expected error for empty/punctuation-only query")
	}
}

func TestVectorLexicalRegistryManifestAndRanking(t *testing.T) {
	registry, sha, err := vectorLayerRegistry()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := lexicalVectorManifest(registry, sha)
	if err != nil {
		t.Fatal(err)
	}
	second, err := lexicalVectorManifest(registry, sha)
	if err != nil || string(raw) != string(second) {
		t.Fatal("nonrepeatable lexical manifest")
	}
	report, rows, err := validateVectorManifest(raw, registry, sha)
	if err != nil || report.Entries != len(registry.Layers) || len(rows) != len(registry.Layers) {
		t.Fatalf("invalid reviewed lexical manifest: %v", err)
	}
	if report.ModelID != vectorLexicalModelID || report.ModelRevision != vectorLexicalRevision {
		t.Fatal("wrong model pin")
	}
	var manifest vectorIngestManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	query, err := embedProvenanceText("LOLA south polar digital elevation model LDEM 80m terrain")
	if err != nil {
		t.Fatal(err)
	}
	best, bestID := -2.0, ""
	for _, entry := range manifest.Entries {
		vector := make([]float64, len(entry.Embedding))
		for i, v := range entry.Embedding {
			vector[i] = *v
		}
		if score := cosineSim(query, vector); score > best {
			best, bestID = score, entry.LayerID
		}
	}
	if bestID != "lola-ldem-80s-80m" {
		t.Fatalf("LOLA expected first, got %s", bestID)
	}
}
