package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

var updateGolden = flag.Bool("update", false, "rewrite examples/mission/*.response.json")

type spec struct {
	OpenAPI    string                                `json:"openapi"`
	Paths      map[string]map[string]json.RawMessage `json:"paths"`
	Components struct {
		Schemas map[string]map[string]any `json:"schemas"`
	} `json:"components"`
}

func loadSpec(t *testing.T) (spec, map[string]any) {
	t.Helper()
	var s spec
	var raw map[string]any
	if err := json.Unmarshal(openAPISpec, &s); err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(openAPISpec, &raw)
	return s, raw
}

// validateSchema checks a decoded JSON value against the subset of JSON Schema
// used in openapi.json: $ref, type, properties, required, additionalProperties,
// items, enum, minimum, maximum.
func validateSchema(root map[string]any, schema map[string]any, v any, path string) []string {
	if ref, ok := schema["$ref"].(string); ok {
		name := strings.TrimPrefix(ref, "#/components/schemas/")
		target, ok := root["components"].(map[string]any)["schemas"].(map[string]any)[name].(map[string]any)
		if !ok {
			return []string{path + ": unresolved " + ref}
		}
		return validateSchema(root, target, v, path)
	}
	var errs []string
	if typ, ok := schema["type"]; ok {
		types := []string{}
		switch tt := typ.(type) {
		case string:
			types = append(types, tt)
		case []any:
			for _, x := range tt {
				types = append(types, x.(string))
			}
		}
		match := false
		for _, want := range types {
			switch want {
			case "object":
				_, match = v.(map[string]any)
			case "array":
				_, match = v.([]any)
			case "string":
				_, match = v.(string)
			case "boolean":
				_, match = v.(bool)
			case "number":
				_, match = v.(float64)
			case "integer":
				f, ok := v.(float64)
				match = ok && f == math.Trunc(f)
			case "null":
				match = v == nil
			}
			if match {
				break
			}
		}
		if !match {
			return []string{fmt.Sprintf("%s: %T is not %v", path, v, types)}
		}
	}
	if enum, ok := schema["enum"].([]any); ok {
		found := false
		for _, e := range enum {
			if e == v {
				found = true
			}
		}
		if !found {
			errs = append(errs, fmt.Sprintf("%s: %v not in enum", path, v))
		}
	}
	if f, ok := v.(float64); ok {
		if min, ok := schema["minimum"].(float64); ok && f < min {
			errs = append(errs, fmt.Sprintf("%s: %v < minimum %v", path, f, min))
		}
		if max, ok := schema["maximum"].(float64); ok && f > max {
			errs = append(errs, fmt.Sprintf("%s: %v > maximum %v", path, f, max))
		}
	}
	if obj, ok := v.(map[string]any); ok {
		props, _ := schema["properties"].(map[string]any)
		for _, r := range asStrings(schema["required"]) {
			if _, ok := obj[r]; !ok {
				errs = append(errs, path+": missing required "+r)
			}
		}
		keys := make([]string, 0, len(obj))
		for k := range obj {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if ps, ok := props[k].(map[string]any); ok {
				errs = append(errs, validateSchema(root, ps, obj[k], path+"."+k)...)
			} else if ap, ok := schema["additionalProperties"].(map[string]any); ok {
				errs = append(errs, validateSchema(root, ap, obj[k], path+"."+k)...)
			} else if schema["additionalProperties"] == false {
				errs = append(errs, path+": undocumented property "+k)
			}
		}
	}
	if list, ok := v.([]any); ok {
		if items, ok := schema["items"].(map[string]any); ok {
			for i, x := range list {
				errs = append(errs, validateSchema(root, items, x, fmt.Sprintf("%s[%d]", path, i))...)
			}
		}
	}
	return errs
}

func asStrings(v any) []string {
	var out []string
	if list, ok := v.([]any); ok {
		for _, x := range list {
			out = append(out, x.(string))
		}
	}
	return out
}

func responseSchema(t *testing.T, raw map[string]any, path, method string, status int) map[string]any {
	t.Helper()
	op := raw["paths"].(map[string]any)[path].(map[string]any)[method].(map[string]any)
	resp, ok := op["responses"].(map[string]any)[fmt.Sprint(status)].(map[string]any)
	if !ok {
		t.Fatalf("%s %s: status %d not documented", method, path, status)
	}
	content, _ := resp["content"].(map[string]any)
	media, _ := content["application/json"].(map[string]any)
	schema, _ := media["schema"].(map[string]any)
	return schema
}

