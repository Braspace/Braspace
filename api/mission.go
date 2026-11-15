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
	"mime"
	"net/http"
	"sort"
	"time"

	"github.com/Braspace/Braspace/api/internal/jsoncontract"
	"github.com/Braspace/Braspace/api/onboard"
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
	"Windows must start on a series grid epoch and last a whole multiple of the series step; anything else is reported as GRID_NOT_ALIGNED, never rounded.",
	"Results are only as accurate as the stored horizon and ephemeris series; check science_status and provenance per site.",
	"Constraint thresholds are caller-declared assumptions, not mission requirements.",
}

type missionAPI struct {
	store  *siteStore
	engine *engineClient
	// storePing, quando definido (store postgres), sonda o banco com timeout curto.
	// O catálogo é servido da memória: falha aqui degrada /api/health, não derruba o serviço.
	storePing func(context.Context) error
}

const storePingTimeout = 500 * time.Millisecond

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
	case errors.Is(err, errRequestCanceled):
		ae = errf(499, "REQUEST_CANCELED", "client closed the request")
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
	m.registerSky(mux)
	mux.HandleFunc("POST /api/compare", m.compare)
	mux.HandleFunc("POST /api/scenarios/delay", m.delayScenario)
	mux.HandleFunc("POST /api/onboard/site-evaluate", m.siteOnboard)
	mux.HandleFunc("POST /api/onboard/site-report", m.siteReport)
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
		"data_source":             m.store.source,
		"sites":                   len(m.store.sites),
		"sites_with_series":       len(m.store.series),
		"series_science_statuses": statuses,
		"status":                  "ok",
	}
	store := map[string]any{"source": m.store.source, "status": "ok"}
	if m.storePing != nil {
		ctx, cancel := context.WithTimeout(r.Context(), storePingTimeout)
		start := time.Now()
		err := m.storePing(ctx)
		cancel()
		store["last_ping_ms"] = float64(time.Since(start).Microseconds()) / 1000
		if err != nil {
			store["status"], body["status"] = "degraded", "degraded"
		}
	}
	body["store"] = store
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
	if media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || media != "application/json" {
		return errf(http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "application/json required")
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBytes+1))
	if err != nil || len(raw) > maxRequestBytes {
		return errf(http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "request too large")
	}
	if err := jsoncontract.Check(raw); err != nil {
		return errf(http.StatusBadRequest, "INVALID_JSON", "invalid JSON document")
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

// Grid alignment is mandatory: floor/ceil resampling can silently change
// reported sunlight, communications and energy for an actual mission window.
func gridAligned(s *siteSeries, start time.Time, hours float64) bool {
	if s.step <= 0 || !finite(hours) || hours <= 0 {
		return false
	}
	value := hours * float64(time.Hour)
	if value <= 0 || value > float64(365*24*time.Hour) {
		return false
	}
	rounded := math.Round(value)
	if math.Abs(value-rounded) > 1 {
		return false
	} // sub-ns float tolerance
	return rounded >= float64(s.step) && start.Sub(s.start)%s.step == 0 && time.Duration(rounded)%s.step == 0
}

// span maps the exact [start, start+hours) onto sample indices; never rounds.
func span(s *siteSeries, start time.Time, hours float64) (from, to int, ok bool) {
	if !gridAligned(s, start, hours) {
		return 0, 0, false
	}
	off := start.Sub(s.start)
	if off < 0 {
		return 0, 0, false
	}
	from = int(off / s.step)
	to = from + int(time.Duration(math.Round(hours*float64(time.Hour)))/s.step)
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
	if !gridAligned(ser, start, hours) {
		res.DataStatus = "GRID_NOT_ALIGNED"
		res.Reason = fmt.Sprintf("requested start and duration must match the %d-second sample grid exactly", ser.StepSeconds)
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
	// Even one missing or off-grid candidate invalidates a full comparison.
	if len(results) == 0 {
		return false
	}
	for _, r := range results {
		if r.DataStatus != "AVAILABLE" ||
			r.ScienceStatus != "VALIDATED" || r.EngineScienceStatus != "VALIDATED" {
			return false
		}
	}
	return true
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
	req.StartUTC = start.Format(time.RFC3339Nano)

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
	// Optional resource models (#69): crew consumables, and the onboard
	// energy/comms simulator from #70 applied to each option.
	Crew                 *crewSpec      `json:"crew,omitempty"`
	Power                *onboard.Power `json:"power,omitempty"`
	MaxCommBlackoutHours *float64       `json:"max_comm_blackout_hours,omitempty"`
}

type onboardSummary struct {
	SimulationStatus string          `json:"simulation_status"`
	EndMode          string          `json:"end_mode"`
	Metrics          onboard.Metrics `json:"metrics"`
	Risks            []onboard.Risk  `json:"risks"`
}

type scenarioOption struct {
	Kind                string             `json:"kind"`
	SiteID              string             `json:"site_id"`
	DelayHours          float64            `json:"delay_hours"`
	DistanceKm          *float64           `json:"distance_km,omitempty"`
	StartUTC            string             `json:"start_utc"`
	DataStatus          string             `json:"data_status"`
	Reason              string             `json:"reason,omitempty"`
	ScienceStatus       string             `json:"science_status,omitempty"`
	EngineScienceStatus string             `json:"engine_science_status,omitempty"`
	Admissible          bool               `json:"admissible"`
	Checks              []constraintCheck  `json:"checks"`
	Breached            []constraintCheck  `json:"breached"`
	Metrics             *metrics           `json:"metrics,omitempty"`
	Evaluation          *evaluation        `json:"evaluation,omitempty"`
	Consumables         *consumablesResult `json:"consumables,omitempty"`
	Onboard             *onboardSummary    `json:"onboard,omitempty"`
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
	req.StartUTC = start.Format(time.RFC3339Nano)
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

	var baseOpt *scenarioOption
	option := func(kind string, target *site, delay float64, dist *float64, baseline *metrics) (scenarioOption, error) {
		at := start.Add(time.Duration(delay * float64(time.Hour)))
		// Options are only comparable on horizons computed for the same observer height.
		if ts, ok := m.store.seriesFor(target.ID); ok && ts.ObserverHeightM != ser.ObserverHeightM {
			return scenarioOption{Kind: kind, SiteID: target.ID, DelayHours: delay, DistanceKm: dist, StartUTC: at.Format(time.RFC3339Nano),
				DataStatus: "OBSERVER_HEIGHT_MISMATCH", Checks: []constraintCheck{}, Breached: []constraintCheck{},
				Reason: fmt.Sprintf("series computed for observer_height_m=%g, baseline uses %g", ts.ObserverHeightM, ser.ObserverHeightM)}, nil
		}
		res, err := m.evaluateSite(ctx, ev, target, at, req.DurationHours, false)
		if err != nil {
			return scenarioOption{}, err
		}
		o := scenarioOption{Kind: kind, SiteID: target.ID, DelayHours: delay, DistanceKm: dist, StartUTC: at.Format(time.RFC3339Nano),
			DataStatus: res.DataStatus, Reason: res.Reason, ScienceStatus: res.ScienceStatus, EngineScienceStatus: res.EngineScienceStatus,
			Checks: []constraintCheck{}, Breached: []constraintCheck{}}
		if res.Evaluation != nil {
			o.Checks = req.Constraints.check(res.Evaluation.Metrics, baseline)
			o.Breached = breached(o.Checks)
			o.Admissible = allPassed(o.Checks)
			o.Metrics = &res.Evaluation.Metrics
			o.StartUTC = res.Evaluation.StartUTC
			if err := m.resourceChecks(ctx, ev, &req, &o, target, at, delay, baseOpt); err != nil {
				return scenarioOption{}, err
			}
			o.Breached = breached(o.Checks)
			o.Admissible = allPassed(o.Checks)
		}
		return o, nil
	}

	base, err := option("baseline", s, 0, nil, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	if base.Metrics == nil {
		code := "OUTSIDE_COVERAGE"
		if base.DataStatus == "GRID_NOT_ALIGNED" {
			code = "GRID_NOT_ALIGNED"
		}
		writeError(w, errf(http.StatusUnprocessableEntity, code, "baseline cannot be evaluated: %s", base.Reason))
		return
	}
	baseOpt = &base
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
	if req.Constraints.empty() && req.Crew == nil && req.Power == nil {
		return errf(http.StatusUnprocessableEntity, "CONSTRAINTS_REQUIRED", "declare at least one constraint, crew or power model")
	}
	if req.Crew != nil {
		if err := req.Crew.validate(); err != nil {
			return err
		}
	}
	if (req.Power == nil) != (req.MaxCommBlackoutHours == nil) {
		return errf(http.StatusUnprocessableEntity, "INVALID_POWER", "power and max_comm_blackout_hours go together")
	}
	if req.Power != nil && (!finite(*req.MaxCommBlackoutHours) || *req.MaxCommBlackoutHours < 0 || *req.MaxCommBlackoutHours > req.DurationHours) {
		return errf(http.StatusUnprocessableEntity, "INVALID_POWER", "max_comm_blackout_hours must be in [0, duration_hours]")
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

// resourceChecks adds consumable and onboard energy/comms results to an option
// and appends their constraint checks (with baseline values when available).
func (m *missionAPI) resourceChecks(ctx context.Context, ev *evaluator, req *delayScenarioRequest, o *scenarioOption, target *site, at time.Time, delay float64, base *scenarioOption) error {
	if req.Crew != nil {
		cons := consumables(req.Crew, at, req.DurationHours, delay)
		o.Consumables = &cons
		var bc *consumablesResult
		if base != nil {
			bc = base.Consumables
		}
		o.Checks = append(o.Checks, consumableChecks(req.Crew, &cons, bc)...)
	}
	if req.Power == nil {
		return nil
	}
	in, err := m.adaptSeries(ctx, ev, "option "+o.Kind, target.ID, at, req.DurationHours)
	if err != nil {
		return err
	}
	resp, err := onboard.Evaluate(onboard.Request{MissionID: "delay-replan", Candidates: []onboard.Candidate{in.candidate(o.Kind, *req.Power, *req.MaxCommBlackoutHours)}})
	if err != nil {
		return errf(http.StatusUnprocessableEntity, "INVALID_SCENARIO", "%s", err)
	}
	opt := resp.Options[0]
	o.Onboard = &onboardSummary{SimulationStatus: opt.SimulationStatus, EndMode: opt.EndMode, Metrics: opt.Metrics, Risks: opt.Risks}
	var bm *onboard.Metrics
	if base != nil && base.Onboard != nil {
		bm = &base.Onboard.Metrics
	}
	// Pass/fail comes from the simulator's own risk register, which uses
	// unrounded values; the reported value and margin are its rounded metrics.
	risks := map[string]bool{}
	for _, rk := range opt.Risks {
		risks[rk.Category] = true
	}
	add := func(name, unit, cmp string, limit float64, pick func(onboard.Metrics) float64, riskCategory string) {
		v := pick(opt.Metrics)
		margin := limit - v
		if cmp == ">=" {
			margin = v - limit
		}
		cc := constraintCheck{Criterion: name, Unit: unit, Comparator: cmp, Limit: limit, Value: v, Margin: round6(margin), Passed: !risks[riskCategory]}
		if bm != nil {
			b := pick(*bm)
			cc.BaselineValue = &b
		}
		o.Checks = append(o.Checks, cc)
	}
	add("min_battery_charge_wh", "Wh", ">=", req.Power.ReserveWh, func(m onboard.Metrics) float64 { return m.MinChargeWh }, "ENERGY_RESERVE")
	add("unserved_energy_wh", "Wh", "<=", 0, func(m onboard.Metrics) float64 { return m.UnservedEnergyWh }, "ENERGY_LOSS")
	add("longest_earth_obstruction_hours", "h", "<=", *req.MaxCommBlackoutHours, func(m onboard.Metrics) float64 { return m.LongestEarthObstructionHours }, "EARTH_GEOMETRIC_BLACKOUT")
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
