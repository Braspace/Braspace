package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestSkyRouteFields(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?hours=6", "")
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	var v struct {
		SiteID          string               `json:"site_id"`
		ScienceStatus   string               `json:"science_status"`
		ObserverHeightM float64              `json:"observer_height_m"`
		TerrainHorizon  []map[string]float64 `json:"terrain_horizon"`
		Samples         []map[string]any     `json:"samples"`
	}
	raw := decode(t, rec)
	for _, k := range []string{"api_version", "site_id", "science_status", "scientifically_validated", "provenance", "observer_height_m", "terrain_horizon", "samples"} {
		if _, ok := raw[k]; !ok {
			t.Errorf("missing %s", k)
		}
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &v)
	if v.SiteID != "synthetic-demo-a" || v.ScienceStatus != "SYNTHETIC" || v.ObserverHeightM != 2 {
		t.Errorf("header: %+v", v)
	}
	if len(v.TerrainHorizon) != 72 || len(v.Samples) != 6 {
		t.Fatalf("horizon %d samples %d", len(v.TerrainHorizon), len(v.Samples))
	}
	smp := v.Samples[0]
	for _, k := range []string{"epoch_utc", "sun", "earth", "sun_visible", "earth_visible", "sun_margin_deg", "earth_margin_deg"} {
		if _, ok := smp[k]; !ok {
			t.Errorf("sample missing %s", k)
		}
	}
	for _, k := range []string{"sun", "earth"} {
		d := smp[k].(map[string]any)
		if _, ok := d["azimuth_deg"]; !ok {
			t.Errorf("%s without azimuth_deg", k)
		}
		if _, ok := d["elevation_deg"]; !ok {
			t.Errorf("%s without elevation_deg", k)
		}
	}
	// Angles are the stored ones, untouched.
	st, _ := loadDefaultStore()
	ser, _ := st.seriesFor("synthetic-demo-a")
	got := smp["sun"].(map[string]any)["azimuth_deg"].(float64)
	if got != ser.Samples[0].Sun.AzimuthDeg {
		t.Errorf("sun az %v != stored %v", got, ser.Samples[0].Sun.AzimuthDeg)
	}
}

func TestSkyNoSeries(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "GET", "/api/sites/haworth/sky", "")
	if rec.Code != 404 || decode(t, rec)["code"] != "NO_SERIES_DATA" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	rec = do(h, "GET", "/api/sites/atlantis/sky", "")
	if rec.Code != 404 || decode(t, rec)["code"] != "SITE_NOT_FOUND" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestSkyLimits(t *testing.T) {
	h, _ := testAPI(t, "ok")
	for _, tc := range []struct {
		q, code string
	}{
		{"hours=721", "INVALID_DURATION"},
		{"hours=0", "INVALID_DURATION"},
		{"hours=abc", "INVALID_DURATION"},
		{"step=1800", "INVALID_STEP"},
		{"start=2026-11-01T00:30:00Z", "GRID_NOT_ALIGNED"},
		{"start=2026-10-01T00:00:00Z", "OUTSIDE_COVERAGE"},
		{"start=2027-06-01T00:00:00Z", "OUTSIDE_COVERAGE"},
		{"start=garbage", "INVALID_TIME"},
	} {
		rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?"+tc.q, "")
		if rec.Code != 422 || decode(t, rec)["code"] != tc.code {
			t.Errorf("%s: %d %s", tc.q, rec.Code, rec.Body.String())
		}
	}
}

// The sample cap must bite: with a series step of 60 s a 720 h window is 43200 samples.
func TestSkySampleCap(t *testing.T) {
	h, api := testAPI(t, "ok")
	ser, _ := api.store.seriesFor("synthetic-demo-a")
	fine := *ser
	fine.StepSeconds, fine.step = 60, 60*1e9
	fine.Samples = make([]seriesSample, 2000)
	for i := range fine.Samples {
		fine.Samples[i] = ser.Samples[0]
	}
	api.store.series["synthetic-demo-a"] = &fine
	t.Cleanup(func() { api.store.series["synthetic-demo-a"] = ser })
	rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?hours=24", "") // 1440 samples
	if rec.Code != 422 || decode(t, rec)["code"] != "WINDOW_TOO_LONG" {
		t.Fatalf("%d %.200s", rec.Code, rec.Body.String())
	}
	// A coarser step brings the same window under the limit. 180 samples, not 720: every sample starts the
	// fake engine (a shell script, about 26 ms each), and 720 of them took 19.1 s alone and more than the
	// 20 s request deadline under -race, which failed the build gate on a loaded machine.
	rec = do(h, "GET", "/api/sites/synthetic-demo-a/sky?hours=24&step=480", "")
	if rec.Code != 200 || len(decode(t, rec)["samples"].([]any)) != 180 {
		t.Fatalf("%d %.200s", rec.Code, rec.Body.String())
	}
}

