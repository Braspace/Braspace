package main

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "regexp"
    "strings"
    "testing"
)

// Regression checks cover the HTTP boundary of the caller-supplied geometric
// classifier. A passing result is never scientific validation of lunar data.
func TestVisibilityBoundaryRegression(t *testing.T) {
    cases := []struct {
        name string
        body string
        contentType string
        want int
    }{
        {"valid request but engine absent", validBody, "application/json", 502},
        {"invalid sun negative elevation", strings.Replace(validBody, `"elevation_deg":2`, `"elevation_deg":-91`, 1), "application/json", 422},
        {"azimuth equal to 360", strings.Replace(validBody, `"azimuth_deg":0`, `"azimuth_deg":360`, 1), "application/json", 422},
        {"negative azimuth", strings.Replace(validBody, `"azimuth_deg":0`, `"azimuth_deg":-1`, 1), "application/json", 422},
        {"duplicate horizon azimuth", strings.Replace(validBody, `"azimuth_deg":180,"elevation_deg":0`, `"azimuth_deg":0,"elevation_deg":0`, 1), "application/json", 422},
        {"missing provenance id", strings.Replace(validBody, `"terrain_dataset_id":"SYNTHETIC-TEST"`, `"terrain_dataset_id":""`, 1), "application/json", 422},
        {"malformed epoch", strings.Replace(validBody, "2026-11-14T12:00:00Z", "not-a-date", 1), "application/json", 422},
        {"site id too long", strings.Replace(validBody, "demo-synthetic", strings.Repeat("x", 81), 1), "application/json", 422},
        {"wrong content type", validBody, "text/plain", 415},
        {"unknown key", strings.Replace(validBody, `"site_id"`, `"unknown_key"`, 1), "application/json", 400},
        {"two JSON documents", validBody+"{}", "application/json", 400},
        {"oversized request", strings.Repeat("x", maxRequestBytes+1), "application/json", 413},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            req := httptest.NewRequest(http.MethodPost, "/v1/visibility", strings.NewReader(tc.body))
            req.Header.Set("Content-Type", tc.contentType)
            rec := httptest.NewRecorder()
            routes("/nonexistent/engine").ServeHTTP(rec, req)
            if rec.Code != tc.want {
                t.Fatalf("got HTTP %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
            }
            if rec.Header().Get("Cache-Control") != "no-store" {
                t.Fatal("sensitive mission response must not be cached")
            }
        })
    }
}

func TestScientificClaimsAndCapabilityRegression(t *testing.T) {
    h := routes("/nonexistent/engine")
    for _, endpoint := range []string{"/healthz", "/v1/capabilities"} {
        rec := httptest.NewRecorder()
        h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, endpoint, nil))
        if rec.Code != http.StatusOK {
            t.Fatalf("%s: HTTP %d", endpoint, rec.Code)
        }
        var body map[string]any
        if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
            t.Fatal(err)
        }
        if endpoint == "/healthz" && body["science_status"] != "UNVERIFIED_INPUTS" {
            t.Fatal("liveness must not certify science")
        }
        if endpoint == "/v1/capabilities" {
            for _, field := range []string{"nasa_lola_loaded", "naif_spice_loaded", "scientifically_validated"} {
                if body[field] != false {
                    t.Fatalf("unexpected certified capability %s=%v", field, body[field])
                }
            }
        }
        if rec.Header().Get("Content-Type") != "application/json; charset=utf-8" {
            t.Fatalf("wrong JSON MIME on %s", endpoint)
        }
    }
}

func TestVisibilityEvidencePassportIsDeterministicAndUnverified(t *testing.T) {
    // TestMain supplies a deterministic local engine double, not a NASA source.
    h := routes(testEngineBin)
    first := postWithHandler(h, validBody)
    second := postWithHandler(h, validBody)
    if first.Code != 200 || second.Code != 200 {
        t.Fatalf("HTTP %d and %d: %s", first.Code, second.Code, first.Body.String())
    }
    a := decode(t, first)
    passport, ok := a["evidence_passport"].(map[string]any)
    if !ok {
        t.Fatal("missing evidence passport")
    }
    if a["science_status"] != "UNVERIFIED_INPUTS" {
        t.Fatal("engine must report UNVERIFIED_INPUTS")
    }
    if passport["nasa_sources_verified"] != false || passport["scientific_validation"] != false || passport["inputs_supplied_by_caller"] != true {
        t.Fatalf("evidence passport falsely certifies science: %v", passport)
    }
    digest, ok := passport["request_sha256"].(string)
    if !ok || !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(digest) {
        t.Fatalf("invalid request fingerprint %v", passport["request_sha256"])
    }
    if decode(t, second)["evidence_passport"].(map[string]any)["request_sha256"] != digest {
        t.Fatal("same normalized request must produce the same digest")
    }
    if passport["frame_claimed"] != "MOON_ME" || passport["ephemeris_id_claimed"] != "SYNTHETIC-TEST" {
        t.Fatalf("claimed provenance not preserved: %v", passport)
    }
}

func postWithHandler(h http.Handler, body string) *httptest.ResponseRecorder {
    req := httptest.NewRequest(http.MethodPost, "/v1/visibility", strings.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    return rec
}
