package main

import (
	"math"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// Synthetic contract tests only (port of tests/test_horizon_reach_contract.py); these do not
// validate lunar science or NASA data.

func mustJSON(t *testing.T, text string) any {
	t.Helper()
	v, err := pyjson.LoadsStr(text, nil)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func contractFixture(t *testing.T) any {
	return mustJSON(t, `{
  "schema": "braspace.horizon-reach-study.v1",
  "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
  "reaches_m": [100000, 200000],
  "sites": [{
    "site": "synthetic-test-site",
    "reaches": [
      {"reach_m": 100000, "sun_center_visible_pct": 80,
       "mean_solar_disc_visible_pct": 79, "earth_center_visible_pct": 60,
       "longest_darkness_h": 10, "longest_earth_blackout_h": 5},
      {"reach_m": 200000, "sun_center_visible_pct": 75,
       "mean_solar_disc_visible_pct": 74, "earth_center_visible_pct": 55,
       "longest_darkness_h": 20, "longest_earth_blackout_h": 8}
    ]
  }]
}`)
}

func TestValidSyntheticPreliminaryFixture(t *testing.T) {
	if errs := check(contractFixture(t)); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestVerifiedClaimIsRejected(t *testing.T) {
	data := contractFixture(t)
	pyjson.Set(data, "VERIFIED", "science_status")
	if len(check(data)) == 0 {
		t.Fatal("VERIFIED accepted")
	}
}

func TestMissingAndDuplicateReachesAreRejected(t *testing.T) {
	for _, reaches := range [][]any{{}, {pyjson.I(100000), pyjson.I(100000)}, {pyjson.I(200000), pyjson.I(100000)}, {true, pyjson.I(200000)}} {
		data := contractFixture(t)
		pyjson.Set(data, reaches, "reaches_m")
		if len(check(data)) == 0 {
			t.Errorf("reaches %v accepted", reaches)
		}
	}
}

func TestIncreasingVisibilityIsRejected(t *testing.T) {
	for _, metric := range metrics {
		data := contractFixture(t)
		pyjson.Set(data, pyjson.I(99), "sites", 0, "reaches", 1, metric)
		if len(check(data)) == 0 {
			t.Errorf("%s increase accepted", metric)
		}
	}
}

func TestInvalidNonfiniteAndBooleanMetricsAreRejected(t *testing.T) {
	for _, v := range []any{math.NaN(), math.Inf(1), pyjson.I(-1), pyjson.I(101), true, nil} {
		data := contractFixture(t)
		pyjson.Set(data, v, "sites", 0, "reaches", 0, "sun_center_visible_pct")
		if len(check(data)) == 0 {
			t.Errorf("value %v accepted", v)
		}
	}
}

func TestNegativeBlackoutAndDuplicateSiteAreRejected(t *testing.T) {
	data := contractFixture(t)
	pyjson.Set(data, pyjson.I(-1), "sites", 0, "reaches", 0, "longest_earth_blackout_h")
	if len(check(data)) == 0 {
		t.Error("negative blackout accepted")
	}
	data = contractFixture(t)
	sites := pyjson.Get(data, "sites").([]any)
	pyjson.Set(data, append(sites, pyjson.Clone(sites[0])), "sites")
	if len(check(data)) == 0 {
		t.Error("duplicate site accepted")
	}
}

func TestMissingReachRowIsRejected(t *testing.T) {
	data := contractFixture(t)
	rows := pyjson.Get(data, "sites", 0, "reaches").([]any)
	pyjson.Set(data, rows[:len(rows)-1], "sites", 0, "reaches")
	if len(check(data)) == 0 {
		t.Fatal("missing reach row accepted")
	}
}

func hasError(errs []string, fragment string) bool {
	for _, e := range errs {
		if strings.Contains(e, fragment) {
			return true
		}
	}
	return false
}
