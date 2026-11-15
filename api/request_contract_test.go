package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

func TestStandaloneOnboardOpenAPIRequest(t *testing.T) {
	var spec struct {
		Paths map[string]struct {
			Post struct {
				RequestBody struct {
					Required bool `json:"required"`
					Content  map[string]struct {
						Schema map[string]any `json:"schema"`
					} `json:"content"`
				} `json:"requestBody"`
			} `json:"post"`
		} `json:"paths"`
		Components struct {
			Schemas map[string]struct {
				Required []string `json:"required"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/onboard/evaluate", "/api/onboard/report"} {
		body := spec.Paths[path].Post.RequestBody
		if !body.Required || body.Content["application/json"].Schema["$ref"] != "#/components/schemas/StandaloneOnboardRequest" {
			t.Errorf("%s must have an explicit standalone onboard resource request schema", path)
		}
	}
	for schema, fields := range map[string][]string{
		"StandaloneOnboardRequest":   {"mission_id", "candidates"},
		"StandaloneOnboardCandidate": {"power", "max_comm_blackout_hours", "samples"},
		"OnboardPower":               {"battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"},
	} {
		for _, field := range fields {
			found := false
			for _, required := range spec.Components.Schemas[schema].Required {
				if field == required {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("%s missing required field %s", schema, field)
			}
		}
	}
}
