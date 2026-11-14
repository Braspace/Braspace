package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
)

const modelID = "svs-14959-moon-small-glb"

// standIn points the model layer at a local server returning body, resized to
// the stand-in so the registered size and checksum can be patched in.
func standIn(t *testing.T, body []byte, contentType string) (*layersAPI, http.Handler, *httptest.Server) {
	t.Helper()
	l, h := testLayers(t)
	l.assets.dir = t.TempDir()
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType)
		_, _ = w.Write(body)
	}))
	t.Cleanup(up.Close)
	ly := l.byID[modelID]
	if ly == nil {
		t.Fatal("model layer missing from the catalog")
	}
	ly.SourceURL = up.URL
	return l, h, up
}

func cacheFiles(t *testing.T, dir string) []string {
	t.Helper()
	m, _ := filepath.Glob(filepath.Join(dir, "*"))
	return m
}

// Without its catalog entry the model cannot be served at all.
func TestModelLayerFailsWithoutCatalogEntry(t *testing.T) {
	st, _ := loadDefaultStore()
	raw, _ := embeddedSiteData.ReadFile("sitedata/layers.json")
	var c layerCatalog
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatal(err)
	}
	kept := c.Layers[:0]
	for _, ly := range c.Layers {
		if ly.ID != modelID {
			kept = append(kept, ly)
		}
	}
	if len(kept) != len(c.Layers)-1 {
		t.Fatal("the catalog must contain the model entry")
	}
	c.Layers = kept
	rawNo, _ := json.Marshal(c)
	cat, err := loadLayers(rawNo, st)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	newLayersAPI(cat, st).register(mux)
	if rec := do(mux, "GET", "/api/layers/"+modelID+"/asset", ""); rec.Code != 404 || decode(t, rec)["code"] != "LAYER_NOT_FOUND" {
		t.Fatalf("model without entry must be 404: %d %s", rec.Code, rec.Body.String())
	}
}

// The catalog entry, the registry entry and the file measured in BR41 agree.
func TestModelLayerMatchesRegistry(t *testing.T) {
	l, _ := testLayers(t)
	ly := l.byID[modelID]
	if ly == nil {
		t.Fatal("missing model layer")
	}
	const wantSHA = "12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4"
	if ly.SHA256 != wantSHA || ly.Bytes != 13799876 || ly.Format != "model/gltf-binary" || ly.Kind != "visual_model_3d" ||
		ly.Delivery != "proxy" || ly.ScientificRole != "visualization_only" || ly.AssetPath != "/api/layers/"+modelID+"/asset" ||
		!strings.HasPrefix(ly.SourceURL, "https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/") || !strings.Contains(ly.Attribution, "NASA's Goddard Space Flight Center") {
		t.Fatalf("unexpected catalog entry: %+v", ly)
	}
	raw, err := os.ReadFile(filepath.Join("..", "data", "ASSET_REGISTRY.json"))
	if err != nil {
		t.Fatal(err)
	}
	var r struct {
		Assets []map[string]any `json:"assets"`
	}
	_ = json.Unmarshal(raw, &r)
	for _, a := range r.Assets {
		if a["asset_id"] == "nasa-svs-14959-moon-small-glb-2026" {
			if a["sha256"] != wantSHA || a["file_url"] != ly.SourceURL || a["bytes"].(float64) != 13799876 || a["author_credit"] != ly.Attribution {
				t.Fatalf("registry entry drifted: %v", a)
			}
			return
		}
	}
	t.Fatal("registry entry nasa-svs-14959-moon-small-glb-2026 missing")
}

