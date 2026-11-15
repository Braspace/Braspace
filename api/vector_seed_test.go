package main

import (
	"os"
	"strings"
	"testing"
)

// The seed must come only from the registries: every row pinned, none hand-typed.
func TestVectorSeedIsRegistryPinned(t *testing.T) {
	e, err := buildProvenanceSeedEntries(embeddedVectorFS())
	if err != nil {
		t.Fatal(err)
	}
	if len(e) < 20 {
		t.Fatalf("only %d seed rows", len(e))
	}
	reg := ""
	for _, f := range []string{"../data/ASSET_REGISTRY.json", "../data/POLAR_SOURCE_EVIDENCE.json", "sitedata/catalog.json"} {
		if b, err := os.ReadFile(f); err == nil {
			reg += string(b)
		}
	}
	for _, r := range e {
		if !sha256Re.MatchString(r.SHA256) || !strings.HasPrefix(r.SourceURL, "https://") {
			t.Fatalf("%s not pinned", r.SourceRef)
		}
		if reg != "" && !strings.Contains(reg, r.SHA256) {
			t.Fatalf("%s sha256 %s is not in any registry", r.SourceRef, r.SHA256)
		}
	}
}
