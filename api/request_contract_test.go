package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func mutateRequest(t *testing.T, input string, mutate func(map[string]any)) string {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal([]byte(input), &value); err != nil {
		t.Fatal(err)
	}
	mutate(value)
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func TestExplicitMissionResourceInputs(t *testing.T) {
	h, _ := testAPI(t, "ok")
	site := readExample(t, "onboard-site-evaluate.request.json")
	delay := readExample(t, "scenario-delay-resources.request.json")
	for _, route := range []struct{ path, body string }{{"/api/onboard/site-evaluate", site}, {"/api/onboard/site-report", site}, {"/api/scenarios/delay", delay}} {
		for _, field := range []string{"battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"} {
			for _, null := range []bool{false, true} {
				body := mutateRequest(t, route.body, func(v map[string]any) {
					p := v["power"].(map[string]any)
					if null {
						p[field] = nil
					} else {
						delete(p, field)
					}
				})
				if rec := do(h, "POST", route.path, body); rec.Code != 400 {
					t.Errorf("%s power.%s null=%v: %d %s", route.path, field, null, rec.Code, rec.Body.String())
				}
			}
		}
		for _, field := range []string{"o2_stock_kg", "food_stock_kg", "reserve_hours", "aboard_during_delay"} {
			for _, null := range []bool{false, true} {
				body := mutateRequest(t, route.body, func(v map[string]any) {
					c := v["crew"].(map[string]any)
					if null {
						c[field] = nil
					} else {
						delete(c, field)
					}
				})
				if rec := do(h, "POST", route.path, body); rec.Code != 400 {
					t.Errorf("%s crew.%s null=%v: %d %s", route.path, field, null, rec.Code, rec.Body.String())
				}
			}
		}
		for _, field := range []string{"power", "crew", "max_comm_blackout_hours"} {
			body := mutateRequest(t, route.body, func(v map[string]any) { v[field] = nil })
			if rec := do(h, "POST", route.path, body); rec.Code != 400 {
				t.Errorf("%s null %s: %d", route.path, field, rec.Code)
			}
		}
		positive := mutateRequest(t, route.body, func(v map[string]any) {
			p := v["power"].(map[string]any)
			p["load_w"] = 0
			p["solar_generation_w"] = 0
			p["reserve_wh"] = 0
			c := v["crew"].(map[string]any)
			c["aboard_during_delay"] = false
			c["reserve_hours"] = 0
			v["max_comm_blackout_hours"] = 0
		})
		if rec := do(h, "POST", route.path, positive); rec.Code != 200 {
			t.Errorf("%s explicit zero/false: %d %s", route.path, rec.Code, rec.Body.String())
		}
	}
	for _, route := range []string{"/api/onboard/site-evaluate", "/api/onboard/site-report"} {
		for _, field := range []string{"max_comm_blackout_hours", "power"} {
			body := mutateRequest(t, site, func(v map[string]any) { delete(v, field) })
			if rec := do(h, "POST", route, body); rec.Code != 400 {
				t.Errorf("%s omitted %s: %d", route, field, rec.Code)
			}
		}
		for _, null := range []bool{false, true} {
			body := mutateRequest(t, site, func(v map[string]any) {
				c := v["candidates"].([]any)[0].(map[string]any)
				if null {
					c["delay_hours"] = nil
				} else {
					delete(c, "delay_hours")
				}
			})
			if rec := do(h, "POST", route, body); rec.Code != 400 {
				t.Errorf("%s delay_hours null=%v: %d", route, null, rec.Code)
			}
		}
	}
}

func TestDecodeRejectsAmbiguousInputs(t *testing.T) {
	h, _ := testAPI(t, "ok")
	for _, tc := range []struct {
		ct, body string
		want     int
	}{
		{"application/json-not-json", compareBody, 415},
		{"application/json; charset=utf-8", compareBody, 200},
		{"application/json", strings.Replace(compareBody, `"duration_hours":72`, `"duration_hours":12,"duration_hours":72`, 1), 400},
		{"application/json", strings.Replace(compareBody, `"duration_hours":72`, `"Duration_Hours":12,"duration_hours":72`, 1), 400},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/compare", strings.NewReader(tc.body))
		r.Header.Set("Content-Type", tc.ct)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != tc.want {
			t.Errorf("%s %s: %d", tc.ct, tc.body, rec.Code)
		}
	}
}

func TestSubNanosecondWindowDoesNotPanicAndHashPreservesEpoch(t *testing.T) {
	h, _ := testAPI(t, "ok")
	base := `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":1}`
	a := do(h, "POST", "/api/compare", base)
	if a.Code != 200 {
		t.Fatal(a.Code, a.Body.String())
	}
	for _, body := range []string{strings.Replace(base, `"duration_hours":1`, `"duration_hours":1e-30`, 1), strings.Replace(base, `00:00:00Z`, `00:00:00.1Z`, 1)} {
		rec := do(h, "POST", "/api/compare", body)
		if rec.Code != 200 {
			t.Fatal(rec.Code, rec.Body.String())
		}
		out := decode(t, rec)
		row := out["results"].([]any)[0].(map[string]any)
		if row["data_status"] != "GRID_NOT_ALIGNED" || row["evaluation"] != nil {
			t.Fatalf("invented aligned result: %v", row)
		}
		if out["request_sha256"] == decode(t, a)["request_sha256"] {
			t.Fatal("different request has same fingerprint")
		}
		if strings.Contains(body, ".1Z") && out["request"].(map[string]any)["start_utc"] != "2026-12-01T00:00:00.1Z" {
			t.Fatalf("lost subsecond time: %v", out["request"])
		}
	}
}

func TestConsumableTinyRatesAndRoundedThresholds(t *testing.T) {
	c := crewSpec{Size: 1, O2StockKg: 1, FoodStockKg: 1, O2KgPerPersonDay: 1e-320, FoodKgPerPersonDay: 1, RateSource: "synthetic"}
	if c.validate() == nil {
		t.Fatal("non-representable autonomy accepted")
	}
	c.O2KgPerPersonDay = 24
	c.FoodKgPerPersonDay = 24
	c.ReserveHours = 1
	c.O2StockKg = 1.9999999
	c.FoodStockKg = 3
	if err := c.validate(); err != nil {
		t.Fatal(err)
	}
	res := consumables(&c, time.Now().UTC(), 1, 0)
	checks := consumableChecks(&c, &res, nil)
	if res.Items[0].Status != "BELOW_RESERVE" || checks[0].Passed || checks[0].Margin >= 0 {
		t.Fatalf("rounded margin falsely approved: %v %v", res.Items[0], checks[0])
	}
}

func TestConstraintUsesExactFractionBeforeDisplayRounding(t *testing.T) {
	s := &siteSeries{start: time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC), step: time.Hour}
	res := []engineResult{{SunVisible: true}, {SunVisible: true}, {SunVisible: false}}
	m := analyze(s, 0, res, false).Metrics
	limit := 0.6666669
	check := missionConstraints{MinSunFraction: &limit}.check(m, nil)[0]
	if m.SunVisibleFraction != 0.666667 || check.Passed || check.Margin >= 0 || check.Value >= limit {
		t.Fatalf("rounded display falsely approved: %+v, %+v", m, check)
	}
}
