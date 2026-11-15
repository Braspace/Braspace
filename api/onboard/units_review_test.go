package onboard

// Dimensional review of the simulator (issue #65, BS-061): energy in Wh, power in W, time in hours.
// Synthetic scenarios only; these tests pin arithmetic, not physics.

import (
	"math"
	"testing"
)

func scenario(stepMinutes int, sun []bool, p Power) Request {
	samples := make([]Sample, len(sun))
	for i, v := range sun {
		samples[i] = Sample{flag(v), flag(true)}
	}
	return Request{MissionID: "units-review", Candidates: []Candidate{{
		ID: "c", SiteID: "demo-synthetic", StartUTC: "2026-12-01T00:00:00Z", SourceClaim: "SYNTHETIC-NOT-NASA",
		StepMinutes: stepMinutes, MaxCommBlackoutHours: 0, Power: p, Samples: samples,
	}}}
}

func repeat(v bool, n int) []bool {
	out := make([]bool, n)
	for i := range out {
		out[i] = v
	}
	return out
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestEnergyIsWattsTimesHours(t *testing.T) {
	// 100 W for 3 h (two 90-minute steps) takes 300 Wh out of 1000 Wh.
	p := Power{BatteryCapacityWh: 1000, InitialChargeWh: 1000, ReserveWh: 100, SolarGenerationW: 0, LoadW: 100}
	r, err := Evaluate(scenario(90, repeat(false, 2), p))
	if err != nil {
		t.Fatal(err)
	}
	m := r.Options[0].Metrics
	if !near(m.DurationHours, 3) || !near(m.FinalChargeWh, 700) || !near(m.MinChargeWh, 700) || !near(m.LongestDarknessHours, 3) {
		t.Fatalf("metrics: %+v", m)
	}
	// Net charging: (250 W - 100 W) for 2 h adds 300 Wh, limited by the capacity.
	p = Power{BatteryCapacityWh: 1000, InitialChargeWh: 600, ReserveWh: 100, SolarGenerationW: 250, LoadW: 100}
	r, err = Evaluate(scenario(60, repeat(true, 2), p))
	if err != nil {
		t.Fatal(err)
	}
	if got := r.Options[0].Metrics.FinalChargeWh; !near(got, 900) {
		t.Fatalf("final charge %v", got)
	}
}

func TestResultsDoNotDependOnTheStepWhenTheScenarioIsTheSame(t *testing.T) {
	// 4 h dark then 4 h sunlit, sampled at 30, 60 and 120 minutes: every energy and duration must agree.
	p := Power{BatteryCapacityWh: 500, InitialChargeWh: 300, ReserveWh: 50, SolarGenerationW: 180, LoadW: 90}
	var first *Metrics
	for _, step := range []int{30, 60, 120} {
		n := 4 * 60 / step
		sun := append(repeat(false, n), repeat(true, n)...)
		r, err := Evaluate(scenario(step, sun, p))
		if err != nil {
			t.Fatal(err)
		}
		m := r.Options[0].Metrics
		if first == nil {
			first = &m
			// 300 - 90*4 = -60: the battery empties, 60 Wh of load is not served, then 90 W net for 4 h.
			if !near(m.UnservedEnergyWh, 60) || !near(m.MinChargeWh, 0) || !near(m.FinalChargeWh, 360) || !near(m.LongestDarknessHours, 4) || !near(m.DurationHours, 8) {
				t.Fatalf("step %d: %+v", step, m)
			}
			continue
		}
		if !near(m.UnservedEnergyWh, first.UnservedEnergyWh) || !near(m.MinChargeWh, first.MinChargeWh) || !near(m.FinalChargeWh, first.FinalChargeWh) ||
			!near(m.LongestDarknessHours, first.LongestDarknessHours) || !near(m.DurationHours, first.DurationHours) {
			t.Fatalf("step %d differs: %+v vs %+v", step, m, *first)
		}
	}
}

func TestBlackoutIsCountedInHoursOfWholeSamples(t *testing.T) {
	// Three consecutive Earth-hidden samples of 30 minutes are reported as 1.5 h and compared with a limit in hours.
	req := scenario(30, repeat(true, 6), Power{BatteryCapacityWh: 100, InitialChargeWh: 100, ReserveWh: 0, SolarGenerationW: 10, LoadW: 10})
	c := &req.Candidates[0]
	for i := 1; i <= 3; i++ {
		c.Samples[i].EarthVisible = flag(false)
	}
	c.MaxCommBlackoutHours = 1
	r, err := Evaluate(req)
	if err != nil {
		t.Fatal(err)
	}
	o := r.Options[0]
	if !near(o.Metrics.LongestEarthObstructionHours, 1.5) {
		t.Fatalf("obstruction %v h", o.Metrics.LongestEarthObstructionHours)
	}
	if len(o.Risks) != 1 || o.Risks[0].Category != "EARTH_GEOMETRIC_BLACKOUT" || o.Risks[0].Unit != "h" || !near(o.Risks[0].Measured, 1.5) || !near(o.Risks[0].Allowed, 1) {
		t.Fatalf("risks: %+v", o.Risks)
	}
}

func TestSunVisibleIsAllOrNothingGeneration(t *testing.T) {
	// Documented model limit, pinned so that it cannot change unnoticed: a sunlit sample yields the whole
	// solar_generation_w whatever the Sun's elevation, incidence or occulted fraction of the disc.
	p := Power{BatteryCapacityWh: 1000, InitialChargeWh: 0, ReserveWh: 0, SolarGenerationW: 200, LoadW: 0}
	r, err := Evaluate(scenario(60, []bool{true, false, true}, p))
	if err != nil {
		t.Fatal(err)
	}
	if got := r.Options[0].Metrics.FinalChargeWh; !near(got, 400) {
		t.Fatalf("final charge %v", got)
	}
}
