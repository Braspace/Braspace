package main

import (
	"io/fs"
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

func TestBuildProvenanceSeedEntriesAndRanking(t *testing.T) {
	fsys, err := fs.Sub(embeddedSiteData, "sitedata")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := buildProvenanceSeedEntries(fsys)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 5 {
		t.Fatalf("expected at least 5 provenance seed entries, got %d", len(entries))
	}
	q, err := embedProvenanceText("LOLA DEM elevation")
	if err != nil {
		t.Fatal(err)
	}
	lolaVec, _ := embedProvenanceText(entries[0].Text)
	spiceVec, _ := embedProvenanceText(entries[2].Text)
	if cosineSim(q, lolaVec) <= cosineSim(q, spiceVec) {
		t.Fatalf("expected LOLA entry to rank above SPICE for 'LOLA DEM elevation'")
	}
}
