package spicelunar

import (
	"errors"
	"math"
	"testing"
	"time"
)

func TestParseISOMatchesPythonFromisoformat(t *testing.T) {
	loc := time.FixedZone("naive", -3*3600)
	for _, c := range []struct {
		in    string
		want  time.Time
		hasTZ bool
	}{
		{"2026-11-15T00:00:00Z", time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), true},
		{"2026-11-14T21:00:00-03:00", time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), true},
		{"2026-11-15 00:00:00+0000", time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), true},
		{"2026-11-15T00:00:00", time.Date(2026, 11, 15, 3, 0, 0, 0, time.UTC), false}, // naive = the given zone, like astimezone()
		{"2026-11-15", time.Date(2026, 11, 15, 3, 0, 0, 0, time.UTC), false},
		{"2026-11-15T00:00:00.5Z", time.Date(2026, 11, 15, 0, 0, 0, 500000000, time.UTC), true},
	} {
		got, hasTZ, err := ParseISO(c.in, loc)
		if err != nil || !got.Equal(c.want) || hasTZ != c.hasTZ {
			t.Errorf("%q: %v tz=%v err=%v", c.in, got, hasTZ, err)
		}
	}
	for _, bad := range []string{"", "x", "2026-02-30T00:00:00Z", "2026-13-01", "2026-11-15T24:00:00Z"} {
		if _, _, err := ParseISO(bad, time.UTC); err == nil {
			t.Errorf("%q must fail", bad)
		}
	}
}

func TestLoadFailsClosedOnMissingKernel(t *testing.T) {
	_, _, err := Load(t.TempDir())
	var mk *MissingKernelError
	if !errors.As(err, &mk) || mk.Name != "naif0012.tls" || err.Error() != "missing required JPL/NAIF kernel: naif0012.tls" {
		t.Errorf("%v", err)
	}
}

func TestRoundedAndObserverKm(t *testing.T) {
	if _, err := Rounded(math.Inf(1)); err == nil {
		t.Error("nonfinite must fail")
	}
	if v, _ := Rounded(1.23456749); v != 1.234567 {
		t.Errorf("round: %v", v)
	}
	r, obs := ObserverKm(-89.4632, -137.49, 1900, 2)
	if math.Abs(r-1739.302) > 1e-9 || math.Abs(math.Sqrt(obs[0]*obs[0]+obs[1]*obs[1]+obs[2]*obs[2])-r) > 1e-9 {
		t.Errorf("observer radius %v %v", r, obs)
	}
}
