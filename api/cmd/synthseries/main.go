// Command synthseries writes the synthetic site series used by tests and UI
// development. The output is deliberately labelled SYNTHETIC: it is shaped
// like a south-pole sky (Sun and Earth skimming the horizon) but it is not
// derived from NASA terrain or ephemerides.
//
//	go run ./cmd/synthseries -out sitedata/series
package main

import (
	"encoding/json"
	"flag"
	"log"
	"math"
	"os"
	"path/filepath"
	"time"
)

type angle struct {
	AzimuthDeg   float64 `json:"azimuth_deg"`
	ElevationDeg float64 `json:"elevation_deg"`
}

type sample struct {
	Sun   angle `json:"sun"`
	Earth angle `json:"earth"`
}

type series struct {
	Schema          string         `json:"schema"`
	SiteID          string         `json:"site_id"`
	ScienceStatus   string         `json:"science_status"`
	Provenance      map[string]any `json:"provenance"`
	ObserverHeightM float64        `json:"observer_height_m"`
	TerrainHorizon  []angle        `json:"terrain_horizon"`
	StartUTC        string         `json:"start_utc"`
	StepSeconds     int            `json:"step_seconds"`
	Samples         []sample       `json:"samples"`
}

const (
	synodicHours  = 29.530589 * 24
	siderealHours = 27.321661 * 24
)

func round(v float64) float64 { return math.Round(v*1e4) / 1e4 }

func wrap(az float64) float64 {
	az = math.Mod(az, 360)
	if az < 0 {
		az += 360
	}
	return round(az)
}

func rad(d float64) float64 { return d * math.Pi / 180 }

func build(siteID string, phase float64) series {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	step := time.Hour

	horizon := make([]angle, 0, 72)
	for az := 0.0; az < 360; az += 5 {
		el := 1.2 + 1.5*math.Sin(rad(2*az+phase)) + 1.0*math.Cos(rad(3*az+20+phase))
		horizon = append(horizon, angle{az, round(math.Max(el, -1))})
	}

	var samples []sample
	for t := start; t.Before(end); t = t.Add(step) {
		h := t.Sub(start).Hours()
		sunAz := 360*h/synodicHours + phase
		sunEl := 0.6 + 1.6*math.Cos(rad(sunAz-40))
		earthAz := 4 * math.Sin(2*math.Pi*h/siderealHours)
		earthEl := 1.5 + 5.5*math.Sin(2*math.Pi*h/siderealHours+1+rad(phase))
		samples = append(samples, sample{
			Sun:   angle{wrap(sunAz), round(sunEl)},
			Earth: angle{wrap(earthAz), round(earthEl)},
		})
	}

	return series{
		Schema:        "braspace.site-series.v1",
		SiteID:        siteID,
		ScienceStatus: "SYNTHETIC",
		Provenance: map[string]any{
			"terrain_dataset_id": "SYNTHETIC-HORIZON-NOT-NASA",
			"ephemeris_id":       "SYNTHETIC-EPHEMERIS-NOT-NASA",
			"frame":              "MOON_ME",
			"generator":          "api/cmd/synthseries v1",
			"note":               "Synthetic test fixture. Not NASA data.",
		},
		ObserverHeightM: 2,
		TerrainHorizon:  horizon,
		StartUTC:        start.Format(time.RFC3339),
		StepSeconds:     int(step.Seconds()),
		Samples:         samples,
	}
}

func main() {
	out := flag.String("out", "sitedata/series", "output directory")
	flag.Parse()
	for id, phase := range map[string]float64{"synthetic-demo-a": 0, "synthetic-demo-b": 35} {
		data, err := json.Marshal(build(id, phase))
		if err != nil {
			log.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(*out, id+".json"), append(data, '\n'), 0o644); err != nil {
			log.Fatal(err)
		}
	}
}
