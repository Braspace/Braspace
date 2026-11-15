package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
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

func scriptEngine(t *testing.T, body string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell script")
	}
	p := filepath.Join(t.TempDir(), "engine")
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body+"\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	return p
}

const okEngineJSON = `{"site_id":"demo-synthetic","epoch_utc":"2026-11-14T12:00:00Z","science_status":"UNVERIFIED_INPUTS","sun_horizon_deg":0,"earth_horizon_deg":0,"sun_margin_deg":2,"earth_margin_deg":-1,"sun_visible":true,"earth_visible":false,"simultaneous_visibility":false`

func TestVisibilityRejectsUnknownEngineFields(t *testing.T) {
	good := visibilityVia(t, scriptEngine(t, "printf '%s\\n' '"+okEngineJSON+"}'"))
	if good.Code != 200 {
		t.Fatalf("control (no extra field) must pass: %d %s", good.Code, good.Body.String())
	}
	rec := visibilityVia(t, scriptEngine(t, "printf '%s\\n' '"+okEngineJSON+`,"evil":1}'`))
	if rec.Code != 502 || strings.Contains(rec.Body.String(), "evil") {
		t.Fatalf("extra engine field must be refused and not echoed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestVisibilityRejectsNullEngineScalars(t *testing.T) {
	for _, field := range []string{`"sun_horizon_deg":0`, `"earth_horizon_deg":0`, `"earth_visible":false`, `"simultaneous_visibility":false`} {
		t.Run(field, func(t *testing.T) {
			key := strings.SplitN(field, ":", 2)[0]
			payload := strings.Replace(okEngineJSON, field, key+":null", 1) + "}"
			rec := visibilityVia(t, scriptEngine(t, "printf '%s\\n' '"+payload+"'"))
			if rec.Code != http.StatusBadGateway {
				t.Fatalf("null engine scalar must fail closed: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestVisibilityCapsEngineOutput(t *testing.T) {
	// ~200 KB of valid-looking padding after the contract: must be refused, not buffered.
	rec := visibilityVia(t, scriptEngine(t, "printf '%s' '"+okEngineJSON+",\"source_warning\":\"'; head -c 200000 /dev/zero | tr '\\\\0' 'x'; printf '\"}\\n'"))
	if rec.Code != 502 {
		t.Fatalf("oversized engine output: got %d %.200s", rec.Code, rec.Body.String())
	}
}
