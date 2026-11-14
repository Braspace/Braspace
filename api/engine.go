package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"
)

var (
	errEngineUnavailable = errors.New("engine unavailable")
	errEngineTimeout     = errors.New("engine deadline exceeded")
	errEngineFailed      = errors.New("engine execution failed")
	errEngineContract    = errors.New("engine returned invalid contract")
	errRequestCanceled   = errors.New("request canceled by client")
)

// engineSlots bounds concurrent engine subprocesses across all requests, so
// parallel requests queue instead of multiplying processes.
var engineSlots = make(chan struct{}, maxConcurrentEngines())

func maxConcurrentEngines() int {
	n := 2 * runtime.NumCPU()
	if n > 16 {
		n = 16
	}
	return n
}

// maxEngineCallsPerRequest caps the uncached samples one request may evaluate.
var maxEngineCallsPerRequest = 4000

// engineResult mirrors the Rust engine stdout contract (braspace.visibility.v1).
type engineResult struct {
	SiteID                 string  `json:"site_id"`
	EpochUTC               string  `json:"epoch_utc"`
	ScienceStatus          string  `json:"science_status"`
	SunHorizonDeg          float64 `json:"sun_horizon_deg"`
	EarthHorizonDeg        float64 `json:"earth_horizon_deg"`
	SunMarginDeg           float64 `json:"sun_margin_deg"`
	EarthMarginDeg         float64 `json:"earth_margin_deg"`
	SunVisible             bool    `json:"sun_visible"`
	EarthVisible           bool    `json:"earth_visible"`
	SimultaneousVisibility bool    `json:"simultaneous_visibility"`
	SourceWarning          string  `json:"source_warning,omitempty"`
}

// maxEngineOutputBytes caps what the engine may write to stdout (the real
// result is well under 1 KiB).
const maxEngineOutputBytes = 64 << 10

// cappedBuffer stops accepting bytes past max and reports the overflow, so a
// runaway engine is killed by a write error instead of filling memory.
type cappedBuffer struct {
	buf      bytes.Buffer
	max      int
	overflow bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if c.buf.Len()+len(p) > c.max {
		c.overflow = true
		return 0, errors.New("engine output too large")
	}
	return c.buf.Write(p)
}

type engineClient struct {
	binary      string
	callTimeout time.Duration
	workers     int
}

func newEngineClient(binary string) *engineClient {
	w := runtime.NumCPU()
	if w > 8 {
		w = 8
	}
	return &engineClient{binary: binary, callTimeout: 2 * time.Second, workers: w}
}

func (e *engineClient) available() bool {
	st, err := os.Stat(e.binary)
	if err != nil || st.IsDir() {
		return false
	}
	// Windows has no execute bit; existence of a regular file is the check there.
	return runtime.GOOS == "windows" || st.Mode()&0o111 != 0
}

func (e *engineClient) call(ctx context.Context, req visibilityRequest) (engineResult, error) {
	res, _, err := e.callRaw(ctx, req)
	return res, err
}

// callRaw is call plus the validated engine stdout, for routes that return the
// engine document as-is (/v1/visibility).
func (e *engineClient) callRaw(ctx context.Context, req visibilityRequest) (engineResult, []byte, error) {
	if !e.available() {
		return engineResult{}, nil, errEngineUnavailable
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return engineResult{}, nil, err
	}
	select {
	case engineSlots <- struct{}{}:
		defer func() { <-engineSlots }()
	case <-ctx.Done():
		return engineResult{}, nil, ctxError(ctx)
	}
	parent := ctx
	ctx, cancel := context.WithTimeout(ctx, e.callTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, e.binary)
	cmd.WaitDelay = 500 * time.Millisecond
	cmd.Stdin = bytes.NewReader(payload)
	stdout := &cappedBuffer{max: maxEngineOutputBytes}
	var stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = stdout, &stderr
	if err := cmd.Run(); err != nil {
		if parent.Err() != nil {
			return engineResult{}, nil, ctxError(parent)
		}
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return engineResult{}, nil, errEngineTimeout
		}
		log.Printf("engine error: %v; stderr: %.300s", err, stderr.String())
		return engineResult{}, nil, errEngineFailed
	}
	if stdout.overflow {
		return engineResult{}, nil, errEngineContract
	}
	res, err := parseEngineResult(req, stdout.buf.Bytes())
	return res, stdout.buf.Bytes(), err
}

