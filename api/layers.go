package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Layers (BS-054 / #57): typed metadata for optional lunar map layers and
// gallery links, taken from the team's reviewed asset registry. Visual layers
// never feed scientific calculations.

var sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

type layerCoverage struct {
	LatitudeMinDeg float64 `json:"latitude_min_deg"`
	LatitudeMaxDeg float64 `json:"latitude_max_deg"`
}

type layer struct {
	ID                   string        `json:"id"`
	Title                string        `json:"title"`
	Kind                 string        `json:"kind"`
	RegistryRef          string        `json:"registry_ref"`
	SourcePage           string        `json:"source_page"`
	SourceURL            string        `json:"source_url"`
	Format               string        `json:"format"`
	Bytes                int64         `json:"bytes"`
	SHA256               string        `json:"sha256"`
	WidthPx              int           `json:"width_px"`
	HeightPx             int           `json:"height_px"`
	Projection           string        `json:"projection"`
	Frame                string        `json:"frame"`
	Coverage             layerCoverage `json:"coverage"`
	ResolutionKmPerPxEq  *float64      `json:"resolution_km_per_px_equator"`
	ResolutionMPerPx     *float64      `json:"resolution_m_per_px,omitempty"`
	Attribution          string        `json:"attribution"`
	Rights               string        `json:"rights"`
	RedistributionStatus string        `json:"redistribution_status"`
	ScientificRole       string        `json:"scientific_role"`
	Delivery             string        `json:"delivery"`
	Note                 string        `json:"note"`
	AssetPath            string        `json:"asset_path,omitempty"`
}

type mediaCard struct {
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	Region           string   `json:"region"`
	PageURL          string   `json:"page_url"`
	ImageID          string   `json:"image_id"`
	Credit           string   `json:"credit"`
	IllustrativeOnly bool     `json:"illustrative_only"`
	CoordinateNote   string   `json:"coordinate_note"`
	RelatedSiteIDs   []string `json:"related_site_ids"`
}

type layerCatalog struct {
	Schema          string      `json:"schema"`
	Note            string      `json:"note"`
	GalleryTermsURL string      `json:"gallery_terms_url"`
	Layers          []layer     `json:"layers"`
	Media           []mediaCard `json:"media"`
}

// Only these hosts may ever be fetched by the asset proxy, and only for the
// exact source_url registered for a "proxy" layer.
var allowedAssetHosts = map[string]bool{"svs.gsfc.nasa.gov": true}

const (
	// Images are small and kept in memory after the first verified fetch.
	maxProxyBytes = 8 << 20
	// 3D models (glTF binary) are larger: they are verified while being
	// written to a disk cache and then streamed from the file, never held in
	// memory (the public API container has 256 MB).
	maxProxyModelBytes = 16 << 20
	modelFormat        = "model/gltf-binary"
	imageFetchTimeout  = 15 * time.Second
	modelFetchTimeout  = 60 * time.Second
	// A slow 3 Mbit/s phone needs about 40 s for 14 MB, longer than the
	// server-wide WriteTimeout; the asset route extends its own deadline.
	modelWriteTimeout = 3 * time.Minute
)

func isModelFormat(f string) bool { return f == modelFormat }

func loadLayers(raw []byte, st *siteStore) (*layerCatalog, error) {
	var c layerCatalog
	if err := decodeStrict(raw, &c); err != nil {
		return nil, fmt.Errorf("parse layers: %w", err)
	}
	if c.Schema != "braspace.layers.v1" {
		return nil, fmt.Errorf("unsupported layers schema %q", c.Schema)
	}
	seen := map[string]bool{}
	for i := range c.Layers {
		l := &c.Layers[i]
		u, err := url.Parse(l.SourceURL)
		switch {
		case !siteIDPattern.MatchString(l.ID) || seen[l.ID]:
			return nil, fmt.Errorf("layer %d: invalid or duplicate id", i)
		case l.Title == "" || l.Attribution == "" || l.Rights == "" || l.Frame == "" || l.Projection == "":
			return nil, fmt.Errorf("layer %s: title, attribution, rights, frame and projection are required", l.ID)
		case err != nil || u.Scheme != "https":
			return nil, fmt.Errorf("layer %s: source_url must be https", l.ID)
		case !sha256Pattern.MatchString(l.SHA256) || l.Bytes <= 0:
			return nil, fmt.Errorf("layer %s: sha256 and bytes are required", l.ID)
		case l.ScientificRole != "visualization_only" && l.ScientificRole != "science_source":
			return nil, fmt.Errorf("layer %s: invalid scientific_role", l.ID)
		case l.Delivery != "proxy" && l.Delivery != "external":
			return nil, fmt.Errorf("layer %s: delivery must be proxy or external", l.ID)
		}
		if l.Delivery == "proxy" {
			isImage := strings.HasPrefix(l.Format, "image/") && l.Bytes <= maxProxyBytes
			isModel := isModelFormat(l.Format) && l.Kind == "visual_model_3d" && l.Bytes <= maxProxyModelBytes
			if !allowedAssetHosts[u.Host] || l.ScientificRole != "visualization_only" || !(isImage || isModel) {
				return nil, fmt.Errorf("layer %s: only small visualization images or 3D visual models from allowed hosts can be proxied", l.ID)
			}
			l.AssetPath = "/api/layers/" + l.ID + "/asset"
		}
		seen[l.ID] = true
	}
	for i := range c.Media {
		m := &c.Media[i]
		if m.ID == "" || m.Title == "" || m.Credit == "" || !strings.HasPrefix(m.PageURL, "https://") {
			return nil, fmt.Errorf("media %d: id, title, credit and https page_url are required", i)
		}
		if m.RelatedSiteIDs == nil {
			m.RelatedSiteIDs = []string{}
		}
		for _, id := range m.RelatedSiteIDs {
			if _, ok := st.site(id); !ok {
				return nil, fmt.Errorf("media %s: unknown site %q", m.ID, id)
			}
		}
	}
	return &c, nil
}

// assetCache fetches a registered asset once and verifies size and SHA-256.
// Images (small) are kept in memory; 3D models are written to a disk cache
// while being hashed and served from the file. Failures are not cached, so a
// later request can retry.
type assetCache struct {
	client *http.Client
	mu     sync.Mutex
	data   map[string][]byte
	// dir holds model files named <sha256>.glb. Cache hits are rechecked:
	// a matching filename or byte count alone is not integrity evidence.
	dir     string
	fetchMu sync.Mutex // one model download at a time: no thundering herd on first use
}

var errAssetUnavailable = errors.New("asset unavailable")

func defaultAssetCacheDir() string {
	if d := os.Getenv("ASSET_CACHE_DIR"); d != "" {
		return d
	}
	return filepath.Join(os.TempDir(), "braspace-asset-cache")
}

func newAssetCache() *assetCache {
	// Never follow redirects from the registered NASA asset URL. Go's
	// default client follows Location headers across hosts and schemes,
	// bypassing our catalog host allowlist before the checksum is checked.
	// ErrUseLastResponse returns the original 3xx to get(), which rejects it.
	// The deadline is per request (context), because models need longer.
	return &assetCache{
		client: &http.Client{
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		data: map[string][]byte{},
		dir:  defaultAssetCacheDir(),
	}
}

// open performs the checked GET shared by images and models.
func (a *assetCache) open(ctx context.Context, l *layer) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.SourceURL, nil)
	if err != nil {
		return nil, errAssetUnavailable
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, errAssetUnavailable
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, errAssetUnavailable
	}
	// The SHA-256 pin already fixes the bytes; a mismatched type is still refused.
	if ct, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type")); ct != l.Format {
		resp.Body.Close()
		return nil, fmt.Errorf("%w: unexpected content type %q", errAssetUnavailable, ct)
	}
	// A declared length above the registered size is refused before reading.
	if resp.ContentLength > l.Bytes {
		resp.Body.Close()
		return nil, fmt.Errorf("%w: upstream is larger than the registered size", errAssetUnavailable)
	}
	return resp, nil
}

