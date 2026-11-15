// Package navigation computes, for a lunar site, when a receiver could get a fix from an
// Earth GNSS-like constellation. EDUCATIONAL and SYNTHETIC: the constellation is generic (not an
// almanac), the Earth position uses an approximate libration (a premise), and sidelobe tracking is
// not modelled. The geometry mirrors web/onboard/nav.js; both must give the same answer for the
// same input (see the parity test).
package navigation

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"mime"
	"net/http"
	"sort"
	"strings"
	"time"
)

const (
	MaxRequestBytes = 16 << 10
	MaxSamples      = 480
	Version         = "navigation.synthetic.v1"
)

// Premises are the team's choices. They are returned with every response.
type Premises struct {
	MoonRadiusKm       float64 `json:"moon_radius_km"`
	EarthRadiusKm      float64 `json:"earth_radius_km"`
	EarthMoonKm        float64 `json:"earth_moon_km"`
	GNSSRadiusKm       float64 `json:"gnss_radius_km"`
	GNSSInclinationDeg float64 `json:"gnss_inclination_deg"`
	GNSSPeriodH        float64 `json:"gnss_period_h"`
	Planes             int     `json:"planes"`
	PerPlane           int     `json:"per_plane"`
	LibrationLatDeg    float64 `json:"libration_lat_deg"`
	LibrationLonDeg    float64 `json:"libration_lon_deg"`
	LibrationPeriodH   float64 `json:"libration_period_h"`
	ElevationMaskDeg   float64 `json:"elevation_mask_deg"`
	GDOPLimit          float64 `json:"gdop_limit"`
	MinSatellites      int     `json:"min_satellites"`
}

func DefaultPremises() Premises {
	return Premises{
		MoonRadiusKm: 1737.4, EarthRadiusKm: 6371, EarthMoonKm: 384400,
		GNSSRadiusKm: 26560, GNSSInclinationDeg: 55, GNSSPeriodH: 11.967,
		Planes: 6, PerPlane: 4,
		LibrationLatDeg: 6.7, LibrationLonDeg: 7.9, LibrationPeriodH: 27.32 * 24,
		ElevationMaskDeg: 5, GDOPLimit: 50, MinSatellites: 4,
	}
}

// Request uses pointers for optional fields so that omitted values take the premise default.
type Request struct {
	Lat              *float64 `json:"lat"`
	Lon              *float64 `json:"lon"`
	StartUTC         string   `json:"start_utc"`
	DurationHours    *float64 `json:"duration_hours"`
	StepMinutes      *float64 `json:"step_minutes"`
	GDOPLimit        *float64 `json:"gdop_limit,omitempty"`
	MinSatellites    *int     `json:"min_satellites,omitempty"`
	ElevationMaskDeg *float64 `json:"elevation_mask_deg,omitempty"`
}

type Sample struct {
	EpochUTC   string   `json:"epoch_utc"`
	Satellites int      `json:"satellites"`
	GDOP       *float64 `json:"gdop"`
	Available  bool     `json:"available"`
}

type Outage struct {
	FromUTC string  `json:"from_utc"`
	ToUTC   string  `json:"to_utc"`
	Hours   float64 `json:"hours"`
}

type Summary struct {
	Availability   float64  `json:"availability"`
	AvailableH     float64  `json:"available_h"`
	TotalH         float64  `json:"total_h"`
	MinSatellites  int      `json:"min_satellites_seen"`
	MedianGDOP     *float64 `json:"median_gdop"`
	LongestOutageH float64  `json:"longest_outage_h"`
	OutageCount    int      `json:"outage_count"`
}

type Response struct {
	Version       string   `json:"version"`
	ModelStatus   string   `json:"model_status"`
	Premises      Premises `json:"premises"`
	GDOPLimit     float64  `json:"gdop_limit"`
	MinSatellites int      `json:"min_satellites"`
	Summary       Summary  `json:"summary"`
	Outages       []Outage `json:"outages"`
	Samples       []Sample `json:"samples"`
}

type vec [3]float64

