package main

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"
)

// GET /api/sites/{id}/sky (BS-025): read-only view of one site's stored terrain
// horizon and Sun/Earth look angles. Every angle is copied from the server-side
// series (file or PostgreSQL); nothing is interpolated, extrapolated or promoted.
// Visibility flags and margins come from the same engine as /api/compare.

const (
	maxSkySamples   = 1000
	defaultSkyHours = 24.0
)

type skySample struct {
	EpochUTC       string    `json:"epoch_utc"`
	Sun            direction `json:"sun"`
	Earth          direction `json:"earth"`
	SunVisible     bool      `json:"sun_visible"`
	EarthVisible   bool      `json:"earth_visible"`
	SunMarginDeg   float64   `json:"sun_margin_deg"`
	EarthMarginDeg float64   `json:"earth_margin_deg"`
}

type skyResponse struct {
	APIVersion      string           `json:"api_version"`
	SiteID          string           `json:"site_id"`
	ScienceStatus   string           `json:"science_status"`
	Provenance      seriesProvenance `json:"provenance"`
	ObserverHeightM float64          `json:"observer_height_m"`
	StartUTC        string           `json:"start_utc"`
	EndUTC          string           `json:"end_utc"`
	StepSeconds     int              `json:"step_seconds"`
	TerrainHorizon  []horizonSample  `json:"terrain_horizon"`
	Samples         []skySample      `json:"samples"`
	Limitations     []string         `json:"limitations"`
}

func (m *missionAPI) registerSky(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sites/{id}/sky", m.siteSky)
}

func (m *missionAPI) siteSky(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s, ok := m.store.site(id)
	if !siteIDPattern.MatchString(id) || !ok {
		writeError(w, errf(http.StatusNotFound, "SITE_NOT_FOUND", "unknown site"))
		return
	}
	ser, ok := m.store.seriesFor(s.ID)
	if !ok {
		writeError(w, errf(http.StatusNotFound, "NO_SERIES_DATA", "no horizon/ephemeris series has been ingested for this site"))
		return
	}
	q := r.URL.Query()
	start := ser.start
	if v := q.Get("start"); v != "" {
		t, err := parseUTC("start", v)
		if err != nil {
			writeError(w, err)
			return
		}
		start = t
	}
	hours := defaultSkyHours
	if v := q.Get("hours"); v != "" {
		h, err := strconv.ParseFloat(v, 64)
		if err != nil {
			writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_DURATION", "hours must be a number in (0, %d]", maxWindowHours))
			return
		}
		hours = h
	}
	if err := checkHours("hours", hours, maxWindowHours); err != nil {
		writeError(w, err)
		return
	}
	stride := 1
	if v := q.Get("step"); v != "" {
		sec, err := strconv.Atoi(v)
		if err != nil || sec < ser.StepSeconds || sec%ser.StepSeconds != 0 {
			writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_STEP", "step must be a whole multiple of the series step (%d s), in seconds", ser.StepSeconds))
			return
		}
		stride = sec / ser.StepSeconds
	}
	off := start.Sub(ser.start)
	if off < 0 {
		writeError(w, errf(http.StatusUnprocessableEntity, "OUTSIDE_COVERAGE", "series covers %s to %s", ser.StartUTC, ser.end().Format(time.RFC3339)))
		return
	}
	if off%ser.step != 0 {
		writeError(w, errf(http.StatusUnprocessableEntity, "GRID_NOT_ALIGNED", "start must fall on the series grid (start_utc %s, step %d s)", ser.StartUTC, ser.StepSeconds))
		return
	}
	from := int(off / ser.step)
	n := int(math.Ceil(hours * float64(time.Hour) / float64(ser.step)))
	if n < 1 {
		n = 1
	}
	to := from + n
	if to > len(ser.Samples) {
		writeError(w, errf(http.StatusUnprocessableEntity, "OUTSIDE_COVERAGE", "series covers %s to %s", ser.StartUTC, ser.end().Format(time.RFC3339)))
		return
	}
	count := (n + stride - 1) / stride
	if count > maxSkySamples {
		writeError(w, errf(http.StatusUnprocessableEntity, "WINDOW_TOO_LONG", "window would return %d samples; the limit is %d (raise step or shorten hours)", count, maxSkySamples))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestDeadline)
	defer cancel()
	ev := newEvaluator(m.engine)
	var res []engineResult
	if stride == 1 {
		var err error
		if res, err = ev.evaluate(ctx, ser, from, to); err != nil {
			writeError(w, err)
			return
		}
	} else {
		for i := from; i < to; i += stride {
			one, err := ev.evaluate(ctx, ser, i, i+1)
			if err != nil {
				writeError(w, err)
				return
			}
			res = append(res, one[0])
		}
	}
	if len(res) != count {
		writeError(w, errors.New("sky: sample count mismatch"))
		return
	}
	out := make([]skySample, 0, count)
	for k, rr := range res {
		i := from + k*stride
		out = append(out, skySample{
			EpochUTC: ser.epoch(i).Format(time.RFC3339), Sun: ser.Samples[i].Sun, Earth: ser.Samples[i].Earth,
			SunVisible: rr.SunVisible, EarthVisible: rr.EarthVisible,
			SunMarginDeg: round6(rr.SunMarginDeg), EarthMarginDeg: round6(rr.EarthMarginDeg),
		})
	}
	writeJSON(w, http.StatusOK, skyResponse{
		APIVersion: missionAPIVersion, SiteID: s.ID, ScienceStatus: ser.ScienceStatus, Provenance: ser.Provenance,
		ObserverHeightM: ser.ObserverHeightM, StartUTC: out[0].EpochUTC, EndUTC: ser.epoch(from + n).Format(time.RFC3339),
		StepSeconds: ser.StepSeconds * stride, TerrainHorizon: ser.TerrainHorizon, Samples: out,
		Limitations: append([]string{
			"Angles and horizon are the stored series values, copied unchanged; nothing is interpolated.",
			"science_status is the series state and is never promoted by this route.",
		}, limitations...),
	})
}
