// Command downloadbenchmark refaz o download do benchmark independente de angulos Sol/Terra do JPL Horizons.
// Go port of science/benchmarks/horizons/download_benchmark.py (same request parameters, same files written).
//
// Consulta https://ssd.jpl.nasa.gov/api/horizons.api (sem chave) para os alvos
// Sol (10) e Terra (399), observador na superficie da Lua por coordenada
// (CENTER='coord@301' com SITE_COORD='longitude,latitude,altitude'), quantidade
// de azimute e elevacao aparentes (QUANTITIES=4). Respeita no maximo 1
// requisicao por segundo.
//
// Salva (relativo a -root, por padrao a raiz do repositorio vista de api/):
//
//	science/benchmarks/horizons/raw/<site>/<epoch>/<body>.json  resposta bruta (JSON HTTP completo)
//	science/benchmarks/horizons/benchmark.json                  normalizado
//
// Uso (a partir de api/): go run ./cmd/downloadbenchmark
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

const (
	baseURL                  = "https://ssd.jpl.nasa.gov/api/horizons.api"
	fallbackHorizonsVersion  = "1.2"
	fallbackEphemerisSource  = "DE441"
	fallbackFrame            = "MEAN_ME"
	reqTimeout               = 60 * time.Second
	defaultMinIntervalSecond = 1.1
	provenanceText           = "NASA Lunar Surface Data Book ACD-50044 Rev. A, Appendix A2 (feature center); planetocentric lat, east-positive lon; ~5-10 m feature-center accuracy."
)

type site struct {
	ID, Name        string
	Lat, Lon, AltKm float64
}

var sites = []site{
	{"lm1", "Shackleton Rim B", -89.5244, 56.30993, 0.0},
	{"haworth", "Haworth", -86.7639, -22.77700, 0.0},
	{"shoemaker", "Shoemaker", -87.1835, 62.83502, 0.0},
}

var epochs = []string{
	"2026-12-01T12:00:00Z", "2026-12-09T12:00:00Z", "2026-12-17T12:00:00Z", "2026-12-25T12:00:00Z",
	"2027-01-02T12:00:00Z", "2027-01-10T12:00:00Z", "2027-01-18T12:00:00Z", "2027-01-26T12:00:00Z",
}

type body struct {
	ID   int
	Name string
}

var bodies = []body{{10, "Sun"}, {399, "Earth"}}

var (
	soeRe    = regexp.MustCompile(`(?s)\$\$SOE\n(.*?)\n\$\$EOE`)
	sourceRe = regexp.MustCompile(`\{source:\s*([A-Za-z0-9]+)\}`)
)

func splitLines(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		switch r {
		case '\n', '\r', '\v', '\f', 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029:
			return true
		}
		return false
	})
}

// parseAzEl extracts azimuth/elevation from the $$SOE ... $$EOE block of the result text.
func parseAzEl(text string) (float64, float64, error) {
	m := soeRe.FindStringSubmatch(text)
	if m == nil {
		return 0, 0, errors.New("bloco $$SOE/$$EOE nao encontrado no resultado Horizons")
	}
	var rows []string
	for _, ln := range splitLines(m[1]) {
		if strings.TrimSpace(ln) != "" {
			rows = append(rows, ln)
		}
	}
	if len(rows) != 1 {
		return 0, 0, fmt.Errorf("esperava uma linha de efemeride, obteve %d: %q", len(rows), rows)
	}
	parts := strings.Fields(rows[0])
	if len(parts) < 2 {
		return 0, 0, errors.New("linha de efemeride sem azimute/elevacao")
	}
	az, err := strconv.ParseFloat(parts[len(parts)-2], 64)
	if err != nil {
		return 0, 0, err
	}
	el, err := strconv.ParseFloat(parts[len(parts)-1], 64)
	if err != nil {
		return 0, 0, err
	}
	return az, el, nil
}

func extractSource(text string) string {
	if m := sourceRe.FindStringSubmatch(text); m != nil {
		return m[1]
	}
	return fallbackEphemerisSource
}

func epochFileTag(epoch string) string {
	return strings.NewReplacer(":", "", "-", "", "T", "").Replace(epoch)
}

