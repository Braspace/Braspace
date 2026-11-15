package naif

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

const (
	frameJ2000 = 1
	frameICRF  = 17
	spd        = 86400.0
	julCentury = 36525.0
)

var rpd = math.Pi / 180.0

// iauFrames are the built-in IAU body-fixed frame names and codes (CSPICE FRAMEX table subset).
var iauFrames = map[string][2]int{ // name -> frame id, body id
	"IAU_SUN": {10010, 10}, "IAU_MERCURY": {10011, 199}, "IAU_VENUS": {10012, 299},
	"IAU_EARTH": {10013, 399}, "IAU_MARS": {10014, 499}, "IAU_JUPITER": {10015, 599},
	"IAU_SATURN": {10016, 699}, "IAU_URANUS": {10017, 799}, "IAU_NEPTUNE": {10018, 899},
	"IAU_PLUTO": {10019, 999}, "IAU_MOON": {10020, 301},
}

var reFrameIDKey = regexp.MustCompile(`^-?\d+_`)

// Namfrm returns the frame ID for a frame name (0 when unknown), like CSPICE namfrm.
func (k *Kernels) Namfrm(name string) int {
	n := strings.ToUpper(strings.TrimSpace(name))
	switch n {
	case "J2000":
		return frameJ2000
	case "ICRF":
		return frameICRF
	}
	if f, ok := iauFrames[n]; ok {
		return f[0]
	}
	if v, ok := k.pool.Numbers("FRAME_" + n); ok && len(v) == 1 {
		return int(v[0])
	}
	return 0
}

func (k *Kernels) frameName(id int) string {
	switch id {
	case frameJ2000:
		return "J2000"
	case frameICRF:
		return "ICRF"
	}
	for n, f := range iauFrames {
		if f[0] == id {
			return n
		}
	}
	if s, ok := k.pool.String("FRAME_" + strconv.Itoa(id) + "_NAME"); ok {
		return s
	}
	return strconv.Itoa(id)
}

// rotation is a J2000 -> frame rotation and its time derivative (per second).
type rotation struct{ r, dr mat3 }

func eulerRot(w, delta, phi, dw, ddelta, dphi float64) rotation {
	a, b, c := rotAxis(w, 3), rotAxis(delta, 1), rotAxis(phi, 3)
	da, db, dc := drotAxis(w, 3), drotAxis(delta, 1), drotAxis(phi, 3)
	bc := mxm(b, c)
	r := mxm(a, bc)
	var d mat3
	t1 := mxm(da, bc)
	t2 := mxm(a, mxm(db, c))
	t3 := mxm(a, mxm(b, dc))
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			d[i][j] = float64(dw*t1[i][j]) + float64(ddelta*t2[i][j]) + float64(dphi*t3[i][j])
		}
	}
	return rotation{r, d}
}

// rotFromJ2000 returns the J2000 -> frame rotation at et.
func (k *Kernels) rotFromJ2000(id int, et float64, depth int) (rotation, error) {
	if depth > 16 {
		return rotation{}, fmt.Errorf("frame chain too deep at frame %d", id)
	}
	ident := mat3{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}
	if id == frameJ2000 || id == frameICRF {
		return rotation{r: ident}, nil
	}
	class, classID := 0, 0
	for _, f := range iauFrames {
		if f[0] == id {
			class, classID = 2, f[1]
		}
	}
	if class == 0 {
		c, ok := k.pool.Numbers("FRAME_" + strconv.Itoa(id) + "_CLASS")
		ci, ok2 := k.pool.Numbers("FRAME_" + strconv.Itoa(id) + "_CLASS_ID")
		if !ok || !ok2 || len(c) != 1 || len(ci) != 1 {
			return rotation{}, fmt.Errorf("frame %d is not defined by the loaded kernels", id)
		}
		class, classID = int(c[0]), int(ci[0])
	}
	switch class {
	case 2:
		if seg := k.findPCK(classID, et); seg != nil {
			val, rate, err := seg.type2(et, 3)
			if err != nil {
				return rotation{}, err
			}
			return eulerRot(math.Mod(val[2], 2*math.Pi), val[1], val[0], rate[2], rate[1], rate[0]), nil
		}
		return k.textPCK(classID, et)
	case 4:
		return k.tkFrame(id, et, depth)
	}
	return rotation{}, fmt.Errorf("frame %d: unsupported frame class %d", id, class)
}

func (k *Kernels) findPCK(id int, et float64) *segment {
	for i := len(k.pck) - 1; i >= 0; i-- {
		s := k.pck[i]
		if int(s.ic[0]) == id && et >= s.start && et <= s.end {
			if s.ic[2] != 2 || s.ic[1] != frameJ2000 {
				continue
			}
			return s
		}
	}
	return nil
}

