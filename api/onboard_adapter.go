package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Braspace/Braspace/api/onboard"
)

// Adapter (BS-060 / #64): feeds the onboard simulator (#70) with Sun/Earth
// visibility computed from stored series instead of caller-typed booleans.
// Missing or partial data is rejected; nothing is filled with zeros.

type siteOnboardCandidate struct {
	ID         string  `json:"id"`
	SiteID     string  `json:"site_id"`
	DelayHours float64 `json:"delay_hours"`
}

type siteOnboardRequest struct {
	MissionID            string                 `json:"mission_id"`
	StartUTC             string                 `json:"start_utc"`
	DurationHours        float64                `json:"duration_hours"`
	Candidates           []siteOnboardCandidate `json:"candidates"`
	Power                onboard.Power          `json:"power"`
	MaxCommBlackoutHours float64                `json:"max_comm_blackout_hours"`
	Crew                 *crewSpec              `json:"crew,omitempty"`
}

type candidateSource struct {
	ID                  string            `json:"id"`
	SiteID              string            `json:"site_id"`
	DelayHours          float64           `json:"delay_hours"`
	StartUTC            string            `json:"start_utc"`
	ScienceStatus       string            `json:"science_status"`
	EngineScienceStatus string            `json:"engine_science_status"`
	Provenance          seriesProvenance  `json:"provenance"`
	ObserverHeightM     float64           `json:"observer_height_m"`
	StepSeconds         int               `json:"step_seconds"`
	Consumables         consumablesResult `json:"consumables"`
	Admissible          bool              `json:"admissible"`
	BreachedRisks       []string          `json:"breached_risks"`
}

// onboardInput is one candidate's adapted series: engine results on the
// stored grid, ready for onboard.Candidate.
type onboardInput struct {
	series *siteSeries
	from   int
	res    []engineResult
}

// adaptSeries evaluates [start, start+hours) for a site and checks it fits the
// onboard simulator limits. Errors are 4xx apiErrors naming the candidate.
func (m *missionAPI) adaptSeries(ctx context.Context, ev *evaluator, label, siteID string, start time.Time, hours float64) (onboardInput, error) {
	ser, ok := m.store.seriesFor(siteID)
	if !ok {
		return onboardInput{}, errf(http.StatusUnprocessableEntity, "DATA_NOT_AVAILABLE", "%s: no horizon/ephemeris series for site %q", label, siteID)
	}
	if ser.StepSeconds%60 != 0 {
		return onboardInput{}, errf(http.StatusUnprocessableEntity, "GRID_UNSUPPORTED", "%s: series step must be whole minutes", label)
	}
	if !gridAligned(ser, start, hours) {
		return onboardInput{}, errf(http.StatusUnprocessableEntity, "GRID_NOT_ALIGNED",
			"%s: start and duration must match the %d-second sample grid", label, ser.StepSeconds)
	}
	from, to, ok := span(ser, start, hours)
	if !ok {
		return onboardInput{}, errf(http.StatusUnprocessableEntity, "OUTSIDE_COVERAGE", "%s: series covers %s to %s", label, ser.StartUTC, ser.end().Format(time.RFC3339))
	}
	if to-from > onboard.MaxSamples {
		return onboardInput{}, errf(http.StatusUnprocessableEntity, "WINDOW_TOO_LONG", "%s: %d samples exceed the onboard limit of %d", label, to-from, onboard.MaxSamples)
	}
	res, err := ev.evaluate(ctx, ser, from, to)
	if err != nil {
		return onboardInput{}, err
	}
	return onboardInput{ser, from, res}, nil
}

func (in onboardInput) candidate(id string, power onboard.Power, maxBlackout float64) onboard.Candidate {
	samples := make([]onboard.Sample, len(in.res))
	for i, r := range in.res {
		sun, earth := r.SunVisible, r.EarthVisible
		samples[i] = onboard.Sample{SunVisible: &sun, EarthVisible: &earth}
	}
	p := in.series.Provenance
	return onboard.Candidate{
		ID: id, SiteID: in.series.SiteID, StartUTC: in.series.epoch(in.from).Format(time.RFC3339),
		SourceClaim:          fmt.Sprintf("%s series; terrain=%s; ephemeris=%s; frame=%s", in.series.ScienceStatus, p.TerrainDatasetID, p.EphemerisID, p.Frame),
		StepMinutes:          in.series.StepSeconds / 60,
		MaxCommBlackoutHours: maxBlackout,
		Power:                power,
		Samples:              samples,
	}
}

