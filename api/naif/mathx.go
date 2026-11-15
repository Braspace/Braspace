package naif

import "math"

type vec3 = [3]float64
type mat3 = [3][3]float64

func mxv(m mat3, v vec3) vec3 {
	var o vec3
	for i := 0; i < 3; i++ {
		o[i] = float64(m[i][0]*v[0]) + float64(m[i][1]*v[1]) + float64(m[i][2]*v[2])
	}
	return o
}

func mtxv(m mat3, v vec3) vec3 {
	var o vec3
	for i := 0; i < 3; i++ {
		o[i] = float64(m[0][i]*v[0]) + float64(m[1][i]*v[1]) + float64(m[2][i]*v[2])
	}
	return o
}

func mxm(a, b mat3) mat3 {
	var o mat3
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			o[i][j] = float64(a[i][0]*b[0][j]) + float64(a[i][1]*b[1][j]) + float64(a[i][2]*b[2][j])
		}
	}
	return o
}

func transpose(m mat3) mat3 {
	var o mat3
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			o[i][j] = m[j][i]
		}
	}
	return o
}

func vsub(a, b vec3) vec3 { return vec3{a[0] - b[0], a[1] - b[1], a[2] - b[2]} }
func vadd(a, b vec3) vec3 { return vec3{a[0] + b[0], a[1] + b[1], a[2] + b[2]} }
func vdot(a, b vec3) float64 {
	return float64(a[0]*b[0]) + float64(a[1]*b[1]) + float64(a[2]*b[2])
}
func vcross(a, b vec3) vec3 {
	return vec3{float64(a[1]*b[2]) - float64(a[2]*b[1]), float64(a[2]*b[0]) - float64(a[0]*b[2]),
		float64(a[0]*b[1]) - float64(a[1]*b[0])}
}
func vscl(s float64, a vec3) vec3 { return vec3{s * a[0], s * a[1], s * a[2]} }

// vnorm is CSPICE VNORM: scaled by the largest component to avoid overflow.
func vnorm(a vec3) float64 {
	m := math.Max(math.Abs(a[0]), math.Max(math.Abs(a[1]), math.Abs(a[2])))
	if m == 0 {
		return 0
	}
	x, y, z := a[0]/m, a[1]/m, a[2]/m
	return m * math.Sqrt(float64(x*x)+float64(y*y)+float64(z*z))
}

// rotAxis is CSPICE ROTATE: the matrix that rotates coordinate axes by angle about axis 1..3.
func rotAxis(angle float64, axis int) mat3 {
	s, c := math.Sin(angle), math.Cos(angle)
	switch axis {
	case 1:
		return mat3{{1, 0, 0}, {0, c, s}, {0, -s, c}}
	case 2:
		return mat3{{c, 0, -s}, {0, 1, 0}, {s, 0, c}}
	default:
		return mat3{{c, s, 0}, {-s, c, 0}, {0, 0, 1}}
	}
}

// drotAxis is d(rotAxis)/d(angle).
func drotAxis(angle float64, axis int) mat3 {
	s, c := math.Sin(angle), math.Cos(angle)
	switch axis {
	case 1:
		return mat3{{0, 0, 0}, {0, -s, c}, {0, -c, -s}}
	case 2:
		return mat3{{-s, 0, -c}, {0, 0, 0}, {c, 0, -s}}
	default:
		return mat3{{-s, c, 0}, {-c, -s, 0}, {0, 0, 0}}
	}
}

// Reclat converts rectangular coordinates to (radius, longitude, latitude), radians.
func Reclat(v [3]float64) (r, lon, lat float64) {
	r = vnorm(v)
	if v[0] == 0 && v[1] == 0 {
		lon = 0
	} else {
		lon = math.Atan2(v[1], v[0])
	}
	lat = math.Atan2(v[2], math.Hypot(v[0], v[1]))
	if r == 0 {
		lat = 0
	}
	return
}

// M2Q is CSPICE m2q: the SPICE unit quaternion (w, x, y, z) of a rotation matrix, with w >= 0.
func M2Q(r [3][3]float64) [4]float64 {
	tr := r[0][0] + r[1][1] + r[2][2]
	best, idx := 1+tr, 0 // idx 0: w dominant; 1..3: x, y, z dominant
	for i := 0; i < 3; i++ {
		if v := 1 + 2*r[i][i] - tr; v > best {
			best, idx = v, i+1
		}
	}
	var q [4]float64
	s := math.Sqrt(best)
	q[idx] = 0.5 * s
	f := 0.5 / s
	if idx == 0 {
		q[1], q[2], q[3] = (r[2][1]-r[1][2])*f, (r[0][2]-r[2][0])*f, (r[1][0]-r[0][1])*f
	} else {
		a, b := idx%3+1, (idx+1)%3+1 // the other two axes (1-based), cyclic
		q[0] = (r[b-1][a-1] - r[a-1][b-1]) * f
		q[a] = (r[idx-1][a-1] + r[a-1][idx-1]) * f
		q[b] = (r[idx-1][b-1] + r[b-1][idx-1]) * f
	}
	if q[0] < 0 {
		for i := range q {
			q[i] = -q[i]
		}
	}
	return q
}
