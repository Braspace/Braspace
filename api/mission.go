package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
)

//go:embed openapi.json
var openAPISpec []byte

const (
	missionAPIVersion = "braspace.mission.v1"
	maxWindowHours    = 720
	maxDelayHours     = 720
	requestDeadline   = 20 * time.Second
)

var limitations = []string{
	"Visibility is geometric line of sight to the Sun and Earth centers against the stored terrain horizon; Sun disc width, refraction, eclipses, RF link budget and DSN scheduling are not modelled.",
	"Durations have a resolution of one series step; windows start and end on grid epochs.",
	"Results are only as accurate as the stored horizon and ephemeris series; check science_status and provenance per site.",
	"Constraint thresholds are caller-declared assumptions, not mission requirements.",
}

type missionAPI struct {
	store  *siteStore
	engine *engineClient
}

type modelInfo struct {
	APIVersion      string `json:"api_version"`
	AnalysisVersion string `json:"analysis_version"`
	EngineContract  string `json:"engine_contract"`
}

var model = modelInfo{APIVersion: missionAPIVersion, AnalysisVersion: analysisVersion, EngineContract: "braspace.visibility.v1"}

type apiError struct {
	status int
	code   string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(status int, code, format string, a ...any) *apiError {
	return &apiError{status, code, fmt.Sprintf(format, a...)}
}

func writeError(w http.ResponseWriter, err error) {
	var ae *apiError
	switch {
	case errors.As(err, &ae):
	case errors.Is(err, errEngineUnavailable):
		ae = errf(http.StatusServiceUnavailable, "ENGINE_UNAVAILABLE", "%s", err)
	case errors.Is(err, errEngineTimeout):
		ae = errf(http.StatusGatewayTimeout, "ENGINE_TIMEOUT", "%s", err)
	case errors.Is(err, errEngineFailed), errors.Is(err, errEngineContract):
		ae = errf(http.StatusBadGateway, "ENGINE_ERROR", "%s", err)
	default:
		ae = errf(http.StatusInternalServerError, "INTERNAL", "internal error")
	}
	writeJSON(w, ae.status, map[string]string{"error": ae.msg, "code": ae.code})
}

func (m *missionAPI) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", m.health)
	mux.HandleFunc("GET /api/sites", m.listSites)
	mux.HandleFunc("GET /api/sites/{id}", m.getSite)
	mux.HandleFunc("POST /api/compare", m.compare)
	mux.HandleFunc("POST /api/scenarios/delay", m.delayScenario)
	mux.HandleFunc("GET /api/openapi.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(openAPISpec)
	})
}

func (m *missionAPI) health(w http.ResponseWriter, r *http.Request) {
	statuses := map[string]int{}
	for _, s := range m.store.series {
		statuses[s.ScienceStatus]++
	}
	body := map[string]any{
		"service":                 "braspace-api",
		"api_version":             missionAPIVersion,
		"engine":                  "ready",
		"sites":                   len(m.store.sites),
		"sites_with_series":       len(m.store.series),
		"series_science_statuses": statuses,
		"status":                  "ok",
	}
	code := http.StatusOK
	if !m.engine.available() {
		body["engine"], body["status"], code = "unavailable", "degraded", http.StatusServiceUnavailable
	}
	writeJSON(w, code, body)
}

type seriesCoverage struct {
	StartUTC        string  `json:"start_utc"`
	EndUTC          string  `json:"end_utc"`
	StepSeconds     int     `json:"step_seconds"`
	ScienceStatus   string  `json:"science_status"`
	ObserverHeightM float64 `json:"observer_height_m"`
}

type siteSummary struct {
	site
	Series *seriesCoverage `json:"series,omitempty"`
}

func (m *missionAPI) summary(s *site) siteSummary {
	out := siteSummary{site: *s}
	out.Nearby = nil
	if ser, ok := m.store.seriesFor(s.ID); ok {
		out.Series = &seriesCoverage{ser.StartUTC, ser.end().Format(time.RFC3339), ser.StepSeconds, ser.ScienceStatus, ser.ObserverHeightM}
	}
	return out
}

