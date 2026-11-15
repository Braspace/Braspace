package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

func repr(f float64) string { return pyfmt.FloatRepr(f) }

const committedDir = "../../../science/benchmarks/horizons"

// The tests never touch JPL: a local server replays the committed raw responses.
func replayServer(t *testing.T) *httptest.Server {
	t.Helper()
	coords := map[string]string{}
	for _, s := range sites {
		coords[repr(s.Lon)+","+repr(s.Lat)+","+repr(s.AltKm)] = s.ID
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		site, ok := coords[q.Get("SITE_COORD")]
		if !ok || q.Get("QUANTITIES") != "4" || q.Get("CENTER") != "coord@301" || q.Get("format") != "json" ||
			q.Get("STEP_SIZE") != "1d" || !strings.HasSuffix(q.Get("STOP_TIME"), "T12:01:00Z") ||
			r.Header.Get("User-Agent") != "braspac-helena-benchmark/1.0" {
			http.Error(w, "unexpected request "+r.URL.RawQuery, http.StatusBadRequest)
			return
		}
		b, err := os.ReadFile(filepath.Join(committedDir, "raw", site, epochFileTag(q.Get("START_TIME")), q.Get("COMMAND")+".json"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		_, _ = w.Write(b)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestRegeneratesCommittedBenchmarkFromRawResponses(t *testing.T) {
	srv := replayServer(t)
	root := t.TempDir()
	var out bytes.Buffer
	err := run(config{root: root, base: srv.URL, minInterval: 0, stdout: &out, now: func() time.Time { return time.Date(2026, 11, 14, 17, 0, 3, 0, time.UTC) }})
	if err != nil {
		t.Fatal(err)
	}
	// Every raw response is rewritten byte for byte; the normalised benchmark is identical,
	// timestamp included (the clock is injected).
	for _, rel := range []string{"benchmark.json"} {
		got, _ := os.ReadFile(filepath.Join(root, "science/benchmarks/horizons", rel))
		want, _ := os.ReadFile(filepath.Join(committedDir, rel))
		if !bytes.Equal(got, want) {
			t.Errorf("%s differs from the committed benchmark", rel)
		}
	}
	n := 0
	err = filepath.Walk(filepath.Join(committedDir, "raw"), func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(committedDir, p)
		want, _ := os.ReadFile(p)
		got, gerr := os.ReadFile(filepath.Join(root, "science/benchmarks/horizons", rel))
		if gerr != nil || !bytes.Equal(got, want) {
			t.Errorf("raw %s not reproduced", rel)
		}
		n++
		return nil
	})
	if err != nil || n != 48 {
		t.Fatalf("expected 48 raw responses, saw %d (err %v)", n, err)
	}
	if !strings.Contains(out.String(), "benchmark.json gravado com 48 entradas") {
		t.Errorf("unexpected stdout tail: %s", out.String())
	}
}

func TestHTTPErrorStopsTheRun(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "boom", 503) }))
	defer srv.Close()
	err := run(config{root: t.TempDir(), base: srv.URL, stdout: io.Discard, now: time.Now})
	if err == nil || !strings.Contains(err.Error(), "503") {
		t.Fatalf("expected HTTP 503 failure, got %v", err)
	}
}

func TestParseAzEl(t *testing.T) {
	az, el, err := parseAzEl("head\n$$SOE\n 2026-Dec-01 12:00 *   217.667102   1.090980\n$$EOE\ntail")
	if err != nil || az != 217.667102 || el != 1.090980 {
		t.Fatalf("got %v %v %v", az, el, err)
	}
	for _, bad := range []string{"no block", "$$SOE\n a 1 2\n b 3 4\n$$EOE"} {
		if _, _, err := parseAzEl(bad); err == nil {
			t.Errorf("expected error for %q", bad)
		}
	}
	if extractSource("x {source: DE441} y") != "DE441" || extractSource("none") != fallbackEphemerisSource {
		t.Error("extractSource")
	}
}

func TestQueryEncodingMatchesUrllib(t *testing.T) {
	got := encodeQuery([][2]string{{"SITE_COORD", "56.30993,-89.5244,0.0"}, {"COMMAND", "10"}, {"START_TIME", "2026-12-01T12:00:00Z"}, {"x", "a b'c"}})
	want := "SITE_COORD=56.30993%2C-89.5244%2C0.0&COMMAND=10&START_TIME=2026-12-01T12%3A00%3A00Z&x=a+b%27c"
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	if !regexp.MustCompile(`^\d{14}Z$`).MatchString(epochFileTag("2026-12-01T12:00:00Z")) {
		t.Error("epoch tag format")
	}
}
