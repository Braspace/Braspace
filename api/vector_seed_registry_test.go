package main

import (
	"os"
	"strings"
	"testing"
	"testing/fstest"
)

// Every SHA-256 written into the provenance seed must be one the repository
// already records in data/ (zero false validation: no invented checksums).
func TestVectorSeedSHA256AreRegistered(t *testing.T) {
	var registry strings.Builder
	for _, f := range []string{"../data/ASSET_REGISTRY.json", "../data/manifest.json"} {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		registry.Write(b)
	}
	// Empty FS: only the hard-coded entries, not the catalog-derived ones.
	entries, err := buildProvenanceSeedEntries(fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("no seed entries")
	}
	for _, e := range entries {
		if len(e.SHA256) != 64 || !strings.Contains(registry.String(), e.SHA256) {
			t.Errorf("%s: sha256 %q is not recorded in data/ASSET_REGISTRY.json or data/manifest.json", e.SourceRef, e.SHA256)
		}
	}
}