// Validate checks the request and fills defaults. Errors are plain, for the API response.
func (r Request) resolve() (Premises, float64, float64, float64, time.Time, int, error) {
	P := DefaultPremises()
	if r.Lat == nil || r.Lon == nil {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("lat and lon are required")
	}
	lat, lon := *r.Lat, *r.Lon
	if !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180) {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("lat must be in [-90, 90] and lon in [-180, 180]")
	}
	start, err := time.Parse(time.RFC3339, r.StartUTC)
	if err != nil {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("start_utc must be RFC 3339")
	}
	if r.DurationHours == nil || !(*r.DurationHours >= 1 && *r.DurationHours <= 720) {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("duration_hours must be in [1, 720]")
	}
	if r.StepMinutes == nil || !(*r.StepMinutes >= 1 && *r.StepMinutes <= 360) {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("step_minutes must be in [1, 360]")
	}
	count := int(math.Floor(*r.DurationHours * 60 / *r.StepMinutes))
	if count < 1 {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("step_minutes must fit at least one sample in duration_hours")
	}
	if count > MaxSamples {
		return P, 0, 0, 0, time.Time{}, 0, errors.New("too many samples: raise step_minutes or lower duration_hours")
	}
	if r.GDOPLimit != nil {
		if !(*r.GDOPLimit > 0 && *r.GDOPLimit <= 1e6) {
			return P, 0, 0, 0, time.Time{}, 0, errors.New("gdop_limit must be in (0, 1e6]")
		}
		P.GDOPLimit = *r.GDOPLimit
	}
	if r.MinSatellites != nil {
		if *r.MinSatellites < 1 || *r.MinSatellites > 24 {
			return P, 0, 0, 0, time.Time{}, 0, errors.New("min_satellites must be in [1, 24]")
		}
		P.MinSatellites = *r.MinSatellites
	}
	if r.ElevationMaskDeg != nil {
		if !(*r.ElevationMaskDeg >= 0 && *r.ElevationMaskDeg <= 60) {
			return P, 0, 0, 0, time.Time{}, 0, errors.New("elevation_mask_deg must be in [0, 60]")
		}
		P.ElevationMaskDeg = *r.ElevationMaskDeg
	}
	return P, lat, lon, *r.StepMinutes, start, count, nil
}

const d2r = math.Pi / 180

func unitFromLatLon(latDeg, lonDeg float64) vec {
	la, lo := latDeg*d2r, lonDeg*d2r
	return vec{math.Cos(la) * math.Cos(lo), math.Cos(la) * math.Sin(lo), math.Sin(la)}
}

func earthCentre(tH float64, P Premises) vec {
	w := 2 * math.Pi * tH / P.LibrationPeriodH
	u := unitFromLatLon(P.LibrationLatDeg*math.Sin(w), P.LibrationLonDeg*math.Sin(w+1))
	return vec{P.EarthMoonKm * u[0], P.EarthMoonKm * u[1], P.EarthMoonKm * u[2]}
}

func satellitesAt(tH float64, P Premises) []vec {
	inc := P.GNSSInclinationDeg * d2r
	ci, si := math.Cos(inc), math.Sin(inc)
	E := earthCentre(tH, P)
	sats := make([]vec, 0, P.Planes*P.PerPlane)
	for pl := 0; pl < P.Planes; pl++ {
		raan := 2 * math.Pi * float64(pl) / float64(P.Planes)
		cr, sr := math.Cos(raan), math.Sin(raan)
		for k := 0; k < P.PerPlane; k++ {
			phase := 2*math.Pi*float64(k)/float64(P.PerPlane) + 2*math.Pi*float64(pl)/float64(P.Planes*P.PerPlane)
			th := phase + 2*math.Pi*tH/P.GNSSPeriodH
			cth, sth := math.Cos(th), math.Sin(th)
			x := P.GNSSRadiusKm * (cr*cth - sr*ci*sth)
			y := P.GNSSRadiusKm * (sr*cth + cr*ci*sth)
			z := P.GNSSRadiusKm * (si * sth)
			sats = append(sats, vec{E[0] + x, E[1] + y, E[2] + z})
		}
	}
	return sats
}

func segmentDistance(a, b, c vec) float64 {
	var d, w vec
	for i := 0; i < 3; i++ {
		d[i] = b[i] - a[i]
		w[i] = c[i] - a[i]
	}
	dd := d[0]*d[0] + d[1]*d[1] + d[2]*d[2]
	t := 0.0
	if dd > 0 {
		t = (w[0]*d[0] + w[1]*d[1] + w[2]*d[2]) / dd
	}
	t = math.Max(0, math.Min(1, t))
	var q vec
	for i := 0; i < 3; i++ {
		q[i] = a[i] + t*d[i] - c[i]
	}
	return math.Sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2])
}

