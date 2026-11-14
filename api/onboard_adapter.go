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

func (m *missionAPI) siteOnboard(w http.ResponseWriter, r *http.Request) {
	var req siteOnboardRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, err)
		return
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
		writeError(w, err)
		return
	}
	req.StartUTC = start.Format(time.RFC3339)

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
			writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_CANDIDATES", "candidate ids must be unique and non-empty"))
			return
		}
		seen[c.ID] = true
		if _, ok := m.store.site(c.SiteID); !siteIDPattern.MatchString(c.SiteID) || !ok {
			writeError(w, errf(http.StatusNotFound, "SITE_NOT_FOUND", "%s: unknown site", label))
			return
		}
		if !finite(c.DelayHours) || c.DelayHours < 0 || c.DelayHours > maxDelayHours {
			writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_DURATION", "%s: delay_hours must be in [0, %d]", label, maxDelayHours))
			return
		}
		at := start.Add(time.Duration(c.DelayHours * float64(time.Hour)))
		in, err := m.adaptSeries(ctx, ev, label, c.SiteID, at, req.DurationHours)
		if err != nil {
			writeError(w, err)
			return
		}
		if step != 0 && in.series.StepSeconds != step {
			writeError(w, errf(http.StatusUnprocessableEntity, "GRID_MISMATCH", "all candidates must share one time step"))
			return
		}
		step = in.series.StepSeconds
		inputs = append(inputs, in)
		obReq.Candidates = append(obReq.Candidates, in.candidate(c.ID, req.Power, req.MaxCommBlackoutHours))
	}
	obResp, err := onboard.Evaluate(obReq)
	if err != nil {
		writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_SCENARIO", "%s", err))
		return
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
	writeJSON(w, http.StatusOK, map[string]any{
		"api_version":              missionAPIVersion,
		"request_sha256":           fingerprint(req),
		"model":                    model,
		"request":                  req,
		"combined_decision":        combined,
		"candidates":               sources,
		"onboard":                  obResp,
		"scientifically_validated": scientificallyValidated(results...),
		"limitations": append(append([]string{}, limitations...),
			"Consumables use constant per-person rates from crew.rate_source; no regeneration, leaks or EVA demand are modelled."),
	})
}
