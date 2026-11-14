package main

import (
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/Braspace/Braspace/api/onboard"
)

// crewSpec declares crew size, consumable stocks and per-person rates. Rates
// are inputs with a cited source (rate_source); the API ships no defaults.
type crewSpec struct {
	Size               int     `json:"size"`
	O2StockKg          float64 `json:"o2_stock_kg"`
	FoodStockKg        float64 `json:"food_stock_kg"`
	O2KgPerPersonDay   float64 `json:"o2_kg_per_person_day"`
	FoodKgPerPersonDay float64 `json:"food_kg_per_person_day"`
	ReserveHours       float64 `json:"reserve_hours"`
	AboardDuringDelay  bool    `json:"aboard_during_delay"`
	RateSource         string  `json:"rate_source"`
}

func (c *crewSpec) validate() error {
	switch {
	case c.Size < 1 || c.Size > 12:
		return errf(http.StatusUnprocessableEntity, "INVALID_CREW", "crew.size must be 1..12")
	case !finite(c.O2StockKg) || c.O2StockKg < 0 || c.O2StockKg > 1e5, !finite(c.FoodStockKg) || c.FoodStockKg < 0 || c.FoodStockKg > 1e5:
		return errf(http.StatusUnprocessableEntity, "INVALID_CREW", "crew stocks must be in [0, 100000] kg")
	case !finite(c.O2KgPerPersonDay) || c.O2KgPerPersonDay <= 0 || c.O2KgPerPersonDay > 100,
		!finite(c.FoodKgPerPersonDay) || c.FoodKgPerPersonDay <= 0 || c.FoodKgPerPersonDay > 100:
		return errf(http.StatusUnprocessableEntity, "INVALID_CREW", "crew rates must be in (0, 100] kg per person per day")
	case !finite(c.ReserveHours) || c.ReserveHours < 0 || c.ReserveHours > maxWindowHours:
		return errf(http.StatusUnprocessableEntity, "INVALID_CREW", "crew.reserve_hours must be in [0, %d]", maxWindowHours)
	case strings.TrimSpace(c.RateSource) == "" || len(c.RateSource) > 300:
		return errf(http.StatusUnprocessableEntity, "INVALID_CREW", "crew.rate_source must cite where the consumption rates come from")
	}
	return nil
}

type consumableReport struct {
	Resource          string  `json:"resource"`
	Unit              string  `json:"unit"`
	RateKgPerHour     float64 `json:"rate_kg_per_hour"`
	UsedDuringDelayKg float64 `json:"used_during_delay_kg"`
	StockAtStartKg    float64 `json:"stock_at_start_kg"`
	RequiredKg        float64 `json:"required_for_window_kg"`
	RemainingAtEndKg  float64 `json:"remaining_at_end_kg"`
	AutonomyHours     float64 `json:"autonomy_hours"`
	MarginHours       float64 `json:"margin_hours"`
	DepletionUTC      *string `json:"depletion_utc"`
	Status            string  `json:"status"`
}

type consumablesResult struct {
	Status     string             `json:"status"`
	RateSource string             `json:"rate_source,omitempty"`
	Items      []consumableReport `json:"items"`
	Risks      []onboard.Risk     `json:"risks"`
}

// consumables projects linear consumption over [start, start+hours). When the
// crew waits aboard during a delay, the delay is consumed before the window
// starts. A nil crew gives status UNKNOWN; nothing is assumed.
func consumables(c *crewSpec, start time.Time, hours, delayHours float64) consumablesResult {
	if c == nil {
		return consumablesResult{Status: "UNKNOWN", Items: []consumableReport{}, Risks: []onboard.Risk{}}
	}
	res := consumablesResult{Status: "OK", RateSource: c.RateSource, Items: []consumableReport{}, Risks: []onboard.Risk{}}
	for _, r := range []struct {
		name, label  string
		stock, perPD float64
	}{{"oxygen", "OXYGEN", c.O2StockKg, c.O2KgPerPersonDay}, {"food", "FOOD", c.FoodStockKg, c.FoodKgPerPersonDay}} {
		rate := float64(c.Size) * r.perPD / 24
		delayUse := 0.0
		exhaustedWaiting := false
		if c.AboardDuringDelay {
			exhaustedWaiting = rate*delayHours > r.stock
			delayUse = math.Min(r.stock, rate*delayHours)
		}
		stock := r.stock - delayUse
		autonomy := stock / rate
		margin := autonomy - hours
		item := consumableReport{
			Resource: r.name, Unit: "kg", RateKgPerHour: round6(rate), UsedDuringDelayKg: round6(delayUse),
			StockAtStartKg: round6(stock), RequiredKg: round6(rate * hours), RemainingAtEndKg: round6(math.Max(0, stock-rate*hours)),
			AutonomyHours: round6(autonomy), MarginHours: round6(margin), Status: "OK",
		}
		switch {
		case exhaustedWaiting:
			// Runs out before the window starts: launch time + stock / rate.
			launch := start.Add(-time.Duration(delayHours * float64(time.Hour)))
			at := launch.Add(time.Duration(r.stock / rate * float64(time.Hour))).UTC().Format(time.RFC3339)
			item.DepletionUTC, item.Status = &at, "DEPLETED_DURING_DELAY"
			res.Risks = append(res.Risks, onboard.Risk{Category: r.label + "_DEPLETION", Severity: "CRITICAL", Measured: round6(r.stock / rate), Allowed: round6(delayHours + hours), Unit: "h",
				Explanation: fmt.Sprintf("%s runs out %.1f h into the %.0f h delay, before the window starts, at the declared consumption rate.", r.name, r.stock/rate, delayHours)})
			res.Status = "CRITICAL"
		case margin < 0:
			at := start.Add(time.Duration(autonomy * float64(time.Hour))).UTC().Format(time.RFC3339)
			item.DepletionUTC, item.Status = &at, "DEPLETED_BEFORE_END"
			res.Risks = append(res.Risks, onboard.Risk{Category: r.label + "_DEPLETION", Severity: "CRITICAL", Measured: round6(autonomy), Allowed: round6(hours), Unit: "h",
				Explanation: fmt.Sprintf("%s runs out %.1f h before the end of the window at the declared consumption rate.", r.name, -margin)})
			res.Status = "CRITICAL"
		case margin < c.ReserveHours:
			item.Status = "BELOW_RESERVE"
			res.Risks = append(res.Risks, onboard.Risk{Category: r.label + "_RESERVE", Severity: "HIGH", Measured: round6(margin), Allowed: round6(c.ReserveHours), Unit: "h",
				Explanation: fmt.Sprintf("%s margin at the end of the window is below the declared reserve.", r.name)})
			if res.Status == "OK" {
				res.Status = "WARNING"
			}
		}
		res.Items = append(res.Items, item)
	}
	return res
}

// consumableChecks expresses the consumable margins as constraint checks so
// the delay replan can name the breached criterion, unit and margin.
func consumableChecks(c *crewSpec, res, baseline *consumablesResult) []constraintCheck {
	if c == nil || res == nil {
		return nil
	}
	var out []constraintCheck
	for i, it := range res.Items {
		cc := constraintCheck{Criterion: it.Resource + "_margin_hours", Unit: "h", Comparator: ">=", Limit: c.ReserveHours,
			Value: it.MarginHours, Margin: round6(it.MarginHours - c.ReserveHours), Passed: it.MarginHours >= c.ReserveHours}
		if baseline != nil && i < len(baseline.Items) {
			b := baseline.Items[i].MarginHours
			cc.BaselineValue = &b
		}
		out = append(out, cc)
	}
	return out
}
