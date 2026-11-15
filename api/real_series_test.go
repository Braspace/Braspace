package main

import (
	"strings"
	"testing"
	"testing/fstest"
)

// realSeriesSites are every real catalog site with a stored LOLA + SPICE series (all 14 since 2026-11-15).
var realSeriesSites = []string{"mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton",
	"haworth", "nobile-rim-2", "connecting-ridge-extension", "de-gerlache-rim-1", "de-gerlache-rim-2", "de-gerlache-kocher-massif",
	"leibnitz-beta-plateau", "faustini-rim-a", "amundsen-rim"}

// BR72: every real LOLA+SPICE precomputed series (14 sites) is served as PRELIMINARY, never VALIDATED.
func TestRealSitesSkyPreliminary(t *testing.T) {
	h, _ := productionTestAPI(t, "ok")
	for _, id := range realSeriesSites {
		rec := do(h, "GET", "/api/sites/"+id+"/sky?hours=24", "")
		if rec.Code != 200 {
			t.Fatalf("%s: %d %s", id, rec.Code, rec.Body.String())
		}
		v := decode(t, rec)
		if v["science_status"] != "PRELIMINARY" {
			t.Errorf("%s: science_status = %v, want PRELIMINARY", id, v["science_status"])
		}
		if strings.Contains(rec.Body.String(), `"VALIDATED"`) {
			t.Errorf("%s: response mentions VALIDATED", id)
		}
		p := v["provenance"].(map[string]any)
		note, _ := p["note"].(string)
		if p["terrain_sha256"] == "" || !strings.Contains(note, "source_sha256=") || !strings.Contains(note, "step_seconds=3600") {
			t.Errorf("%s: provenance lacks source/SHA/step: %v", id, p)
		}
		if len(v["samples"].([]any)) != 24 || v["step_seconds"].(float64) != 3600 {
			t.Errorf("%s: want 24 hourly samples", id)
		}
	}
}

func TestFiveRealSitesCompareNeverValidated(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "POST", "/api/compare", `{"site_ids":["malapert-massif","nobile-rim-1"],"start_utc":"2025-03-01T00:00:00Z","duration_hours":48}`)
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	v := decode(t, rec)
	if v["scientifically_validated"] != false {
		t.Errorf("scientifically_validated = %v", v["scientifically_validated"])
	}
	for _, r := range v["results"].([]any) {
		m := r.(map[string]any)
		if m["data_status"] != "AVAILABLE" || m["science_status"] != "PRELIMINARY" {
			t.Errorf("result %v", m)
		}
	}
}

func TestFiveRealSitesDelayScenario(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := strings.Replace(scenarioBody, `"synthetic-demo-a"`, `"peak-near-shackleton"`, 1)
	body = strings.Replace(body, "2026-12-01", "2025-03-01", 1)
	if rec := do(h, "POST", "/api/scenarios/delay", body); rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestEverySeriesIsPinnedAndNeverValidated(t *testing.T) {
	st, err := loadDefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range realSeriesSites {
		s, _ := st.site(id)
		ser, ok := st.seriesFor(id)
		if !ok || !sha256Pattern.MatchString(s.SeriesSHA256) || ser.ScienceStatus == "VALIDATED" {
			t.Errorf("%s: series=%v sha=%q", id, ok, s.SeriesSHA256)
		}
	}
}

// A series whose bytes differ from the catalog SHA-256 must stop the load.
func TestRealSeriesShaMismatchFailsClosed(t *testing.T) {
	good, err := embeddedSiteData.ReadFile("sitedata/series/malapert-massif.json")
	if err != nil {
		t.Fatal(err)
	}
	cat, _ := embeddedSiteData.ReadFile("sitedata/catalog.json")
	tampered := []byte(strings.Replace(string(good), `"azimuth_deg":`, `"azimuth_deg": `, 1))
	fsys := fstest.MapFS{"catalog.json": {Data: cat}}
	for _, id := range append([]string{"synthetic-demo-a", "synthetic-demo-b"}, realSeriesSites...) {
		b, err := embeddedSiteData.ReadFile("sitedata/series/" + id + ".json")
		if err != nil {
			t.Fatal(err)
		}
		fsys["series/"+id+".json"] = &fstest.MapFile{Data: b}
	}
	if _, err := loadStore(fsys); err != nil {
		t.Fatalf("untouched copy must load: %v", err)
	}
	fsys["series/malapert-massif.json"] = &fstest.MapFile{Data: tampered}
	if _, err := loadStore(fsys); err == nil || !strings.Contains(err.Error(), "series_sha256") {
		t.Fatalf("want SHA mismatch failure, got %v", err)
	}
}

// A file that labels itself VALIDATED is still rejected.
func TestPreliminaryCannotBePromoted(t *testing.T) {
	good, _ := embeddedSiteData.ReadFile("sitedata/series/malapert-massif.json")
	var s siteSeries
	if err := decodeStrict(good, &s); err != nil {
		t.Fatal(err)
	}
	s.ScienceStatus = "VALIDATED"
	if err := validateSeries(&s); err == nil {
		t.Fatal("VALIDATED must be rejected")
	}
}
