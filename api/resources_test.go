package main

import (
	"encoding/json"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func crew(o2, food, reserve float64, aboard bool) *crewSpec {
	return &crewSpec{Size: 2, O2StockKg: o2, FoodStockKg: food, O2KgPerPersonDay: 0.84, FoodKgPerPersonDay: 1.76,
		ReserveHours: reserve, AboardDuringDelay: aboard, RateSource: "test values"}
}

var t0 = time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)

func TestConsumablesUnknownWithoutCrew(t *testing.T) {
	if r := consumables(nil, t0, 72, 0); r.Status != "UNKNOWN" || len(r.Items) != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestConsumablesBoundaries(t *testing.T) {
	// 2 crew x 0.84 kg/day = 0.07 kg/h; 72 h needs exactly 5.04 kg.
	r := consumables(crew(5.04, 100, 0, false), t0, 72, 0)
	o2 := r.Items[0]
	if math.Abs(o2.MarginHours) > 1e-6 || o2.Status != "OK" || o2.DepletionUTC != nil {
		t.Fatalf("stock that lasts exactly the window must pass with zero reserve: %+v", o2)
	}
	r = consumables(crew(5.04, 100, 1, false), t0, 72, 0)
	if r.Items[0].Status != "BELOW_RESERVE" || r.Status != "WARNING" || r.Risks[0].Category != "OXYGEN_RESERVE" {
		t.Fatalf("zero margin with a 1 h reserve must warn: %+v", r)
	}
	r = consumables(crew(500, 100, 0, false), t0, 72, 0)
	if r.Items[0].DepletionUTC != nil || r.Items[0].AutonomyHours <= 72 {
		t.Fatalf("stock beyond the window has no depletion time: %+v", r.Items[0])
	}
	r = consumables(crew(3.5, 100, 0, false), t0, 72, 0)
	if r.Status != "CRITICAL" || r.Items[0].DepletionUTC == nil || *r.Items[0].DepletionUTC != "2026-12-03T02:00:00Z" {
		t.Fatalf("3.5 kg at 0.07 kg/h lasts 50 h: %+v", r.Items[0])
	}
}

func TestConsumablesDelayAboard(t *testing.T) {
	waiting := consumables(crew(6, 100, 0, true), t0, 72, 24)
	notAboard := consumables(crew(6, 100, 0, false), t0, 72, 24)
	if waiting.Items[0].UsedDuringDelayKg != 1.68 || notAboard.Items[0].UsedDuringDelayKg != 0 {
		t.Fatalf("delay use: %+v / %+v", waiting.Items[0], notAboard.Items[0])
	}
	if waiting.Items[0].Status != "DEPLETED_BEFORE_END" || notAboard.Items[0].Status != "OK" {
		t.Fatal("waiting aboard must consume the stock before the window")
	}
	// 1 kg at 0.07 kg/h lasts 14.29 h of a 48 h wait: depletes during the delay.
	empty := consumables(crew(1, 100, 0, true), t0, 72, 48)
	rate := 0.07
	want := t0.Add(-48 * time.Hour).Add(time.Duration(1 / rate * float64(time.Hour))).UTC().Format(time.RFC3339)
	if empty.Items[0].Status != "DEPLETED_DURING_DELAY" || empty.Items[0].StockAtStartKg != 0 || *empty.Items[0].DepletionUTC != want {
		t.Fatalf("stock used up during the delay: %+v (want depletion %s)", empty.Items[0], want)
	}
	if !strings.Contains(empty.Risks[0].Explanation, "before the window starts") {
		t.Fatalf("explanation: %s", empty.Risks[0].Explanation)
	}
}

func readExample(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "examples", "mission", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestSiteOnboardAdapter(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := readExample(t, "onboard-site-evaluate.request.json")
	a, b := do(h, "POST", "/api/onboard/site-evaluate", body), do(h, "POST", "/api/onboard/site-evaluate", body)
	if a.Code != 200 || a.Body.String() != b.Body.String() {
		t.Fatalf("not deterministic: %d %s", a.Code, a.Body.String())
	}
	var out struct {
		Candidates []candidateSource `json:"candidates"`
		Combined   map[string]any    `json:"combined_decision"`
		Onboard    struct {
			ScienceStatus string `json:"science_status"`
			Options       []struct {
				SourceClaim string `json:"source_claim_unverified"`
				Timeline    []struct {
					SunVisible   bool `json:"sun_visible"`
					EarthVisible bool `json:"earth_visible"`
				} `json:"timeline"`
			} `json:"options"`
		} `json:"onboard"`
	}
	if err := json.Unmarshal(a.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Onboard.ScienceStatus != "UNVERIFIED_INPUTS" || !strings.Contains(out.Onboard.Options[0].SourceClaim, "SYNTHETIC-HORIZON-NOT-NASA") {
		t.Fatalf("provenance not forwarded: %+v", out.Onboard.Options[0].SourceClaim)
	}
	if out.Candidates[1].StartUTC != "2026-12-03T00:00:00Z" || out.Candidates[1].Consumables.Items[0].UsedDuringDelayKg == 0 {
		t.Fatalf("delayed candidate: %+v", out.Candidates[1])
	}
	if out.Combined["candidate_id"] != "B-planned" {
		t.Fatalf("combined decision must require consumables too: %v", out.Combined)
	}
	// The adapted booleans must equal the compare endpoint's hourly series.
	cmp := do(h, "POST", "/api/compare", `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":72,"include_series":true}`)
	var c struct {
		Results []struct {
			Evaluation evaluation `json:"evaluation"`
		} `json:"results"`
	}
	_ = json.Unmarshal(cmp.Body.Bytes(), &c)
	tl := out.Onboard.Options[0].Timeline
	for i, p := range c.Results[0].Evaluation.Series {
		if tl[i].SunVisible != p.SunVisible || tl[i].EarthVisible != p.EarthVisible {
			t.Fatalf("sample %d differs between adapter and compare", i)
		}
	}
}

func TestSiteOnboardRejectsMissingOrPartialData(t *testing.T) {
	h, _ := testAPI(t, "ok")
	base := readExample(t, "onboard-site-evaluate.request.json")
	r := func(old, new string) string { return strings.Replace(base, old, new, 1) }
	cases := []struct {
		name, body, code string
		status           int
	}{
		{"site without series", r(`"site_id": "synthetic-demo-b"`, `"site_id": "malapert-massif"`), "DATA_NOT_AVAILABLE", 422},
		{"past series end", r(`"delay_hours": 48`, `"delay_hours": 700`), "OUTSIDE_COVERAGE", 422},
		{"over onboard sample limit", r(`"duration_hours": 72`, `"duration_hours": 500`), "WINDOW_TOO_LONG", 422},
		{"unknown site", r(`"site_id": "synthetic-demo-b"`, `"site_id": "atlantis"`), "SITE_NOT_FOUND", 404},
		{"duplicate id", r(`"id": "B-planned"`, `"id": "A-planned"`), "INVALID_CANDIDATES", 422},
		{"crew without rate source", r(`"rate_source": "Example`, `"rate_source": " ", "x": "`), "INVALID_JSON", 400},
		{"blank rate source", strings.Replace(base, readRateSource(base), " ", 1), "INVALID_CREW", 422},
		{"battery reserve above capacity", r(`"reserve_wh": 4000`, `"reserve_wh": 40000`), "INVALID_SCENARIO", 422},
	}
	for _, tc := range cases {
		rec := do(h, "POST", "/api/onboard/site-evaluate", tc.body)
		if rec.Code != tc.status || decode(t, rec)["code"] != tc.code {
			t.Errorf("%s: got %d %s", tc.name, rec.Code, rec.Body.String())
		}
	}
}

func readRateSource(body string) string {
	i := strings.Index(body, `"rate_source": "`) + len(`"rate_source": "`)
	return body[i : i+strings.Index(body[i:], `"`)]
}

func TestSiteOnboardGridMismatch(t *testing.T) {
	a, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	b, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-b.json")
	b30 := strings.Replace(string(b), `"step_seconds":3600`, `"step_seconds":1800`, 1)
	cat := `{"schema":"braspace.site-catalog.v1","note":"","sites":[
		{"id":"synthetic-demo-a","name":"A","kind":"synthetic_test_fixture","series_file":"a.json"},
		{"id":"synthetic-demo-b","name":"B","kind":"synthetic_test_fixture","series_file":"b.json"}]}`
	st, err := loadStore(fstest.MapFS{"catalog.json": {Data: []byte(cat)}, "a.json": {Data: a}, "b.json": {Data: []byte(b30)}})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	(&missionAPI{store: st, engine: newEngineClient(testEngineBin)}).register(mux)
	// Halving the step halves B's coverage, so use an early window both series cover.
	body := strings.Replace(readExample(t, "onboard-site-evaluate.request.json"), `"duration_hours": 72`, `"duration_hours": 24`, 1)
	body = strings.Replace(body, "2026-12-01T00:00:00Z", "2026-11-05T00:00:00Z", 1)
	if rec := do(mux, "POST", "/api/onboard/site-evaluate", body); rec.Code != 422 || decode(t, rec)["code"] != "GRID_MISMATCH" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestDelayScenarioWithResources(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := readExample(t, "scenario-delay-resources.request.json")
	rec := do(h, "POST", "/api/scenarios/delay", body)
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Options []scenarioOption `json:"options"`
		Outcome scenarioOutcome  `json:"outcome"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	base, delayed := out.Options[0], out.Options[1]
	if base.Onboard == nil || base.Consumables == nil {
		t.Fatal("baseline must carry onboard and consumables results")
	}
	names := map[string]constraintCheck{}
	for _, c := range delayed.Checks {
		names[c.Criterion] = c
	}
	for _, want := range []string{"oxygen_margin_hours", "food_margin_hours", "min_battery_charge_wh", "unserved_energy_wh", "longest_earth_obstruction_hours"} {
		c, ok := names[want]
		if !ok || c.BaselineValue == nil {
			t.Fatalf("%s missing or without baseline value: %+v", want, delayed.Checks)
		}
	}
	if names["oxygen_margin_hours"].Value >= *names["oxygen_margin_hours"].BaselineValue {
		t.Fatal("waiting aboard for 24 h must reduce the oxygen margin")
	}
	if out.Outcome.Status != "ALTERNATIVE_FOUND" || out.Outcome.FirstAdmissible.Kind != "nearby_site" {
		t.Fatalf("outcome: %+v", out.Outcome)
	}

	for name, b := range map[string]string{
		"power without blackout": strings.Replace(body, `"max_comm_blackout_hours": 24,`, ``, 1),
		"blackout above window":  strings.Replace(body, `"max_comm_blackout_hours": 24,`, `"max_comm_blackout_hours": 100,`, 1),
		"crew size zero":         strings.Replace(body, `"size": 2`, `"size": 0`, 1),
	} {
		if rec := do(h, "POST", "/api/scenarios/delay", b); rec.Code != 422 {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body.String())
		}
	}
}
