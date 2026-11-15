// Command compareangles compara um arquivo de angulos calculados contra o benchmark JPL Horizons
// e imprime o residuo. Go port of science/benchmarks/horizons/compare_angles.py (same stdout and exit codes).
//
// Uso (a partir de api/):
//
//	go run ./cmd/compareangles -benchmark ../science/benchmarks/horizons/benchmark.json \
//	    -calculated calculado_angulos.json [-tolerancia-deg 0.05]
//
// O arquivo calculado deve conter uma chave "entries" (lista), e cada entrada deve ter
// site, epoch_utc, body, azimuth_deg e elevation_deg. A comparacao faz join por
// (site, epoch_utc, body) e imprime o residuo = calculado - benchmark para azimute e
// eleventao, em graus, mais um resumo estatistico.
//
// Saida: tabela linha a linha + resumo (contagem comparada, maximo absoluto, medio,
// desvio padrao para az e el). Retorna codigo de saída != 0 se algum resíduo absoluto
// exceder -tolerancia-deg ou se houver entradas calculadas sem correspondencia no benchmark.
package main

import (
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

type key struct {
	site, epoch string
	body        int64
}

type row struct {
	site, epoch, body, bodyName string
	calcAz, benchAz, resAz      float64
	calcEl, benchEl, resEl      float64
}

func loadEntries(path string) ([]any, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	data, err := pyfmt.Parse(b)
	if err != nil {
		return nil, err
	}
	switch d := data.(type) {
	case pyfmt.Obj:
		if v, ok := d.Get("entries"); ok {
			l, _ := v.([]any)
			return l, nil
		}
		if v, ok := d.Get("samples"); ok {
			l, _ := v.([]any)
			return l, nil
		}
		return []any{}, nil
	case []any:
		return d, nil
	}
	return nil, fmt.Errorf("formato de arquivo calculado nao reconhecido: %s", path)
}

func field(e any, k string) (any, error) {
	o, ok := e.(pyfmt.Obj)
	if !ok {
		return nil, fmt.Errorf("entrada nao e um objeto: %v", e)
	}
	v, ok := o.Get(k)
	if !ok {
		return nil, fmt.Errorf("KeyError: '%s'", k)
	}
	return v, nil
}

func keyOf(e any) (key, error) {
	s, err := field(e, "site")
	if err != nil {
		return key{}, err
	}
	ep, err := field(e, "epoch_utc")
	if err != nil {
		return key{}, err
	}
	bd, err := field(e, "body")
	if err != nil {
		return key{}, err
	}
	bf, err := pyfmt.Float(bd)
	if err != nil {
		return key{}, err
	}
	return key{pyfmt.Str(s), pyfmt.Str(ep), int64(bf)}, nil
}

func padRight(s string, w int) string {
	if n := utf8.RuneCountInString(s); n < w {
		return s + strings.Repeat(" ", w-n)
	}
	return s
}

func padLeft(s string, w int) string {
	if n := utf8.RuneCountInString(s); n < w {
		return strings.Repeat(" ", w-n) + s
	}
	return s
}

func stdev(vals []float64, mean float64) float64 {
	n := len(vals)
	if n < 2 {
		return 0
	}
	var s float64
	for _, v := range vals {
		d := float64(v - mean)
		s += float64(d * d)
	}
	return math.Sqrt(s / float64(n-1))
}

func compare(args []string, out io.Writer) (int, error) {
	fs := flag.NewFlagSet("compareangles", flag.ContinueOnError)
	bench := fs.String("benchmark", "", "caminho do benchmark.json")
	calc := fs.String("calculated", "", "caminho do arquivo de angulos calculados")
	tol := fs.Float64("tolerancia-deg", 0.05, "tolerancia absoluta de resíduo em graus (padrao 0.05)")
	if err := fs.Parse(args); err != nil {
		return 2, nil
	}
	if *bench == "" || *calc == "" {
		return 2, fmt.Errorf("the following arguments are required: -benchmark, -calculated")
	}
	benchEntries, err := loadEntries(*bench)
	if err != nil {
		return 1, err
	}
	calcEntries, err := loadEntries(*calc)
	if err != nil {
		return 1, err
	}
	idx := map[key]any{}
	for _, e := range benchEntries {
		k, err := keyOf(e)
		if err != nil {
			return 1, err
		}
		idx[k] = e
	}
	var compared []row
	var missing []any
	for _, c := range calcEntries {
		k, err := keyOf(c)
		if err != nil {
			return 1, err
		}
		b, ok := idx[k]
		if !ok {
			missing = append(missing, c)
			continue
		}
		num := func(e any, name string) (float64, error) {
			v, err := field(e, name)
			if err != nil {
				return 0, err
			}
			return pyfmt.Float(v)
		}
		cAz, e1 := num(c, "azimuth_deg")
		bAz, e2 := num(b, "azimuth_deg")
		cEl, e3 := num(c, "elevation_deg")
		bEl, e4 := num(b, "elevation_deg")
		for _, e := range []error{e1, e2, e3, e4} {
			if e != nil {
				return 1, e
			}
		}
		sv, _ := field(c, "site")
		ev, _ := field(c, "epoch_utc")
		bv, _ := field(c, "body")
		name := ""
		if o := c.(pyfmt.Obj); true {
			if v, ok := o.Get("body_name"); ok {
				name = pyfmt.Str(v)
			} else if v, ok := b.(pyfmt.Obj).Get("body_name"); ok {
				name = pyfmt.Str(v)
			}
		}
		compared = append(compared, row{pyfmt.Str(sv), pyfmt.Str(ev), pyfmt.Str(bv), name,
			cAz, bAz, cAz - bAz, cEl, bEl, cEl - bEl})
	}

	p := func(format string, a ...any) { fmt.Fprintf(out, format+"\n", a...) }
	p("Comparador de angulos vs benchmark JPL Horizons")
	p("  benchmark : %s", *bench)
	p("  calculado : %s", *calc)
	p("  entradas benchmark : %d", len(benchEntries))
	p("  entradas calculadas: %d", len(calcEntries))
	p("  comparadas         : %d", len(compared))
	p("  sem correspondencia: %d", len(missing))
	p("")
	if len(missing) > 0 {
		p("Entradas calculadas sem correspondencia no benchmark:")
		for _, c := range missing {
			sv, _ := field(c, "site")
			ev, _ := field(c, "epoch_utc")
			bv, _ := field(c, "body")
			az, e1 := field(c, "azimuth_deg")
			el, e2 := field(c, "elevation_deg")
			if e1 != nil || e2 != nil {
				return 1, fmt.Errorf("KeyError: azimuth_deg/elevation_deg")
			}
			azf, _ := pyfmt.Float(az)
			elf, _ := pyfmt.Float(el)
			p("  site=%s epoch=%s body=%s az=%.4f el=%.4f", pyfmt.Str(sv), pyfmt.Str(ev), pyfmt.Str(bv), azf, elf)
		}
		p("")
	}
	p("%s %s %s %s %s %s %s %s %s", padRight("site", 10), padRight("epoch_utc", 20), padRight("body", 6),
		padLeft("calc_az", 9), padLeft("bench_az", 9), padLeft("res_az", 9), padLeft("calc_el", 9), padLeft("bench_el", 9), padLeft("res_el", 9))
	for _, r := range compared {
		p("%s %s %s %9.4f %9.4f %9.4f %9.4f %9.4f %9.4f", padRight(r.site, 10), padRight(r.epoch, 20), padRight(r.body, 6),
			r.calcAz, r.benchAz, r.resAz, r.calcEl, r.benchEl, r.resEl)
	}

	falha := len(missing) > 0
	if len(compared) > 0 {
		var maxAz, maxEl, sumAz, sumEl float64
		resAz := make([]float64, len(compared))
		resEl := make([]float64, len(compared))
		for i, r := range compared {
			maxAz = math.Max(maxAz, math.Abs(r.resAz))
			maxEl = math.Max(maxEl, math.Abs(r.resEl))
			sumAz += r.resAz
			sumEl += r.resEl
			resAz[i], resEl[i] = r.resAz, r.resEl
		}
		meanAz := sumAz / float64(len(compared))
		meanEl := sumEl / float64(len(compared))
		sdAz, sdEl := stdev(resAz, meanAz), stdev(resEl, meanEl)
		p("")
		p("Resumo de resíduos (calculado - benchmark):")
		p("  azimuto : medio=%+.6f deg  max_abs=%.6f deg  dp=%.6f deg", meanAz, maxAz, sdAz)
		p("  elevacao: medio=%+.6f deg  max_abs=%.6f deg  dp=%.6f deg", meanEl, maxEl, sdEl)
		if maxAz > *tol || maxEl > *tol {
			falha = true
		}
	}
	p("")
	if falha {
		p("RESULTADO: FALHA (resíduos acima da tolerancia ou entradas sem correspondencia)")
		return 1, nil
	}
	p("RESULTADO: OK (todos os resíduos dentro da tolerancia de %.2f deg)", *tol)
	return 0, nil
}

func main() {
	code, err := compare(os.Args[1:], os.Stdout)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(code)
}