func TestModelAssetIsStreamedFromDiskCache(t *testing.T) {
	body := bytes.Repeat([]byte("glTF"), 40000) // 160 KB stand-in
	l, h, up := standIn(t, body, "model/gltf-binary")
	ly := l.byID[modelID]
	ly.Bytes, ly.SHA256 = int64(len(body)), sha256Hex(body)

	rec := do(h, "GET", "/api/layers/"+modelID+"/asset", "")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "model/gltf-binary" || !bytes.Equal(rec.Body.Bytes(), body) {
		t.Fatalf("%d %v", rec.Code, rec.Header())
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") || !strings.Contains(cc, "max-age=") {
		t.Errorf("model must be cached immutable: %q", cc)
	}
	if rec.Header().Get("ETag") != `"`+ly.SHA256+`"` || rec.Header().Get("Cross-Origin-Resource-Policy") != "same-origin" {
		t.Errorf("headers: %v", rec.Header())
	}
	if len(l.assets.data) != 0 {
		t.Error("a model must never be held in the in-memory image cache")
	}
	if files := cacheFiles(t, l.assets.dir); len(files) != 1 || filepath.Base(files[0]) != ly.SHA256+".glb" {
		t.Fatalf("expected exactly the verified file in the cache: %v", files)
	}
	// Conditional and ranged requests are answered from the file.
	req := httptest.NewRequest("GET", "/api/layers/"+modelID+"/asset", nil)
	req.Header.Set("If-None-Match", `"`+ly.SHA256+`"`)
	r2 := httptest.NewRecorder()
	h.ServeHTTP(r2, req)
	if r2.Code != 304 {
		t.Errorf("If-None-Match: %d", r2.Code)
	}
	req = httptest.NewRequest("GET", "/api/layers/"+modelID+"/asset", nil)
	req.Header.Set("Range", "bytes=0-3")
	r3 := httptest.NewRecorder()
	h.ServeHTTP(r3, req)
	if r3.Code != 206 || r3.Body.String() != "glTF" {
		t.Errorf("Range: %d %q", r3.Code, r3.Body.String())
	}
	// Upstream gone: the verified disk copy still serves.
	up.Close()
	if rec := do(h, "GET", "/api/layers/"+modelID+"/asset", ""); rec.Code != 200 || rec.Body.Len() != len(body) {
		t.Fatalf("disk cache hit: %d", rec.Code)
	}
}

func TestModelAssetRejectsWrongSHA(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 50000)
	l, h, _ := standIn(t, body, "model/gltf-binary")
	ly := l.byID[modelID]
	ly.Bytes = int64(len(body)) // right size, registered SHA-256 is the real model's: mismatch
	rec := do(h, "GET", "/api/layers/"+modelID+"/asset", "")
	if rec.Code != 502 || decode(t, rec)["code"] != "LAYER_UNAVAILABLE" {
		t.Fatalf("wrong bytes must be refused: %d", rec.Code)
	}
	if files := cacheFiles(t, l.assets.dir); len(files) != 0 {
		t.Fatalf("a failed download must leave nothing in the cache: %v", files)
	}
}

func TestModelAssetRejectsWrongContentType(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 1000)
	l, h, _ := standIn(t, body, "text/html")
	ly := l.byID[modelID]
	ly.Bytes, ly.SHA256 = int64(len(body)), sha256Hex(body)
	if rec := do(h, "GET", "/api/layers/"+modelID+"/asset", ""); rec.Code != 502 {
		t.Fatalf("%d", rec.Code)
	}
}

// An upstream file larger than the registered size is cut off and refused
// without being stored, even when the declared length is missing.
func TestModelAssetRejectsFileLargerThanRegistered(t *testing.T) {
	body := bytes.Repeat([]byte("y"), 300000)
	l, h, _ := standIn(t, body, "model/gltf-binary")
	ly := l.byID[modelID]
	ly.Bytes, ly.SHA256 = 100000, sha256Hex(body[:100000]) // the first 100000 bytes would match
	if rec := do(h, "GET", "/api/layers/"+modelID+"/asset", ""); rec.Code != 502 {
		t.Fatalf("oversized upstream must be refused: %d", rec.Code)
	}
	if files := cacheFiles(t, l.assets.dir); len(files) != 0 {
		t.Fatalf("nothing may be cached: %v", files)
	}
}