func (a *assetCache) get(ctx context.Context, l *layer) ([]byte, error) {
	a.mu.Lock()
	if b, ok := a.data[l.ID]; ok {
		a.mu.Unlock()
		return b, nil
	}
	a.mu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, imageFetchTimeout)
	defer cancel()
	resp, err := a.open(ctx, l)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, l.Bytes+1))
	if err != nil || int64(len(b)) != l.Bytes {
		return nil, errAssetUnavailable
	}
	sum := sha256.Sum256(b)
	if hex.EncodeToString(sum[:]) != l.SHA256 {
		return nil, fmt.Errorf("%w: checksum mismatch", errAssetUnavailable)
	}
	a.mu.Lock()
	a.data[l.ID] = b
	a.mu.Unlock()
	return b, nil
}

// openVerifiedModel checks the actual file descriptor that would be served.
// Reject links and non-regular files and hash with bounded memory.
func openVerifiedModel(name string, l *layer) (*os.File, error) {
	fi, err := os.Lstat(name)
	if err != nil || !fi.Mode().IsRegular() || fi.Size() != l.Bytes {
		return nil, errAssetUnavailable
	}
	f, err := os.Open(name)
	if err != nil {
		return nil, errAssetUnavailable
	}
	opened, err := f.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(fi, opened) {
		f.Close()
		return nil, errAssetUnavailable
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, l.Bytes+1))
	if err != nil || n != l.Bytes || hex.EncodeToString(h.Sum(nil)) != l.SHA256 {
		f.Close()
		return nil, errAssetUnavailable
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		f.Close()
		return nil, errAssetUnavailable
	}
	return f, nil
}

