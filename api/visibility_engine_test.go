package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// /v1/visibility goes through engineClient, so its failure codes match the
// mission routes (issue #112) and the engine output is held to the same contract.
func visibilityVia(t *testing.T, binary string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/visibility", strings.NewReader(validBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	routes(binary).ServeHTTP(rec, req)
	return rec
}

func TestVisibilityEngineFailureCodesMatchMissionRoutes(t *testing.T) {
	want := map[string]int{"fail": 502, "garbage": 502, "slow": 504}
	for mode, code := range want {
		rec := visibilityVia(t, fakeEngineBinary(t, mode))
		if rec.Code != code || !strings.Contains(rec.Body.String(), "ENGINE_") {
			t.Errorf("mode %q: got %d %s, want %d with an ENGINE_* code", mode, rec.Code, rec.Body.String(), code)
		}
	}
	rec := visibilityVia(t, "/nonexistent/engine")
	if rec.Code != 503 || !strings.Contains(rec.Body.String(), "ENGINE_UNAVAILABLE") {
		t.Errorf("absent engine: got %d %s", rec.Code, rec.Body.String())
	}
}

// scriptEngine is an engine that prints exactly `out` (portable, see stdoutEngine).
func scriptEngine(t *testing.T, out string) string { return stdoutEngine(t, out) }

const okEngineJSON = `{"site_id":"demo-synthetic","epoch_utc":"2026-11-14T12:00:00Z","science_status":"UNVERIFIED_INPUTS","sun_horizon_deg":0,"earth_horizon_deg":0,"sun_margin_deg":2,"earth_margin_deg":-1,"sun_visible":true,"earth_visible":false,"simultaneous_visibility":false`

func TestVisibilityRejectsUnknownEngineFields(t *testing.T) {
	good := visibilityVia(t, scriptEngine(t, okEngineJSON+"}\n"))
	if good.Code != 200 {
		t.Fatalf("control (no extra field) must pass: %d %s", good.Code, good.Body.String())
	}
	rec := visibilityVia(t, scriptEngine(t, okEngineJSON+`,"evil":1}`+"\n"))
	if rec.Code != 502 || strings.Contains(rec.Body.String(), "evil") {
		t.Fatalf("extra engine field must be refused and not echoed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestVisibilityRejectsNullEngineScalars(t *testing.T) {
	for _, field := range []string{`"sun_horizon_deg":0`, `"earth_horizon_deg":0`, `"earth_visible":false`, `"simultaneous_visibility":false`} {
		t.Run(field, func(t *testing.T) {
			key := strings.SplitN(field, ":", 2)[0]
			payload := strings.Replace(okEngineJSON, field, key+":null", 1) + "}"
			rec := visibilityVia(t, scriptEngine(t, payload+"\n"))
			if rec.Code != http.StatusBadGateway {
				t.Fatalf("null engine scalar must fail closed: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

// A successful Rust document must mean exactly the same thing to Go and to
// the browser. encoding/json otherwise coerces null into zero/false and
// silently accepts duplicate keys and case-insensitive struct field aliases.
func TestVisibilityRejectsAmbiguousEngineOutput(t *testing.T) {
	valid := okEngineJSON + `}`
	_, spec := loadSpec(t)
	cases := map[string]string{
		"null zero horizon":      strings.Replace(valid, `"sun_horizon_deg":0`, `"sun_horizon_deg":null`, 1),
		"null earth horizon":     strings.Replace(valid, `"earth_horizon_deg":0`, `"earth_horizon_deg":null`, 1),
		"null false flag":        strings.Replace(valid, `"earth_visible":false`, `"earth_visible":null`, 1),
		"null simultaneous flag": strings.Replace(valid, `"simultaneous_visibility":false`, `"simultaneous_visibility":null`, 1),
		"duplicate exact key":    okEngineJSON + `,"earth_visible":false}`,
		"duplicate escaped key":  okEngineJSON + `,"earth_\u0076isible":false}`,
		"case alias":             okEngineJSON + `,"Earth_Visible":false}`,
		"optional alias":         okEngineJSON + `,"Source_Warning":"unexpected alias"}`,
		"null optional warning":  okEngineJSON + `,"source_warning":null}`,
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			rec := visibilityVia(t, scriptEngine(t, payload+"\n"))
			if rec.Code != http.StatusBadGateway || decode(t, rec)["code"] != "ENGINE_ERROR" {
				t.Fatalf("ambiguous output must be a stable ENGINE_ERROR: %d %s", rec.Code, rec.Body.String())
			}
			for _, issue := range validateSchema(spec, responseSchema(t, spec, "/v1/visibility", "post", rec.Code), decode(t, rec), name) {
				t.Error(issue)
			}
		})
	}
	for _, payload := range []string{valid, okEngineJSON + `,"source_warning":"unverified caller inputs"}`} {
		rec := visibilityVia(t, scriptEngine(t, payload+"\n"))
		if rec.Code != http.StatusOK {
			t.Fatalf("explicit zero/false and valid optional string must pass: %d %s", rec.Code, rec.Body.String())
		}
		for _, issue := range validateSchema(spec, responseSchema(t, spec, "/v1/visibility", "post", rec.Code), decode(t, rec), "valid engine result") {
			t.Error(issue)
		}
	}
}

func TestVisibilityCapsEngineOutput(t *testing.T) {
	// ~200 KB of valid-looking padding after the contract: must be refused, not buffered.
	rec := visibilityVia(t, scriptEngine(t, okEngineJSON+`,"source_warning":"`+strings.Repeat("x", 200000)+"\"}\n"))
	if rec.Code != 502 {
		t.Fatalf("oversized engine output: got %d %.200s", rec.Code, rec.Body.String())
	}
}
