// Package onboard implements an educational, deterministic lunar lander
// resource simulator. It is NOT spacecraft flight software and consumes
// caller-supplied (unverified) sunlight/earth-visibility data.
package onboard

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"sort"
	"strings"
	"time"
	"github.com/Braspace/Braspace/api/internal/jsoncontract"
)

const (
	Version = "braspace.onboard-simulator.v1"
	MaxRequestBytes = 128 << 10
	MaxCandidates = 8
	MaxSamples = 480
)

type Power struct {
	BatteryCapacityWh float64 `json:"battery_capacity_wh"`
	InitialChargeWh float64 `json:"initial_charge_wh"`
	ReserveWh float64 `json:"reserve_wh"`
	SolarGenerationW float64 `json:"solar_generation_w"`
	LoadW float64 `json:"load_w"`
}

type Sample struct {
	SunVisible *bool `json:"sun_visible"`
	EarthVisible *bool `json:"earth_visible"`
}

type Candidate struct {
	ID string `json:"id"`
	SiteID string `json:"site_id"`
	StartUTC string `json:"start_utc"`
	SourceClaim string `json:"source_claim"`
	StepMinutes int `json:"step_minutes"`
	MaxCommBlackoutHours float64 `json:"max_comm_blackout_hours"`
	Power Power `json:"power"`
	Samples []Sample `json:"samples"`
}

type Request struct {
	MissionID string `json:"mission_id"`
	Candidates []Candidate `json:"candidates"`
}

type Risk struct {
	Category string `json:"category"`
	Severity string `json:"severity"`
	Measured float64 `json:"measured"`
	Allowed float64 `json:"allowed"`
	Unit string `json:"unit"`
	Explanation string `json:"explanation"`
}

type Snapshot struct {
	EpochUTC string `json:"epoch_utc"`
	SunVisible bool `json:"sun_visible"`
	EarthVisible bool `json:"earth_visible"`
	ChargeWh float64 `json:"charge_wh"`
	UnservedEnergyWh float64 `json:"unserved_energy_wh"`
	Mode string `json:"mode"`
}

type Metrics struct {
	DurationHours float64 `json:"duration_hours"`
	MinChargeWh float64 `json:"minimum_charge_wh"`
	FinalChargeWh float64 `json:"final_charge_wh"`
	UnservedEnergyWh float64 `json:"total_unserved_energy_wh"`
	LongestDarknessHours float64 `json:"longest_darkness_hours"`
	LongestEarthObstructionHours float64 `json:"longest_earth_obstruction_hours"`
}

type Option struct {
	ID string `json:"id"`
	SiteID string `json:"site_id"`
	StartUTC string `json:"start_utc"`
	SourceClaimUnverified string `json:"source_claim_unverified,omitempty"`
	SimulationStatus string `json:"simulation_status"`
	EndMode string `json:"end_mode"`
	Risks []Risk `json:"risks"`
	Metrics Metrics `json:"metrics"`
	Timeline []Snapshot `json:"timeline"`
}

