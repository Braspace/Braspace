package onboard

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStandaloneWireResourcesNeverDefault(t *testing.T) {
	for _, route := range []struct {
		path    string
		handler http.Handler
	}{{"/api/onboard/evaluate", Handler()}, {"/api/onboard/report", ReportHandler()}} {
		send := func(body string) int {
			r := httptest.NewRequest(http.MethodPost, route.path, strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			out := httptest.NewRecorder()
			route.handler.ServeHTTP(out, r)
			return out.Code
		}
		mutate := func(fn func(map[string]any)) string {
			original, _ := json.Marshal(base())
			var req map[string]any
			if err := json.Unmarshal(original, &req); err != nil {
				t.Fatal(err)
			}
			fn(req["candidates"].([]any)[0].(map[string]any))
			out, err := json.Marshal(req)
			if err != nil {
				t.Fatal(err)
			}
			return string(out)
		}
		for _, field := range []string{"battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"} {
			for _, null := range []bool{false, true} {
				body := mutate(func(c map[string]any) {
					p := c["power"].(map[string]any)
					if null {
						p[field] = nil
					} else {
						delete(p, field)
					}
				})
				if status := send(body); status != 400 {
					t.Errorf("%s power.%s null=%v: %d", route.path, field, null, status)
				}
			}
		}
		for _, field := range []string{"power", "max_comm_blackout_hours"} {
			for _, null := range []bool{false, true} {
				body := mutate(func(c map[string]any) {
					if null {
						c[field] = nil
					} else {
						delete(c, field)
					}
				})
				if status := send(body); status != 400 {
					t.Errorf("%s %s null=%v: %d", route.path, field, null, status)
				}
			}
		}
		valid := mutate(func(c map[string]any) {
			p := c["power"].(map[string]any)
			p["load_w"] = 0
			p["reserve_wh"] = 0
			c["max_comm_blackout_hours"] = 0
		})
		if status := send(valid); status != 200 {
			t.Errorf("%s explicit zero: %d", route.path, status)
		}
		duplicate := strings.Replace(valid, `"load_w":0`, `"load_w":10,"load_w":0`, 1)
		if status := send(duplicate); status != 400 {
			t.Errorf("%s duplicate field: %d", route.path, status)
		}
	}
}
