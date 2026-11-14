// Command testengine is a stand-in for the Rust CLI used by Go tests. It
// implements the same stdin/stdout contract and horizon interpolation, and can
// be told to fail via BRASPACE_FAKE_ENGINE=fail|garbage|slow.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

type angle struct {
	AzimuthDeg   float64 `json:"azimuth_deg"`
	ElevationDeg float64 `json:"elevation_deg"`
}

type request struct {
	SiteID         string  `json:"site_id"`
	EpochUTC       string  `json:"epoch_utc"`
	Sun            angle   `json:"sun"`
	Earth          angle   `json:"earth"`
	TerrainHorizon []angle `json:"terrain_horizon"`
}

func horizonAt(s []angle, az float64) float64 {
	i := sort.Search(len(s), func(i int) bool { return s[i].AzimuthDeg > az })
	var la, le, ra, re float64
	switch {
	case i == 0:
		la, le, ra, re = s[len(s)-1].AzimuthDeg-360, s[len(s)-1].ElevationDeg, s[0].AzimuthDeg, s[0].ElevationDeg
	case i == len(s):
		la, le, ra, re = s[len(s)-1].AzimuthDeg, s[len(s)-1].ElevationDeg, s[0].AzimuthDeg+360, s[0].ElevationDeg
	default:
		la, le, ra, re = s[i-1].AzimuthDeg, s[i-1].ElevationDeg, s[i].AzimuthDeg, s[i].ElevationDeg
	}
	return le + (re-le)*(az-la)/(ra-la)
}

func main() {
	switch os.Getenv("BRASPACE_FAKE_ENGINE") {
	case "fail":
		fmt.Fprintln(os.Stderr, "engine rejected request")
		os.Exit(2)
	case "garbage":
		fmt.Println("not json")
		return
	case "slow":
		time.Sleep(5 * time.Second)
		return
	}
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil || len(req.TerrainHorizon) < 2 {
		os.Exit(2)
	}
	sunH := horizonAt(req.TerrainHorizon, req.Sun.AzimuthDeg)
	earthH := horizonAt(req.TerrainHorizon, req.Earth.AzimuthDeg)
	sm, em := req.Sun.ElevationDeg-sunH, req.Earth.ElevationDeg-earthH
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
		"site_id": req.SiteID, "epoch_utc": req.EpochUTC, "science_status": "UNVERIFIED_INPUTS",
		"sun_horizon_deg": sunH, "earth_horizon_deg": earthH, "sun_margin_deg": sm, "earth_margin_deg": em,
		"sun_visible": sm >= 0, "earth_visible": em >= 0, "simultaneous_visibility": sm >= 0 && em >= 0,
	})
}
