package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestScienceGridDoesNotRound(t *testing.T) {
	st, err := loadDefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	ser, ok := st.seriesFor("synthetic-demo-a")
	if !ok {
		t.Fatal("fixture missing")
	}
	start := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	if _, _, ok := span(ser, start, 2); !ok {
		t.Fatal("aligned time rejected")
	}
	for _, tc := range []struct {
		at    time.Time
		hours float64
	}{
		{start.Add(30 * time.Minute), 2},
		{start, 1.5},
		{start.Add(5 * time.Second), 2},
		{start, 0.5},
	} {
		if gridAligned(ser, tc.at, tc.hours) {
			t.Errorf("aligned incorrectly: %+v", tc)
		}
		if _, _, ok := span(ser, tc.at, tc.hours); ok {
			t.Errorf("rounded incorrectly: %+v", tc)
		}
	}
}

func TestScienceGridPublicRoutes(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-12-01T00:30:00Z","duration_hours":2}`
	rec := do(h, "POST", "/api/compare", body)
	if rec.Code != 200 {
		t.Fatalf("compare: %d %s", rec.Code, rec.Body.String())
	}
	result := decode(t, rec)["results"].([]any)[0].(map[string]any)
	if result["data_status"] != "GRID_NOT_ALIGNED" || result["evaluation"] != nil {
		t.Fatalf("off-grid comparison must never report metrics: %v", result)
	}
	rec = do(h, "POST", "/api/compare", strings.Replace(body, "00:30:00", "00:00:00", 1))
	if rec.Code != 200 || decode(t, rec)["results"].([]any)[0].(map[string]any)["data_status"] != "AVAILABLE" {
		t.Fatalf("aligned comparison regressed: %d %s", rec.Code, rec.Body.String())
	}
	delay := `{"site_id":"synthetic-demo-a","start_utc":"2026-12-01T00:30:00Z","duration_hours":2,"constraints":{"min_sun_fraction":0.1}}`
	rec = do(h, "POST", "/api/scenarios/delay", delay)
	if rec.Code != 422 || decode(t, rec)["code"] != "GRID_NOT_ALIGNED" {
		t.Fatalf("off-grid baseline must be rejected: %d %s", rec.Code, rec.Body.String())
	}
	onboardBody := strings.Replace(readExample(t, "onboard-site-evaluate.request.json"),
		"2026-12-01T00:00:00Z", "2026-12-01T00:30:00Z", 1)
	rec = do(h, "POST", "/api/onboard/site-evaluate", onboardBody)
	if rec.Code != 422 || decode(t, rec)["code"] != "GRID_NOT_ALIGNED" {
		t.Fatalf("off-grid onboard evaluation must be rejected: %d %s", rec.Code, rec.Body.String())
	}
}

func TestScienceStoreRejectsUnattestedAndTrailingData(t *testing.T) {
	cat, err := embeddedSiteData.ReadFile("sitedata/catalog.json")
	if err != nil {
		t.Fatal(err)
	}
	_, err = loadStore(fstest.MapFS{"catalog.json": {Data: append(cat, []byte("\n{}")...)}})
	if err == nil {
		t.Fatal("trailing catalog document accepted")
	}
	raw, err := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	if err != nil {
		t.Fatal(err)
	}
	var parsed siteSeries
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatal(err)
	}
	parsed.ScienceStatus = "VALIDATED"
	if err := validateSeries(&parsed); err == nil {
		t.Fatal("fake scientific VALIDATED status accepted")
	}
	var doc siteSeries
	if err := decodeStrict(append(raw, []byte("\n{}")...), &doc); err == nil {
		t.Fatal("trailing series JSON accepted")
	}
}

func TestScienceValidationCannotIgnoreMissingSites(t *testing.T) {
	good := siteResult{DataStatus: "AVAILABLE", ScienceStatus: "VALIDATED", EngineScienceStatus: "VALIDATED"}
	if scientificallyValidated(good, siteResult{DataStatus: "NO_SERIES_DATA"}) {
		t.Fatal("missing site ignored")
	}
	if scientificallyValidated(good, siteResult{DataStatus: "GRID_NOT_ALIGNED"}) {
		t.Fatal("off-grid site ignored")
	}
	if scientificallyValidated() {
		t.Fatal("empty result is not validated")
	}
}

func TestScienceEngineRejectsForgedOutput(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell fixture")
	}
	req := visibilityRequest{
		SiteID: "synthetic", EpochUTC: "2026-11-14T00:00:00Z",
		Sun:            direction{AzimuthDeg: 0, ElevationDeg: 2},
		Earth:          direction{AzimuthDeg: 180, ElevationDeg: -1},
		TerrainHorizon: []horizonSample{{AzimuthDeg: 0, ElevationDeg: 0}, {AzimuthDeg: 180, ElevationDeg: 0}},
		Provenance:     provenance{TerrainDatasetID: "TEST", EphemerisID: "TEST", Frame: "MOON_ME"},
	}
	valid := map[string]any{
		"site_id": req.SiteID, "epoch_utc": req.EpochUTC, "science_status": "UNVERIFIED_INPUTS",
		"sun_horizon_deg": 0, "earth_horizon_deg": 0,
		"sun_margin_deg": 2, "earth_margin_deg": -1,
		"sun_visible": true, "earth_visible": false, "simultaneous_visibility": false,
	}
	cases := map[string]func(map[string]any){
		"self-validated":         func(m map[string]any) { m["science_status"] = "VALIDATED" },
		"wrong-site":             func(m map[string]any) { m["site_id"] = "another-site" },
		"wrong-epoch":            func(m map[string]any) { m["epoch_utc"] = "2025-01-01T00:00:00Z" },
		"missing-margin":         func(m map[string]any) { delete(m, "sun_margin_deg") },
		"falsified-margin":       func(m map[string]any) { m["sun_margin_deg"] = 1.5 },
		"falsified-visibility":   func(m map[string]any) { m["sun_visible"] = false },
		"falsified-simultaneous": func(m map[string]any) { m["simultaneous_visibility"] = true },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			record := map[string]any{}
			for k, v := range valid {
				record[k] = v
			}
			mutate(record)
			b, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(t.TempDir(), "engine.sh")
			script := "#!/bin/sh\nprintf '%s\\n' '" + string(b) + "'\n"
			if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
				t.Fatal(err)
			}
			_, err = newEngineClient(path).call(context.Background(), req)
			if !errors.Is(err, errEngineContract) {
				t.Fatalf("accepted forged engine response %s: %v", name, err)
			}
		})
	}
}
