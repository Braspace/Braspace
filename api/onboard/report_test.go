package onboard

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func reportPost(body, ct string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/onboard/report", strings.NewReader(body))
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	ReportHandler().ServeHTTP(w, req)
	return w
}

func TestReportContentAndRiskAgreement(t *testing.T) {
	req := base()
	raw, _ := json.Marshal(req)
	w := reportPost(string(raw), "application/json; charset=utf-8")
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	html := w.Body.String()
	for _, snippet := range []string{
		"MoonProof Mission Report", "NOT FLIGHT SOFTWARE", "UNVERIFIED_INPUTS",
		"ENERGY_LOSS", "EARTH_GEOMETRIC_BLACKOUT", "ENERGY_RESERVE",
		"synthetic-lander-test", "minimum", "10", "2", "Wh", "Save as PDF",
		"no supplied scenario satisfies", "Scenario receipt",
	} {
		if !strings.Contains(strings.ToLower(html), strings.ToLower(snippet)) {
			t.Errorf("HTML missing %q", snippet)
		}
	}
	if w.Header().Get("Content-Type") != "text/html; charset=utf-8" {
		t.Error("wrong HTML MIME")
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "default-src 'none'") {
		t.Fatal("CSP missing")
	}
	if strings.Contains(html, "<script") || strings.Contains(html, "<img") {
		t.Fatal("unexpected script or external media")
	}
}

func TestReportEscapesUserInput(t *testing.T) {
	req := base()
	req.MissionID = `<script>alert("hijack")</script>`
	req.Candidates[0].SourceClaim = `<img src=x onerror=alert(1)>`
	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	w := reportPost(string(raw), "application/json")
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	html := w.Body.String()
	if strings.Contains(html, `<script>alert("hijack")</script>`) || strings.Contains(html, `<img src=x onerror=alert(1)>`) {
		t.Fatal("unescaped user HTML")
	}
	if !strings.Contains(html, "&lt;script&gt;") || !strings.Contains(html, "&lt;img") {
		t.Fatal("missing safely escaped user data")
	}
}

func TestReportRejectsInvalidInputs(t *testing.T) {
	req := base()
	raw, _ := json.Marshal(req)
	for _, tc := range []struct {
		body, ct string
		status   int
	}{
		{"{}", "application/json", 422},
		{string(raw), "text/plain", 415},
		{string(raw) + "{}", "application/json", 400},
		{`{"mission_id":"X","candidates":[],"extra":1}`, "application/json", 400},
		{strings.Repeat("x", MaxRequestBytes+1), "application/json", 413},
	} {
		w := reportPost(tc.body, tc.ct)
		if w.Code != tc.status {
			t.Errorf("unexpected status %d (want %d): %s", w.Code, tc.status, w.Body.String())
		}
	}
}

func TestReportDeterminismAndAlternative(t *testing.T) {
	req := base()
	option := req.Candidates[0]
	option.ID = "recovery-48h"
	option.Power.LoadW = 10
	option.Samples = []Sample{{flag(true), flag(true)}, {flag(true), flag(true)}}
	option.Power.SolarGenerationW = 50
	req.Candidates = append(req.Candidates, option)
	raw, _ := json.Marshal(req)
	a := reportPost(string(raw), "application/json")
	b := reportPost(string(raw), "application/json")
	if a.Code != 200 || b.Code != 200 {
		t.Fatalf("report failed %d %d", a.Code, b.Code)
	}
	if a.Body.String() != b.Body.String() {
		t.Fatal("same scenario must produce identical document")
	}
	for _, v := range []string{"recovery-48h", "EDUCATIONAL_OPTION_MEETS_ASSUMED_LIMITS", "NOT FLIGHT SOFTWARE"} {
		if !strings.Contains(a.Body.String(), v) {
			t.Errorf("report missing %s", v)
		}
	}
}
