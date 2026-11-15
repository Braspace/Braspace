package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

var testEngineBin string

// TestMain builds internal/testengine, a stand-in for the Rust CLI with the
// same contract that can also be told to fail, time out or emit garbage.
func TestMain(m *testing.M) {
	// Unit tests always use the embedded data; the PostgreSQL suite opts in via TEST_DATABASE_URL.
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("SITE_DATA_DIR")
	dir, err := os.MkdirTemp("", "braspace-testengine")
	if err != nil {
		panic(err)
	}
	testEngineBin = filepath.Join(dir, "testengine")
	if runtime.GOOS == "windows" {
		testEngineBin += ".exe"
	}
	if out, err := exec.Command("go", "build", "-o", testEngineBin, "./internal/testengine").CombinedOutput(); err != nil {
		panic(fmt.Sprintf("build test engine: %v\n%s", err, out))
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

func fakeEngineBinary(t *testing.T, mode string) string {
	t.Helper()
	if mode == "ok" {
		return testEngineBin
	}
	if runtime.GOOS == "windows" {
		t.Skip("failure-mode engines are POSIX shell scripts")
	}
	path := filepath.Join(t.TempDir(), "engine")
	script := fmt.Sprintf("#!/bin/sh\nBRASPACE_FAKE_ENGINE=%s exec %q\n", mode, testEngineBin)
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func testAPI(t *testing.T, engineMode string) (http.Handler, *missionAPI) {
	t.Helper()
	store, err := loadDefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	bin := "/nonexistent/engine"
	if engineMode != "" {
		bin = fakeEngineBinary(t, engineMode)
	}
	api := &missionAPI{store: store, engine: newEngineClient(bin)}
	mux := http.NewServeMux()
	api.register(mux)
	return withRecover(withSecurityHeaders(mux)), api
}

func do(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON (%d): %s", rec.Code, rec.Body.String())
	}
	return out
}

func TestHealth(t *testing.T) {
	h, _ := testAPI(t, "ok")
	if rec := do(h, "GET", "/api/health", ""); rec.Code != 200 || decode(t, rec)["engine"] != "ready" {
		t.Fatalf("ready: %d %s", rec.Code, rec.Body.String())
	}
	h, _ = testAPI(t, "")
	if rec := do(h, "GET", "/api/health", ""); rec.Code != 503 || decode(t, rec)["engine"] != "unavailable" {
		t.Fatalf("unavailable: %d %s", rec.Code, rec.Body.String())
	}
}

func TestSites(t *testing.T) {
	h, _ := testAPI(t, "")
	rec := do(h, "GET", "/api/sites", "")
	if rec.Code != 200 {
		t.Fatal(rec.Code)
	}
	sites := decode(t, rec)["sites"].([]any)
	if len(sites) != 16 {
		t.Fatalf("got %d sites", len(sites))
	}
	for _, path := range []string{"/api/sites/unknown-site", "/api/sites/..%2Fetc", "/api/sites/UPPER"} {
		if rec := do(h, "GET", path, ""); rec.Code != 404 {
			t.Errorf("%s: %d", path, rec.Code)
		}
	}
	rec = do(h, "GET", "/api/sites/malapert-massif", "")
	nearby := decode(t, rec)["nearby"].([]any)
	prev := 0.0
	for _, n := range nearby {
		d := n.(map[string]any)["distance_km"].(float64)
		if d < prev {
			t.Fatalf("nearby not sorted: %v", nearby)
		}
		prev = d
	}
	if first := nearby[0].(map[string]any)["id"]; first != "haworth" {
		t.Fatalf("nearest to Malapert Massif should be Haworth, got %v", first)
	}
}

const compareBody = `{"site_ids":["synthetic-demo-a","synthetic-demo-b","haworth"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":72}`

func TestCompareDeterministicAndHonest(t *testing.T) {
	h, _ := testAPI(t, "ok")
	a, b := do(h, "POST", "/api/compare", compareBody), do(h, "POST", "/api/compare", compareBody)
	if a.Code != 200 || a.Body.String() != b.Body.String() {
		t.Fatalf("not deterministic: %d\n%s\n%s", a.Code, a.Body.String(), b.Body.String())
	}
	out := decode(t, a)
	if out["scientifically_validated"] != false {
		t.Fatal("synthetic data must never be reported as validated")
	}
	results := out["results"].([]any)
	if s := results[0].(map[string]any)["science_status"]; s != "SYNTHETIC" {
		t.Fatalf("science_status = %v", s)
	}
	if r := results[2].(map[string]any); r["data_status"] != "NO_SERIES_DATA" || r["evaluation"] != nil {
		t.Fatalf("site without data must not get values: %v", r)
	}
	m := results[0].(map[string]any)["evaluation"].(map[string]any)["metrics"].(map[string]any)
	if m["sample_count"].(float64) != 72 || m["step_hours"].(float64) != 1 {
		t.Fatalf("metrics: %v", m)
	}
}

func TestCompareValidation(t *testing.T) {
	h, _ := testAPI(t, "ok")
	r := func(old, new string) string { return strings.Replace(compareBody, old, new, 1) }
	cases := []struct {
		name, body, ct string
		status         int
	}{
		{"wrong content type", compareBody, "text/plain", 415},
		{"unknown field", r(`"site_ids"`, `"sites"`), "", 400},
		{"trailing document", compareBody + "{}", "", 400},
		{"too large", strings.Repeat(" ", maxRequestBytes+1), "", 413},
		{"bad date", r("2026-12-01T00:00:00Z", "2026-13-01"), "", 422},
		{"date out of bounds", r("2026-12-01", "1999-12-01"), "", 422},
		{"zero duration", r(`"duration_hours":72`, `"duration_hours":0`), "", 422},
		{"duration too long", r(`"duration_hours":72`, `"duration_hours":721`), "", 422},
		{"four sites", r(`"haworth"`, `"haworth","nobile-rim-2"`), "", 422},
		{"duplicate site", r(`"haworth"`, `"synthetic-demo-a"`), "", 422},
		{"invalid site id", r(`"haworth"`, `"Robert'); DROP TABLE sites;--"`), "", 422},
		{"unknown site", r(`"haworth"`, `"atlantis"`), "", 404},
	}
	for _, tc := range cases {
		req := httptest.NewRequest("POST", "/api/compare", strings.NewReader(tc.body))
		ct := tc.ct
		if ct == "" {
			ct = "application/json"
		}
		req.Header.Set("Content-Type", ct)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != tc.status {
			t.Errorf("%s: got %d want %d: %s", tc.name, rec.Code, tc.status, rec.Body.String())
		}
		if rec.Code >= 400 && decode(t, rec)["code"] == nil {
			t.Errorf("%s: error without code", tc.name)
		}
	}
	if rec := do(h, "GET", "/api/compare", ""); rec.Code != 405 {
		t.Errorf("GET compare: %d", rec.Code)
	}
}

func TestCompareOutsideCoverage(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "POST", "/api/compare", `{"site_ids":["synthetic-demo-a"],"start_utc":"2030-01-01T00:00:00Z","duration_hours":24}`)
	r := decode(t, rec)["results"].([]any)[0].(map[string]any)
	if rec.Code != 200 || r["data_status"] != "OUTSIDE_COVERAGE" || r["evaluation"] != nil {
		t.Fatalf("%d %v", rec.Code, r)
	}
}

func TestEngineFailureModes(t *testing.T) {
	body := `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":4}`
	for mode, want := range map[string]int{"": 503, "fail": 502, "garbage": 502, "slow": 504} {
		h, api := testAPI(t, mode)
		// Short deadline only where the timeout itself is under test; the other
		// modes get headroom so a slow process start cannot turn them into 504s.
		api.engine.callTimeout = 3 * time.Second
		if mode == "slow" {
			api.engine.callTimeout = 300 * time.Millisecond
		}
		rec := do(h, "POST", "/api/compare", body)
		if rec.Code != want {
			t.Errorf("engine %q: got %d want %d: %s", mode, rec.Code, want, rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), "/") && strings.Contains(rec.Body.String(), "engine\"") {
			t.Errorf("engine %q: response leaks a path: %s", mode, rec.Body.String())
		}
	}
}

func TestPanicBecomes500(t *testing.T) {
	h := withRecover(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	rec := do(h, "GET", "/", "")
	if rec.Code != 500 || decode(t, rec)["code"] != "INTERNAL" || strings.Contains(rec.Body.String(), "boom") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

const scenarioBody = `{"site_id":"synthetic-demo-a","start_utc":"2026-12-01T00:00:00Z","duration_hours":72,"constraints":{"max_continuous_dark_hours":20,"min_earth_fraction":0.5}}`

func TestDelayScenario(t *testing.T) {
	h, _ := testAPI(t, "ok")
	a, b := do(h, "POST", "/api/scenarios/delay", scenarioBody), do(h, "POST", "/api/scenarios/delay", scenarioBody)
	if a.Code != 200 || a.Body.String() != b.Body.String() {
		t.Fatalf("replay must be identical: %d %s", a.Code, a.Body.String())
	}
	out := decode(t, a)
	opts := out["options"].([]any)
	kinds := []string{}
	for _, o := range opts {
		kinds = append(kinds, o.(map[string]any)["kind"].(string))
	}
	if strings.Join(kinds, ",") != "baseline,delay,delay,delay,nearby_site" {
		t.Fatalf("options: %v", kinds)
	}
	base := opts[0].(map[string]any)
	delayed := opts[1].(map[string]any)
	if delayed["start_utc"] != "2026-12-02T00:00:00Z" {
		t.Fatalf("delay not applied: %v", delayed["start_utc"])
	}
	bm, dm := base["metrics"].(map[string]any), delayed["metrics"].(map[string]any)
	if bm["longest_continuous_dark_hours"] == dm["longest_continuous_dark_hours"] && bm["sun_visible_fraction"] == dm["sun_visible_fraction"] {
		t.Fatal("delayed window should be recalculated from shifted samples")
	}
	br := base["breached"].([]any)
	if len(br) == 0 {
		t.Fatal("expected the synthetic baseline to breach the dark-hours constraint")
	}
	c := br[0].(map[string]any)
	for _, k := range []string{"criterion", "unit", "limit", "value", "margin"} {
		if _, ok := c[k]; !ok {
			t.Fatalf("breach missing %s: %v", k, c)
		}
	}
	if c["margin"].(float64) >= 0 {
		t.Fatalf("breach margin must be negative: %v", c)
	}
	if _, ok := delayed["checks"].([]any)[0].(map[string]any)["baseline_value"]; !ok {
		t.Fatal("alternatives must report the baseline value")
	}
	if out["outcome"].(map[string]any)["status"] != "ALTERNATIVE_FOUND" {
		t.Fatalf("outcome: %v", out["outcome"])
	}
}

func TestDelayScenarioNoAlternative(t *testing.T) {
	h, _ := testAPI(t, "ok")
	// Baseline (47 h dark) and +24 h (23 h dark) both breach a 20 h limit; no nearby sites evaluated.
	body := strings.Replace(scenarioBody, `"duration_hours":72`, `"duration_hours":72,"delays_hours":[24],"include_nearby":false`, 1)
	rec := do(h, "POST", "/api/scenarios/delay", body)
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	oc := decode(t, rec)["outcome"].(map[string]any)
	if oc["status"] != "NO_ADMISSIBLE_ALTERNATIVE" || oc["first_admissible"] != nil {
		t.Fatalf("%d %v", rec.Code, oc)
	}
}

func TestDelayScenarioErrors(t *testing.T) {
	h, _ := testAPI(t, "ok")
	r := func(old, new string) string { return strings.Replace(scenarioBody, old, new, 1) }
	cases := []struct {
		name, body, code string
		status           int
	}{
		{"site without NASA data", r("synthetic-demo-a", "haworth"), "DATA_NOT_AVAILABLE", 422},
		{"unknown site", r("synthetic-demo-a", "atlantis"), "SITE_NOT_FOUND", 404},
		{"no constraints", r(`"constraints":{"max_continuous_dark_hours":20,"min_earth_fraction":0.5}`, `"constraints":{}`), "CONSTRAINTS_REQUIRED", 422},
		{"fraction above 1", r(`"min_earth_fraction":0.5`, `"min_earth_fraction":1.5`), "INVALID_CONSTRAINT", 422},
		{"observer height not computed", r(`"duration_hours":72`, `"duration_hours":72,"observer_height_m":10`), "OBSERVER_HEIGHT_UNAVAILABLE", 422},
		{"negative delay", r(`"duration_hours":72`, `"duration_hours":72,"delays_hours":[-24]`), "INVALID_DURATION", 422},
		{"duplicate delays", r(`"duration_hours":72`, `"duration_hours":72,"delays_hours":[24,24]`), "INVALID_DELAYS", 422},
		{"bad UTC", r("2026-12-01T00:00:00Z", "2026-12-01 00:00"), "INVALID_TIME", 422},
		{"baseline outside data", r("2026-12-01T00:00:00Z", "2031-01-01T00:00:00Z"), "OUTSIDE_COVERAGE", 422},
	}
	for _, tc := range cases {
		rec := do(h, "POST", "/api/scenarios/delay", tc.body)
		if rec.Code != tc.status || decode(t, rec)["code"] != tc.code {
			t.Errorf("%s: got %d %s", tc.name, rec.Code, rec.Body.String())
		}
	}
}

func TestDelayOutsideCoverageIsReportedNotInvented(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := strings.Replace(scenarioBody, "2026-12-01T00:00:00Z", "2026-12-29T00:00:00Z", 1)
	out := decode(t, do(h, "POST", "/api/scenarios/delay", body))
	last := out["options"].([]any)[3].(map[string]any)
	if last["data_status"] != "OUTSIDE_COVERAGE" || last["admissible"] != false || last["metrics"] != nil {
		t.Fatalf("72h delay past series end must be reported, got %v", last)
	}
}

func TestCORS(t *testing.T) {
	h := withCORS(allowedOrigins("https://braspace.example, *, ftp://bad"), http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	req := func(method, origin string, preflight bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/sites", nil)
		r.Header.Set("Origin", origin)
		if preflight {
			r.Header.Set("Access-Control-Request-Method", "POST")
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		return rec
	}
	if rec := req("GET", "https://braspace.example", false); rec.Header().Get("Access-Control-Allow-Origin") != "https://braspace.example" {
		t.Error("allowed origin not echoed")
	}
	if rec := req("GET", "https://evil.example", false); rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("wildcard or unknown origin must not be allowed")
	}
	if rec := req("OPTIONS", "https://evil.example", true); rec.Code != 403 {
		t.Errorf("disallowed preflight: %d", rec.Code)
	}
	if rec := req("OPTIONS", "https://braspace.example", true); rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Methods") != "GET, POST" {
		t.Errorf("allowed preflight: %d", rec.Code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	h, _ := testAPI(t, "")
	rec := do(h, "GET", "/api/sites", "")
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers: %v", rec.Header())
	}
}

func TestStoreRejectsBadData(t *testing.T) {
	good, err := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	if err != nil {
		t.Fatal(err)
	}
	catalog := func(sites string) *fstest.MapFile {
		return &fstest.MapFile{Data: []byte(`{"schema":"braspace.site-catalog.v1","note":"","sites":[` + sites + `]}`)}
	}
	entryFor := func(data []byte) string {
		return `{"id":"synthetic-demo-a","name":"A","kind":"synthetic_test_fixture","series_file":"s.json","series_sha256":"` + sha256Hex(data) + `"}`
	}
	entry := entryFor(good)
	badFrame := []byte(strings.Replace(string(good), `"MOON_ME"`, `"J2000"`, 1))
	badStatus := []byte(strings.Replace(string(good), `"SYNTHETIC"`, `"TRUST_ME"`, 1))
	truncated := good[:len(good)/2]
	cases := map[string]fstest.MapFS{
		"duplicate id":      {"catalog.json": catalog(entry + "," + entry), "s.json": {Data: good}},
		"unknown nearby":    {"catalog.json": catalog(`{"id":"x","name":"X","kind":"k","nearby":["y"]}`)},
		"wrong frame":       {"catalog.json": catalog(entryFor(badFrame)), "s.json": {Data: badFrame}},
		"bad status":        {"catalog.json": catalog(entryFor(badStatus)), "s.json": {Data: badStatus}},
		"wrong site":        {"catalog.json": catalog(strings.Replace(entry, `"id":"synthetic-demo-a"`, `"id":"other"`, 1)), "s.json": {Data: good}},
		"missing hash":      {"catalog.json": catalog(`{"id":"synthetic-demo-a","name":"A","kind":"k","series_file":"s.json"}`), "s.json": {Data: good}},
		"edited after hash": {"catalog.json": catalog(entry), "s.json": {Data: badFrame}},
		"truncated file":    {"catalog.json": catalog(entry), "s.json": {Data: truncated}},
		"no source":         {"catalog.json": catalog(`{"id":"x","name":"X","kind":"k","coordinate":{"latitude_deg":-89,"longitude_deg":0,"role":"r","frame":"f","source":""}}`)},
	}
	for name, fsys := range cases {
		if _, err := loadStore(fsys); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}
}

func TestAnalysisPrimitives(t *testing.T) {
	if got := longestRun([]bool{true, false, false, true, false, false, false}, false); got != 3 {
		t.Fatalf("longestRun = %d", got)
	}
	s := &siteSeries{start: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), step: time.Hour}
	w := windows(s, 0, []bool{false, true, true, false, true})
	if len(w) != 2 || w[0].StartUTC != "2026-01-01T01:00:00Z" || w[0].DurationHours != 2 || w[1].EndUTC != "2026-01-01T05:00:00Z" {
		t.Fatalf("windows = %+v", w)
	}
	lim := 10.0
	cs := missionConstraints{MaxContinuousDarkHours: &lim}.check(metrics{LongestDarkHours: 13}, nil)
	if cs[0].Passed || cs[0].Margin != -3 || cs[0].Unit != "h" {
		t.Fatalf("check = %+v", cs[0])
	}
	if d := greatCircleKm(coordinate{LatitudeDeg: -90}, coordinate{LatitudeDeg: -89}); math.Abs(d-30.32) > 0.01 {
		t.Fatalf("1 degree of latitude on the Moon = %.3f km", d)
	}
}

// TestRealEngineAgreesWithContract runs only when the Rust binary is built.
func TestRealEngineAgreesWithContract(t *testing.T) {
	bin := os.Getenv("RUST_ENGINE_BIN")
	if bin == "" {
		bin = "../engine/target/debug/braspace-lunar-engine"
		if runtime.GOOS == "windows" {
			bin += ".exe"
		}
	}
	if _, err := os.Stat(bin); err != nil {
		t.Skip("Rust engine not built")
	}
	abs, _ := filepath.Abs(bin)
	store, _ := loadDefaultStore()
	real := &missionAPI{store: store, engine: newEngineClient(abs)}
	mux := http.NewServeMux()
	real.register(mux)
	fake, _ := testAPI(t, "ok")
	a, b := do(mux, "POST", "/api/compare", compareBody), do(fake, "POST", "/api/compare", compareBody)
	if a.Code != 200 {
		t.Fatalf("real engine: %d %s", a.Code, a.Body.String())
	}
	ra, _ := io.ReadAll(a.Body)
	rb, _ := io.ReadAll(b.Body)
	if string(ra) != string(rb) {
		t.Fatal("real Rust engine and test engine disagree on the same inputs")
	}
}

// TestSeriesHashCatchesSilentEdits covers edits that still parse: a changed
// angle, a removed sample (which would shift every later epoch) and a cut tail.
func TestSeriesHashCatchesSilentEdits(t *testing.T) {
	good, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	var s map[string]any
	_ = json.Unmarshal(good, &s)
	samples := s["samples"].([]any)
	variants := map[string]func() []any{
		"changed angle": func() []any {
			c := append([]any{}, samples...)
			c[50] = map[string]any{"sun": map[string]any{"azimuth_deg": 10.0, "elevation_deg": 45.0}, "earth": c[50].(map[string]any)["earth"]}
			return c
		},
		"removed sample": func() []any { return append(append([]any{}, samples[:1]...), samples[2:]...) },
		"cut tail":       func() []any { return append([]any{}, samples[:100]...) },
	}
	cat := `{"schema":"braspace.site-catalog.v1","note":"","sites":[{"id":"synthetic-demo-a","name":"A","kind":"k","series_file":"s.json","series_sha256":"` + sha256Hex(good) + `"}]}`
	for name, mutate := range variants {
		c := map[string]any{}
		for k, v := range s {
			c[k] = v
		}
		c["samples"] = mutate()
		edited, _ := json.Marshal(c)
		if _, err := loadStore(fstest.MapFS{"catalog.json": {Data: []byte(cat)}, "s.json": {Data: edited}}); err == nil || !strings.Contains(err.Error(), "series_sha256") {
			t.Errorf("%s: must be rejected by the catalog hash, got %v", name, err)
		}
	}
	if _, err := loadStore(fstest.MapFS{"catalog.json": {Data: []byte(cat)}, "s.json": {Data: good}}); err != nil {
		t.Fatalf("unchanged file must load: %v", err)
	}
}
