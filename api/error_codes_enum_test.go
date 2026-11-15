package main

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Every error code the API writes must be declared in components.schemas.Error.code.enum of openapi.json,
// so clients (cockpit, Worker, docs/API.md) never meet an undocumented code. Found on 15/11/2026: the
// navigation and onboard handlers answered 415 with CONTENT_TYPE_REQUIRED and 422 with INVALID_INPUT,
// neither in the enum, while the rest of the API used UNSUPPORTED_MEDIA_TYPE.
func TestErrorCodesWrittenByHandlersAreInOpenAPIEnum(t *testing.T) {
	raw, err := os.ReadFile("openapi.json")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Components struct {
			Schemas map[string]struct {
				Properties map[string]struct {
					Enum []string `json:"enum"`
				} `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	enum := map[string]bool{}
	for _, c := range spec.Components.Schemas["Error"].Properties["code"].Enum {
		enum[c] = true
	}
	if len(enum) == 0 {
		t.Fatal("Error.code enum is empty or missing")
	}
	// Literal codes in the two writing styles used by the handlers:
	//   map[string]string{"code": "X", ...}   and   errf(status, "X", ...) / apiError{Code: "X"}
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`"code":\s*"([A-Z][A-Z0-9_]{2,})"`),
		regexp.MustCompile(`errf\([^,]+,\s*"([A-Z][A-Z0-9_]{2,})"`),
	}
	missing := map[string][]string{}
	err = filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && path != "." && (d.Name() == "testdata" || strings.HasPrefix(d.Name(), ".")) {
			return filepath.SkipDir
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, re := range patterns {
			for _, m := range re.FindAllStringSubmatch(string(src), -1) {
				if !enum[m[1]] {
					missing[m[1]] = append(missing[m[1]], path)
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(missing) > 0 {
		var lines []string
		for code, files := range missing {
			lines = append(lines, code+" ("+strings.Join(files, ", ")+")")
		}
		sort.Strings(lines)
		t.Fatalf("error codes written by the API but missing from openapi.json Error.code enum:\n  %s", strings.Join(lines, "\n  "))
	}
}
