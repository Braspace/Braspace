// Command checkactionsprestep classifies GitHub Actions job snapshots without mistaking missing
// steps for test failures. Go port of scripts/check_actions_prestep.py (same messages and exit codes).
//
// Usage: go run ./cmd/checkactionsprestep jobs.json
// Input: GitHub REST /actions/runs/{run_id}/jobs response (jobs array).
// Exit 1 for failed/cancelled/timed-out jobs without recorded steps; 2 for bad input.
// This diagnostic never certifies CI or scientific results.
package main

import (
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"
	"strings"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

func inspect(payload any) ([]string, error) {
	obj, _ := payload.(map[string]any)
	jobs, isList := obj["jobs"].([]any)
	if !isList {
		return nil, errors.New("expected an object with jobs array")
	}
	var anomalies []string
	for _, j := range jobs {
		job, _ := j.(map[string]any)
		id, isInt := job["id"].(*big.Int)
		if job == nil || !isInt {
			return nil, errors.New("each job requires an integer id")
		}
		steps := job["steps"]
		list, isList := steps.([]any)
		if steps != nil && !isList {
			return nil, errors.New("steps must be an array or null")
		}
		switch job["conclusion"] {
		case "failure", "cancelled", "timed_out":
			if len(list) == 0 {
				anomalies = append(anomalies, id.String())
			}
		}
	}
	return anomalies, nil
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 2 {
		fmt.Fprintln(stderr, "usage: check_actions_prestep.py jobs.json")
		return 2
	}
	text, err := pyjson.ReadText(args[1])
	var anomalies []string
	if err == nil {
		var data any
		if data, err = pyjson.LoadsStr(text, nil); err == nil {
			anomalies, err = inspect(data)
		}
	}
	if err != nil {
		fmt.Fprintf(stderr, "INVALID: %v\n", err)
		return 2
	}
	if len(anomalies) > 0 {
		fmt.Fprintln(stdout, "PRESTEP_ANOMALY jobs="+strings.Join(anomalies, ","))
		return 1
	}
	fmt.Fprintln(stdout, "NO_PRESTEP_ANOMALY_DETECTED; CI success NOT established")
	return 0
}

func main() { os.Exit(run(os.Args, os.Stdout, os.Stderr)) }
