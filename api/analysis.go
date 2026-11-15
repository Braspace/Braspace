package main

import (
	"math"
	"time"
)

const analysisVersion = "braspace.analysis.v1"

type window struct {
	StartUTC      string  `json:"start_utc"`
	EndUTC        string  `json:"end_utc"`
	DurationHours float64 `json:"duration_hours"`
}

type seriesPoint struct {
	EpochUTC       string  `json:"epoch_utc"`
	SunVisible     bool    `json:"sun_visible"`
	EarthVisible   bool    `json:"earth_visible"`
	SunMarginDeg   float64 `json:"sun_margin_deg"`
	EarthMarginDeg float64 `json:"earth_margin_deg"`
}

// metrics treat each sample as constant over [t, t+step); durations therefore
// have a resolution of one step.
type metrics struct {
	exact                    *metrics
	SampleCount              int     `json:"sample_count"`
	StepHours                float64 `json:"step_hours"`
	SunVisibleFraction       float64 `json:"sun_visible_fraction"`
	EarthVisibleFraction     float64 `json:"earth_visible_fraction"`
	SimultaneousFraction     float64 `json:"simultaneous_fraction"`
	LongestDarkHours         float64 `json:"longest_continuous_dark_hours"`
	LongestCommGapHours      float64 `json:"longest_continuous_comm_gap_hours"`
	MinSunMarginDeg          float64 `json:"min_sun_margin_deg"`
	MinEarthMarginDeg        float64 `json:"min_earth_margin_deg"`
	SunVisibilityWindowCount int     `json:"sun_window_count"`
}

type evaluation struct {
	StartUTC     string        `json:"start_utc"`
	EndUTC       string        `json:"end_utc"`
	Metrics      metrics       `json:"metrics"`
	SunWindows   []window      `json:"sun_windows"`
	EarthWindows []window      `json:"earth_windows"`
	BothWindows  []window      `json:"simultaneous_windows"`
	Series       []seriesPoint `json:"series,omitempty"`
}

func round6(v float64) float64 { return math.Round(v*1e6) / 1e6 }

func analyze(s *siteSeries, from int, res []engineResult, includeSeries bool) evaluation {
	n := len(res)
	stepH := s.step.Hours()
	ev := evaluation{
		StartUTC: s.epoch(from).Format(time.RFC3339),
		EndUTC:   s.epoch(from + n).Format(time.RFC3339),
	}
	sun := make([]bool, n)
	earth := make([]bool, n)
	both := make([]bool, n)
	var sunN, earthN, bothN int
	minSun, minEarth := math.Inf(1), math.Inf(1)
	for i, r := range res {
		sun[i], earth[i], both[i] = r.SunVisible, r.EarthVisible, r.SunVisible && r.EarthVisible
		if sun[i] {
			sunN++
		}
		if earth[i] {
			earthN++
		}
		if both[i] {
			bothN++
		}
		minSun, minEarth = math.Min(minSun, r.SunMarginDeg), math.Min(minEarth, r.EarthMarginDeg)
		if includeSeries {
			ev.Series = append(ev.Series, seriesPoint{
				EpochUTC: s.epoch(from + i).Format(time.RFC3339), SunVisible: r.SunVisible, EarthVisible: r.EarthVisible,
				SunMarginDeg: round6(r.SunMarginDeg), EarthMarginDeg: round6(r.EarthMarginDeg),
			})
		}
	}
	ev.SunWindows = windows(s, from, sun)
	ev.EarthWindows = windows(s, from, earth)
	ev.BothWindows = windows(s, from, both)
	exact := metrics{
		SampleCount:              n,
		StepHours:                stepH,
		SunVisibleFraction:       float64(sunN) / float64(n),
		EarthVisibleFraction:     float64(earthN) / float64(n),
		SimultaneousFraction:     float64(bothN) / float64(n),
		LongestDarkHours:         float64(longestRun(sun, false)) * stepH,
		LongestCommGapHours:      float64(longestRun(earth, false)) * stepH,
		MinSunMarginDeg:          round6(minSun),
		MinEarthMarginDeg:        round6(minEarth),
		SunVisibilityWindowCount: len(ev.SunWindows),
	}
	// Keep the public display precision stable, but evaluate science
	// constraints using the original sample counts and durations.
	ev.Metrics = exact
	ev.Metrics.exact = &exact
	ev.Metrics.SunVisibleFraction = round6(exact.SunVisibleFraction)
	ev.Metrics.EarthVisibleFraction = round6(exact.EarthVisibleFraction)
	ev.Metrics.SimultaneousFraction = round6(exact.SimultaneousFraction)
	ev.Metrics.LongestDarkHours = round6(exact.LongestDarkHours)
	ev.Metrics.LongestCommGapHours = round6(exact.LongestCommGapHours)
	return ev
}

