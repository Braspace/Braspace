package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestRequestEngineBudget(t *testing.T) {
	h, _ := testAPI(t, "ok")
	old := maxEngineCallsPerRequest
	maxEngineCallsPerRequest = 100
	defer func() { maxEngineCallsPerRequest = old }()
	rec := do(h, "POST", "/api/compare", `{"site_ids":["synthetic-demo-a","synthetic-demo-b"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":72}`)
	if rec.Code != 422 || decode(t, rec)["code"] != "TOO_MANY_EVALUATIONS" {
		t.Fatalf("144 evaluations over a budget of 100: %d %s", rec.Code, rec.Body.String())
	}
	// Overlapping delay windows hit the cache and do not count twice.
	maxEngineCallsPerRequest = 72 + 24 + 72
	rec = do(h, "POST", "/api/scenarios/delay", strings.Replace(scenarioBody, `"duration_hours":72`, `"duration_hours":72,"delays_hours":[24],"include_nearby":true,"max_nearby":1`, 1))
	if rec.Code != 200 {
		t.Fatalf("96 baseline+delay samples plus 72 nearby fit a budget of 168: %d %s", rec.Code, rec.Body.String())
	}
}

func TestClientCancelIsNotAnEngineError(t *testing.T) {
	h, _ := testAPI(t, "ok")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest("POST", "/api/compare", strings.NewReader(`{"site_ids":["synthetic-demo-a"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":24}`)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 499 || decode(t, rec)["code"] != "REQUEST_CANCELED" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestNearbyWithDifferentObserverHeightIsNotCompared(t *testing.T) {
	a, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	b, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-b.json")
	b10 := strings.Replace(string(b), `"observer_height_m":2`, `"observer_height_m":10`, 1)
	cat := `{"schema":"braspace.site-catalog.v1","note":"","sites":[
		{"id":"synthetic-demo-a","name":"A","kind":"synthetic_test_fixture","series_file":"a.json","series_sha256":"` + sha256Hex(a) + `","nearby":["synthetic-demo-b"]},
		{"id":"synthetic-demo-b","name":"B","kind":"synthetic_test_fixture","series_file":"b.json","series_sha256":"` + sha256Hex([]byte(b10)) + `"}]}`
	st, err := loadStore(fstest.MapFS{"catalog.json": {Data: []byte(cat)}, "a.json": {Data: a}, "b.json": {Data: []byte(b10)}})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	(&missionAPI{store: st, engine: newEngineClient(testEngineBin)}).register(mux)
	rec := do(mux, "POST", "/api/scenarios/delay", strings.Replace(scenarioBody, `"duration_hours":72`, `"duration_hours":72,"delays_hours":[24]`, 1))
	var out struct {
		Options []scenarioOption `json:"options"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	last := out.Options[len(out.Options)-1]
	if rec.Code != 200 || last.Kind != "nearby_site" || last.DataStatus != "OBSERVER_HEIGHT_MISMATCH" || last.Admissible || last.Metrics != nil {
		t.Fatalf("%d %+v", rec.Code, last)
	}
}

func TestPowerChecksAgreeWithOnboardVerdict(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "POST", "/api/scenarios/delay", readExample(t, "scenario-delay-resources.request.json"))
	var out struct {
		Options []scenarioOption `json:"options"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	for _, o := range out.Options {
		if o.Onboard == nil {
			continue
		}
		powerOK := true
		for _, c := range o.Checks {
			switch c.Criterion {
			case "min_battery_charge_wh", "unserved_energy_wh", "longest_earth_obstruction_hours":
				powerOK = powerOK && c.Passed
			}
		}
		if powerOK != (o.Onboard.SimulationStatus == "CONSTRAINTS_MET") {
			t.Errorf("%s +%gh: checks pass=%v but onboard says %s", o.Kind, o.DelayHours, powerOK, o.Onboard.SimulationStatus)
		}
	}
}

func TestSubSecondSeriesStartRejected(t *testing.T) {
	a, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	bad := strings.Replace(string(a), `"start_utc":"2026-11-01T00:00:00Z"`, `"start_utc":"2026-11-01T00:00:00.5Z"`, 1)
	if bad == string(a) {
		t.Fatal("replacement did not apply")
	}
	cat := `{"schema":"braspace.site-catalog.v1","note":"","sites":[{"id":"synthetic-demo-a","name":"A","kind":"k","series_file":"a.json","series_sha256":"` + sha256Hex([]byte(bad)) + `"}]}`
	if _, err := loadStore(fstest.MapFS{"catalog.json": {Data: []byte(cat)}, "a.json": {Data: []byte(bad)}}); err == nil || !strings.Contains(err.Error(), "whole second") {
		t.Fatalf("sub-second start_utc must be rejected for that reason, got %v", err)
	}
}
