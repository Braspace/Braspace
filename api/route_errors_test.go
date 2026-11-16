package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestJSONRoutingErrors(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/sites/{id}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"id": r.PathValue("id")})
	})
	mux.HandleFunc("POST /v1/visibility", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	h := withJSONRoutingErrors(mux)
	for _, tc := range []struct {
		method, path    string
		wantStatus      int
		wantCode, allow string
	}{
		{"GET", "/api/unknown", 404, "API_ROUTE_NOT_FOUND", ""},
		{"POST", "/api/unknown", 404, "API_ROUTE_NOT_FOUND", ""},
		{"POST", "/api/health", 405, "METHOD_NOT_ALLOWED", "GET, HEAD"},
		{"PUT", "/api/sites/abc", 405, "METHOD_NOT_ALLOWED", "GET, HEAD"},
		{"GET", "/v1/visibility", 405, "METHOD_NOT_ALLOWED", "POST"},
		{"GET", "/api/health", 200, "", ""},
		{"HEAD", "/api/health", 200, "", ""},
		{"GET", "/api/sites/abc", 200, "", ""},
		{"POST", "/v1/visibility", 200, "", ""},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, tc.path, nil)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.wantStatus {
				t.Fatalf("status %d, want %d", w.Code, tc.wantStatus)
			}
			if a := w.Header().Get("Allow"); a != tc.allow {
				t.Errorf("Allow=%q, want %q", a, tc.allow)
			}
			if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
				t.Errorf("content-type=%q", ct)
			}
			var body map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if tc.wantCode != "" && body["code"] != tc.wantCode {
				t.Fatalf("code %q, want %q", body["code"], tc.wantCode)
			}
		})
	}
}

 
// Exercise the application's actual routes() registration, not only an isolated
// ServeMux fixture. A regression that removes withJSONRoutingErrors from routes()
// must fail even when the standalone wrapper tests remain green.
func TestProductionRouteFallback(t *testing.T) {
	h := withMiddleware(routes("/nonexistent/engine"))
	for _, tc := range []struct {
		method, path string
		status int
		code, allow string
	}{
		{"GET", "/api/nonexistent", 404, "API_ROUTE_NOT_FOUND", ""},
		{"PUT", "/api/sites/malapert-massif", 405, "METHOD_NOT_ALLOWED", "GET, HEAD"},
		{"GET", "/api/sites/malapert-massif", 200, "", ""},
		{"GET", "/healthz", 200, "", ""},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.status {
				t.Fatalf("status=%d, want %d: %s", w.Code, tc.status, w.Body.String())
			}
			if got := w.Header().Get("Allow"); got != tc.allow {
				t.Errorf("Allow=%q, want %q", got, tc.allow)
			}
			if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
				t.Errorf("Content-Type=%q", ct)
			}
			var body map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if tc.code != "" && body["code"] != tc.code {
				t.Errorf("code=%v, want %s", body["code"], tc.code)
			}
		})
	}
}