// modelPath returns the verified disk copy of a model layer, downloading it
// on first use. Memory use is one 32 KiB copy buffer, not the file size.
func (a *assetCache) modelPath(ctx context.Context, l *layer) (string, error) {
	final := filepath.Join(a.dir, l.SHA256+".glb")
	if f, err := openVerifiedModel(final, l); err == nil {
		f.Close()
		return final, nil
	}
	a.fetchMu.Lock()
	defer a.fetchMu.Unlock()
	if f, err := openVerifiedModel(final, l); err == nil {
		f.Close()
		return final, nil // another request finished the download while we waited
	}
	if err := os.MkdirAll(a.dir, 0o755); err != nil {
		return "", fmt.Errorf("%w: cache dir: %v", errAssetUnavailable, err)
	}
	ctx, cancel := context.WithTimeout(ctx, modelFetchTimeout)
	defer cancel()
	resp, err := a.open(ctx, l)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	tmp, err := os.CreateTemp(a.dir, "dl-*.part")
	if err != nil {
		return "", fmt.Errorf("%w: cache file: %v", errAssetUnavailable, err)
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(resp.Body, l.Bytes+1))
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil || n != l.Bytes {
		return "", errAssetUnavailable
	}
	if hex.EncodeToString(h.Sum(nil)) != l.SHA256 {
		return "", fmt.Errorf("%w: checksum mismatch", errAssetUnavailable)
	}
	if err := os.Rename(tmp.Name(), final); err != nil {
		return "", errAssetUnavailable
	}
	return final, nil
}

type layersAPI struct {
	catalog *layerCatalog
	byID    map[string]*layer
	assets  *assetCache
	store   *siteStore
}

func newLayersAPI(c *layerCatalog, st *siteStore) *layersAPI {
	l := &layersAPI{catalog: c, byID: map[string]*layer{}, assets: newAssetCache(), store: st}
	for i := range c.Layers {
		l.byID[c.Layers[i].ID] = &c.Layers[i]
	}
	return l
}

func (l *layersAPI) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/layers", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"api_version": missionAPIVersion, "note": l.catalog.Note, "layers": l.catalog.Layers})
	})
	mux.HandleFunc("GET /api/layers/{id}", func(w http.ResponseWriter, r *http.Request) {
		ly, ok := l.byID[r.PathValue("id")]
		if !ok {
			writeError(w, errf(http.StatusNotFound, "LAYER_NOT_FOUND", "unknown layer"))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"api_version": missionAPIVersion, "layer": ly})
	})
	mux.HandleFunc("GET /api/layers/{id}/asset", l.asset)
	mux.HandleFunc("GET /api/sites/{id}/media", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if _, ok := l.store.site(id); !siteIDPattern.MatchString(id) || !ok {
			writeError(w, errf(http.StatusNotFound, "SITE_NOT_FOUND", "unknown site"))
			return
		}
		cards := []mediaCard{}
		for _, m := range l.catalog.Media {
			for _, s := range m.RelatedSiteIDs {
				if s == id {
					cards = append(cards, m)
				}
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"api_version": missionAPIVersion, "site_id": id, "terms_url": l.catalog.GalleryTermsURL,
			"note": "Links to original LROC pages; no image is copied. Illustrative context only, not landing coordinates.", "media": cards})
	})
}

func (l *layersAPI) asset(w http.ResponseWriter, r *http.Request) {
	ly, ok := l.byID[r.PathValue("id")]
	if !ok {
		writeError(w, errf(http.StatusNotFound, "LAYER_NOT_FOUND", "unknown layer"))
		return
	}
	if ly.Delivery != "proxy" {
		writeError(w, errf(http.StatusNotFound, "LAYER_NOT_PROXIED", "this layer is linked at its source_url, not served here"))
		return
	}
	setAssetHeaders := func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", ly.Format)
		w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
		w.Header().Set("ETag", `"`+ly.SHA256+`"`)
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	}
	unavailable := func() {
		writeError(w, errf(http.StatusBadGateway, "LAYER_UNAVAILABLE", "registered source could not be fetched or failed its checksum; use the fallback rendering"))
	}
	if isModelFormat(ly.Format) {
		path, err := l.assets.modelPath(r.Context(), ly)
		if err != nil {
			unavailable()
			return
		}
		f, err := openVerifiedModel(path, ly)
		if err != nil {
			unavailable()
			return
		}
		defer f.Close()
		// Slow clients: extend this response's own write deadline (the
		// server-wide 30 s would cut a 14 MB body on a 3 Mbit/s link).
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(modelWriteTimeout))
		setAssetHeaders(w)
		// ServeContent streams from the file, answers If-None-Match with 304
		// (the ETag is the registered SHA-256) and supports Range requests.
		http.ServeContent(w, r, "", time.Time{}, f)
		return
	}
	b, err := l.assets.get(r.Context(), ly)
	if err != nil {
		unavailable()
		return
	}
	setAssetHeaders(w)
	_, _ = w.Write(b)
}

// registerLayers mounts the layer routes using the embedded catalog.
func registerLayers(mux *http.ServeMux, st *siteStore) {
	raw, err := embeddedSiteData.ReadFile("sitedata/layers.json")
	if err != nil {
		panic(fmt.Errorf("layers: %w", err))
	}
	c, err := loadLayers(raw, st)
	if err != nil {
		panic(err)
	}
	newLayersAPI(c, st).register(mux)
}
