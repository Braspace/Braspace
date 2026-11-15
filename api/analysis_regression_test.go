package main

import (
	"math"
	"testing"
	"time"
)

// Enumerate 256 synthetic visibility patterns. This is an independent
// software-invariant oracle; it does not prove physical or NASA data accuracy.
func TestAnalysisExhaustiveShortVisibilityWindows(t *testing.T) {
	site := &siteSeries{
		start: time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC),
		step:  30 * time.Minute,
	}
	const count = 8
	for mask := 0; mask < (1 << count); mask++ {
		results := make([]engineResult, count)
		sunCount, earthCount, bothCount := 0, 0, 0
		maxDark, darkStreak := 0, 0
		maxGap, earthStreak := 0, 0
		expectedSunWindows := 0
		previousSun := false
		for i := 0; i < count; i++ {
			sun := (mask>>i)&1 != 0
			// The second visibility sequence is intentionally independent.
			earth := (mask>>(count-1-i))&1 != 0
			results[i] = engineResult{
				SunVisible: sun, EarthVisible: earth,
				SunMarginDeg: -2, EarthMarginDeg: -3,
			}
			if sun {
				sunCount++
				if !previousSun {
					expectedSunWindows++
				}
				darkStreak = 0
			} else {
				darkStreak++
				if darkStreak > maxDark {
					maxDark = darkStreak
				}
			}
			previousSun = sun
			if earth {
				earthCount++
				earthStreak = 0
			} else {
				earthStreak++
				if earthStreak > maxGap {
					maxGap = earthStreak
				}
			}
			if sun && earth {
				bothCount++
			}
		}
		got := analyze(site, 0, results, true)
		metrics := got.Metrics
		if metrics.SampleCount != count || metrics.StepHours != 0.5 ||
			math.Abs(metrics.SunVisibleFraction-float64(sunCount)/count) > 1e-6 ||
			math.Abs(metrics.EarthVisibleFraction-float64(earthCount)/count) > 1e-6 ||
			math.Abs(metrics.SimultaneousFraction-float64(bothCount)/count) > 1e-6 ||
			metrics.LongestDarkHours != float64(maxDark)*0.5 ||
			metrics.LongestCommGapHours != float64(maxGap)*0.5 ||
			metrics.SunVisibilityWindowCount != expectedSunWindows {
			t.Fatalf("mask %08b produced inconsistent metrics: %+v", mask, metrics)
		}
		if len(got.Series) != count || got.EndUTC != "2026-12-01T04:00:00Z" {
			t.Fatalf("mask %08b: unexpected timestamps or series count", mask)
		}
		totalVisible := 0.0
		for _, window := range got.SunWindows {
			start, errStart := time.Parse(time.RFC3339, window.StartUTC)
			end, errEnd := time.Parse(time.RFC3339, window.EndUTC)
			if errStart != nil || errEnd != nil || !start.Before(end) ||
				window.DurationHours != end.Sub(start).Hours() {
				t.Fatalf("mask %08b invalid visible window %+v", mask, window)
			}
			totalVisible += window.DurationHours
		}
		if totalVisible != float64(sunCount)*0.5 {
			t.Fatalf("mask %08b lost visible hours: got %v", mask, totalVisible)
		}
	}
}

func TestConstraintMarginsAreSignedAndHonest(t *testing.T) {
	maxDark, minEarth := 2.0, 0.75
	limit := missionConstraints{
		MaxContinuousDarkHours: &maxDark,
		MinEarthFraction:       &minEarth,
	}
	checks := limit.check(metrics{LongestDarkHours: 3, EarthVisibleFraction: 0.5}, nil)
	if len(checks) != 2 || checks[0].Passed || checks[1].Passed ||
		checks[0].Margin != -1 || checks[1].Margin != -0.25 ||
		allPassed(checks) || len(breached(checks)) != 2 {
		t.Fatalf("breached assumptions must remain explicit: %+v", checks)
	}
	if limit.empty() {
		t.Fatal("declared limits must never be treated as empty")
	}
}
