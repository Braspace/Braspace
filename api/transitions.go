package main

import (
	"context"
	"time"
)

// next_transitions on GET /api/sites/{id}/sky: the first stored sample, after the
// requested start, whose sun_visible or earth_visible flag differs from the
// start sample. Only stored samples at the native series step are compared;
// nothing is interpolated, so the true change lies somewhere in
// (last_unchanged_utc, epoch_utc] and resolution_seconds is that bracket width.

// maxTransitionScan bounds the native-step samples evaluated for the search.
const maxTransitionScan = 2000

type transition struct {
	EpochUTC          string  `json:"epoch_utc"`
	LastUnchangedUTC  string  `json:"last_unchanged_utc"`
	Kind              string  `json:"kind"`
	HoursFromStart    float64 `json:"hours_from_start"`
	ResolutionSeconds int     `json:"resolution_seconds"`
}

type nextTransitions struct {
	SearchStartUTC    string      `json:"search_start_utc"`
	SearchEndUTC      string      `json:"search_end_utc"`
	ResolutionSeconds int         `json:"resolution_seconds"`
	Sun               *transition `json:"sun"`
	SunNullReason     *string     `json:"sun_null_reason"`
	Earth             *transition `json:"earth"`
	EarthNullReason   *string     `json:"earth_null_reason"`
}

func strp(s string) *string { return &s }

// findTransitions scans native samples [from, to) of ser. res, when it already
// holds exactly those engine results, is reused; otherwise the engine is called.
func findTransitions(ctx context.Context, ev *evaluator, ser *siteSeries, from, to int, res []engineResult) (*nextTransitions, error) {
	nt := &nextTransitions{
		SearchStartUTC:    ser.epoch(from).Format(time.RFC3339),
		SearchEndUTC:      ser.epoch(to - 1).Format(time.RFC3339),
		ResolutionSeconds: ser.StepSeconds,
	}
	if to-from > maxTransitionScan {
		r := "WINDOW_TOO_LONG_FOR_SCAN: the window has more than 2000 native samples; shorten hours"
		nt.SunNullReason, nt.EarthNullReason = strp(r), strp(r)
		return nt, nil
	}
	if len(res) != to-from {
		var err error
		if res, err = ev.evaluate(ctx, ser, from, to); err != nil {
			return nil, err
		}
	}
	pick := func(flag func(engineResult) bool, up, down string) (*transition, *string) {
		first := flag(res[0])
		for k := 1; k < len(res); k++ {
			if flag(res[k]) != first {
				kind := down
				if !first {
					kind = up
				}
				return &transition{
					EpochUTC:          ser.epoch(from + k).Format(time.RFC3339),
					LastUnchangedUTC:  ser.epoch(from + k - 1).Format(time.RFC3339),
					Kind:              kind,
					HoursFromStart:    round6(float64(k) * float64(ser.StepSeconds) / 3600),
					ResolutionSeconds: ser.StepSeconds,
				}, nil
			}
		}
		state := "not visible"
		if first {
			state = "visible"
		}
		return nil, strp("NO_CHANGE_IN_WINDOW: " + state + " at every stored sample from search_start_utc to search_end_utc")
	}
	nt.Sun, nt.SunNullReason = pick(func(r engineResult) bool { return r.SunVisible }, "sunrise", "sunset")
	nt.Earth, nt.EarthNullReason = pick(func(r engineResult) bool { return r.EarthVisible }, "earth_rise", "earth_set")
	return nt, nil
}
