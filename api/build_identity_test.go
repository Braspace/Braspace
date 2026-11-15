package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The deployed service must name the commit it runs, never an empty field.
func TestHealthzReportsBuildCommit(t *testing.T) {
	for _, tc := range []struct{ stamped, want string }{{"0b5c3a3f14be", "0b5c3a3f14be"}, {"", ""}} {
		buildCommit = tc.stamped
		rec := httptest.NewRecorder()
		routes("/nonexistent/engine").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		var body map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		got := body["build_commit"]
		if got == "" || (tc.want != "" && got != tc.want) {
			t.Fatalf("stamped %q: build_commit=%q", tc.stamped, got)
		}
	}
	buildCommit = ""
}