func (m *missionAPI) listSites(w http.ResponseWriter, r *http.Request) {
	list := make([]siteSummary, 0, len(m.store.sites))
	for i := range m.store.sites {
		list = append(list, m.summary(&m.store.sites[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"api_version": missionAPIVersion, "note": catalogNote, "sites": list})
}

const catalogNote = "Coordinates are cited source feature centers, not touchdown points or landing recommendations. Sites without a series have no computed visibility yet."

func (m *missionAPI) getSite(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s, ok := m.store.site(id)
	if !siteIDPattern.MatchString(id) || !ok {
		writeError(w, errf(http.StatusNotFound, "SITE_NOT_FOUND", "unknown site"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"api_version": missionAPIVersion, "site": m.summary(s), "nearby": m.store.nearby(id, 5, false)})
}

// decodeJSON enforces content type, size, known fields and a single document.
func decodeJSON(r *http.Request, v any) error {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		return errf(http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "application/json required")
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBytes+1))
	if err != nil || len(raw) > maxRequestBytes {
		return errf(http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "request too large")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return errf(http.StatusBadRequest, "INVALID_JSON", "invalid JSON contract")
	}
	if dec.Decode(new(any)) != io.EOF {
		return errf(http.StatusBadRequest, "INVALID_JSON", "trailing JSON payload")
	}
	return nil
}

func parseUTC(field, v string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return t, errf(http.StatusUnprocessableEntity, "INVALID_TIME", "%s must be RFC3339 UTC, e.g. 2026-12-01T00:00:00Z", field)
	}
	t = t.UTC()
	if t.Year() < 2000 || t.Year() > 2100 {
		return t, errf(http.StatusUnprocessableEntity, "INVALID_TIME", "%s must be between 2000 and 2100", field)
	}
	return t, nil
}

func checkHours(field string, v, max float64) error {
	if !finite(v) || v <= 0 || v > max {
		return errf(http.StatusUnprocessableEntity, "INVALID_DURATION", "%s must be in (0, %g] hours", field, max)
	}
	return nil
}

func fingerprint(v any) string {
	b, _ := json.Marshal(v)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}

// span maps [start, start+hours) onto series indices, aligning start down to
// the series grid. ok is false when the series does not cover the window.
func span(s *siteSeries, start time.Time, hours float64) (from, to int, ok bool) {
	off := start.Sub(s.start)
	if off < 0 {
		return 0, 0, false
	}
	from = int(off / s.step)
	n := int(math.Ceil(hours * float64(time.Hour) / float64(s.step)))
	if n < 1 {
		n = 1
	}
	to = from + n
	return from, to, to <= len(s.Samples)
}

type siteResult struct {
	Site                siteSummary       `json:"site"`
	DataStatus          string            `json:"data_status"`
	Reason              string            `json:"reason,omitempty"`
	ScienceStatus       string            `json:"science_status,omitempty"`
	EngineScienceStatus string            `json:"engine_science_status,omitempty"`
	Provenance          *seriesProvenance `json:"provenance,omitempty"`
	Evaluation          *evaluation       `json:"evaluation,omitempty"`
}

// evaluateSite returns a per-site result; missing data is reported, never filled in.
func (m *missionAPI) evaluateSite(ctx context.Context, ev *evaluator, s *site, start time.Time, hours float64, series bool) (siteResult, error) {
	res := siteResult{Site: m.summary(s)}
	ser, ok := m.store.seriesFor(s.ID)
	if !ok {
		res.DataStatus, res.Reason = "NO_SERIES_DATA", "no horizon/ephemeris series has been ingested for this site"
		return res, nil
	}
	from, to, ok := span(ser, start, hours)
	if !ok {
		res.DataStatus = "OUTSIDE_COVERAGE"
		res.Reason = fmt.Sprintf("series covers %s to %s", ser.StartUTC, ser.end().Format(time.RFC3339))
		return res, nil
	}
	out, err := ev.evaluate(ctx, ser, from, to)
	if err != nil {
		return res, err
	}
	e := analyze(ser, from, out, series)
	prov := ser.Provenance
	res.DataStatus, res.ScienceStatus, res.EngineScienceStatus = "AVAILABLE", ser.ScienceStatus, out[0].ScienceStatus
	res.Provenance, res.Evaluation = &prov, &e
	return res, nil
}

