package naif

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var months = map[string]int{"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
	"JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}

// daysFromCivil is the proleptic Gregorian day count since 1970-01-01.
func daysFromCivil(y, m, d int) int {
	if m <= 2 {
		y--
	}
	era := y / 400
	if y < 0 {
		era = (y - 399) / 400
	}
	yoe := y - era*400
	mp := (m + 9) % 12
	doy := (153*mp+2)/5 + d - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	return era*146097 + doe - 719468
}

var j2000Day = daysFromCivil(2000, 1, 1)

// utcSeconds is the UTC clock count (every UTC day is 86400 s) from 2000-01-01 12:00:00.
func utcSeconds(y, mo, d, h, mi int, s float64) float64 {
	days := daysFromCivil(y, mo, d) - j2000Day
	return float64(days)*86400 + float64(h*3600+mi*60) + s - 43200
}

// leapTable holds (UTC count at 00:00:00 of the effective date, TAI-UTC after it).
type leapTable struct {
	at       []float64
	delta    []float64
	dtA, k   float64
	eb       float64
	m0, m1   float64
	loadedOK bool
}

var litDate = regexp.MustCompile(`^@(\d{4})-([A-Za-z]{3})-(\d{1,2})$`)

func (k *Kernels) leaps() (*leapTable, error) {
	if k.leap != nil {
		return k.leap, nil
	}
	t := &leapTable{}
	sc := func(name string) (float64, error) {
		v, ok := k.pool.Numbers(name)
		if !ok || len(v) < 1 {
			return 0, fmt.Errorf("leapseconds kernel not loaded: missing %s", name)
		}
		return v[0], nil
	}
	var err error
	if t.dtA, err = sc("DELTET/DELTA_T_A"); err != nil {
		return nil, err
	}
	if t.k, err = sc("DELTET/K"); err != nil {
		return nil, err
	}
	if t.eb, err = sc("DELTET/EB"); err != nil {
		return nil, err
	}
	m, ok := k.pool.Numbers("DELTET/M")
	if !ok || len(m) != 2 {
		return nil, fmt.Errorf("leapseconds kernel not loaded: missing DELTET/M")
	}
	t.m0, t.m1 = m[0], m[1]
	da, ok := k.pool.Values("DELTET/DELTA_AT")
	if !ok || len(da) == 0 || len(da)%2 != 0 {
		return nil, fmt.Errorf("leapseconds kernel not loaded: missing DELTET/DELTA_AT")
	}
	for i := 0; i < len(da); i += 2 {
		if da[i].IsStr || !da[i+1].IsStr {
			return nil, fmt.Errorf("invalid DELTET/DELTA_AT")
		}
		g := litDate.FindStringSubmatch(da[i+1].Str)
		if g == nil {
			return nil, fmt.Errorf("invalid leap second date %q", da[i+1].Str)
		}
		y, _ := strconv.Atoi(g[1])
		d, _ := strconv.Atoi(g[3])
		t.at = append(t.at, utcSeconds(y, months[strings.ToUpper(g[2])], d, 0, 0, 0))
		t.delta = append(t.delta, da[i].Num)
	}
	k.leap = t
	return t, nil
}

// tdbFromTDT is CSPICE UNITIM TDT -> TDB.
func (t *leapTable) tdbFromTDT(tdt float64) float64 {
	m := t.m0 + float64(t.m1*tdt)
	e := m + float64(t.eb*math.Sin(m))
	return tdt + float64(t.k*math.Sin(e))
}

var (
	reMonth = regexp.MustCompile(`^(\d{4})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2}(?:\.\d*)?)(?:\s+(UTC|TDB))?$`)
	reISO   = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z?(?:\s+(UTC|TDB))?$`)
)

// Str2ET converts "YYYY Mon DD HH:MM:SS[.f] [UTC|TDB]" or ISO "YYYY-MM-DDTHH:MM:SS[.f][Z]"
// (UTC unless labelled TDB) to ephemeris time, as CSPICE str2et does for those formats.
func (k *Kernels) Str2ET(s string) (float64, error) {
	s = strings.TrimSpace(s)
	var y, mo, d, h, mi int
	var sec float64
	var zone string
	if g := reMonth.FindStringSubmatch(s); g != nil {
		mo = months[strings.ToUpper(g[2])]
		if mo == 0 {
			return 0, fmt.Errorf("str2et: bad month in %q", s)
		}
		y, _ = strconv.Atoi(g[1])
		d, _ = strconv.Atoi(g[3])
		h, _ = strconv.Atoi(g[4])
		mi, _ = strconv.Atoi(g[5])
		sec, _ = strconv.ParseFloat(g[6], 64)
		zone = g[7]
	} else if g := reISO.FindStringSubmatch(s); g != nil {
		y, _ = strconv.Atoi(g[1])
		mo, _ = strconv.Atoi(g[2])
		d, _ = strconv.Atoi(g[3])
		h, _ = strconv.Atoi(g[4])
		mi, _ = strconv.Atoi(g[5])
		sec, _ = strconv.ParseFloat(g[6], 64)
		zone = g[7]
	} else {
		return 0, fmt.Errorf("str2et: unsupported time format %q", s)
	}
	if mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec >= 60 {
		return 0, fmt.Errorf("str2et: invalid date/time %q", s)
	}
	t, err := k.leaps()
	if err != nil {
		return 0, err
	}
	if zone == "TDB" {
		return utcSeconds(y, mo, d, h, mi, sec), nil // calendar TDB count has the same epoch
	}
	utc := utcSeconds(y, mo, d, h, mi, sec)
	delta := t.delta[0]
	for i, a := range t.at {
		if utc >= a {
			delta = t.delta[i]
		}
	}
	tdt := utc + delta + t.dtA
	return t.tdbFromTDT(tdt), nil
}
