// Command validatereleaseevidence is a fail-closed, standard-library-only release evidence gate.
// Go port of scripts/validate_release_evidence.py (same messages and exit codes).
//
// This is an evidence validator, NOT a substitute for GitHub branch protection.
// Usage: go run ./cmd/validatereleaseevidence evidence.json
package main

import (
	"fmt"
	"io"
	"os"
	"regexp"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

var (
	sha256Hex = regexp.MustCompile(`^[0-9a-f]{40}$`)
	runURL    = regexp.MustCompile(`^https://github\.com/Braspace/Braspace/actions/runs/[0-9]+$`)
	required  = []string{"main_sha", "candidate_sha", "ci_run_url", "ci_conclusion",
		"required_checks", "human_approval", "science_status",
		"public_demo_verified", "nasa_submission_authorized"}
)

func validate(record any) []string {
	m, ok := record.(map[string]any)
	if !ok {
		return []string{"evidence must be a JSON object"}
	}
	var errs []string
	for _, key := range required {
		if _, ok := m[key]; !ok {
			errs = append(errs, "missing "+key)
		}
	}
	for _, key := range []string{"main_sha", "candidate_sha"} {
		if s, ok := m[key].(string); !ok || !sha256Hex.MatchString(s) {
			errs = append(errs, key+" must be a full lowercase 40-character SHA")
		}
	}
	if m["ci_conclusion"] != "success" {
		errs = append(errs, "CI is not successful")
	}
	if u, ok := m["ci_run_url"].(string); !ok || !runURL.MatchString(u) {
		errs = append(errs, "missing canonical GitHub Actions run URL")
	}
	checks, ok := m["required_checks"].(map[string]any)
	bad := !ok || len(checks) == 0
	for _, v := range checks {
		if v != "success" {
			bad = true
		}
	}
	if bad {
		errs = append(errs, "required checks must be a nonempty map of successes")
	}
	if m["human_approval"] != true {
		errs = append(errs, "human approval absent")
	}
	if m["science_status"] != "VERIFIED" {
		errs = append(errs, "science remains PRELIMINARY/UNVERIFIED")
	}
	if m["public_demo_verified"] != true {
		errs = append(errs, "public demo not verified")
	}
	if m["nasa_submission_authorized"] != true {
		errs = append(errs, "NASA submission not authorized")
	}
	return errs
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 2 {
		fmt.Fprintln(stderr, "usage: validate_release_evidence.py evidence.json")
		return 2
	}
	text, err := pyjson.ReadText(args[1])
	var record any
	if err == nil {
		record, err = pyjson.LoadsStr(text, nil)
	}
	if err != nil {
		fmt.Fprintf(stderr, "BLOCKED: invalid evidence: %v\n", err)
		return 2
	}
	errs := validate(record)
	for _, e := range errs {
		fmt.Fprintf(stderr, "BLOCKED: %s\n", e)
	}
	if len(errs) > 0 {
		return 1
	}
	fmt.Fprintln(stdout, "Evidence fields pass structural gate; independently verify run, SHA and approvals.")
	return 0
}

func main() { os.Exit(run(os.Args, os.Stdout, os.Stderr)) }