type siteOnboardResult struct {
	req      siteOnboardRequest
	sources  []candidateSource
	onboard  onboard.Response
	combined map[string]any
	results  []siteResult
}

func (m *missionAPI) siteOnboard(w http.ResponseWriter, r *http.Request) {
	res, err := m.runSiteOnboard(r)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"api_version":              missionAPIVersion,
		"request_sha256":           fingerprint(res.req),
		"model":                    model,
		"request":                  res.req,
		"combined_decision":        res.combined,
		"candidates":               res.sources,
		"onboard":                  res.onboard,
		"scientifically_validated": scientificallyValidated(res.results...),
		"limitations": append(append([]string{}, limitations...),
			"Consumables use constant per-person rates from crew.rate_source; no regeneration, leaks or EVA demand are modelled."),
	})
}

// siteReport renders the printable mission report (#72) for the same input
// as site-evaluate, with consumables and the combined decision appended.
func (m *missionAPI) siteReport(w http.ResponseWriter, r *http.Request) {
	res, err := m.runSiteOnboard(r)
	if err != nil {
		writeError(w, err)
		return
	}
	app := &onboard.ReportAppendix{Candidates: []onboard.AppendixCandidate{}}
	if id, ok := res.combined["candidate_id"].(string); ok {
		app.CombinedCandidateID = id
	}
	if res.req.Crew != nil {
		app.RateSource = res.req.Crew.RateSource
	}
	validated := "not scientifically validated"
	if scientificallyValidated(res.results...) {
		validated = "scientifically validated"
	}
	app.VisibilitySource = fmt.Sprintf("computed by the BRASPACE API (Rust engine) from stored horizon/ephemeris series, %s; series status per candidate below", validated)
	for _, c := range res.sources {
		ac := onboard.AppendixCandidate{ID: c.ID, SiteID: c.SiteID, ScienceStatus: c.ScienceStatus, Admissible: c.Admissible,
			ConsumablesStatus: c.Consumables.Status, Risks: c.Consumables.Risks,
			Provenance: fmt.Sprintf("terrain=%s ephemeris=%s frame=%s", c.Provenance.TerrainDatasetID, c.Provenance.EphemerisID, c.Provenance.Frame)}
		for _, it := range c.Consumables.Items {
			row := onboard.ConsumableRow{Resource: it.Resource, Status: it.Status, StockAtStartKg: it.StockAtStartKg, UsedDuringDelayKg: it.UsedDuringDelayKg,
				RequiredKg: it.RequiredKg, AutonomyHours: it.AutonomyHours, MarginHours: it.MarginHours}
			if it.DepletionUTC != nil {
				row.DepletionUTC = *it.DepletionUTC
			}
			ac.Consumables = append(ac.Consumables, row)
		}
		app.Candidates = append(app.Candidates, ac)
	}
	page, err := onboard.RenderReport(res.onboard, app)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	w.Header().Set("Content-Disposition", "inline; filename=\"braspace-mission-report.html\"")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(page)
}