// encodeQuery is urllib.parse.urlencode: insertion order kept, quote_plus on keys and values.
func encodeQuery(kv [][2]string) string {
	parts := make([]string, len(kv))
	for i, p := range kv {
		parts[i] = url.QueryEscape(p[0]) + "=" + url.QueryEscape(p[1])
	}
	return strings.Join(parts, "&")
}

func horizonQuery(client *http.Client, base string, params [][2]string) (string, error) {
	req, err := http.NewRequest("GET", base+"?"+encodeQuery(params), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "braspac-helena-benchmark/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP Error %d: %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return pyfmt.ToValidUTF8(b), nil
}

func lookup(v any, key string) any {
	if o, ok := v.(pyfmt.Obj); ok {
		r, _ := o.Get(key)
		return r
	}
	return nil
}

func truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case pyfmt.Num:
		f, _ := strconv.ParseFloat(string(t), 64)
		return f != 0
	case []any:
		return len(t) > 0
	case pyfmt.Obj:
		return len(t) > 0
	}
	return true
}

type config struct {
	root        string
	base        string
	minInterval time.Duration
	stdout      io.Writer
	now         func() time.Time
}

func run(c config) error {
	root, err := filepath.Abs(c.root)
	if err != nil {
		return err
	}
	horizonsDir := filepath.Join(root, "science", "benchmarks", "horizons")
	rawDir := filepath.Join(horizonsDir, "raw")
	if err := os.MkdirAll(rawDir, 0o755); err != nil {
		return err
	}
	client := &http.Client{Timeout: reqTimeout}
	var entries []any
	var lastCall time.Time
	for _, s := range sites {
		siteDir := filepath.Join(rawDir, s.ID)
		if err := os.MkdirAll(siteDir, 0o755); err != nil {
			return err
		}
		siteCoord := pyfmt.FloatRepr(s.Lon) + "," + pyfmt.FloatRepr(s.Lat) + "," + pyfmt.FloatRepr(s.AltKm)
		for _, epoch := range epochs {
			tag := epochFileTag(epoch)
			epochDir := filepath.Join(siteDir, tag)
			if err := os.MkdirAll(epochDir, 0o755); err != nil {
				return err
			}
			for _, b := range bodies {
				if d := time.Since(lastCall); d < c.minInterval {
					time.Sleep(c.minInterval - d)
				}
				lastCall = time.Now()
				stop := strings.Replace(epoch, "T12:00:00Z", "T12:01:00Z", 1)
				raw, err := horizonQuery(client, c.base, [][2]string{
					{"format", "json"}, {"COMMAND", strconv.Itoa(b.ID)}, {"CENTER", "coord@301"}, {"SITE_COORD", siteCoord},
					{"START_TIME", epoch}, {"STOP_TIME", stop}, {"STEP_SIZE", "1d"}, {"QUANTITIES", "4"},
				})
				if err != nil {
					return err
				}
				// resposta bruta: corpo HTTP completo (JSON), gravado tal qual.
				bodyFile := filepath.Join(epochDir, strconv.Itoa(b.ID)+".json")
				if err := os.WriteFile(bodyFile, []byte(raw), 0o644); err != nil {
					return err
				}
				sum := sha256.Sum256([]byte(raw))

				data, err := pyfmt.Parse([]byte(raw))
				if err != nil {
					return err
				}
				text, _ := lookup(data, "result").(string)
				var version any = fallbackHorizonsVersion
				if sig := lookup(data, "signature"); truthy(sig) {
					if v, ok := sig.(pyfmt.Obj).Get("version"); ok {
						version = v
					}
				}
				az, el, err := parseAzEl(text)
				if err != nil {
					return err
				}
				entries = append(entries, pyfmt.Obj{
					{K: "site", V: s.ID}, {K: "site_name", V: s.Name},
					{K: "latitude_deg", V: s.Lat}, {K: "longitude_deg", V: s.Lon}, {K: "altitude_km", V: s.AltKm},
					{K: "epoch_utc", V: epoch}, {K: "body", V: b.ID}, {K: "body_name", V: b.Name},
					{K: "azimuth_deg", V: pyfmt.Round(az, 6)}, {K: "elevation_deg", V: pyfmt.Round(el, 6)},
					{K: "frame", V: fallbackFrame}, {K: "horizons_version", V: version},
					{K: "ephemeris_source", V: extractSource(text)},
					{K: "raw_file", V: "science/benchmarks/horizons/raw/" + s.ID + "/" + tag + "/" + strconv.Itoa(b.ID) + ".json"},
					{K: "response_sha256", V: hex.EncodeToString(sum[:])},
				})
				fmt.Fprintf(c.stdout, "OK %s %s body=%d az=%.4f el=%.4f\n", s.ID, epoch, b.ID, az, el)
			}
		}
	}

	siteList := make([]any, len(sites))
	for i, s := range sites {
		siteList[i] = pyfmt.Obj{{K: "site", V: s.ID}, {K: "name", V: s.Name}, {K: "latitude_deg", V: s.Lat},
			{K: "longitude_deg", V: s.Lon}, {K: "altitude_km", V: s.AltKm}, {K: "provenance", V: provenanceText}}
	}
	epochList := make([]any, len(epochs))
	for i, e := range epochs {
		epochList[i] = e
	}
	bodyList := make([]any, len(bodies))
	for i, b := range bodies {
		bodyList[i] = pyfmt.Obj{{K: "id", V: b.ID}, {K: "name", V: b.Name}}
	}
	benchmark := pyfmt.Obj{
		{K: "generated_utc", V: c.now().UTC().Format("2006-01-02T15:04:05Z")},
		{K: "issue", V: "BS-017"},
		{K: "gate", V: "G5"},
		{K: "horizons_api", V: pyfmt.Obj{{K: "url", V: baseURL}, {K: "version", V: fallbackHorizonsVersion},
			{K: "ephemeris_source", V: fallbackEphemerisSource}, {K: "frame", V: fallbackFrame}}},
		{K: "convention", V: pyfmt.Obj{
			{K: "azimuth", V: "medido no sentido horario a partir do norte local: North(0) -> East(90) -> South(180) -> West(270) -> North(360)"},
			{K: "elevation", V: "graus acima do plano perpendicular a direcao do zenito local da superficie de referencia (MEAN_ME), toposcentrica"},
			{K: "refraction", V: "NENHUMA (airless); a Lua nao tem atmosfera"},
			{K: "light_time", V: "compensada (atraso de luz da ida, desvio gravitacional da luz, aberracao estelar, precessao e nutacao)"},
			{K: "target", V: "centro do corpo celeste (nao a borda/lmbo superior)"},
		}},
		{K: "limits", V: []any{
			"o Horizons usa a superficie de referencia (elipsoide/esfera Media da Lua), NAO o relevo topografico (LOLA)",
			"valida angulo do corpo celeste (Sol/Terra), NAO o horizonte do terreno nem visibilidade acima de crateras/encostas",
		}},
		{K: "sites", V: siteList},
		{K: "epochs", V: epochList},
		{K: "bodies", V: bodyList},
		{K: "count", V: len(entries)},
		{K: "entries", V: entries},
	}
	txt, err := pyfmt.Marshal(benchmark, pyfmt.Options{Indent: 2})
	if err != nil {
		return err
	}
	out := filepath.Join(horizonsDir, "benchmark.json")
	if err := os.WriteFile(out, []byte(txt+"\n"), 0o644); err != nil {
		return err
	}
	fmt.Fprintf(c.stdout, "\nbenchmark.json gravado com %d entradas em %s\n", len(entries), out)
	return nil
}

func main() {
	root := flag.String("root", "..", "raiz do repositorio (a partir de api/)")
	base := flag.String("base-url", baseURL, "endpoint do Horizons (so para testes com servidor local)")
	minInterval := flag.Float64("min-interval-s", defaultMinIntervalSecond, "intervalo minimo entre requisicoes, em segundos")
	flag.Parse()
	err := run(config{root: *root, base: *base, minInterval: time.Duration(*minInterval * float64(time.Second)),
		stdout: os.Stdout, now: time.Now})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
