package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testLayers(t *testing.T) (*layersAPI, http.Handler) {
	t.Helper()
	st, _ := loadDefaultStore()
	raw, _ := embeddedSiteData.ReadFile("sitedata/layers.json")
	c, err := loadLayers(raw, st)
	if err != nil {
		t.Fatal(err)
	}
	l := newLayersAPI(c, st)
	mux := http.NewServeMux()
	l.register(mux)
	return l, mux
}

// The layer catalog must agree with the team's reviewed registry and manifest.
func TestLayersMatchTeamRegistry(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "data", "ASSET_REGISTRY.json"))
	if err != nil {
		t.Skip("data/ASSET_REGISTRY.json not available")
	}
	var r struct {
		Assets []map[string]any `json:"assets"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		t.Fatal(err)
	}
	byID := map[string]map[string]any{}
	for _, a := range r.Assets {
		byID[a["asset_id"].(string)] = a
	}
	l, _ := testLayers(t)
	for _, ly := range l.catalog.Layers {
		ref, ok := strings.CutPrefix(ly.RegistryRef, "data/ASSET_REGISTRY.json#")
		if !ok {
			continue
		}
		a := byID[ref]
		if a == nil || a["file_url"] != ly.SourceURL || a["sha256"] != ly.SHA256 || a["author_credit"] != ly.Attribution || a["scientific_role"] != ly.ScientificRole {
			t.Errorf("%s drifted from registry entry %s", ly.ID, ref)
		}
	}
	mraw, _ := os.ReadFile(filepath.Join("..", "data", "manifest.json"))
	var m nasaManifest
	_ = json.Unmarshal(mraw, &m)
	if dem := l.byID["lola-ldem-80s-80m"]; dem == nil || dem.SHA256 != m.Verification.SHA256 || dem.SourceURL != m.Source.ImageURL {
		t.Error("science DEM layer drifted from data/manifest.json")
	}
}

func TestLayersEndpoints(t *testing.T) {
	_, h := testLayers(t)
	rec := do(h, "GET", "/api/layers", "")
	var out struct {
		Layers []layer `json:"layers"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Code != 200 || len(out.Layers) != 3 {
		t.Fatalf("%d %d", rec.Code, len(out.Layers))
	}
	for _, ly := range out.Layers {
		if ly.Attribution == "" || ly.Rights == "" || ly.Frame == "" || ly.SHA256 == "" {
			t.Errorf("%s missing provenance fields", ly.ID)
		}
		if (ly.Delivery == "proxy") != (ly.AssetPath != "") {
			t.Errorf("%s: asset_path only for proxied layers", ly.ID)
		}
	}
	if rec := do(h, "GET", "/api/layers/nope", ""); rec.Code != 404 {
		t.Errorf("unknown layer: %d", rec.Code)
	}
	if rec := do(h, "GET", "/api/layers/lola-ldem-80s-80m/asset", ""); rec.Code != 404 || decode(t, rec)["code"] != "LAYER_NOT_PROXIED" {
		t.Errorf("science DEM must never be proxied: %d", rec.Code)
	}
	rec = do(h, "GET", "/api/sites/malapert-massif/media", "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "LROC-1294") || strings.Contains(rec.Body.String(), "LROC-1247") {
		t.Fatalf("media: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(h, "GET", "/api/sites/haworth/media", ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"media":[]`) {
		t.Errorf("site without cards must return an empty list: %s", rec.Body.String())
	}
	if rec := do(h, "GET", "/api/sites/atlantis/media", ""); rec.Code != 404 {
		t.Errorf("unknown site media: %d", rec.Code)
	}
}

func TestLayerAssetProxyVerifiesChecksum(t *testing.T) {
	l, h := testLayers(t)
	ly := l.byID["lroc-color-2k"]
	good := make([]byte, ly.Bytes) // stand-in bytes; checksum patched below
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(good) }))
	defer upstream.Close()
	ly.SourceURL = upstream.URL

	// Wrong bytes for the registered checksum: refused, nothing cached.
	if rec := do(h, "GET", "/api/layers/lroc-color-2k/asset", ""); rec.Code != 502 || decode(t, rec)["code"] != "LAYER_UNAVAILABLE" {
		t.Fatalf("checksum mismatch must be refused: %d", rec.Code)
	}
	if len(l.assets.data) != 0 {
		t.Fatal("a failed fetch must not be cached")
	}
	// Matching checksum: served same-origin with caching headers.
	ly.SHA256 = sha256Hex(good)
	rec := do(h, "GET", "/api/layers/lroc-color-2k/asset", "")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/jpeg" || rec.Body.Len() != int(ly.Bytes) || rec.Header().Get("ETag") == "" {
		t.Fatalf("%d %v", rec.Code, rec.Header())
	}
	// Upstream down after caching: still served from memory.
	upstream.Close()
	if rec := do(h, "GET", "/api/layers/lroc-color-2k/asset", ""); rec.Code != 200 {
		t.Fatalf("cached asset: %d", rec.Code)
	}
}

func TestLayerAssetUpstreamFailure(t *testing.T) {
	l, h := testLayers(t)
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer down.Close()
	l.byID["lroc-color-2k"].SourceURL = down.URL
	if rec := do(h, "GET", "/api/layers/lroc-color-2k/asset", ""); rec.Code != 502 {
		t.Fatalf("%d", rec.Code)
	}
}

func TestLayerCatalogRejectsUnsafeEntries(t *testing.T) {
	st, _ := loadDefaultStore()
	raw, _ := embeddedSiteData.ReadFile("sitedata/layers.json")
	cases := map[string]string{
		"proxy from unknown host": strings.Replace(string(raw), "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg", "https://evil.example/x.jpg", 1),
		"plain http source":       strings.Replace(string(raw), "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg", "http://svs.gsfc.nasa.gov/x.jpg", 1),
		"science data proxied": strings.Replace(string(raw), `"scientific_role": "science_source",
      "delivery": "external"`, `"scientific_role": "science_source",
      "delivery": "proxy"`, 1),
		"unknown site in media": strings.Replace(string(raw), `"malapert-massif"`, `"atlantis"`, 1),
		"missing attribution":   strings.Replace(string(raw), `"attribution": "LOLA Science Team, NASA GSFC; PDS Geosciences Node"`, `"attribution": ""`, 1),
	}
	for name, c := range cases {
		if c == string(raw) {
			t.Fatalf("%s: replacement did not apply", name)
		}
		if _, err := loadLayers([]byte(c), st); err == nil {
			t.Errorf("%s: must be rejected", name)
		}
	}
}