// The catalog itself cannot register a model above the proxy limit, nor a
// model that is not a visual model, nor one from another host.
func TestModelCatalogLimits(t *testing.T) {
	st, _ := loadDefaultStore()
	raw, _ := embeddedSiteData.ReadFile("sitedata/layers.json")
	s := string(raw)
	cases := map[string]string{
		"above the model limit": strings.Replace(s, `"bytes": 13799876`, `"bytes": 16777217`, 1),
		"model as science":      strings.Replace(s, `"kind": "visual_model_3d"`, `"kind": "science_elevation"`, 1),
		"model from other host": strings.Replace(s, "https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb", "https://evil.example/moon_small.glb", 1),
	}
	for name, c := range cases {
		if c == s {
			t.Fatalf("%s: replacement did not apply", name)
		}
		if _, err := loadLayers([]byte(c), st); err == nil {
			t.Errorf("%s: must be rejected", name)
		}
	}
	// A 13.8 MB model fits the model limit but must still not pass as an image.
	if maxProxyModelBytes < 13799876 || maxProxyModelBytes > 32<<20 {
		t.Errorf("model limit out of range: %d", maxProxyModelBytes)
	}
}

// Serving a large model must not grow the heap by the file size (the public
// API container runs with 256 MB).
func TestModelAssetDoesNotBufferWholeFile(t *testing.T) {
	const size = 12 << 20
	body := bytes.Repeat([]byte("0123456789abcdef"), size/16)
	l, h, _ := standIn(t, body, "model/gltf-binary")
	ly := l.byID[modelID]
	ly.Bytes, ly.SHA256 = int64(len(body)), sha256Hex(body)
	path, err := l.assets.modelPath(t.Context(), ly)
	if err != nil {
		t.Fatal(err)
	}
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	req := httptest.NewRequest("GET", "/api/layers/"+modelID+"/asset", nil)
	w := &countingWriter{header: http.Header{}}
	h.ServeHTTP(w, req)
	runtime.ReadMemStats(&after)
	if w.n != size || w.code != 200 {
		t.Fatalf("served %d bytes, status %d (file %s)", w.n, w.code, path)
	}
	if grown := int64(after.TotalAlloc - before.TotalAlloc); grown > size/4 {
		t.Fatalf("serving allocated %d bytes for a %d byte file: the response is being buffered", grown, size)
	}
}

type countingWriter struct {
	header http.Header
	code   int
	n      int
}

func (w *countingWriter) Header() http.Header { return w.header }
func (w *countingWriter) WriteHeader(c int)   { w.code = c }
func (w *countingWriter) Write(p []byte) (int, error) {
	if w.code == 0 {
		w.code = 200
	}
	w.n += len(p)
	return len(p), nil
}

// The download is cut at the registered size: an upstream that keeps sending
// is abandoned after a few MB, not drained to disk.
func TestModelAssetDownloadIsCappedAtRegisteredSize(t *testing.T) {
	l, h := testLayers(t)
	l.assets.dir = t.TempDir()
	var sent atomic.Int64
	chunk := bytes.Repeat([]byte("z"), 64<<10)
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "model/gltf-binary") // no Content-Length: chunked
		for i := 0; i < 3200; i++ {                         // would be 200 MB
			n, err := w.Write(chunk)
			sent.Add(int64(n))
			if err != nil {
				return
			}
		}
	}))
	defer up.Close()
	ly := l.byID[modelID]
	ly.SourceURL = up.URL
	ly.Bytes, ly.SHA256 = 1<<20, strings.Repeat("0", 64)
	if rec := do(h, "GET", "/api/layers/"+modelID+"/asset", ""); rec.Code != 502 {
		t.Fatalf("%d", rec.Code)
	}
	if got := sent.Load(); got > 64<<20 {
		t.Fatalf("upstream was drained: %d bytes sent for a 1 MiB registration", got)
	}
	if files := cacheFiles(t, l.assets.dir); len(files) != 0 {
		t.Fatalf("nothing may be cached: %v", files)
	}
}
