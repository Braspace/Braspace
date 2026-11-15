package main

import (
	"bytes"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

const benchPath = "../../../science/benchmarks/horizons/benchmark.json"

func benchEntries(t *testing.T) []any {
	t.Helper()
	b, err := os.ReadFile(benchPath)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := pyfmt.Parse(b)
	if err != nil {
		t.Fatal(err)
	}
	v, _ := doc.(pyfmt.Obj).Get("entries")
	return v.([]any)
}

func get(e any, k string) any { v, _ := e.(pyfmt.Obj).Get(k); return v }

func write(t *testing.T, entries []any) string {
	t.Helper()
	txt, err := pyfmt.Marshal(pyfmt.Obj{{K: "entries", V: entries}}, pyfmt.Options{Indent: 2, EnsureASCII: true})
	if err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(t.TempDir(), "calc.json")
	if err := os.WriteFile(p, []byte(txt+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func runCompare(t *testing.T, calc string) (string, int) {
	t.Helper()
	var out bytes.Buffer
	code, err := compare([]string{"-benchmark", benchPath, "-calculated", calc, "-tolerancia-deg", "0.05"}, &out)
	if err != nil {
		t.Fatal(err)
	}
	return out.String(), code
}

// Port of test_compare_synthetic.py: half the entries identical, half with a known
// +0.3 deg az / -0.2 deg el deviation; the comparator must report exactly those residuals and FAIL.
func TestSyntheticInjectedDeviations(t *testing.T) {
	var entries []any
	for i, e := range benchEntries(t) {
		az, _ := pyfmt.Float(get(e, "azimuth_deg"))
		el, _ := pyfmt.Float(get(e, "elevation_deg"))
		az, el = pyfmt.Round(az, 6), pyfmt.Round(el, 6)
		if (i+1)%2 == 0 {
			az, el = pyfmt.Round(az+0.3, 6), pyfmt.Round(el-0.2, 6)
		}
		entries = append(entries, pyfmt.Obj{{K: "site", V: get(e, "site")}, {K: "epoch_utc", V: get(e, "epoch_utc")},
			{K: "body", V: get(e, "body")}, {K: "body_name", V: get(e, "body_name")}, {K: "azimuth_deg", V: az}, {K: "elevation_deg", V: el}})
	}
	txt, code := runCompare(t, write(t, entries))
	re := regexp.MustCompile(`lm1\s+2026-12-01T12:00:00Z\s+399\s+-?[\d.]+\s+-?[\d.]+\s+([\d.+-]+)\s+-?[\d.]+\s+-?[\d.]+\s+([\d.+-]+)`)
	m := re.FindStringSubmatch(txt)
	if m == nil {
		t.Fatalf("injected line n=2 not found in output:\n%s", txt)
	}
	resAz, _ := strconv.ParseFloat(m[1], 64)
	resEl, _ := strconv.ParseFloat(m[2], 64)
	if math.Abs(resAz-0.3) > 0.001 || math.Abs(resEl-(-0.2)) > 0.001 {
		t.Errorf("injected residuals az=%+.4f el=%+.4f, expected az=+0.3 el=-0.2", resAz, resEl)
	}
	if !strings.Contains(txt, "RESULTADO: FALHA") || code == 0 {
		t.Errorf("expected RESULTADO: FALHA and non-zero exit (deviations exceed 0.05), got exit %d", code)
	}
}

// Identical calculated file -> zero residual, OK, exit 0.
func TestIdenticalFileIsOK(t *testing.T) {
	txt, code := runCompare(t, write(t, benchEntries(t)))
	if !strings.Contains(txt, "RESULTADO: OK") || code != 0 {
		t.Fatalf("expected OK/exit 0, got exit %d:\n%s", code, txt)
	}
}

// An entry without a counterpart in the benchmark fails closed.
func TestUnmatchedEntryFails(t *testing.T) {
	entries := benchEntries(t)
	extra := pyfmt.Obj{{K: "site", V: "nowhere"}, {K: "epoch_utc", V: "2030-01-01T00:00:00Z"}, {K: "body", V: pyfmt.Num("10")},
		{K: "azimuth_deg", V: 1.0}, {K: "elevation_deg", V: 2.0}}
	txt, code := runCompare(t, write(t, append(append([]any{}, entries...), extra)))
	if code != 1 || !strings.Contains(txt, "sem correspondencia: 1") || !strings.Contains(txt, "RESULTADO: FALHA") {
		t.Fatalf("unmatched entry must fail, exit %d:\n%s", code, txt)
	}
}
