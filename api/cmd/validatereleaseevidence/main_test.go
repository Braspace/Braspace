package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// Negative contract tests for the structural release-evidence gate (port of
// tests/test_release_evidence_gate.py). They do not authenticate GitHub CI, human reviews,
// or NASA submission.

func structurallyCompleteRecord() map[string]any {
	// Deliberately synthetic: never use this fixture as release evidence.
	return map[string]any{
		"main_sha":                   strings.Repeat("a", 40),
		"candidate_sha":              strings.Repeat("b", 40),
		"ci_run_url":                 "https://github.com/Braspace/Braspace/actions/runs/123",
		"ci_conclusion":              "success",
		"required_checks":            map[string]any{"example-only": "success"},
		"human_approval":             true,
		"science_status":             "VERIFIED",
		"public_demo_verified":       true,
		"nasa_submission_authorized": true,
	}
}

func with(key string, value any) map[string]any {
	r := structurallyCompleteRecord()
	r[key] = value
	return r
}

func TestStructuralPositiveIsNotExternalVerification(t *testing.T) {
	if errs := validate(structurallyCompleteRecord()); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestMissingFieldsBlock(t *testing.T) {
	for _, key := range required {
		r := structurallyCompleteRecord()
		delete(r, key)
		if len(validate(r)) == 0 {
			t.Errorf("missing %s accepted", key)
		}
	}
}

func TestUnknownOrPreliminaryScienceBlocks(t *testing.T) {
	for _, status := range []any{"PRELIMINARY", "UNVERIFIED", "UNKNOWN", nil} {
		if len(validate(with("science_status", status))) == 0 {
			t.Errorf("science_status %v accepted", status)
		}
	}
}

func TestCIFailureAndMissingChecksBlock(t *testing.T) {
	for _, c := range []any{"failure", "cancelled", "skipped", nil} {
		if len(validate(with("ci_conclusion", c))) == 0 {
			t.Errorf("ci_conclusion %v accepted", c)
		}
	}
	for _, c := range []any{map[string]any{}, map[string]any{"example-only": "failure"}, nil} {
		if len(validate(with("required_checks", c))) == 0 {
			t.Errorf("required_checks %v accepted", c)
		}
	}
}

func TestApprovalDemoAndSubmissionRequireLiteralTrue(t *testing.T) {
	for _, key := range []string{"human_approval", "public_demo_verified", "nasa_submission_authorized"} {
		for _, v := range []any{false, "true", pyjson.I(1), nil} {
			if len(validate(with(key, v))) == 0 {
				t.Errorf("%s=%v accepted", key, v)
			}
		}
	}
}

func TestInvalidSHAAndURLBlock(t *testing.T) {
	for _, key := range []string{"main_sha", "candidate_sha"} {
		if len(validate(with(key, strings.Repeat("A", 40)))) == 0 {
			t.Errorf("%s uppercase accepted", key)
		}
	}
	if len(validate(with("ci_run_url", "https://example.org/actions/runs/123"))) == 0 {
		t.Error("foreign URL accepted")
	}
}

func TestNonObjectInputBlocks(t *testing.T) {
	for _, v := range []any{nil, []any{}, "success", pyjson.I(1)} {
		if len(validate(v)) == 0 {
			t.Errorf("%v accepted", v)
		}
	}
}

func TestCLIExitCodes(t *testing.T) {
	file := func(body string) string {
		p := filepath.Join(t.TempDir(), "e.json")
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	var out, errb bytes.Buffer
	if run([]string{"x"}, &out, &errb) != 2 || !strings.Contains(errb.String(), "usage:") {
		t.Fatalf("usage: %q", errb.String())
	}
	errb.Reset()
	if run([]string{"x", file("{bad")}, &out, &errb) != 2 || !strings.HasPrefix(errb.String(), "BLOCKED: invalid evidence: Expecting property name") {
		t.Fatalf("invalid json: %q", errb.String())
	}
	errb.Reset()
	if run([]string{"x", file("{}")}, &out, &errb) != 1 || !strings.Contains(errb.String(), "BLOCKED: missing main_sha") {
		t.Fatalf("empty object: %q", errb.String())
	}
}
