package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// BR02: a null/empty sample in a file series decodes to the zero direction
// (az 0, el 0), which is a valid angle, and is used as real data.
func TestBR02SeriesRejectsNullOrEmptySample(t *testing.T) {
	raw, err := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	if err != nil {
		t.Fatal(err)
	}
	for name, repl := range map[string]string{"null": "null", "empty": "{}"} {
		var doc map[string]any
		if err := json.Unmarshal(raw, &doc); err != nil {
			t.Fatal(err)
		}
		samples := doc["samples"].([]any)
		if name == "null" {
			samples[1] = nil
		} else {
			samples[1] = map[string]any{}
		}
		b, _ := json.Marshal(doc)
		var s siteSeries
		if err := decodeStrict(b, &s); err == nil {
			if err := validateSeries(&s); err == nil {
				t.Errorf("%s sample (%s) accepted and filled with zeros", name, repl)
			}
		}
	}
}

// BR02: the public limitations text still promises one-step rounding.
func TestBR02LimitationsDoNotPromiseRounding(t *testing.T) {
	for _, l := range limitations {
		if strings.Contains(l, "resolution of one series step") {
			t.Errorf("stale limitation contradicts exact-grid rule: %q", l)
		}
	}
}

func TestBR13SampleErrorIsTyped(t *testing.T) {
	for _, in := range []string{"null", "{}", `{"sun":{"azimuth_deg":1,"elevation_deg":2}}`, `{"sun":{"azimuth_deg":1},"earth":{"azimuth_deg":1,"elevation_deg":2}}`} {
		var smp seriesSample
		err := json.Unmarshal([]byte(in), &smp)
		var se *SampleError
		if !errors.As(err, &se) {
			t.Errorf("%s: want *SampleError, got %v", in, err)
		}
	}
}