func requestSchema(raw map[string]any, path string) map[string]any {
	op := raw["paths"].(map[string]any)[path].(map[string]any)["post"].(map[string]any)
	return op["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
}

func TestOpenAPIDocumentCoversRoutes(t *testing.T) {
	s, _ := loadSpec(t)
	if s.OpenAPI != "3.1.0" {
		t.Fatalf("openapi = %q", s.OpenAPI)
	}
	h := routes(fakeEngineBinary(t, "ok"))
	for path, ops := range s.Paths {
		for method := range ops {
			url := strings.ReplaceAll(path, "{id}", "synthetic-demo-a")
			if strings.HasPrefix(path, "/api/layers/") {
				url = strings.ReplaceAll(path, "{id}", "lola-ldem-80s-80m")
			}
			body := ""
			if method == "post" {
				body = "{}"
			}
			rec := do(h, strings.ToUpper(method), url, body)
			// The mux answers unknown routes with text/plain; API errors are JSON.
			routeMissing := (rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed) &&
				!strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json")
			if routeMissing {
				t.Errorf("%s %s is documented but not served (%d)", method, path, rec.Code)
			}
		}
	}
	for _, want := range []string{"/api/health", "/api/sites", "/api/sites/{id}", "/api/compare", "/api/scenarios/delay", "/api/openapi.json", "/api/onboard/site-evaluate", "/v1/visibility"} {
		if _, ok := s.Paths[want]; !ok {
			t.Errorf("%s missing from openapi.json", want)
		}
	}
}

func TestGetResponsesMatchSchema(t *testing.T) {
	_, raw := loadSpec(t)
	h := routes(fakeEngineBinary(t, "ok"))
	for _, tc := range []struct {
		path, url string
		status    int
	}{
		{"/api/health", "/api/health", 200},
		{"/api/sites", "/api/sites", 200},
		{"/api/sites/{id}", "/api/sites/malapert-massif", 200},
		{"/api/sites/{id}", "/api/sites/synthetic-demo-a", 200},
		{"/api/sites/{id}", "/api/sites/atlantis", 404},
		{"/api/layers", "/api/layers", 200},
		{"/api/layers/{id}", "/api/layers/lroc-color-2k", 200},
		{"/api/sites/{id}/media", "/api/sites/malapert-massif/media", 200},
	} {
		rec := do(h, "GET", tc.url, "")
		if rec.Code != tc.status {
			t.Fatalf("%s: %d", tc.url, rec.Code)
		}
		var v any
		_ = json.Unmarshal(rec.Body.Bytes(), &v)
		for _, e := range validateSchema(raw, responseSchema(t, raw, tc.path, "get", tc.status), v, tc.url) {
			t.Error(e)
		}
	}
}

// TestExamples replays every request in examples/mission against the API,
// checks request and response against openapi.json and compares the response
// byte for byte with the stored *.response.json (go test -run TestExamples -update).
func TestExamples(t *testing.T) {
	_, raw := loadSpec(t)
	// Examples are replayed against the real catalog (examples/mission/replay.sh
	// does the same against a running API); only site-without-data needs the
	// fixture store, because every real catalog site now has a series.
	h, _ := productionTestAPI(t, "ok")
	noData, _ := testAPI(t, "ok")
	cases := []struct {
		name, path string
		status     int
	}{
		{"compare", "/api/compare", 200},
		{"scenario-delay", "/api/scenarios/delay", 200},
		{"scenario-no-alternative", "/api/scenarios/delay", 200},
		{"site-without-data", "/api/scenarios/delay", 422},
		{"scenario-delay-resources", "/api/scenarios/delay", 200},
		{"onboard-site-evaluate", "/api/onboard/site-evaluate", 200},
	}
	dir := filepath.Join("..", "examples", "mission")
	for _, tc := range cases {
		reqBody, err := os.ReadFile(filepath.Join(dir, tc.name+".request.json"))
		if err != nil {
			t.Fatal(err)
		}
		var reqVal any
		if err := json.Unmarshal(reqBody, &reqVal); err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		for _, e := range validateSchema(raw, requestSchema(raw, tc.path), reqVal, tc.name+".request") {
			t.Error(e)
		}
		srv := h
		if tc.name == "site-without-data" {
			srv = noData
		}
		rec := do(srv, "POST", tc.path, string(reqBody))
		if rec.Code != tc.status {
			t.Fatalf("%s: got %d want %d: %s", tc.name, rec.Code, tc.status, rec.Body.String())
		}
		var respVal any
		_ = json.Unmarshal(rec.Body.Bytes(), &respVal)
		for _, e := range validateSchema(raw, responseSchema(t, raw, tc.path, "post", tc.status), respVal, tc.name+".response") {
			t.Error(e)
		}
		var pretty bytes.Buffer
		_ = json.Indent(&pretty, rec.Body.Bytes(), "", "  ")
		golden := filepath.Join(dir, tc.name+".response.json")
		if *updateGolden {
			if err := os.WriteFile(golden, pretty.Bytes(), 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		want, err := os.ReadFile(golden)
		if err != nil {
			t.Fatalf("%s: %v (run with -update)", tc.name, err)
		}
		if !bytes.Equal(want, pretty.Bytes()) {
			t.Errorf("%s: response differs from %s (run with -update if the change is intended)", tc.name, golden)
		}
	}
}
