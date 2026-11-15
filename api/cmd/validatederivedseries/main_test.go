package main

import (
	"errors"
	"math"
	"os"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// Regression tests for NASA-derived source integrity and honesty (port of
// tests/test_derived_series_integrity.py).

func TestMain(m *testing.M) {
	// go test runs in the package directory; point the pinned paths at the repository files.
	seriesPath = "../../sitedata/series/connecting-ridge-NAIF-PRELIMINARY.json"
	metaPath = "../../../science/evidence/connecting-ridge-NAIF-PRELIMINARY.metadata.json"
	catalogPath = "../../sitedata/catalog.json"
	os.Exit(m.Run())
}

func load(t *testing.T, path string) map[string]any {
	t.Helper()
	raw, err := pyjson.ReadBytes(path)
	if err != nil {
		t.Fatal(err)
	}
	m, err := parseStrict(raw)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func fixtures(t *testing.T) (series, meta, catalog map[string]any) {
	return load(t, seriesPath), load(t, metaPath), load(t, catalogPath)
}

func isIntegrity(err error) bool {
	var ie *IntegrityError
	return errors.As(err, &ie)
}

func TestVerifiedArtifactIsStillExplicitlyUnverifiedScience(t *testing.T) {
	series, _, _ := fixtures(t)
	if err := validateFiles(); err != nil {
		t.Fatal(err)
	}
	pinned, err := readPinned(seriesPath, seriesSHA)
	if err != nil || !pyjson.Equal(pinned, series) {
		t.Fatalf("pinned read differs: %v", err)
	}
}

func TestStatusAndScientificApprovalCannotBeForged(t *testing.T) {
	series, meta, catalog := fixtures(t)
	for _, label := range []string{"VALIDATED", "SYNTHETIC"} {
		source := pyjson.Clone(series).(map[string]any)
		source["science_status"] = label
		if err := validate(source, meta, catalog); !isIntegrity(err) {
			t.Errorf("status %s: %v", label, err)
		}
	}
	for _, key := range []string{"validated_against_independent_reference", "lola_horizon_independently_validated", "nasa_mission_certified"} {
		m := pyjson.Clone(meta).(map[string]any)
		m[key] = true
		if err := validate(series, m, catalog); !isIntegrity(err) {
			t.Errorf("flag %s: %v", key, err)
		}
	}
}

func TestBoundsSamplesFrameAndCatalogGuards(t *testing.T) {
	series, meta, catalog := fixtures(t)
	changes := []func(s map[string]any){
		func(s map[string]any) { pyjson.Set(s, "J2000", "provenance", "frame") },
		func(s map[string]any) { pyjson.Set(s, pyjson.I(91), "samples", 0, "sun", "elevation_deg") },
		func(s map[string]any) { pyjson.Set(s, math.NaN(), "samples", 0, "earth", "azimuth_deg") },
		func(s map[string]any) {
			samples := s["samples"].([]any)
			s["samples"] = samples[:len(samples)-1]
		},
		func(s map[string]any) { pyjson.Set(s, pyjson.I(0), "terrain_horizon", 1, "azimuth_deg") },
	}
	for n, change := range changes {
		altered := pyjson.Clone(series).(map[string]any)
		change(altered)
		if err := validate(altered, meta, catalog); !isIntegrity(err) {
			t.Errorf("change %d: %v", n, err)
		}
	}
	cat := pyjson.Clone(catalog).(map[string]any)
	for _, s := range cat["sites"].([]any) {
		if s.(map[string]any)["id"] == "connecting-ridge" {
			s.(map[string]any)["coordinate"].(map[string]any)["role"] = "landing_site"
		}
	}
	if err := validate(series, meta, cat); !isIntegrity(err) {
		t.Errorf("promoted coordinate: %v", err)
	}
}

func TestCorruptJSONBytesAndDuplicateFields(t *testing.T) {
	for _, raw := range []string{`{"science_status":"UNVERIFIED","science_status":"VALIDATED"}`, `{"value":NaN}`} {
		if _, err := parseStrict([]byte(raw)); !isIntegrity(err) {
			t.Errorf("%s: %v", raw, err)
		}
	}
	if _, err := readPinned(seriesPath, strings.Repeat("0", 64)); !isIntegrity(err) {
		t.Errorf("wrong pin: %v", err)
	}
}