func scientificallyValidated(results ...siteResult) bool {
	found := false
	for _, r := range results {
		if r.DataStatus != "AVAILABLE" {
			continue
		}
		found = true
		if r.ScienceStatus != "VALIDATED" || r.EngineScienceStatus != "VALIDATED" {
			return false
		}
	}
	return found
}

type compareRequest struct {
	SiteIDs       []string `json:"site_ids"`
	StartUTC      string   `json:"start_utc"`
	DurationHours float64  `json:"duration_hours"`
	IncludeSeries bool     `json:"include_series"`
}

func (m *missionAPI) compare(w http.ResponseWriter, r *http.Request) {
	var req compareRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if len(req.SiteIDs) < 1 || len(req.SiteIDs) > 3 {
		writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_SITES", "site_ids must contain 1 to 3 sites"))
		return
	}
	seen := map[string]bool{}
	var sites []*site
	for _, id := range req.SiteIDs {
		s, ok := m.store.site(id)
		if !siteIDPattern.MatchString(id) || seen[id] {
			writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_SITES", "site_ids must be unique, lowercase ids"))
			return
		}
		if !ok {
			writeError(w, errf(http.StatusNotFound, "SITE_NOT_FOUND", "unknown site %q", id))
			return
		}
		seen[id] = true
		sites = append(sites, s)
	}
	start, err := parseUTC("start_utc", req.StartUTC)
	if err == nil {
		err = checkHours("duration_hours", req.DurationHours, maxWindowHours)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	req.StartUTC = start.Format(time.RFC3339)

	ctx, cancel := context.WithTimeout(r.Context(), requestDeadline)
	defer cancel()
	ev := newEvaluator(m.engine)
	results := make([]siteResult, 0, len(sites))
	for _, s := range sites {
		res, err := m.evaluateSite(ctx, ev, s, start, req.DurationHours, req.IncludeSeries)
		if err != nil {
			writeError(w, err)
			return
		}
		results = append(results, res)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"api_version":              missionAPIVersion,
		"request_sha256":           fingerprint(req),
		"model":                    model,
		"request":                  req,
		"results":                  results,
		"scientifically_validated": scientificallyValidated(results...),
		"limitations":              limitations,
	})
}

type delayScenarioRequest struct {
	SiteID          string             `json:"site_id"`
	StartUTC        string             `json:"start_utc"`
	DurationHours   float64            `json:"duration_hours"`
	DelaysHours     []float64          `json:"delays_hours"`
	ObserverHeightM *float64           `json:"observer_height_m,omitempty"`
	Constraints     missionConstraints `json:"constraints"`
	IncludeNearby   *bool              `json:"include_nearby,omitempty"`
	MaxNearby       int                `json:"max_nearby"`
}

type scenarioOption struct {
	Kind                string            `json:"kind"`
	SiteID              string            `json:"site_id"`
	DelayHours          float64           `json:"delay_hours"`
	DistanceKm          *float64          `json:"distance_km,omitempty"`
	StartUTC            string            `json:"start_utc"`
	DataStatus          string            `json:"data_status"`
	Reason              string            `json:"reason,omitempty"`
	ScienceStatus       string            `json:"science_status,omitempty"`
	EngineScienceStatus string            `json:"engine_science_status,omitempty"`
	Admissible          bool              `json:"admissible"`
	Checks              []constraintCheck `json:"checks"`
	Breached            []constraintCheck `json:"breached"`
	Metrics             *metrics          `json:"metrics,omitempty"`
	Evaluation          *evaluation       `json:"evaluation,omitempty"`
}