func (m *missionAPI) runSiteOnboard(r *http.Request) (*siteOnboardResult, error) {
	var req siteOnboardRequest
	if err := decodeJSON(r, &req); err != nil {
		return nil, err
	}
	start, err := parseUTC("start_utc", req.StartUTC)
	if err == nil {
		err = checkHours("duration_hours", req.DurationHours, maxWindowHours)
	}
	if err == nil && (strings.TrimSpace(req.MissionID) == "" || len(req.MissionID) > 96) {
		err = errf(http.StatusUnprocessableEntity, "INVALID_MISSION", "mission_id is required (<= 96 characters)")
	}
	if err == nil && (len(req.Candidates) < 1 || len(req.Candidates) > onboard.MaxCandidates) {
		err = errf(http.StatusUnprocessableEntity, "INVALID_CANDIDATES", "candidates must have 1..%d entries", onboard.MaxCandidates)
	}
	if err == nil && req.Crew != nil {
		err = req.Crew.validate()
	}
	if err != nil {
		return nil, err
	}
	req.StartUTC = start.Format(time.RFC3339Nano)

	ctx, cancel := context.WithTimeout(r.Context(), requestDeadline)
	defer cancel()
	ev := newEvaluator(m.engine)
	seen := map[string]bool{}
	step := 0
	var inputs []onboardInput
	var obReq = onboard.Request{MissionID: req.MissionID}
	for _, c := range req.Candidates {
		label := "candidate " + c.ID
		if strings.TrimSpace(c.ID) == "" || len(c.ID) > 96 || seen[c.ID] {
			return nil, errf(http.StatusUnprocessableEntity, "INVALID_CANDIDATES", "candidate ids must be unique and non-empty")
		}
		seen[c.ID] = true
		if _, ok := m.store.site(c.SiteID); !siteIDPattern.MatchString(c.SiteID) || !ok {
			return nil, errf(http.StatusNotFound, "SITE_NOT_FOUND", "%s: unknown site", label)
		}
		if !finite(c.DelayHours) || c.DelayHours < 0 || c.DelayHours > maxDelayHours {
			return nil, errf(http.StatusUnprocessableEntity, "INVALID_DURATION", "%s: delay_hours must be in [0, %d]", label, maxDelayHours)
		}
		at := start.Add(time.Duration(c.DelayHours * float64(time.Hour)))
		in, err := m.adaptSeries(ctx, ev, label, c.SiteID, at, req.DurationHours)
		if err != nil {
			return nil, err
		}
		if step != 0 && in.series.StepSeconds != step {
			return nil, errf(http.StatusUnprocessableEntity, "GRID_MISMATCH", "all candidates must share one time step")
		}
		step = in.series.StepSeconds
		inputs = append(inputs, in)
		obReq.Candidates = append(obReq.Candidates, in.candidate(c.ID, req.Power, req.MaxCommBlackoutHours))
	}
	obResp, err := onboard.Evaluate(obReq)
	if err != nil {
		return nil, errf(http.StatusUnprocessableEntity, "INVALID_SCENARIO", "%s", err)
	}

	sources := make([]candidateSource, len(inputs))
	var results []siteResult
	for i, in := range inputs {
		c := req.Candidates[i]
		cons := consumables(req.Crew, in.series.epoch(in.from), req.DurationHours, c.DelayHours)
		breaches := []string{}
		for _, rk := range obResp.Options[i].Risks {
			breaches = append(breaches, rk.Category)
		}
		for _, rk := range cons.Risks {
			breaches = append(breaches, rk.Category)
		}
		sources[i] = candidateSource{
			ID: c.ID, SiteID: c.SiteID, DelayHours: c.DelayHours, StartUTC: in.series.epoch(in.from).Format(time.RFC3339),
			ScienceStatus: in.series.ScienceStatus, EngineScienceStatus: in.res[0].ScienceStatus, Provenance: in.series.Provenance,
			ObserverHeightM: in.series.ObserverHeightM, StepSeconds: in.series.StepSeconds, Consumables: cons,
			Admissible: len(breaches) == 0, BreachedRisks: breaches,
		}
		results = append(results, siteResult{DataStatus: "AVAILABLE", ScienceStatus: in.series.ScienceStatus, EngineScienceStatus: in.res[0].ScienceStatus})
	}
	// The onboard decision only weighs energy and comms; the combined decision
	// also requires consumables to hold. First admissible candidate in request order.
	combined := map[string]any{"status": "NO_CANDIDATE_MEETS_ALL_ASSUMED_LIMITS", "candidate_id": nil}
	for _, c := range sources {
		if c.Admissible {
			combined = map[string]any{"status": "CANDIDATE_MEETS_ALL_ASSUMED_LIMITS", "candidate_id": c.ID}
			break
		}
	}
	return &siteOnboardResult{req: req, sources: sources, onboard: obResp, combined: combined, results: results}, nil
}
