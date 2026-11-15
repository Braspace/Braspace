package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"
)

// BR101: every operation in openapi.json must have a good call and a bad call
// here, and each response must use a documented status and (for JSON) match
// the documented schema. A new route without an entry fails
// TestOpenAPIEveryRouteHasContractCases.
//
// By default the cases run in-process. With BRASPACE_API_BASE=http://host:port
// the same cases run against a live deployment (Compose or production, read
// only calls are used for GET; POST bodies are pure computations).

type contractCall struct {
	method, url, body string
	// allowed statuses for this call; all must also be documented.
	want []int
}

type contractCase struct {
	good, bad contractCall
}

const brVisibilityBody = `{"site_id":"demo-synthetic","epoch_utc":"2026-11-14T12:00:00Z","sun":{"azimuth_deg":0,"elevation_deg":2},"earth":{"azimuth_deg":180,"elevation_deg":-1},"terrain_horizon":[{"azimuth_deg":0,"elevation_deg":0},{"azimuth_deg":180,"elevation_deg":0}],"provenance":{"terrain_dataset_id":"SYNTHETIC-TEST","ephemeris_id":"SYNTHETIC-TEST","frame":"MOON_ME"}}`

func brExample(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("../examples/mission/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func contractCases(t *testing.T) map[string]contractCase {
	const junk = `{"unexpected_field_br101":true}`
	postBad := func(p string) contractCall { return contractCall{"POST", p, junk, []int{400, 422}} }
	return map[string]contractCase{
		"GET /api/health":                 {contractCall{"GET", "/api/health", "", []int{200, 503}}, contractCall{"POST", "/api/health", "{}", []int{404, 405}}},
		"GET /api/sites":                  {contractCall{"GET", "/api/sites", "", []int{200}}, contractCall{"POST", "/api/sites", "{}", []int{404, 405}}},
		"GET /api/sites/{id}":             {contractCall{"GET", "/api/sites/synthetic-demo-a", "", []int{200}}, contractCall{"GET", "/api/sites/atlantis", "", []int{404}}},
		"POST /api/compare":               {contractCall{"POST", "/api/compare", brExample(t, "compare.request.json"), []int{200}}, postBad("/api/compare")},
		"POST /api/scenarios/delay":       {contractCall{"POST", "/api/scenarios/delay", brExample(t, "scenario-delay.request.json"), []int{200}}, postBad("/api/scenarios/delay")},
		"POST /api/onboard/site-evaluate": {contractCall{"POST", "/api/onboard/site-evaluate", brExample(t, "onboard-site-evaluate.request.json"), []int{200}}, postBad("/api/onboard/site-evaluate")},
		"POST /api/onboard/site-report":   {contractCall{"POST", "/api/onboard/site-report", brExample(t, "onboard-site-evaluate.request.json"), []int{200}}, postBad("/api/onboard/site-report")},
		"POST /api/onboard/report":        {contractCall{"POST", "/api/onboard/report", brOnboardBody(t), []int{200}}, postBad("/api/onboard/report")},
		"POST /api/onboard/evaluate":      {contractCall{"POST", "/api/onboard/evaluate", brOnboardBody(t), []int{200}}, postBad("/api/onboard/evaluate")},
		"GET /api/layers":                 {contractCall{"GET", "/api/layers", "", []int{200}}, contractCall{"DELETE", "/api/layers", "", []int{404, 405}}},
		"GET /api/layers/{id}":            {contractCall{"GET", "/api/layers/lroc-color-2k", "", []int{200}}, contractCall{"GET", "/api/layers/no-such-layer", "", []int{404}}},
		"GET /api/layers/{id}/asset":      {contractCall{"GET", "/api/layers/lroc-color-2k/asset", "", []int{200, 302, 502}}, contractCall{"GET", "/api/layers/no-such-layer/asset", "", []int{404}}},
		"GET /api/sites/{id}/media":       {contractCall{"GET", "/api/sites/malapert-massif/media", "", []int{200}}, contractCall{"GET", "/api/sites/atlantis/media", "", []int{404}}},
		"GET /api/openapi.json":           {contractCall{"GET", "/api/openapi.json", "", []int{200}}, contractCall{"POST", "/api/openapi.json", "{}", []int{404, 405}}},
		"GET /healthz":                    {contractCall{"GET", "/healthz", "", []int{200}}, contractCall{"POST", "/healthz", "{}", []int{404, 405}}},
		"GET /readyz":                     {contractCall{"GET", "/readyz", "", []int{200, 503}}, contractCall{"POST", "/readyz", "{}", []int{404, 405}}},
		"GET /v1/capabilities":            {contractCall{"GET", "/v1/capabilities", "", []int{200}}, contractCall{"POST", "/v1/capabilities", "{}", []int{404, 405}}},
		"POST /v1/visibility":             {contractCall{"POST", "/v1/visibility", brVisibilityBody, []int{200}}, postBad("/v1/visibility")},
		"GET /api/sites/{id}/sky":         {contractCall{"GET", "/api/sites/synthetic-demo-a/sky?start=2026-12-01T00:00:00Z&hours=1", "", []int{200}}, contractCall{"GET", "/api/sites/atlantis/sky", "", []int{404}}},
		"GET /api/vector/status":          {contractCall{"GET", "/api/vector/status", "", []int{200}}, contractCall{"POST", "/api/vector/status", "{}", []int{404, 405}}},
		"POST /api/vector/search":         {contractCall{"POST", "/api/vector/search", `{"model":"x","vector":[1],"limit":1}`, []int{200, 400, 422, 503}}, contractCall{"POST", "/api/vector/search", junk, []int{400, 422, 503}}},
	}
}

func brOnboardBody(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("../examples/onboard/mission.synthetic.request.json")
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// brSend runs a call in-process or against BRASPACE_API_BASE.
func brSend(t *testing.T, h http.Handler, c contractCall) (int, string, []byte) {
	t.Helper()
	if base := os.Getenv("BRASPACE_API_BASE"); base != "" {
		req, _ := http.NewRequest(c.method, strings.TrimRight(base, "/")+c.url, strings.NewReader(c.body))
		if c.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", c.method, c.url, err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, resp.Header.Get("Content-Type"), b
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(c.method, c.url, strings.NewReader(c.body))
	if c.body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Header().Get("Content-Type"), rec.Body.Bytes()
}

func TestOpenAPIEveryRouteHasContractCases(t *testing.T) {
	s, _ := loadSpec(t)
	cases := contractCases(t)
	var missing, stale []string
	for p, ops := range s.Paths {
		for m := range ops {
			if _, ok := cases[strings.ToUpper(m)+" "+p]; !ok {
				missing = append(missing, strings.ToUpper(m)+" "+p)
			}
		}
	}
	for k := range cases {
		parts := strings.SplitN(k, " ", 2)
		if _, ok := s.Paths[parts[1]][strings.ToLower(parts[0])]; !ok {
			stale = append(stale, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(stale)
	if len(missing) > 0 {
		t.Errorf("OpenAPI operations with no contract test case (add them to contractCases): %v", missing)
	}
	if len(stale) > 0 {
		t.Errorf("contract cases for operations not in openapi.json: %v", stale)
	}
}

func TestOpenAPIContractGoodAndBadCalls(t *testing.T) {
	s, raw := loadSpec(t)
	h := routes(fakeEngineBinary(t, "ok"))
	if os.Getenv("BRASPACE_API_BASE") == "" {
		api, _ := testAPI(t, "ok")
		_ = api // mission routes are mounted by routes(); testAPI proves the store loads
	}
	keys := []string{}
	cases := contractCases(t)
	for k := range cases {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		cc := cases[key]
		parts := strings.SplitN(key, " ", 2)
		method, path := strings.ToLower(parts[0]), parts[1]
		for label, c := range map[string]contractCall{"good": cc.good, "bad": cc.bad} {
			code, ctype, body := brSend(t, h, c)
			okCode := false
			for _, w := range c.want {
				if code == w {
					okCode = true
				}
			}
			if !okCode {
				t.Errorf("%s %s %s %s: status %d, want one of %v: %.200s", key, label, c.method, c.url, code, c.want, body)
				continue
			}
			// Only calls that hit the documented operation are checked against its schema.
			if c.method != strings.ToUpper(method) {
				continue
			}
			ops := s.Paths[path]
			var op struct {
				Responses map[string]json.RawMessage `json:"responses"`
			}
			_ = json.Unmarshal(ops[method], &op)
			if _, ok := op.Responses[itoa(code)]; !ok {
				t.Errorf("%s %s: status %d is not documented in openapi.json", key, label, code)
				continue
			}
			if !strings.HasPrefix(ctype, "application/json") {
				continue
			}
			var v any
			if err := json.Unmarshal(body, &v); err != nil {
				t.Errorf("%s %s: invalid JSON: %v", key, label, err)
				continue
			}
			if schema := responseSchema(t, raw, path, method, code); schema != nil {
				for _, e := range validateSchema(raw, schema, v, key+" "+label) {
					t.Error(e)
				}
			}
		}
	}
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
