package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
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

const maxProxyBytes = 8 << 20

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
			if !allowedAssetHosts[u.Host] || l.ScientificRole != "visualization_only" || !strings.HasPrefix(l.Format, "image/") || l.Bytes > maxProxyBytes {
				return nil, fmt.Errorf("layer %s: only small visualization images from allowed hosts can be proxied", l.ID)
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

// assetCache fetches a registered asset once, verifies size and SHA-256, and
// keeps it in memory. Failures are not cached, so a later request can retry.
type assetCache struct {
	client *http.Client
	mu     sync.Mutex
	data   map[string][]byte
}

var errAssetUnavailable = errors.New("asset unavailable")

func newAssetCache() *assetCache {
	return &assetCache{client: &http.Client{Timeout: 15 * time.Second}, data: map[string][]byte{}}
}

func (a *assetCache) get(ctx context.Context, l *layer) ([]byte, error) {
	a.mu.Lock()
	if b, ok := a.data[l.ID]; ok {
		a.mu.Unlock()
		return b, nil
	}
	a.mu.Unlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.SourceURL, nil)
	if err != nil {
		return nil, errAssetUnavailable
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, errAssetUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errAssetUnavailable
	}
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
	b, err := l.assets.get(r.Context(), ly)
	if err != nil {
		writeError(w, errf(http.StatusBadGateway, "LAYER_UNAVAILABLE", "registered source could not be fetched or failed its checksum; use the fallback rendering"))
		return
	}
	w.Header().Set("Content-Type", ly.Format)
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("ETag", `"`+ly.SHA256+`"`)
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
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
