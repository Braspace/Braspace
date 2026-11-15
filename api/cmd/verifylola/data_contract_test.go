package main

// Go port of tests/test_data_contract.py.

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const dataDir = "../../../data"

func loadJSON(t *testing.T, name string, v any) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(dataDir, name))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, v); err != nil {
		t.Fatal(err)
	}
	return raw
}

type fullManifest struct {
	Dataset struct {
		ProductFile string `json:"product_file"`
		Raster      struct {
			Lines, LineSamples, SampleBits, RecordBytes, FileSizeBytes int64
			SampleType                                                string  `json:"sample_type"`
			ScalingFactor                                             float64 `json:"scaling_factor"`
		} `json:"raster"`
		MapProjection struct {
			CoordinateSystemName string `json:"coordinate_system_name"`
		} `json:"map_projection"`
		Coverage struct {
			LatMin float64 `json:"latitude_min_deg"`
			LatMax float64 `json:"latitude_max_deg"`
		} `json:"coverage"`
	} `json:"dataset"`
	Source           map[string]string `json:"source"`
	ScientificStatus struct {
		Integrated bool `json:"integrated_into_braspace"`
	} `json:"scientific_status"`
	Verification struct {
		SHA256 string `json:"sha256"`
	} `json:"verification"`
}

// encoding/json does not map snake_case to these multi-name fields, so read them explicitly.
func rasterInts(t *testing.T, raw []byte) map[string]int64 {
	var m struct {
		Dataset struct {
			Raster map[string]any `json:"raster"`
		} `json:"dataset"`
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	out := map[string]int64{}
	for _, k := range []string{"lines", "line_samples", "sample_bits", "record_bytes", "file_size_bytes"} {
		f, ok := m.Dataset.Raster[k].(float64)
		if !ok {
			t.Fatalf("raster.%s missing", k)
		}
		out[k] = int64(f)
	}
	return out
}

func TestManifestConsistent(t *testing.T) {
	var m fullManifest
	raw := loadJSON(t, "manifest.json", &m)
	r := rasterInts(t, raw)
	if r["lines"]*r["record_bytes"] != r["file_size_bytes"] || r["line_samples"]*r["sample_bits"]/8 != r["record_bytes"] {
		t.Fatal("raster sizes inconsistent")
	}
	if m.Dataset.Raster.SampleType != "LSB_INTEGER" || m.Dataset.Raster.ScalingFactor != 0.5 {
		t.Fatal("sample type/scale changed")
	}
	if m.Dataset.MapProjection.CoordinateSystemName != "MEAN EARTH/POLAR AXIS OF DE421" {
		t.Fatal("frame changed")
	}
	if len(m.Verification.SHA256) != 64 {
		t.Fatal("sha256 not 64 hex chars")
	}
	for _, k := range []string{"image_url", "label_url", "xml_label_url"} {
		u, err := url.Parse(m.Source[k])
		if err != nil || u.Scheme != "https" || u.Hostname() != "pds-geosciences.wustl.edu" {
			t.Fatalf("source.%s = %q", k, m.Source[k])
		}
	}
	if m.ScientificStatus.Integrated {
		t.Fatal("integrated_into_braspace must stay false")
	}
}

func TestVerifierRejectsCorruptionLittleEndian(t *testing.T) {
	var m manifest
	loadJSON(t, "manifest.json", &m)
	raw := make([]byte, 8)
	for i, v := range []int16{1183, -2, 256, 0} {
		binary.LittleEndian.PutUint16(raw[i*2:], uint16(v))
	}
	m.Dataset.Raster.Lines, m.Dataset.Raster.LineSamples, m.Dataset.Raster.FileSizeBytes = 2, 2, 8
	s := sha256.Sum256(raw)
	m.Verification.SHA256 = hex.EncodeToString(s[:])
	p := filepath.Join(t.TempDir(), "fixture.img")
	os.WriteFile(p, raw, 0o600)
	res, err := verify(p, m)
	if err != nil || res.FirstDN != 1183 || res.FirstHeightM != 591.5 {
		t.Fatalf("got %+v %v", res, err)
	}
	os.WriteFile(p, raw[:7], 0o600)
	if _, err := verify(p, m); err == nil || !strings.Contains(err.Error(), "wrong file size") {
		t.Fatalf("truncated: %v", err)
	}
	os.WriteFile(p, append(append([]byte{}, raw[:7]...), 1), 0o600)
	if _, err := verify(p, m); err == nil || !strings.Contains(err.Error(), "SHA-256 mismatch") {
		t.Fatalf("corrupt: %v", err)
	}
}

func TestScenarioAndGalleryClaimBoundaries(t *testing.T) {
	var m fullManifest
	loadJSON(t, "manifest.json", &m)
	var sc struct {
		TerrainManifest string `json:"terrain_manifest"`
		Sites           []struct {
			DemAsset string  `json:"dem_asset"`
			Lat      float64 `json:"latitude_deg"`
			Usable   bool    `json:"usable_for_calculation"`
		} `json:"sites"`
		Epochs []string `json:"epochs_utc"`
	}
	loadJSON(t, "SCENARIOS.json", &sc)
	var g struct {
		DefaultCredit string `json:"default_credit"`
		Cards         []struct {
			Illustrative bool   `json:"illustrative_only"`
			PageURL      string `json:"page_url"`
			Credit       string `json:"credit"`
		} `json:"cards"`
	}
	loadJSON(t, "LUNAR_GALLERY.json", &g)
	if sc.TerrainManifest != "manifest.json" || len(sc.Sites) < 2 || len(sc.Epochs) < 2 {
		t.Fatal("scenario shape")
	}
	for _, s := range sc.Sites {
		if s.DemAsset != m.Dataset.ProductFile || s.Lat < m.Dataset.Coverage.LatMin || s.Lat > m.Dataset.Coverage.LatMax || s.Usable {
			t.Fatalf("site %+v", s)
		}
	}
	for _, e := range sc.Epochs {
		ts, err := time.Parse(time.RFC3339, e)
		if err != nil {
			t.Fatalf("epoch %q: %v", e, err)
		}
		if _, off := ts.Zone(); off != 0 {
			t.Fatalf("epoch %q not UTC", e)
		}
	}
	if len(g.Cards) < 5 {
		t.Fatal("gallery < 5 cards")
	}
	for _, c := range g.Cards {
		if !c.Illustrative || !strings.HasPrefix(c.PageURL, "https://lroc.im-ldi.com/images/") || c.Credit != g.DefaultCredit {
			t.Fatalf("card %+v", c)
		}
	}
}
