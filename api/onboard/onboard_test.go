package onboard

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func flag(v bool) *bool { return &v }
func base() Request {
	return Request{
		MissionID: "synthetic-lander-test",
		Candidates: []Candidate{{
			ID: "baseline", SiteID: "demo-synthetic", StartUTC: "2026-12-01T00:00:00Z",
			SourceClaim: "SYNTHETIC-NOT-NASA", StepMinutes: 60, MaxCommBlackoutHours: 1,
			Power:   Power{BatteryCapacityWh: 200, InitialChargeWh: 150, ReserveWh: 50, SolarGenerationW: 0, LoadW: 80},
			Samples: []Sample{{flag(false), flag(false)}, {flag(false), flag(false)}},
		}},
	}
}
func TestBatteryDepletionAndBlackout(t *testing.T) {
	r, e := Evaluate(base())
	if e != nil {
		t.Fatal(e)
	}
	o := r.Options[0]
	if o.SimulationStatus != "CONSTRAINTS_BREACHED" || o.EndMode != "POWER_LOSS" {
		t.Fatalf("bad state: %+v", o)
	}
	if o.Metrics.UnservedEnergyWh != 10 || o.Metrics.FinalChargeWh != 0 || o.Metrics.LongestEarthObstructionHours != 2 || o.Metrics.LongestDarknessHours != 2 {
		t.Fatalf("bad metrics: %+v", o.Metrics)
	}
	if len(o.Risks) != 3 || o.Risks[0].Category != "ENERGY_LOSS" || o.Risks[1].Category != "ENERGY_RESERVE" || o.Risks[2].Category != "EARTH_GEOMETRIC_BLACKOUT" {
		t.Fatalf("bad risk table: %+v", o.Risks)
	}
	if r.LaboratoryCandidateID != nil || r.Decision != "NO_OPTION_PASSES_ASSUMED_LIMITS" {
		t.Fatalf("unearned alternative: %+v", r)
	}
	if r.ScienceStatus != "UNVERIFIED_INPUTS" || !r.NoFlightRecommendation {
		t.Fatal("science provenance must never claim verified")
	}
	if len(o.Timeline) != 2 || o.Timeline[0].ChargeWh != 70 || o.Timeline[1].Mode != "POWER_LOSS" {
		t.Fatalf("bad timeline: %+v", o.Timeline)
	}
}
func TestCandidatesAndDeterminism(t *testing.T) {
	req := base()
	good := req.Candidates[0]
	good.ID = "alternative"
	good.StartUTC = "2026-12-03T00:00:00Z"
	good.Power.SolarGenerationW = 110
	good.Samples = []Sample{{flag(true), flag(true)}, {flag(true), flag(true)}}
	req.Candidates = append(req.Candidates, good)
	a, e := Evaluate(req)
	if e != nil {
		t.Fatal(e)
	}
	b, e := Evaluate(req)
	if e != nil {
		t.Fatal(e)
	}
	if a.InputsSHA256 != b.InputsSHA256 {
		t.Fatal("digest not deterministic")
	}
	if a.LaboratoryCandidateID == nil || *a.LaboratoryCandidateID != "alternative" {
		t.Fatalf("wrong educational candidate: %+v", a.LaboratoryCandidateID)
	}
	if a.Options[1].SimulationStatus != "CONSTRAINTS_MET" || a.Options[1].Metrics.FinalChargeWh != 200 || a.Options[1].Metrics.MinChargeWh != 150 {
		t.Fatalf("battery ceiling wrong: %+v", a.Options[1])
	}
	if a.ScienceStatus != "UNVERIFIED_INPUTS" || !a.NoFlightRecommendation {
		t.Fatal("never assert actual flight recommendation")
	}
	if a.Options[1].SourceClaimUnverified != "SYNTHETIC-NOT-NASA" {
		t.Fatal("source claim missing")
	}
}
func TestRejectUnsafeInputs(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Request)
	}{
		{"empty", func(r *Request) { r.Candidates = nil }},
		{"duplicate", func(r *Request) { r.Candidates = append(r.Candidates, r.Candidates[0]) }},
		{"missing Sun", func(r *Request) { r.Candidates[0].Samples[0].SunVisible = nil }},
		{"missing Earth", func(r *Request) { r.Candidates[0].Samples[0].EarthVisible = nil }},
		{"bad time", func(r *Request) { r.Candidates[0].StartUTC = "yesterday" }},
		{"bad step", func(r *Request) { r.Candidates[0].StepMinutes = 0 }},
		{"negative load", func(r *Request) { r.Candidates[0].Power.LoadW = -1 }},
		{"not finite", func(r *Request) { r.Candidates[0].Power.SolarGenerationW = math.NaN() }},
		{"reserve > capacity", func(r *Request) { r.Candidates[0].Power.ReserveWh = 250 }},
		{"initial charge overflow", func(r *Request) { r.Candidates[0].Power.InitialChargeWh = 250 }},
		{"outage outside duration", func(r *Request) { r.Candidates[0].MaxCommBlackoutHours = 10 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := base()
			tc.mutate(&req)
			if _, err := Evaluate(req); err == nil {
				t.Fatal("accepted unsafe input")
			}
		})
	}
}
func TestHTTPErrorsAndSuccess(t *testing.T) {
	handler := Handler()
	send := func(body string, contentType string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api/onboard/evaluate", strings.NewReader(body))
		request.Header.Set("Content-Type", contentType)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, request)
		return rec
	}
	raw, _ := json.Marshal(base())
	if rec := send(string(raw), "application/json"); rec.Code != 200 {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body)
	}
	if rec := send(string(raw), "text/plain"); rec.Code != 415 {
		t.Fatalf("want 415 got %d", rec.Code)
	}
	if rec := send("{}", "application/json"); rec.Code != 422 {
		t.Fatalf("want 422 got %d", rec.Code)
	}
	if rec := send(string(raw)+"{}", "application/json"); rec.Code != 400 {
		t.Fatalf("want 400 got %d", rec.Code)
	}
	if rec := send(`{"mission_id":"x","unexpected":true,"candidates":[]}`, "application/json"); rec.Code != 400 {
		t.Fatalf("want 400 got %d", rec.Code)
	}
	if rec := send(strings.Repeat("x", MaxRequestBytes+1), "application/json"); rec.Code != 413 {
		t.Fatalf("want 413 got %d", rec.Code)
	}
	var result Response
	rec := send(string(raw), "application/json")
	if err := json.NewDecoder(bytes.NewReader(rec.Body.Bytes())).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Version != Version || result.ScienceStatus != "UNVERIFIED_INPUTS" {
		t.Fatalf("response mismatch: %+v", result)
	}
}