type Response struct {
	Version string `json:"version"`
	MissionID string `json:"mission_id"`
	InputsSHA256 string `json:"inputs_sha256"`
	ScienceStatus string `json:"science_status"`
	NoFlightRecommendation bool `json:"no_flight_recommendation"`
	LaboratoryCandidateID *string `json:"laboratory_candidate_id"`
	Decision string `json:"decision"`
	Options []Option `json:"options"`
	Limitations []string `json:"limitations"`
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func rounded(v float64) float64 { return math.Round(v*1000) / 1000 }

func validate(req Request) error {
	if len(strings.TrimSpace(req.MissionID)) == 0 || len(req.MissionID) > 96 {
		return errors.New("mission_id is required and must be <= 96 characters")
	}
	if len(req.Candidates) < 1 || len(req.Candidates) > MaxCandidates {
		return fmt.Errorf("candidates must have 1..%d entries", MaxCandidates)
	}
	seen := map[string]bool{}
	for _, c := range req.Candidates {
		if strings.TrimSpace(c.ID) == "" || len(c.ID) > 96 || seen[c.ID] {
			return errors.New("candidate id must be nonempty, unique and <= 96 characters")
		}
		seen[c.ID] = true
		if strings.TrimSpace(c.SiteID) == "" || len(c.SiteID) > 96 {
			return fmt.Errorf("candidate %s: site_id is required", c.ID)
		}
		t, err := time.Parse(time.RFC3339, c.StartUTC)
		if err != nil || t.Year() < 1900 || t.Year() > 2200 {
			return fmt.Errorf("candidate %s: start_utc must be RFC3339 in supported range", c.ID)
		}
		if c.StepMinutes < 1 || c.StepMinutes > 360 || len(c.Samples) < 1 || len(c.Samples) > MaxSamples || c.StepMinutes * len(c.Samples) > 43200 {
			return fmt.Errorf("candidate %s: use 1..480 samples, 1..360 min step, <= 30-day duration", c.ID)
		}
		for i, s := range c.Samples {
			if s.SunVisible == nil || s.EarthVisible == nil {
				return fmt.Errorf("candidate %s sample %d: both visibility booleans are required", c.ID, i)
			}
		}
		p := c.Power
		for _, v := range []float64{p.BatteryCapacityWh,p.InitialChargeWh,p.ReserveWh,p.SolarGenerationW,p.LoadW,c.MaxCommBlackoutHours} {
			if !finite(v) || v < 0 || v > 1e8 { return fmt.Errorf("candidate %s: finite, bounded power and limits required", c.ID) }
		}
		if p.BatteryCapacityWh <= 0 || p.InitialChargeWh > p.BatteryCapacityWh || p.ReserveWh > p.BatteryCapacityWh {
			return fmt.Errorf("candidate %s: invalid battery capacity, charge or reserve", c.ID)
		}
		if c.MaxCommBlackoutHours > float64(c.StepMinutes*len(c.Samples))/60 {
			return fmt.Errorf("candidate %s: blackout limit exceeds scenario duration", c.ID)
		}
	}
	return nil
}

func risk(category, severity string, measured, allowed float64, unit, explanation string) Risk {
	return Risk{Category:category, Severity:severity, Measured:rounded(measured), Allowed:rounded(allowed), Unit:unit, Explanation:explanation}
}

func simulate(c Candidate) Option {
	stepH := float64(c.StepMinutes)/60
	t,_ := time.Parse(time.RFC3339, c.StartUTC)
	p:=c.Power
	charge:=p.InitialChargeWh
	minCharge:=charge
	unserved:=0.0
	longestDark,darkRun:=0,0
	longestEarth,earthRun:=0,0
	powerLoss:=false
	trace:=make([]Snapshot,0,len(c.Samples))
	for i,s:=range c.Samples {
		if !*s.SunVisible {darkRun++} else {darkRun=0}
		if !*s.EarthVisible {earthRun++} else {earthRun=0}
		if darkRun>longestDark {longestDark=darkRun}
		if earthRun>longestEarth {longestEarth=earthRun}
		powerInput:=0.0
		if *s.SunVisible {powerInput=p.SolarGenerationW}
		next:=charge+(powerInput-p.LoadW)*stepH
		energyDeficit:=0.0
		if next<0 {energyDeficit=-next;next=0;powerLoss=true}
		if next>p.BatteryCapacityWh {next=p.BatteryCapacityWh}
		charge=next
		if charge<minCharge {minCharge=charge}
		unserved+=energyDeficit
		mode:="NOMINAL"
		if charge<=p.ReserveWh {mode="SAFE_MODE"}
		if energyDeficit>0 {mode="POWER_LOSS"}
		trace=append(trace,Snapshot{
			EpochUTC:t.Add(time.Duration(i+1)*time.Duration(c.StepMinutes)*time.Minute).UTC().Format(time.RFC3339Nano),
			SunVisible:*s.SunVisible,EarthVisible:*s.EarthVisible,
			ChargeWh:rounded(charge),UnservedEnergyWh:rounded(energyDeficit),Mode:mode,
		})
	}
	r:=[]Risk{}
	if powerLoss {
		r=append(r,risk("ENERGY_LOSS","CRITICAL",unserved,0,"Wh","Assumed constant load could not be served by the battery/solar budget."))
	}
	if minCharge<=p.ReserveWh {
		r=append(r,risk("ENERGY_RESERVE","HIGH",minCharge,p.ReserveWh,"Wh","Assumed battery reserve is reached or breached."))
	}
	maxEarth:=float64(longestEarth)*stepH
	if maxEarth>c.MaxCommBlackoutHours {
		r=append(r,risk("EARTH_GEOMETRIC_BLACKOUT","HIGH",maxEarth,c.MaxCommBlackoutHours,"h","Geometric Earth visibility outage exceeds the caller-specified tolerance; no RF or DSN link budget is modeled."))
	}
	status:="CONSTRAINTS_MET"
	if len(r)>0 {status="CONSTRAINTS_BREACHED"}
	mode:="NOMINAL"
	if minCharge<=p.ReserveWh {mode="SAFE_MODE"}
	if powerLoss {mode="POWER_LOSS"}
	return Option{
		ID:c.ID,SiteID:c.SiteID,StartUTC:t.UTC().Format(time.RFC3339Nano),
		SourceClaimUnverified:c.SourceClaim,
		SimulationStatus:status,EndMode:mode,Risks:r,
		Metrics:Metrics{DurationHours:rounded(float64(len(c.Samples))*stepH),MinChargeWh:rounded(minCharge),
			FinalChargeWh:rounded(charge),UnservedEnergyWh:rounded(unserved),
			LongestDarknessHours:rounded(float64(longestDark)*stepH),
			LongestEarthObstructionHours:rounded(maxEarth)},
		Timeline:trace,
	}
}

// Evaluate selects an educational scenario only when all caller-defined
// constraints pass. It NEVER recommends a location for real spacecraft flight.
func Evaluate(req Request) (Response,error) {
	if err:=validate(req);err!=nil{return Response{},err}
	raw,_:=json.Marshal(req)
	digest:=sha256.Sum256(raw)
	resp:=Response{Version:Version,MissionID:req.MissionID,
		InputsSHA256:hex.EncodeToString(digest[:]),ScienceStatus:"UNVERIFIED_INPUTS",
		NoFlightRecommendation:true,Decision:"NO_OPTION_PASSES_ASSUMED_LIMITS",
		Options:make([]Option,0,len(req.Candidates)),
		Limitations:[]string{
			"Educational ground simulation only: not an onboard flight computer, flight-ready navigation, or a NASA-certified mission tool.",
			"Visibility time series and source names were supplied by the caller; no NASA LOLA, SPICE, or JPL data were authenticated.",
			"Sun visibility is treated as fixed assumed electrical generation, ignoring incidence angle, eclipses, thermal conditions, dust and panel degradation.",
			"Earth visibility is geometric only, not guaranteed radio contact, DSN availability, or an RF link-budget result.",
			"Candidate selection compares ONLY supplied scenarios and assumed constraints; it cannot discover unprovided sites or flight trajectories.",
		},
	}
	for _,c:=range req.Candidates {resp.Options=append(resp.Options,simulate(c))}
	valid:=[]Option{}
	for _,o:=range resp.Options {if o.SimulationStatus=="CONSTRAINTS_MET" {valid=append(valid,o)}}
	sort.SliceStable(valid,func(i,j int)bool{
		if valid[i].Metrics.MinChargeWh!=valid[j].Metrics.MinChargeWh {
			return valid[i].Metrics.MinChargeWh>valid[j].Metrics.MinChargeWh
		}
		if valid[i].Metrics.LongestEarthObstructionHours!=valid[j].Metrics.LongestEarthObstructionHours {
			return valid[i].Metrics.LongestEarthObstructionHours<valid[j].Metrics.LongestEarthObstructionHours
		}
		return valid[i].ID<valid[j].ID
	})
	if len(valid)>0 {id:=valid[0].ID;resp.LaboratoryCandidateID=&id;resp.Decision="EDUCATIONAL_OPTION_MEETS_ASSUMED_LIMITS"}
	return resp,nil
}

func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		w.Header().Set("Content-Type","application/json; charset=utf-8")
		w.Header().Set("Cache-Control","no-store")
		media,_,err:=mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err!=nil || media!="application/json" {
			w.WriteHeader(http.StatusUnsupportedMediaType)
			_ = json.NewEncoder(w).Encode(map[string]string{"code":"CONTENT_TYPE_REQUIRED","error":"application/json required"})
			return
		}
		raw,err:=io.ReadAll(io.LimitReader(r.Body,MaxRequestBytes+1))
		if err!=nil || len(raw)>MaxRequestBytes {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			_ = json.NewEncoder(w).Encode(map[string]string{"code":"REQUEST_TOO_LARGE","error":"maximum request size exceeded"})
			return
		}
		if err:=jsoncontract.Check(raw);err!=nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"code":"INVALID_JSON","error":"invalid JSON document"})
			return
		}
		dec:=json.NewDecoder(strings.NewReader(string(raw)))
		dec.DisallowUnknownFields()
		var req Request
		if err:=dec.Decode(&req);err!=nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"code":"INVALID_JSON","error":"invalid JSON contract"})
			return
		}
		var trailing any
		if err:=dec.Decode(&trailing);err!=io.EOF {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"code":"TRAILING_JSON","error":"trailing payload not allowed"})
			return
		}
		out,err:=Evaluate(req)
		if err!=nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]string{"code":"INVALID_SCENARIO","error":err.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(out)
	})
}