// parseEngineResult is the shared fail-closed contract for direct and
// mission/scenario routes. Neither route accepts synthetic 'VALIDATED' claims.
func parseEngineResult(req visibilityRequest, payload []byte) (engineResult, error) {
	// The current engine is a classifier of caller-supplied inputs, not a
	// NASA-validated solver; reject attempts to self-certify or forge margins.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(payload, &raw); err != nil || raw == nil {
		return engineResult{}, errEngineContract
	}
	for _, key := range []string{"site_id", "epoch_utc", "science_status",
		"sun_horizon_deg", "earth_horizon_deg", "sun_margin_deg",
		"earth_margin_deg", "sun_visible", "earth_visible", "simultaneous_visibility"} {
		if _, present := raw[key]; !present {
			return engineResult{}, errEngineContract
		}
	}
	var res engineResult
	dec := json.NewDecoder(bytes.NewReader(payload))
	_ = dec
	if err := dec.Decode(&res); err != nil ||
		res.SiteID != req.SiteID || res.EpochUTC != req.EpochUTC ||
		res.ScienceStatus != "UNVERIFIED_INPUTS" ||
		!finite(res.SunHorizonDeg) || !finite(res.EarthHorizonDeg) ||
		!finite(res.SunMarginDeg) || !finite(res.EarthMarginDeg) ||
		math.Abs(res.SunHorizonDeg) > 90 || math.Abs(res.EarthHorizonDeg) > 90 ||
		math.Abs(res.SunMarginDeg-(req.Sun.ElevationDeg-res.SunHorizonDeg)) > 1e-8 ||
		math.Abs(res.EarthMarginDeg-(req.Earth.ElevationDeg-res.EarthHorizonDeg)) > 1e-8 ||
		res.SunVisible != (res.SunMarginDeg >= 0) ||
		res.EarthVisible != (res.EarthMarginDeg >= 0) ||
		res.SimultaneousVisibility != (res.SunVisible && res.EarthVisible) {
		return engineResult{}, errEngineContract
	}
	return res, nil
}

// evaluator runs the engine over series samples, caching per (site, index)
// so overlapping scenario windows are computed once per request.
type evaluator struct {
	engine  *engineClient
	mu      sync.Mutex
	cache   map[string]engineResult
	planned int
}

// ctxError distinguishes a client disconnect from a deadline.
func ctxError(ctx context.Context) error {
	if errors.Is(ctx.Err(), context.Canceled) {
		return errRequestCanceled
	}
	return errEngineTimeout
}

func newEvaluator(e *engineClient) *evaluator {
	return &evaluator{engine: e, cache: map[string]engineResult{}}
}

func (ev *evaluator) evaluate(ctx context.Context, s *siteSeries, from, to int) ([]engineResult, error) {
	if !ev.engine.available() {
		return nil, errEngineUnavailable
	}
	ev.mu.Lock()
	for i := from; i < to; i++ {
		if _, hit := ev.cache[fmt.Sprintf("%s/%d", s.SiteID, i)]; !hit {
			ev.planned++
		}
	}
	over := ev.planned > maxEngineCallsPerRequest
	ev.mu.Unlock()
	if over {
		return nil, errf(http.StatusUnprocessableEntity, "TOO_MANY_EVALUATIONS",
			"request needs more than %d engine evaluations; shorten the window or reduce delays/sites", maxEngineCallsPerRequest)
	}
	out := make([]engineResult, to-from)
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	jobs := make(chan int)
	var wg sync.WaitGroup
	var once sync.Once
	var firstErr error
	for w := 0; w < ev.engine.workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				key := fmt.Sprintf("%s/%d", s.SiteID, i)
				ev.mu.Lock()
				res, hit := ev.cache[key]
				ev.mu.Unlock()
				if !hit {
					var err error
					res, err = ev.engine.call(ctx, s.request(i))
					if err != nil {
						once.Do(func() { firstErr = err; cancel() })
						continue
					}
					ev.mu.Lock()
					ev.cache[key] = res
					ev.mu.Unlock()
				}
				out[i-from] = res
			}
		}()
	}
loop:
	for i := from; i < to; i++ {
		select {
		case jobs <- i:
		case <-ctx.Done():
			break loop
		}
	}
	close(jobs)
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if ctx.Err() != nil {
		return nil, ctxError(ctx)
	}
	return out, nil
}

func (s *siteSeries) request(i int) visibilityRequest {
	return visibilityRequest{
		SiteID:         s.SiteID,
		EpochUTC:       s.epoch(i).Format(time.RFC3339),
		Sun:            s.Samples[i].Sun,
		Earth:          s.Samples[i].Earth,
		TerrainHorizon: s.TerrainHorizon,
		Provenance: provenance{
			TerrainDatasetID: s.Provenance.TerrainDatasetID,
			EphemerisID:      s.Provenance.EphemerisID,
			Frame:            s.Provenance.Frame,
		},
	}
}