func longestRun(v []bool, want bool) int {
	best, cur := 0, 0
	for _, x := range v {
		if x == want {
			cur++
			if cur > best {
				best = cur
			}
		} else {
			cur = 0
		}
	}
	return best
}

func windows(s *siteSeries, from int, v []bool) []window {
	out := []window{}
	for i := 0; i < len(v); {
		if !v[i] {
			i++
			continue
		}
		j := i
		for j < len(v) && v[j] {
			j++
		}
		out = append(out, window{
			StartUTC:      s.epoch(from + i).Format(time.RFC3339),
			EndUTC:        s.epoch(from + j).Format(time.RFC3339),
			DurationHours: round6(float64(j-i) * s.step.Hours()),
		})
		i = j
	}
	return out
}

// missionConstraints are explicit, caller-declared assumptions (for example a
// battery that survives N hours without sunlight). The API ships no defaults.
type missionConstraints struct {
	MaxContinuousDarkHours    *float64 `json:"max_continuous_dark_hours,omitempty"`
	MaxContinuousCommGapHours *float64 `json:"max_continuous_comm_gap_hours,omitempty"`
	MinSunFraction            *float64 `json:"min_sun_fraction,omitempty"`
	MinEarthFraction          *float64 `json:"min_earth_fraction,omitempty"`
}

type constraintCheck struct {
	Criterion     string   `json:"criterion"`
	Unit          string   `json:"unit"`
	Comparator    string   `json:"comparator"`
	Limit         float64  `json:"limit"`
	Value         float64  `json:"value"`
	BaselineValue *float64 `json:"baseline_value,omitempty"`
	Margin        float64  `json:"margin"`
	Passed        bool     `json:"passed"`
}

func (c missionConstraints) empty() bool {
	return c.MaxContinuousDarkHours == nil && c.MaxContinuousCommGapHours == nil && c.MinSunFraction == nil && c.MinEarthFraction == nil
}

// check evaluates every declared constraint. Margin is positive when the
// constraint holds and negative by the amount it is breached.
func (c missionConstraints) check(m metrics, baseline *metrics) []constraintCheck {
	var out []constraintCheck
	if m.exact != nil {
		m = *m.exact
	}
	if baseline != nil && baseline.exact != nil {
		baseline = baseline.exact
	}
	add := func(limit *float64, name, unit, cmp string, pick func(metrics) float64) {
		if limit == nil {
			return
		}
		v := pick(m)
		margin := *limit - v
		if cmp == ">=" {
			margin = v - *limit
		}
		cc := constraintCheck{Criterion: name, Unit: unit, Comparator: cmp, Limit: *limit, Value: v, Margin: margin, Passed: margin >= 0}
		if baseline != nil {
			b := pick(*baseline)
			cc.BaselineValue = &b
		}
		out = append(out, cc)
	}
	add(c.MaxContinuousDarkHours, "longest_continuous_dark_hours", "h", "<=", func(m metrics) float64 { return m.LongestDarkHours })
	add(c.MaxContinuousCommGapHours, "longest_continuous_comm_gap_hours", "h", "<=", func(m metrics) float64 { return m.LongestCommGapHours })
	add(c.MinSunFraction, "sun_visible_fraction", "fraction", ">=", func(m metrics) float64 { return m.SunVisibleFraction })
	add(c.MinEarthFraction, "earth_visible_fraction", "fraction", ">=", func(m metrics) float64 { return m.EarthVisibleFraction })
	return out
}

func allPassed(cs []constraintCheck) bool {
	for _, c := range cs {
		if !c.Passed {
			return false
		}
	}
	return true
}

func breached(cs []constraintCheck) []constraintCheck {
	out := []constraintCheck{}
	for _, c := range cs {
		if !c.Passed {
			out = append(out, c)
		}
	}
	return out
}