// usable returns the unit line-of-sight vector, or ok=false when the satellite is masked or occulted.
func usable(sat, site, earthC vec, P Premises) (vec, bool) {
	var v vec
	for i := 0; i < 3; i++ {
		v[i] = sat[i] - site[i]
	}
	r := math.Sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
	n := math.Sqrt(site[0]*site[0] + site[1]*site[1] + site[2]*site[2])
	sinEl := (v[0]*site[0] + v[1]*site[1] + v[2]*site[2]) / (r * n)
	if math.Asin(sinEl)/d2r < P.ElevationMaskDeg {
		return vec{}, false
	}
	if segmentDistance(site, sat, vec{0, 0, 0}) < P.MoonRadiusKm-1e-6 {
		return vec{}, false
	}
	if segmentDistance(site, sat, earthC) < P.EarthRadiusKm {
		return vec{}, false
	}
	return vec{v[0] / r, v[1] / r, v[2] / r}, true
}

// gdop returns the geometric dilution of precision, or ok=false when there is no solution.
func gdop(units []vec) (float64, bool) {
	if len(units) < 4 {
		return 0, false
	}
	var A [4][4]float64
	for _, u := range units {
		row := [4]float64{u[0], u[1], u[2], 1}
		for i := 0; i < 4; i++ {
			for j := 0; j < 4; j++ {
				A[i][j] += row[i] * row[j]
			}
		}
	}
	inv, ok := invert4(A)
	if !ok {
		return 0, false
	}
	tr := inv[0][0] + inv[1][1] + inv[2][2] + inv[3][3]
	if !(tr > 0) {
		return 0, false
	}
	return math.Sqrt(tr), true
}

// invert4 is a Gauss-Jordan inverse with partial pivoting; ok=false when singular.
func invert4(M [4][4]float64) ([4][4]float64, bool) {
	var a [4][8]float64
	for i := 0; i < 4; i++ {
		for j := 0; j < 4; j++ {
			a[i][j] = M[i][j]
		}
		a[i][4+i] = 1
	}
	for c := 0; c < 4; c++ {
		piv := c
		for r := c + 1; r < 4; r++ {
			if math.Abs(a[r][c]) > math.Abs(a[piv][c]) {
				piv = r
			}
		}
		if math.Abs(a[piv][c]) < 1e-12 {
			return [4][4]float64{}, false
		}
		a[c], a[piv] = a[piv], a[c]
		d := a[c][c]
		for j := 0; j < 8; j++ {
			a[c][j] /= d
		}
		for r := 0; r < 4; r++ {
			if r == c {
				continue
			}
			f := a[r][c]
			for j := 0; j < 8; j++ {
				a[r][j] -= f * a[c][j]
			}
		}
	}
	var out [4][4]float64
	for i := 0; i < 4; i++ {
		for j := 0; j < 4; j++ {
			out[i][j] = a[i][4+j]
		}
	}
	return out, true
}

// Compute runs the geometry over the window and builds the response.
func Compute(req Request) (Response, error) {
	P, lat, lon, stepMin, start, count, err := req.resolve()
	if err != nil {
		return Response{}, err
	}
	site := unitFromLatLon(lat, lon)
	for i := range site {
		site[i] *= P.MoonRadiusKm
	}
	t0H := float64(start.UnixMilli()) / 3600e3
	samples := make([]Sample, 0, count)
	for i := 0; i < count; i++ {
		tH := t0H + float64(i)*stepMin/60
		earthC := earthCentre(tH, P)
		units := make([]vec, 0, 24)
		for _, s := range satellitesAt(tH, P) {
			if u, ok := usable(s, site, earthC, P); ok {
				units = append(units, u)
			}
		}
		g, ok := gdop(units)
		avail := len(units) >= P.MinSatellites && ok && g <= P.GDOPLimit
		sm := Sample{
			// Convert the complete minute offset to nanoseconds before rounding.
			// Truncating the minute count first would report different epochs
			// from the geometry whenever step_minutes is fractional.
			EpochUTC:   start.Add(time.Duration(math.Round(float64(i) * stepMin * float64(time.Minute)))).UTC().Format(time.RFC3339Nano),
			Satellites: len(units),
			Available:  avail,
		}
		if ok {
			gv := g
			sm.GDOP = &gv
		}
		samples = append(samples, sm)
	}
	return summarise(P, samples, stepMin), nil
}

