// Package habitat models two quantities the mission cockpit does not yet have: cabin pressure with
// the oxygen partial pressure, and propellant (fuel) stock. It is a pure model with no built-in
// numbers: every rate, stock and limit must come from the caller, and each response says which
// inputs it used. Nothing here is a validated flight value.
package habitat

import (
	"errors"
	"math"
)

const (
	MaxDurationH = 720
	Status       = "PREMISE_NOT_VALIDATED"
)

// Cabin describes a cabin that loses pressure at a constant rate.
type Cabin struct {
	InitialKPa float64 `json:"initial_kpa"`
	LeakKPaH   float64 `json:"leak_kpa_per_h"`
	MinKPa     float64 `json:"min_kpa"`
	O2Fraction float64 `json:"o2_fraction"`
	DurationH  float64 `json:"duration_h"`
}

type CabinResult struct {
	Status         string   `json:"status"`
	PressureEndKPa float64  `json:"pressure_end_kpa"`
	PO2EndKPa      float64  `json:"po2_end_kpa"`
	BelowMinAtH    *float64 `json:"below_min_at_h"`
	Breached       bool     `json:"breached"`
	PremiseNote    string   `json:"premise_note"`
}

// Propellant describes a propellant stock that burns at a constant rate.
type Propellant struct {
	StockKg   float64 `json:"stock_kg"`
	BurnKgH   float64 `json:"burn_kg_per_h"`
	DurationH float64 `json:"duration_h"`
}

type PropellantResult struct {
	Status      string   `json:"status"`
	RemainingKg float64  `json:"remaining_kg"`
	DepletedAtH *float64 `json:"depleted_at_h"`
	Depleted    bool     `json:"depleted"`
	PremiseNote string   `json:"premise_note"`
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func (c Cabin) validate() error {
	switch {
	case !finite(c.InitialKPa) || c.InitialKPa <= 0 || c.InitialKPa > 200:
		return errors.New("initial_kpa must be in (0, 200]")
	case !finite(c.LeakKPaH) || c.LeakKPaH < 0 || c.LeakKPaH > 200:
		return errors.New("leak_kpa_per_h must be in [0, 200]")
	case !finite(c.MinKPa) || c.MinKPa < 0 || c.MinKPa > c.InitialKPa:
		return errors.New("min_kpa must be in [0, initial_kpa]")
	case !finite(c.O2Fraction) || c.O2Fraction <= 0 || c.O2Fraction > 1:
		return errors.New("o2_fraction must be in (0, 1]")
	case !finite(c.DurationH) || c.DurationH <= 0 || c.DurationH > MaxDurationH:
		return errors.New("duration_h must be in (0, 720]")
	}
	return nil
}

// Cabin evaluates the cabin at the end of the window and when (if ever) it crosses the minimum.
// Pressure is linear: P(t) = initial - leak * t. Partial pressure of O2 is O2 fraction times P.
func (c Cabin) Evaluate() (CabinResult, error) {
	if err := c.validate(); err != nil {
		return CabinResult{}, err
	}
	pEnd := c.InitialKPa - c.LeakKPaH*c.DurationH
	if pEnd < 0 {
		pEnd = 0
	}
	res := CabinResult{
		Status:         Status,
		PressureEndKPa: pEnd,
		PO2EndKPa:      c.O2Fraction * pEnd,
		PremiseNote:    "Linear leak at a constant rate supplied by the caller. Not a measured or validated leak.",
	}
	if c.LeakKPaH > 0 && c.InitialKPa > c.MinKPa {
		t := (c.InitialKPa - c.MinKPa) / c.LeakKPaH
		if t <= c.DurationH {
			res.Breached = true
			res.BelowMinAtH = &t
		}
	}
	return res, nil
}

func (p Propellant) validate() error {
	switch {
	case !finite(p.StockKg) || p.StockKg < 0 || p.StockKg > 1e6:
		return errors.New("stock_kg must be in [0, 1e6]")
	case !finite(p.BurnKgH) || p.BurnKgH < 0 || p.BurnKgH > 1e6:
		return errors.New("burn_kg_per_h must be in [0, 1e6]")
	case !finite(p.DurationH) || p.DurationH <= 0 || p.DurationH > MaxDurationH:
		return errors.New("duration_h must be in (0, 720]")
	}
	return nil
}

// Evaluate returns remaining propellant and, when the stock runs out inside the window, when.
func (p Propellant) Evaluate() (PropellantResult, error) {
	if err := p.validate(); err != nil {
		return PropellantResult{}, err
	}
	used := p.BurnKgH * p.DurationH
	rem := p.StockKg - used
	res := PropellantResult{
		Status:      Status,
		RemainingKg: math.Max(0, rem),
		PremiseNote: "Constant burn rate supplied by the caller. No propulsion model.",
	}
	if p.BurnKgH > 0 && rem < 0 {
		t := p.StockKg / p.BurnKgH
		res.Depleted = true
		res.DepletedAtH = &t
	}
	return res, nil
}