func TestSkyStepPicksStoredSamples(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?hours=12&step=14400", "")
	if rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	s := decode(t, rec)["samples"].([]any)
	if len(s) != 3 || s[1].(map[string]any)["epoch_utc"] != "2026-11-01T04:00:00Z" {
		t.Fatalf("%v", s)
	}
}

func TestSkyNeverValidated(t *testing.T) {
	h, api := testAPI(t, "ok")
	for _, id := range []string{"synthetic-demo-a", "synthetic-demo-b"} {
		rec := do(h, "GET", "/api/sites/"+id+"/sky?hours=2", "")
		if got := decode(t, rec)["scientifically_validated"]; got != false {
			t.Errorf("%s: unsafe attestation %v", id, got)
		}
		if st := decode(t, rec)["science_status"]; rec.Code != 200 || st == "VALIDATED" || st != api.store.series[id].ScienceStatus {
			t.Errorf("%s: %d status %v", id, rec.Code, st)
		}
	}
	// Even when the engine reports VALIDATED the route does not promote the series.
	h2, _ := testAPI(t, "ok")
	req := httptest.NewRequest("GET", "/api/sites/synthetic-demo-a/sky", nil)
	rr := httptest.NewRecorder()
	h2.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK || decode(t, rr)["science_status"] != "SYNTHETIC" {
		t.Fatal(rr.Body.String())
	}
	rec := do(h, "POST", "/api/sites/synthetic-demo-a/sky", "{}")
	if rec.Code == 200 {
		t.Fatal("route must be read-only")
	}
}

func TestSkyEngineUnavailable(t *testing.T) {
	h, _ := testAPI(t, "")
	if rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky", ""); rec.Code != 503 {
		t.Fatalf("%d", rec.Code)
	}
}

func TestSkyContractSchema(t *testing.T) {
	_, raw := loadSpec(t)
	h, _ := testAPI(t, "ok")
	for url, status := range map[string]int{
		"/api/sites/synthetic-demo-a/sky?hours=3": 200,
		"/api/sites/haworth/sky":                  404,
		"/api/sites/synthetic-demo-a/sky?step=7":  422,
	} {
		rec := do(h, "GET", url, "")
		if rec.Code != status {
			t.Fatalf("%s: %d", url, rec.Code)
		}
		var v any
		_ = json.Unmarshal(rec.Body.Bytes(), &v)
		for _, e := range validateSchema(raw, responseSchema(t, raw, "/api/sites/{id}/sky", "get", status), v, url) {
			t.Error(e)
		}
	}
}

// Same bytes from the embedded files and from PostgreSQL (needs TEST_DATABASE_URL).
func TestDBSkySameAnswers(t *testing.T) {
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
	for _, id := range []string{"synthetic-demo-a", "synthetic-demo-b"} {
		for _, q := range []string{"", "?hours=48&step=7200", "?start=2026-11-05T00:00:00Z&hours=10"} {
			a := do(serve(embedded), "GET", "/api/sites/"+id+"/sky"+q, "")
			b := do(serve(fromDB), "GET", "/api/sites/"+id+"/sky"+q, "")
			if a.Code != 200 || !reflect.DeepEqual(a.Body.String(), b.Body.String()) {
				t.Errorf("%s%s: %d vs %d, bodies differ", id, q, a.Code, b.Code)
			}
		}
	}
	if a, b := do(serve(embedded), "GET", "/api/sites/haworth/sky", ""), do(serve(fromDB), "GET", "/api/sites/haworth/sky", ""); a.Code != 404 || a.Body.String() != b.Body.String() {
		t.Error("no-series answers differ")
	}
}

// A duration that is not a whole multiple of the series step is rejected, never rounded up.
func TestSkyDurationMustBeOnGrid(t *testing.T) {
	h, _ := testAPI(t, "ok")
	for _, q := range []string{"hours=0.01", "hours=0.5", "hours=1.5"} {
		rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?"+q, "")
		if rec.Code != 422 || decode(t, rec)["code"] != "GRID_NOT_ALIGNED" {
			t.Errorf("%s: %d %.200s", q, rec.Code, rec.Body.String())
		}
	}
	rec := do(h, "GET", "/api/sites/synthetic-demo-a/sky?hours=3", "")
	if rec.Code != 200 || len(decode(t, rec)["samples"].([]any)) != 3 {
		t.Fatalf("%d %.200s", rec.Code, rec.Body.String())
	}
}
