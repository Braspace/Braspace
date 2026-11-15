package main

import "github.com/Braspace/Braspace/api/internal/jsoncontract"

func (c *crewSpec) UnmarshalJSON(raw []byte) error {
	type wire crewSpec
	return jsoncontract.Object(raw, (*wire)(c), []string{"size", "o2_stock_kg", "food_stock_kg", "o2_kg_per_person_day", "food_kg_per_person_day", "reserve_hours", "aboard_during_delay", "rate_source"}, nil)
}

func (c *siteOnboardCandidate) UnmarshalJSON(raw []byte) error {
	type wire siteOnboardCandidate
	return jsoncontract.Object(raw, (*wire)(c), []string{"delay_hours"}, nil)
}

func (r *siteOnboardRequest) UnmarshalJSON(raw []byte) error {
	type wire siteOnboardRequest
	return jsoncontract.Object(raw, (*wire)(r), []string{"power", "max_comm_blackout_hours"}, []string{"crew"})
}

func (r *delayScenarioRequest) UnmarshalJSON(raw []byte) error {
	type wire delayScenarioRequest
	// delays_hours:null has a documented default; other explicitly provided
	// assumptions cannot disappear when null is supplied.
	return jsoncontract.Object(raw, (*wire)(r), nil, []string{"power", "crew", "max_comm_blackout_hours", "constraints", "observer_height_m", "include_nearby", "max_nearby"})
}

func (c *missionConstraints) UnmarshalJSON(raw []byte) error {
	type wire missionConstraints
	return jsoncontract.Object(raw, (*wire)(c), nil, []string{"max_continuous_dark_hours", "max_continuous_comm_gap_hours", "min_sun_fraction", "min_earth_fraction"})
}
