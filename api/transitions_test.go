package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// withSeries swaps the stored series of synthetic-demo-a for the test.
func withSeries(t *testing.T, api *missionAPI, samples []seriesSample) {
	t.Helper()
	orig, _ := api.store.seriesFor("synthetic-demo-a")
	cp := *orig
	cp.Samples = samples
	api.store.series["synthetic-demo-a"] = &cp
	t.Cleanup(func() { api.store.series["synthetic-demo-a"] = orig })
}

func sample(sunEl, earthEl float64) seriesSample {
	return seriesSample{Sun: direction{AzimuthDeg: 10, ElevationDeg: sunEl}, Earth: direction{AzimuthDeg: 200, ElevationDeg: earthEl}}
}

func nextOf(t *testing.T, h http.Handler, q string) (map[string]any, map[string]any) {
	t.Helper()
	rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?"+q, "")
	if rec.Code != 200 {
		t.Fatalf("%d %.300s", rec.Code, rec.Body.String())
	}
	body := decode(t, rec)
	nt, ok := body["next_transitions"].(map[string]any)
	if !ok {
		t.Fatalf("next_transitions missing: %.300s", rec.Body.String())
	}
	return body, nt
}

func TestSkyNextTransitionsNoChange(t *testing.T) {
	h, api := testAPI(t, "ok")
	s := make([]seriesSample, 48)
	for i := range s {
		s[i] = sample(60, -60) // Sun up, Earth down at every sample
	}
	withSeries(t, api, s)
	_, nt := nextOf(t, h, "hours=24")
	if nt["sun"] != nil || nt["earth"] != nil {
		t.Fatalf("expected null transitions: %v", nt)
	}
	if r, _ := nt["sun_null_reason"].(string); r == "" || r[:18] != "NO_CHANGE_IN_WINDO" {
		t.Errorf("sun reason %q", r)
	}
	if r, _ := nt["earth_null_reason"].(string); r == "" {
		t.Errorf("earth reason empty")
	}
	if nt["resolution_seconds"] != float64(3600) || nt["search_end_utc"] != "2026-11-01T23:00:00Z" {
		t.Errorf("header %v", nt)
	}
}

func TestSkyNextTransitionsOnLastStep(t *testing.T) {
	h, api := testAPI(t, "ok")
	s := make([]seriesSample, 48)
	for i := range s {
		s[i] = sample(60, -60)
	}
	s[23] = sample(-60, 60) // last sample of a 24 h window from the start
	withSeries(t, api, s)
	body, nt := nextOf(t, h, "hours=24")
	for key, kind := range map[string]string{"sun": "sunset", "earth": "earth_rise"} {
		tr, ok := nt[key].(map[string]any)
		if !ok {
			t.Fatalf("%s: no transition %v", key, nt)
		}
		if tr["kind"] != kind || tr["epoch_utc"] != "2026-11-01T23:00:00Z" || tr["last_unchanged_utc"] != "2026-11-01T22:00:00Z" ||
			tr["hours_from_start"] != float64(23) || tr["resolution_seconds"] != float64(3600) {
			t.Errorf("%s: %v", key, tr)
		}
		if nt[key+"_null_reason"] != nil {
			t.Errorf("%s reason should be null", key)
		}
	}
	if body["science_status"] != "SYNTHETIC" {
		t.Errorf("science_status promoted: %v", body["science_status"])
	}
	// One step shorter: the change is outside the window, so null.
	_, nt = nextOf(t, h, "hours=23")
	if nt["sun"] != nil || nt["earth"] != nil {
		t.Errorf("transition beyond window reported: %v", nt)
	}
	// A coarse step still reports the native-step epoch and resolution.
	_, nt = nextOf(t, h, "hours=24&step=14400")
	if tr := nt["sun"].(map[string]any); tr["epoch_utc"] != "2026-11-01T23:00:00Z" || tr["resolution_seconds"] != float64(3600) {
		t.Errorf("coarse step: %v", tr)
	}
	// Rise direction from a later start.
	_, nt = nextOf(t, h, "start=2026-11-01T23:00:00Z&hours=2")
	if tr := nt["sun"].(map[string]any); tr["kind"] != "sunrise" || tr["hours_from_start"] != float64(1) {
		t.Errorf("sunrise: %v", tr)
	}
	if tr := nt["earth"].(map[string]any); tr["kind"] != "earth_set" {
		t.Errorf("earth_set: %v", tr)
	}
}

func TestSkyResponseMatchesSchema(t *testing.T) {
	_, raw := loadSpec(t)
	h, _ := testAPI(t, "ok")
	for _, q := range []string{"hours=24", "hours=720&step=3600"} {
		rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?"+q, "")
		if rec.Code != 200 {
			t.Fatalf("%s: %d", q, rec.Code)
		}
		var v any
		_ = json.Unmarshal(rec.Body.Bytes(), &v)
		for _, e := range validateSchema(raw, responseSchema(t, raw, "/api/sites/{id}/sky", "get", 200), v, q) {
			t.Error(e)
		}
	}
}

func TestDBSkySameAnswer(t *testing.T) {
	db := ingested(t)
	fromDB, err := loadStoreFromDB(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	embedded, _ := loadDefaultStore()
	serve := func(st *siteStore) http.Handler {
		mux := http.NewServeMux()
		(&missionAPI{store: st, engine: newEngineClient(testEngineBin)}).register(mux)
		return mux
	}
	for _, url := range []string{"/api/sites/synthetic-demo-a/sky?hours=72", "/api/sites/synthetic-demo-b/sky?hours=720&step=3600"} {
		a, b := do(serve(embedded), "GET", url, ""), do(serve(fromDB), "GET", url, "")
		if a.Code != 200 || a.Body.String() != b.Body.String() {
			t.Errorf("%s: embedded and postgres responses differ", url)
		}
		if _, ok := decode(t, a)["next_transitions"].(map[string]any); !ok {
			t.Errorf("%s: no next_transitions", url)
		}
	}
}
