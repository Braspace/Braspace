package naif

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"testing"
)

// TestDifferential compares >= 2000 random epochs against a spiceypy reference written by
// testdata/gen/gen_fixtures.py --diff N. Set NAIF_DIFF_REF to that (uncommitted) JSON file
// and NAIF_KERNEL_DIR to the kernels. Prints the maximum |diff| per output and fails when a
// bound is exceeded: 1e-6 deg for angles, 1e-9 relative for km, 1e-9 for quaternion/matrix.
func TestDifferential(t *testing.T) {
	ref := os.Getenv("NAIF_DIFF_REF")
	if ref == "" {
		t.Skip("NAIF_DIFF_REF not set: no differential reference; skipping")
	}
	f := loadFixture(t)
	k := kernelsOrSkip(t, f)
	b, err := os.ReadFile(ref)
	if err != nil {
		t.Fatal(err)
	}
	var d struct {
		Epochs []struct {
			ET   float64               `json:"et"`
			Geo  map[string][4]float64 `json:"geo"`
			Site map[string][6]float64 `json:"site"`
			Q    [4]float64            `json:"q"`
			M    [3][3]float64         `json:"m"`
		} `json:"epochs"`
		Sites []struct {
			ID  string  `json:"id"`
			Lat float64 `json:"lat"`
			Lon float64 `json:"lon"`
		} `json:"sites"`
	}
	if err := json.Unmarshal(b, &d); err != nil {
		t.Fatal(err)
	}
	if len(d.Epochs) < 2000 {
		t.Fatalf("need at least 2000 epochs, have %d", len(d.Epochs))
	}
	const frame = "MOON_ME_DE440_ME421"
	worst := map[string]float64{}
	note := func(key string, v float64) {
		if v > worst[key] || math.IsNaN(v) {
			worst[key] = v
		}
	}
	for _, e := range d.Epochs {
		for key, want := range e.Geo {
			var tgt, ab string
			fmt.Sscanf(replaceBar(key), "%s %s", &tgt, &ab)
			p, lt, err := k.Spkpos(tgt, e.ET, frame, ab, "MOON")
			if err != nil {
				t.Fatal(err)
			}
			note("spkpos "+ab+" position (relative)", relErr(p, [3]float64{want[0], want[1], want[2]}))
			note("spkpos "+ab+" position (absolute, km)", vnorm(vsub(p, [3]float64{want[0], want[1], want[2]})))
			note("spkpos "+ab+" light time (s)", math.Abs(lt-want[3]))
		}
		for key, want := range e.Site {
			var id, tgt, ab string
			fmt.Sscanf(replaceBar(key), "%s %s %s", &id, &tgt, &ab)
			var lat, lon, elevR float64
			for _, s := range d.Sites {
				if s.ID == id {
					lat, lon = s.Lat, s.Lon
				}
			}
			up, north, east := siteBasis(lat, lon)
			elevR = (1737.4*1000 + siteElev(id) + 2.0) / 1000
			obs := vscl(elevR, up)
			rel, lt, err := k.Spkcpo(tgt, e.ET, frame, "OBSERVER", ab, obs, "MOON", frame)
			if err != nil {
				t.Fatal(err)
			}
			note("spkcpo "+ab+" position (relative)", relErr(rel, [3]float64{want[0], want[1], want[2]}))
			note("spkcpo "+ab+" position (absolute, km)", vnorm(vsub(rel, [3]float64{want[0], want[1], want[2]})))
			note("spkcpo "+ab+" light time (s)", math.Abs(lt-want[3]))
			body := vadd(rel, obs)
			diff := vsub(body, vscl(elevR, up))
			u, n, ee := vdot(diff, up), vdot(diff, north), vdot(diff, east)
			az := math.Mod(math.Atan2(ee, n)*180/math.Pi+360, 360)
			el := math.Atan2(u, math.Hypot(n, ee)) * 180 / math.Pi
			da := math.Abs(az - want[4])
			if da > 180 {
				da = 360 - da
			}
			note("look azimuth "+ab+" (deg)", da)
			note("look elevation "+ab+" (deg)", math.Abs(el-want[5]))
		}
		m, err := k.Pxform("IAU_EARTH", frame, e.ET)
		if err != nil {
			t.Fatal(err)
		}
		q := M2Q(m)
		for i := 0; i < 4; i++ {
			note("quaternion IAU_EARTH->ME component", math.Abs(q[i]-e.Q[i]))
		}
		for i := 0; i < 3; i++ {
			for j := 0; j < 3; j++ {
				note("pxform IAU_EARTH->ME element", math.Abs(m[i][j]-e.M[i][j]))
			}
		}
	}
	keys := make([]string, 0, len(worst))
	for key := range worst {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	t.Logf("differential report: %d epochs, %d sites (spiceypy 8.4.0 reference)", len(d.Epochs), len(d.Sites))
	for _, key := range keys {
		t.Logf("  max |diff|  %-46s %.3e", key, worst[key])
	}
	for _, key := range keys {
		limit := 1e-9 // relative km, seconds, quaternion/matrix components
		switch {
		case contains(key, "(deg)"):
			limit = 1e-6
		case contains(key, "(absolute, km)"):
			limit = 1e-3 // 1e-9 of 1.5e8 km is 0.15 km; the relative bound is the contract
		case contains(key, "light time"):
			limit = 1e-9
		}
		if !(worst[key] <= limit) {
			t.Errorf("%s: %.3e exceeds %.0e", key, worst[key], limit)
		}
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func replaceBar(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c == '|' {
			b[i] = ' '
		}
	}
	return string(b)
}

// siteElev mirrors the site elevations written by gen_fixtures.py.
func siteElev(id string) float64 {
	return map[string]float64{"mons-mouton-im2": 5312.259, "malapert-massif": 5000, "nobile-rim-1": 1500,
		"connecting-ridge": 1900, "peak-near-shackleton": 3400}[id]
}

// siteBasis is science/lola_horizon.site_basis (up, north, east).
func siteBasis(lat, lon float64) (up, north, east vec3) {
	la, lo := lat*math.Pi/180, lon*math.Pi/180
	up = vec3{math.Cos(la) * math.Cos(lo), math.Cos(la) * math.Sin(lo), math.Sin(la)}
	north = vec3{-math.Sin(la) * math.Cos(lo), -math.Sin(la) * math.Sin(lo), math.Cos(la)}
	east = vec3{-math.Sin(lo), math.Cos(lo), 0}
	return
}
