package main

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// The nearby catalog alternative must be assessed at the same UTC window as
// the selected delay; matching site IDs alone is not a valid comparison.
func TestNearbyDelayUsesSelectedWindow(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := strings.Replace(scenarioBody, `"duration_hours":72`,
		`"duration_hours":72,"delays_hours":[48],"nearby_delay_hours":48,"include_nearby":true,"max_nearby":1`, 1)
	rec := do(h, "POST", "/api/scenarios/delay", body)
	if rec.Code != 200 {
		t.Fatalf("explicit nearby delay: %d %s", rec.Code, rec.Body.String())
	}
	opts := decode(t, rec)["options"].([]any)
	var delayed, neighbor map[string]any
	for _, raw := range opts {
		o := raw.(map[string]any)
		switch o["kind"] {
		case "delay":
			delayed = o
		case "nearby_site":
			neighbor = o
		}
	}
	if delayed == nil || neighbor == nil {
		t.Fatalf("expected delay and nearby_site options: %v", opts)
	}
	const start = "2026-12-03T00:00:00Z"
	if delayed["start_utc"] != start || neighbor["start_utc"] != start {
		t.Fatalf("windows must agree at +48 h: delay=%v nearby=%v", delayed["start_utc"], neighbor["start_utc"])
	}
	if neighbor["delay_hours"] != float64(48) {
		t.Fatalf("nearby option must disclose actual offset: %v", neighbor["delay_hours"])
	}
	id := neighbor["site_id"].(string)
	compare := do(h, "POST", "/api/compare",
		fmt.Sprintf(`{"site_ids":[%q],"start_utc":%q,"duration_hours":72}`, id, start))
	if compare.Code != 200 {
		t.Fatalf("control comparison: %d %s", compare.Code, compare.Body.String())
	}
	control := decode(t, compare)["results"].([]any)[0].(map[string]any)
	if neighbor["data_status"] != control["data_status"] {
		t.Fatalf("different data availability at same window: nearby %v compare %v", neighbor["data_status"], control["data_status"])
	}
	if neighbor["data_status"] == "AVAILABLE" {
		reference := control["evaluation"].(map[string]any)["metrics"]
		if !reflect.DeepEqual(neighbor["metrics"], reference) {
			t.Fatalf("nearby metrics drift from /api/compare at same UTC window")
		}
	}
}

func TestNearbyDelayPreservesLegacyBaselineWhenOmitted(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "POST", "/api/scenarios/delay", scenarioBody)
	if rec.Code != 200 {
		t.Fatalf("legacy request: %d %s", rec.Code, rec.Body.String())
	}
	opts := decode(t, rec)["options"].([]any)
	last := opts[len(opts)-1].(map[string]any)
	if last["kind"] != "nearby_site" || last["delay_hours"] != float64(0) ||
		last["start_utc"] != "2026-12-01T00:00:00Z" {
		t.Fatalf("legacy nearby start unexpectedly changed: %v", last)
	}
}

func TestNearbyDelayRejectsInvalidSelectors(t *testing.T) {
	h, _ := testAPI(t, "ok")
	for _, tc := range []struct {
		name, extra string
	}{
		{"not in delays", `"delays_hours":[48],"nearby_delay_hours":24`},
		{"negative", `"delays_hours":[48],"nearby_delay_hours":-1`},
		{"over limit", `"delays_hours":[48],"nearby_delay_hours":721`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := strings.Replace(scenarioBody, `"duration_hours":72`,
				`"duration_hours":72,`+tc.extra, 1)
			rec := do(h, "POST", "/api/scenarios/delay", body)
			if rec.Code != 422 || decode(t, rec)["code"] != "INVALID_NEARBY_DELAY" {
				t.Fatalf("bad nearby delay accepted or misclassified: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
	body := strings.Replace(scenarioBody, `"duration_hours":72`,
		`"duration_hours":72,"nearby_delay_hours":null`, 1)
	rec := do(h, "POST", "/api/scenarios/delay", body)
	if rec.Code < 400 {
		t.Fatalf("explicit null must not silently select baseline: %d %s", rec.Code, rec.Body.String())
	}
}
