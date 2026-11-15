package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// Every source SHA-256 that the lexical ingestion manifest indexes must be one
// the repository already records in data/ or the embedded layer registry
// (zero false validation: no invented checksums). Ported from #284 to the
// registry-pinned manifest of #279.
func TestVectorSeedSHA256AreRegistered(t *testing.T) {
	var recorded strings.Builder
	for _, f := range []string{"../data/ASSET_REGISTRY.json", "../data/manifest.json", "sitedata/layers.json"} {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		recorded.Write(b)
	}
	registry, sha, err := vectorLayerRegistry()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := lexicalVectorManifest(registry, sha)
	if err != nil {
		t.Fatal(err)
	}
	var m vectorIngestManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Entries) == 0 {
		t.Fatal("no manifest entries")
	}
	for _, e := range m.Entries {
		if len(e.SourceSHA256) != 64 || !strings.Contains(recorded.String(), e.SourceSHA256) {
			t.Errorf("%s: sha256 %q is not recorded in data/ or sitedata/layers.json", e.LayerID, e.SourceSHA256)
		}
	}
}
