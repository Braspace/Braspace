package habitat

import (
	"math"
	"testing"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestCabinLinearLeakAndPO2(t *testing.T) {
	r, err := Cabin{InitialKPa: 101.3, LeakKPaH: 0.5, MinKPa: 90, O2Fraction: 0.21, DurationH: 10}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if !near(r.PressureEndKPa, 96.3) {
		t.Errorf("end pressure = %v, want 96.3", r.PressureEndKPa)
	}
	if !near(r.PO2EndKPa, 0.21*96.3) {
		t.Errorf("end PO2 = %v", r.PO2EndKPa)
	}
	if r.Breached || r.BelowMinAtH != nil {
		t.Errorf("should not breach: %+v", r)
	}
}

func TestCabinCrossesMinimumAtExactHour(t *testing.T) {
	// (101.3 - 90) / 0.5 = 22.6 h, inside a 30 h window.
	r, err := Cabin{InitialKPa: 101.3, LeakKPaH: 0.5, MinKPa: 90, O2Fraction: 0.21, DurationH: 30}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if !r.Breached || r.BelowMinAtH == nil || !near(*r.BelowMinAtH, 22.6) {
		t.Fatalf("breach time = %v, breached=%v", r.BelowMinAtH, r.Breached)
	}
}

func TestCabinNoLeakNeverBreaches(t *testing.T) {
	r, err := Cabin{InitialKPa: 101.3, LeakKPaH: 0, MinKPa: 90, O2Fraction: 0.21, DurationH: 720}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if r.Breached || !near(r.PressureEndKPa, 101.3) {
		t.Errorf("no-leak cabin: %+v", r)
	}
}

func TestCabinPressureFloorsAtZero(t *testing.T) {
	r, err := Cabin{InitialKPa: 10, LeakKPaH: 5, MinKPa: 0, O2Fraction: 0.21, DurationH: 10}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if r.PressureEndKPa != 0 || r.PO2EndKPa != 0 {
		t.Errorf("pressure must not go negative: %+v", r)
	}
}

func TestCabinRejectsBadInput(t *testing.T) {
	base := Cabin{InitialKPa: 101.3, LeakKPaH: 0.5, MinKPa: 90, O2Fraction: 0.21, DurationH: 10}
	cases := map[string]func(*Cabin){
		"no initial pressure": func(c *Cabin) { c.InitialKPa = 0 },
		"negative leak":       func(c *Cabin) { c.LeakKPaH = -1 },
		"min above initial":   func(c *Cabin) { c.MinKPa = 200 },
		"o2 fraction zero":    func(c *Cabin) { c.O2Fraction = 0 },
		"o2 fraction over 1":  func(c *Cabin) { c.O2Fraction = 1.5 },
		"duration too long":   func(c *Cabin) { c.DurationH = 721 },
		"nan leak":            func(c *Cabin) { c.LeakKPaH = math.NaN() },
	}
	for name, mutate := range cases {
		c := base
		mutate(&c)
		if _, err := c.Evaluate(); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestPropellantRemainingAndDepletion(t *testing.T) {
	r, err := Propellant{StockKg: 150, BurnKgH: 2, DurationH: 50}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if !near(r.RemainingKg, 50) || r.Depleted {
		t.Errorf("remaining = %v depleted=%v", r.RemainingKg, r.Depleted)
	}
	r, err = Propellant{StockKg: 150, BurnKgH: 2, DurationH: 100}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if !r.Depleted || r.DepletedAtH == nil || !near(*r.DepletedAtH, 75) || r.RemainingKg != 0 {
		t.Errorf("depletion = %+v", r)
	}
}

func TestPropellantNoBurnNeverDepletes(t *testing.T) {
	r, err := Propellant{StockKg: 10, BurnKgH: 0, DurationH: 720}.Evaluate()
	if err != nil {
		t.Fatal(err)
	}
	if r.Depleted || !near(r.RemainingKg, 10) {
		t.Errorf("%+v", r)
	}
}

func TestPropellantRejectsBadInput(t *testing.T) {
	if _, err := (Propellant{StockKg: -1, BurnKgH: 1, DurationH: 1}).Evaluate(); err == nil {
		t.Error("negative stock accepted")
	}
	if _, err := (Propellant{StockKg: 1, BurnKgH: 1, DurationH: 0}).Evaluate(); err == nil {
		t.Error("zero duration accepted")
	}
}