type scenarioOutcome struct {
	Status          string          `json:"status"`
	Message         string          `json:"message"`
	FirstAdmissible *scenarioOption `json:"first_admissible,omitempty"`
}

func (m *missionAPI) delayScenario(w http.ResponseWriter, r *http.Request) {
	var req delayScenarioRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, err)
		return
	}
	s, ok := m.store.site(req.SiteID)
	if !siteIDPattern.MatchString(req.SiteID) || !ok {
		writeError(w, errf(http.StatusNotFound, "SITE_NOT_FOUND", "unknown site"))
		return
	}
	start, err := parseUTC("start_utc", req.StartUTC)
	if err == nil {
		err = checkHours("duration_hours", req.DurationHours, maxWindowHours)
	}
	if err == nil {
		err = normalizeScenario(&req)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	req.StartUTC = start.Format(time.RFC3339)
	ser, ok := m.store.seriesFor(s.ID)
	if !ok {
		writeError(w, errf(http.StatusUnprocessableEntity, "DATA_NOT_AVAILABLE", "no horizon/ephemeris series has been ingested for site %q; nothing can be recalculated", s.ID))
		return
	}
	if req.ObserverHeightM != nil && *req.ObserverHeightM != ser.ObserverHeightM {
		writeError(w, errf(http.StatusUnprocessableEntity, "OBSERVER_HEIGHT_UNAVAILABLE",
			"stored horizon was computed for observer_height_m=%g; other heights need a new terrain horizon", ser.ObserverHeightM))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), requestDeadline)
	defer cancel()
	ev := newEvaluator(m.engine)

	option := func(kind string, target *site, delay float64, dist *float64, baseline *metrics) (scenarioOption, error) {
		at := start.Add(time.Duration(delay * float64(time.Hour)))
		res, err := m.evaluateSite(ctx, ev, target, at, req.DurationHours, false)
		if err != nil {
			return scenarioOption{}, err
		}
		o := scenarioOption{Kind: kind, SiteID: target.ID, DelayHours: delay, DistanceKm: dist, StartUTC: at.Format(time.RFC3339),
			DataStatus: res.DataStatus, Reason: res.Reason, ScienceStatus: res.ScienceStatus, EngineScienceStatus: res.EngineScienceStatus,
			Checks: []constraintCheck{}, Breached: []constraintCheck{}}
		if res.Evaluation != nil {
			o.Checks = req.Constraints.check(res.Evaluation.Metrics, baseline)
			o.Breached = breached(o.Checks)
			o.Admissible = allPassed(o.Checks)
			o.Metrics = &res.Evaluation.Metrics
			o.StartUTC = res.Evaluation.StartUTC
		}
		return o, nil
	}

	base, err := option("baseline", s, 0, nil, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	if base.Metrics == nil {
		writeError(w, errf(http.StatusUnprocessableEntity, "OUTSIDE_COVERAGE", "baseline window is outside stored data: %s", base.Reason))
		return
	}
	options := []scenarioOption{base}
	for _, d := range req.DelaysHours {
		o, err := option("delay", s, d, nil, base.Metrics)
		if err != nil {
			writeError(w, err)
			return
		}
		options = append(options, o)
	}
	considered := []nearbySite{}
	if *req.IncludeNearby {
		considered = m.store.nearby(s.ID, req.MaxNearby+3, false)
		used := 0
		for _, n := range considered {
			if !n.HasSeries || used == req.MaxNearby {
				continue
			}
			used++
			target, _ := m.store.site(n.ID)
			o, err := option("nearby_site", target, 0, n.DistanceKm, base.Metrics)
			if err != nil {
				writeError(w, err)
				return
			}
			options = append(options, o)
		}
	}

	results := []siteResult{}
	for _, o := range options {
		results = append(results, siteResult{DataStatus: o.DataStatus, ScienceStatus: o.ScienceStatus, EngineScienceStatus: o.EngineScienceStatus})
	}
	baseProv := ser.Provenance
	writeJSON(w, http.StatusOK, map[string]any{
		"api_version":              missionAPIVersion,
		"scenario_sha256":          fingerprint(req),
		"model":                    model,
		"request":                  req,
		"site":                     m.summary(s),
		"provenance":               baseProv,
		"options":                  options,
		"nearby_considered":        considered,
		"outcome":                  outcomeFor(options),
		"scientifically_validated": scientificallyValidated(results...),
		"limitations":              limitations,
	})
}

