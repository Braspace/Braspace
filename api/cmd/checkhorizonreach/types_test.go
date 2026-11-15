package main

import (
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// P0 synthetic type-boundary regression for horizon evidence (port of
// tests/test_horizon_type_boundaries.py); no NASA validation.

func typesFixture(t *testing.T) any {
	return mustJSON(t, `{
  "schema": "braspace.horizon-reach-study.v1",
  "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
  "reaches_m": [100000, 200000],
  "sites": [{"site": "synthetic-site", "reaches": [
    {"reach_m": 100000, "sun_center_visible_pct": 70.0, "mean_solar_disc_visible_pct": 70.0,
     "earth_center_visible_pct": 80.0, "longest_darkness_h": 12.0, "longest_earth_blackout_h": 6.0},
    {"reach_m": 200000, "sun_center_visible_pct": 60.0, "mean_solar_disc_visible_pct": 60.0,
     "earth_center_visible_pct": 70.0, "longest_darkness_h": 24.0, "longest_earth_blackout_h": 8.0}
  ]}]
}`)
}

func TestPreliminarySyntheticControl(t *testing.T) {
	if errs := check(typesFixture(t)); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestBooleanReachRejected(t *testing.T) {
	data := typesFixture(t)
	pyjson.Set(data, true, "reaches_m", 0)
	if len(check(data)) == 0 {
		t.Fatal("bool reach accepted")
	}
}

func TestBooleanVisibilityRejected(t *testing.T) {
	data := typesFixture(t)
	pyjson.Set(data, true, "sites", 0, "reaches", 0, "sun_center_visible_pct")
	if len(check(data)) == 0 {
		t.Fatal("bool visibility accepted")
	}
}

func TestBooleanBlackoutRejected(t *testing.T) {
	data := typesFixture(t)
	pyjson.Set(data, false, "sites", 0, "reaches", 0, "longest_darkness_h")
	if len(check(data)) == 0 {
		t.Fatal("bool blackout accepted")
	}
}

func TestMissingMetricRejected(t *testing.T) {
	data := typesFixture(t)
	pyjson.Delete(data, "sites", 0, "reaches", 1, "earth_center_visible_pct")
	if len(check(data)) == 0 {
		t.Fatal("missing metric accepted")
	}
}

func TestDuplicateSiteRejected(t *testing.T) {
	data := typesFixture(t)
	sites := pyjson.Get(data, "sites").([]any)
	pyjson.Set(data, append(sites, pyjson.Clone(sites[0])), "sites")
	if len(check(data)) == 0 {
		t.Fatal("duplicate site accepted")
	}
}
