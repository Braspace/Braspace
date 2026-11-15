package main

import (
	"math"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// Synthetic regression tests for the stacked horizon-reach blackout gate (port of
// tests/test_horizon_blackout_monotonicity.py). No lunar science is independently validated.

func blackoutFixture(t *testing.T) any {
	return mustJSON(t, `{
  "schema": "braspace.horizon-reach-study.v1",
  "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
  "reaches_m": [100000, 200000],
  "sites": [{"site": "SYNTHETIC_SITE", "reaches": [
    {"reach_m": 100000, "sun_center_visible_pct": 40.0, "mean_solar_disc_visible_pct": 41.0,
     "earth_center_visible_pct": 60.0, "longest_darkness_h": 670.0, "longest_earth_blackout_h": 20.0},
    {"reach_m": 200000, "sun_center_visible_pct": 35.0, "mean_solar_disc_visible_pct": 36.0,
     "earth_center_visible_pct": 55.0, "longest_darkness_h": 3389.0, "longest_earth_blackout_h": 30.0}
  ]}]
}`)
}

func TestValidSyntheticIncreasingBlackout(t *testing.T) {
	if errs := check(blackoutFixture(t)); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestSolarDarknessMustNotDecrease(t *testing.T) {
	data := blackoutFixture(t)
	pyjson.Set(data, 669.0, "sites", 0, "reaches", 1, "longest_darkness_h")
	if !hasError(check(data), "longest_darkness_h decreases") {
		t.Fatal("decrease not reported")
	}
}

func TestEarthBlackoutMustNotDecrease(t *testing.T) {
	data := blackoutFixture(t)
	pyjson.Set(data, 19.0, "sites", 0, "reaches", 1, "longest_earth_blackout_h")
	if !hasError(check(data), "longest_earth_blackout_h decreases") {
		t.Fatal("decrease not reported")
	}
}

func TestRoundingToleranceIsAllowed(t *testing.T) {
	data := blackoutFixture(t)
	pyjson.Set(data, 19.995, "sites", 0, "reaches", 1, "longest_earth_blackout_h")
	if errs := check(data); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestNonfiniteBlackoutRejected(t *testing.T) {
	data := blackoutFixture(t)
	pyjson.Set(data, math.NaN(), "sites", 0, "reaches", 1, "longest_darkness_h")
	if !hasError(check(data), "invalid longest_darkness_h") {
		t.Fatal("NaN not reported")
	}
}

func TestVerifiedStatusRejected(t *testing.T) {
	data := blackoutFixture(t)
	pyjson.Set(data, "VERIFIED", "science_status")
	if !hasError(check(data), "PRELIMINARY") {
		t.Fatal("VERIFIED not reported")
	}
}