func normalizeScenario(req *delayScenarioRequest) error {
	if req.Constraints.empty() {
		return errf(http.StatusUnprocessableEntity, "CONSTRAINTS_REQUIRED", "declare at least one constraint (e.g. max_continuous_dark_hours)")
	}
	for name, v := range map[string]*float64{
		"max_continuous_dark_hours": req.Constraints.MaxContinuousDarkHours, "max_continuous_comm_gap_hours": req.Constraints.MaxContinuousCommGapHours,
	} {
		if v != nil && (!finite(*v) || *v < 0 || *v > maxWindowHours) {
			return errf(http.StatusUnprocessableEntity, "INVALID_CONSTRAINT", "%s must be in [0, %d]", name, maxWindowHours)
		}
	}
	for name, v := range map[string]*float64{"min_sun_fraction": req.Constraints.MinSunFraction, "min_earth_fraction": req.Constraints.MinEarthFraction} {
		if v != nil && (!finite(*v) || *v < 0 || *v > 1) {
			return errf(http.StatusUnprocessableEntity, "INVALID_CONSTRAINT", "%s must be in [0, 1]", name)
		}
	}
	if req.ObserverHeightM != nil && (!finite(*req.ObserverHeightM) || *req.ObserverHeightM < 0 || *req.ObserverHeightM > 100) {
		return errf(http.StatusUnprocessableEntity, "INVALID_OBSERVER_HEIGHT", "observer_height_m must be in [0, 100]")
	}
	if req.DelaysHours == nil {
		req.DelaysHours = []float64{24, 48, 72}
	}
	if len(req.DelaysHours) > 6 {
		return errf(http.StatusUnprocessableEntity, "INVALID_DELAYS", "at most 6 delays")
	}
	for _, d := range req.DelaysHours {
		if err := checkHours("delays_hours[]", d, maxDelayHours); err != nil {
			return err
		}
	}
	sort.Float64s(req.DelaysHours)
	for i := 1; i < len(req.DelaysHours); i++ {
		if req.DelaysHours[i] == req.DelaysHours[i-1] {
			return errf(http.StatusUnprocessableEntity, "INVALID_DELAYS", "delays must be unique")
		}
	}
	if req.IncludeNearby == nil {
		t := true
		req.IncludeNearby = &t
	}
	if req.MaxNearby == 0 {
		req.MaxNearby = 2
	}
	if req.MaxNearby < 0 || req.MaxNearby > 3 {
		return errf(http.StatusUnprocessableEntity, "INVALID_NEARBY", "max_nearby must be 1..3")
	}
	return nil
}

func outcomeFor(options []scenarioOption) scenarioOutcome {
	if options[0].Admissible {
		return scenarioOutcome{Status: "BASELINE_ADMISSIBLE", Message: "The original site and time satisfy every declared constraint."}
	}
	for i := 1; i < len(options); i++ {
		if options[i].Admissible {
			o := options[i]
			return scenarioOutcome{Status: "ALTERNATIVE_FOUND", Message: "The baseline breaches a declared constraint; the first evaluated option that satisfies all of them is listed.", FirstAdmissible: &o}
		}
	}
	return scenarioOutcome{Status: "NO_ADMISSIBLE_ALTERNATIVE", Message: "No evaluated date or nearby site satisfies every declared constraint with the stored data. No alternative is proposed."}
}
