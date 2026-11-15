package onboard

import "github.com/Braspace/Braspace/api/internal/jsoncontract"

// A declared physical zero is valid; omitted or null power cannot be
// interpreted as zero load, reserve, solar input, or initial charge.
func (p *Power) UnmarshalJSON(raw []byte) error {
	type wire Power
	return jsoncontract.Object(raw, (*wire)(p), []string{"battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"}, nil)
}

func (c *Candidate) UnmarshalJSON(raw []byte) error {
	type wire Candidate
	return jsoncontract.Object(raw, (*wire)(c), []string{"power", "max_comm_blackout_hours"}, nil)
}