// textPCK is CSPICE TISBOD for body constants from a text PCK (no nutation/precession terms).
func (k *Kernels) textPCK(body int, et float64) (rotation, error) {
	p := "BODY" + strconv.Itoa(body) + "_"
	for _, n := range []string{"NUT_PREC_RA", "NUT_PREC_DEC", "NUT_PREC_PM"} {
		if _, ok := k.pool.Values(p + n); ok {
			return rotation{}, fmt.Errorf("body %d: nutation/precession terms are not supported", body)
		}
	}
	get := func(n string) ([]float64, error) {
		v, ok := k.pool.Numbers(p + n)
		if !ok || len(v) < 2 || len(v) > 3 {
			return nil, fmt.Errorf("text PCK constants %s%s not loaded", p, n)
		}
		for len(v) < 3 {
			v = append(v, 0)
		}
		return v, nil
	}
	ra, err := get("POLE_RA")
	if err != nil {
		return rotation{}, err
	}
	dec, err := get("POLE_DEC")
	if err != nil {
		return rotation{}, err
	}
	pm, err := get("PM")
	if err != nil {
		return rotation{}, err
	}
	d := et / spd
	t := d / julCentury
	ra0 := (ra[0] + float64(ra[1]*t) + float64(ra[2]*t*t)) * rpd
	dec0 := (dec[0] + float64(dec[1]*t) + float64(dec[2]*t*t)) * rpd
	// |w| is ~6e4 rad before the reduction, so one rounding is ~1e-12 rad. The CSPICE arm64 build
	// fuses the polynomial into FMAs; matching that keeps pxform within ~2e-13 of it (x86 builds
	// round differently, by the same amount). Nothing in the pipeline depends on this digit.
	w := math.Mod(math.FMA(math.FMA(pm[2], d, pm[1]), d, pm[0])*rpd, 2*math.Pi)
	dra := (ra[1] + float64(2*ra[2]*t)) * rpd / (spd * julCentury)
	ddec := (dec[1] + float64(2*dec[2]*t)) * rpd / (spd * julCentury)
	dw := (pm[1] + float64(2*pm[2]*d)) * rpd / spd
	return eulerRot(w, math.Pi/2-dec0, ra0+math.Pi/2, dw, -ddec, dra), nil
}

func (k *Kernels) tkFrame(id int, et float64, depth int) (rotation, error) {
	p := "TKFRAME_" + strconv.Itoa(id) + "_"
	spec, ok := k.pool.String(p + "SPEC")
	if !ok {
		return rotation{}, fmt.Errorf("frame %d: missing %sSPEC", id, p)
	}
	relName, ok := k.pool.String(p + "RELATIVE")
	if !ok {
		return rotation{}, fmt.Errorf("frame %d: missing %sRELATIVE", id, p)
	}
	rel := k.Namfrm(relName)
	if rel == 0 {
		return rotation{}, fmt.Errorf("frame %d: unknown relative frame %q", id, relName)
	}
	var tk mat3 // rotation from the relative frame to this frame
	switch strings.ToUpper(spec) {
	case "ANGLES":
		ang, ok := k.pool.Numbers(p + "ANGLES")
		axv, ok2 := k.pool.Numbers(p + "AXES")
		if !ok || !ok2 || len(ang) != 3 || len(axv) != 3 {
			return rotation{}, fmt.Errorf("frame %d: bad TKFRAME angles/axes", id)
		}
		units := "RADIANS"
		if u, ok := k.pool.String(p + "UNITS"); ok {
			units = strings.ToUpper(u)
		}
		conv := map[string]float64{"RADIANS": 1, "DEGREES": rpd, "ARCSECONDS": rpd / 3600, "ARCMINUTES": rpd / 60}[units]
		if conv == 0 {
			return rotation{}, fmt.Errorf("frame %d: unsupported TKFRAME units %q", id, units)
		}
		// CSPICE TKFRAM: [a3]ax3 [a2]ax2 [a1]ax1 (EUL2M)
		m := mxm(rotAxis(ang[0]*conv, int(axv[0])), mxm(rotAxis(ang[1]*conv, int(axv[1])), rotAxis(ang[2]*conv, int(axv[2]))))
		tk = transpose(m) // EUL2M gives relative->frame as a frame rotation; TKFRAM stores the transpose
	case "MATRIX":
		v, ok := k.pool.Numbers(p + "MATRIX")
		if !ok || len(v) != 9 || v[0] != 1 || v[1] != 0 || v[2] != 0 || v[3] != 0 || v[4] != 1 ||
			v[5] != 0 || v[6] != 0 || v[7] != 0 || v[8] != 1 {
			return rotation{}, fmt.Errorf("frame %d: only an identity TKFRAME matrix is supported", id)
		}
		tk = mat3{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}
	default:
		return rotation{}, fmt.Errorf("frame %d: unsupported TKFRAME spec %q", id, spec)
	}
	r, err := k.rotFromJ2000(rel, et, depth+1)
	if err != nil {
		return rotation{}, err
	}
	return rotation{mxm(tk, r.r), mxm(tk, r.dr)}, nil
}

// Pxform is the rotation taking vectors from frame "from" to frame "to" at et (CSPICE pxform).
func (k *Kernels) Pxform(from, to string, et float64) ([3][3]float64, error) {
	f, t := k.Namfrm(from), k.Namfrm(to)
	if f == 0 {
		return mat3{}, fmt.Errorf("pxform: unknown frame %q", from)
	}
	if t == 0 {
		return mat3{}, fmt.Errorf("pxform: unknown frame %q", to)
	}
	rf, err := k.rotFromJ2000(f, et, 0)
	if err != nil {
		return mat3{}, err
	}
	rt, err := k.rotFromJ2000(t, et, 0)
	if err != nil {
		return mat3{}, err
	}
	return mxm(rt.r, transpose(rf.r)), nil
}

// frameCenter is the body at the centre of a non-inertial frame.
func (k *Kernels) frameCenter(id int) (int, bool) {
	for _, f := range iauFrames {
		if f[0] == id {
			return f[1], true
		}
	}
	if c, ok := k.pool.Numbers("FRAME_" + strconv.Itoa(id) + "_CENTER"); ok && len(c) == 1 {
		return int(c[0]), true
	}
	return 0, false
}
