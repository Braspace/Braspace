package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// New test (the Python script had none): classification and CLI contract on synthetic job snapshots.
func runOn(t *testing.T, body string) (int, string, string) {
	p := filepath.Join(t.TempDir(), "jobs.json")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	var out, errb bytes.Buffer
	rc := run([]string{"x", p}, &out, &errb)
	return rc, out.String(), errb.String()
}

func TestPrestepAnomalyAndCleanRuns(t *testing.T) {
	rc, out, _ := runOn(t, `{"jobs":[
	  {"id":1,"conclusion":"failure","steps":[]},
	  {"id":2,"conclusion":"failure","steps":[{"name":"x"}]},
	  {"id":3,"conclusion":"cancelled","steps":null},
	  {"id":4,"conclusion":"success","steps":[]},
	  {"id":5,"conclusion":"timed_out"}]}`)
	if rc != 1 || out != "PRESTEP_ANOMALY jobs=1,3,5\n" {
		t.Fatalf("rc=%d out=%q", rc, out)
	}
	rc, out, _ = runOn(t, `{"jobs":[{"id":2,"conclusion":"failure","steps":[{}]}]}`)
	if rc != 0 || out != "NO_PRESTEP_ANOMALY_DETECTED; CI success NOT established\n" {
		t.Fatalf("rc=%d out=%q", rc, out)
	}
}

func TestPrestepRejectsMalformedInput(t *testing.T) {
	for _, body := range []string{`[]`, `{"jobs":{}}`, `{"jobs":[{"id":true}]}`, `{"jobs":[{"id":1.0}]}`, `{"jobs":[{"id":1,"steps":{}}]}`, `{bad`} {
		if rc, _, errb := runOn(t, body); rc != 2 || errb == "" {
			t.Errorf("%s: rc=%d stderr=%q", body, rc, errb)
		}
	}
}