func summarise(P Premises, samples []Sample, stepMin float64) Response {
	n := len(samples)
	avail := 0
	minSats := math.MaxInt
	var finite []float64
	for _, s := range samples {
		if s.Available {
			avail++
		}
		if s.Satellites < minSats {
			minSats = s.Satellites
		}
		if s.GDOP != nil {
			finite = append(finite, *s.GDOP)
		}
	}
	if n == 0 {
		minSats = 0
	}
	outages := []Outage{}
	run := -1
	flush := func(end int) {
		if run < 0 {
			return
		}
		hours := float64(end-run+1) * stepMin / 60
		outages = append(outages, Outage{
			FromUTC: samples[run].EpochUTC, ToUTC: samples[end].EpochUTC, Hours: hours,
		})
		run = -1
	}
	for i, s := range samples {
		if !s.Available && run < 0 {
			run = i
		}
		if s.Available {
			flush(i - 1)
		}
	}
	flush(n - 1)
	longest := 0.0
	for _, o := range outages {
		longest = math.Max(longest, o.Hours)
	}
	sum := Summary{
		TotalH:         float64(n) * stepMin / 60,
		AvailableH:     float64(avail) * stepMin / 60,
		MinSatellites:  minSats,
		LongestOutageH: longest,
		OutageCount:    len(outages),
	}
	if n > 0 {
		sum.Availability = float64(avail) / float64(n)
	}
	if len(finite) > 0 {
		sort.Float64s(finite)
		m := finite[len(finite)/2]
		sum.MedianGDOP = &m
	}
	return Response{
		Version: Version, ModelStatus: "SYNTHETIC", Premises: P,
		GDOPLimit: P.GDOPLimit, MinSatellites: P.MinSatellites,
		Summary: sum, Outages: outages, Samples: samples,
	}
}

// decodeRequest rejects repeated/case-aliased fields and trailing documents;
// encoding/json's struct decoder normally accepts both aliases and duplicates.
func decodeRequest(raw []byte) (Request, error) {
	var req Request
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	first, err := dec.Token()
	if err != nil || first != json.Delim('{') {
		return req, errors.New("expected JSON object")
	}
	fields := map[string]any{
		"lat": &req.Lat, "lon": &req.Lon, "start_utc": &req.StartUTC,
		"duration_hours": &req.DurationHours, "step_minutes": &req.StepMinutes,
		"gdop_limit": &req.GDOPLimit, "min_satellites": &req.MinSatellites,
		"elevation_mask_deg": &req.ElevationMaskDeg,
	}
	for dec.More() {
		token, err := dec.Token()
		key, ok := token.(string)
		if err != nil || !ok {
			return req, errors.New("invalid JSON field")
		}
		target, ok := fields[key]
		if !ok {
			return req, errors.New("unknown or repeated JSON field")
		}
		delete(fields, key)
		if err := dec.Decode(target); err != nil {
			return req, err
		}
	}
	last, err := dec.Token()
	if err != nil || last != json.Delim('}') {
		return req, errors.New("invalid JSON object")
	}
	if dec.Decode(new(any)) != io.EOF {
		return req, errors.New("trailing JSON payload")
	}
	return req, nil
}

// Handler serves POST /api/onboard/navigation.
func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			w.WriteHeader(http.StatusUnsupportedMediaType)
			_ = json.NewEncoder(w).Encode(map[string]string{"code": "CONTENT_TYPE_REQUIRED", "error": "application/json required"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
		if err != nil || len(raw) > MaxRequestBytes {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			_ = json.NewEncoder(w).Encode(map[string]string{"code": "REQUEST_TOO_LARGE", "error": "maximum request size exceeded"})
			return
		}
		req, err := decodeRequest(raw)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"code": "INVALID_JSON", "error": "invalid JSON contract"})
			return
		}
		resp, err := Compute(req)
		if err != nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]string{"code": "INVALID_INPUT", "error": err.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(resp)
	})
}
