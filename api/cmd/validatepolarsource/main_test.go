package main

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// Fail-closed regression tests (port of tests/test_polar_source_evidence.py). go test runs in the
// package directory, so the repository root is three levels up.
const repoRoot = "../../.."

func original(t *testing.T) any {
	t.Helper()
	text, err := pyjson.ReadText(repoRoot + "/data/POLAR_SOURCE_EVIDENCE.json")
	if err != nil {
		t.Fatal(err)
	}
	v, err := pyjson.LoadsStr(text, nil)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func isCatalogError(err error) bool {
	var ce *CatalogError
	return errors.As(err, &ce)
}

func TestValidCatalog(t *testing.T) {
	sources, refs, err := validateCatalog(original(t))
	if err != nil || sources != 12 || refs != 5 {
		t.Fatalf("got %d, %d, %v", sources, refs, err)
	}
}

func TestRejectsMutations(t *testing.T) {
	for name, mutate := range map[string]func(c any){
		"scientific claim":   func(c any) { pyjson.Set(c, "VALIDATED", "integration_state") },
		"screenshot truth":   func(c any) { pyjson.Set(c, "training_ground_truth", "user_supplied_visual_references", 0, "usage") },
		"polar SLDEM2015":    func(c any) { setSLDEMPriority(c, "P0") },
		"duplicate id":       func(c any) { pyjson.Set(c, pyjson.Get(c, "sources", 1, "id"), "sources", 0, "id") },
		"non-https data_url": func(c any) { pyjson.Set(c, "http://wrong.example/data", "sources", 0, "data_url") },
	} {
		catalog := pyjson.Clone(original(t))
		mutate(catalog)
		if _, _, err := validateCatalog(catalog); !isCatalogError(err) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func setSLDEMPriority(c any, priority string) {
	for _, s := range pyjson.Get(c, "sources").([]any) {
		if m := s.(map[string]any); m["id"] == "USGS-SLDEM2015" {
			m["priority"] = priority
		}
	}
}

func TestRejectsMissingUploads(t *testing.T) {
	err := verifyUploadedFiles(original(t).(map[string]any), repoRoot)
	if !isCatalogError(err) {
		t.Fatalf("got %v", err)
	}
}

// New: the argparse surface of the original (help, abbreviations, errors) and the success line.
func TestCLI(t *testing.T) {
	do := func(args ...string) (int, string, string) {
		var out, errb bytes.Buffer
		rc := run(args, &out, &errb)
		return rc, out.String(), errb.String()
	}
	if rc, out, _ := do("-h"); rc != 0 || !strings.HasPrefix(out, "usage: validate_polar_source_evidence.py [-h]") {
		t.Errorf("help: rc=%d %q", rc, out)
	}
	if rc, _, errb := do("--catalog"); rc != 2 || !strings.HasSuffix(errb, "error: argument --catalog: expected one argument\n") {
		t.Errorf("missing value: rc=%d %q", rc, errb)
	}
	if rc, _, errb := do("--bogus", "x"); rc != 2 || !strings.HasSuffix(errb, "error: unrecognized arguments: --bogus x\n") {
		t.Errorf("unknown: rc=%d %q", rc, errb)
	}
	if rc, _, errb := do("--cat=/does/not/exist"); rc != 1 || !strings.HasPrefix(errb, "POLAR_CATALOG_INVALID: ") || !strings.Contains(errb, "/does/not/exist") {
		t.Errorf("abbreviation: rc=%d %q", rc, errb)
	}
	rc, out, errb := do("--catalog", repoRoot+"/data/POLAR_SOURCE_EVIDENCE.json")
	if rc != 0 || out != "POLAR_CATALOG_OK: 12 sources; 5 references; uploads not inspected\n" {
		t.Errorf("ok: rc=%d %q %q", rc, out, errb)
	}
}
