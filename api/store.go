package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"os"
	"path"
	"regexp"
	"sort"
	"sync"
	"time"
)

//go:embed sitedata
var embeddedSiteData embed.FS

const moonRadiusKm = 1737.4

var siteIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

var scienceStatuses = map[string]bool{"SYNTHETIC": true, "UNVERIFIED": true, "VALIDATED": true}

type coordinate struct {
	LatitudeDeg     float64 `json:"latitude_deg"`
	LongitudeDeg    float64 `json:"longitude_deg"`
	Role            string  `json:"role"`
	Frame           string  `json:"frame"`
	Source          string  `json:"source"`
	Inventory       string  `json:"inventory,omitempty"`
	SourceAccuracyM string  `json:"source_accuracy_m,omitempty"`
}

type site struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Kind       string      `json:"kind"`
	Coordinate *coordinate `json:"coordinate,omitempty"`
	Nearby     []string    `json:"nearby,omitempty"`
	SeriesFile string      `json:"series_file,omitempty"`
	// SeriesSHA256 pins the exact bytes of SeriesFile. A truncated, reordered or
	// edited file (e.g. a removed sample that would shift every later epoch) is
	// rejected at load, matching the content check of the PostgreSQL path.
	SeriesSHA256 string `json:"series_sha256,omitempty"`
	Note       string      `json:"note,omitempty"`
}

type siteCatalog struct {
	Schema string `json:"schema"`
	Note   string `json:"note"`
	Sites  []site `json:"sites"`
}

type seriesProvenance struct {
	TerrainDatasetID string `json:"terrain_dataset_id"`
	TerrainSHA256    string `json:"terrain_sha256,omitempty"`
	EphemerisID      string `json:"ephemeris_id"`
	Frame            string `json:"frame"`
	Generator        string `json:"generator"`
	Note             string `json:"note,omitempty"`
}

type seriesSample struct {
	Sun   direction `json:"sun"`
	Earth direction `json:"earth"`
}

// SampleError is the typed load error for a series sample that is null,
// absent or missing a required field. It is never replaced by a zero angle.
type SampleError struct {
	Index  int
	Reason string
}

func (e *SampleError) Error() string {
	if e.Index < 0 {
		return "series sample: " + e.Reason
	}
	return fmt.Sprintf("series sample %d: %s", e.Index, e.Reason)
}

type rawDirection struct {
	AzimuthDeg   *float64 `json:"azimuth_deg"`
	ElevationDeg *float64 `json:"elevation_deg"`
}

// UnmarshalJSON requires sun and earth, each with both angles. null, {} and
// partial objects are rejected so a missing sample can never become az 0/el 0.
func (s *seriesSample) UnmarshalJSON(b []byte) error {
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		return &SampleError{Index: -1, Reason: "sample is null"}
	}
	var raw struct {
		Sun   *rawDirection `json:"sun"`
		Earth *rawDirection `json:"earth"`
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&raw); err != nil {
		return &SampleError{Index: -1, Reason: err.Error()}
	}
	for name, d := range map[string]*rawDirection{"sun": raw.Sun, "earth": raw.Earth} {
		if d == nil || d.AzimuthDeg == nil || d.ElevationDeg == nil {
			return &SampleError{Index: -1, Reason: name + " direction missing azimuth_deg/elevation_deg"}
		}
	}
	s.Sun = direction{*raw.Sun.AzimuthDeg, *raw.Sun.ElevationDeg}
	s.Earth = direction{*raw.Earth.AzimuthDeg, *raw.Earth.ElevationDeg}
	return nil
}

// siteSeries is the server-side input for one site: its terrain horizon and
// Sun/Earth look angles on a fixed time grid. Produced offline by the science
// pipeline; the API never accepts these values from clients.
type siteSeries struct {
	Schema          string           `json:"schema"`
	SiteID          string           `json:"site_id"`
	ScienceStatus   string           `json:"science_status"`
	Provenance      seriesProvenance `json:"provenance"`
	ObserverHeightM float64          `json:"observer_height_m"`
	TerrainHorizon  []horizonSample  `json:"terrain_horizon"`
	StartUTC        string           `json:"start_utc"`
	StepSeconds     int              `json:"step_seconds"`
	Samples         []seriesSample   `json:"samples"`

	start time.Time
	step  time.Duration
}

func (s *siteSeries) end() time.Time { return s.start.Add(time.Duration(len(s.Samples)) * s.step) }

func (s *siteSeries) epoch(i int) time.Time { return s.start.Add(time.Duration(i) * s.step) }

type siteStore struct {
	source string
	note   string
	sites  []site
	byID   map[string]*site
	series map[string]*siteSeries
}

func (st *siteStore) site(id string) (*site, bool) { s, ok := st.byID[id]; return s, ok }

func (st *siteStore) seriesFor(id string) (*siteSeries, bool) { s, ok := st.series[id]; return s, ok }

func loadStore(fsys fs.FS) (*siteStore, error) {
	raw, err := fs.ReadFile(fsys, "catalog.json")
	if err != nil {
		return nil, fmt.Errorf("read catalog: %w", err)
	}
	var cat siteCatalog
	if err := decodeStrict(raw, &cat); err != nil {
		return nil, fmt.Errorf("parse catalog: %w", err)
	}
	st, err := buildStore(cat, func(s *site) (*siteSeries, error) {
		if s.SeriesFile == "" {
			return nil, nil
		}
		return loadSeries(fsys, s.SeriesFile, s.SeriesSHA256)
	})
	if err != nil {
		return nil, err
	}
	st.source = "embedded"
	return st, nil
}

// buildStore validates a catalog and attaches each site's series (nil when the
// site has none). File and database loaders share it.
func buildStore(cat siteCatalog, seriesOf func(*site) (*siteSeries, error)) (*siteStore, error) {
	if cat.Schema != "braspace.site-catalog.v1" {
		return nil, fmt.Errorf("unsupported catalog schema %q", cat.Schema)
	}
	st := &siteStore{sites: cat.Sites, byID: map[string]*site{}, series: map[string]*siteSeries{}, note: cat.Note}
	for i := range st.sites {
		s := &st.sites[i]
		if !siteIDPattern.MatchString(s.ID) || s.Name == "" {
			return nil, fmt.Errorf("catalog entry %d: invalid id or name", i)
		}
		if _, dup := st.byID[s.ID]; dup {
			return nil, fmt.Errorf("catalog: duplicate site %q", s.ID)
		}
		if c := s.Coordinate; c != nil && (!finite(c.LatitudeDeg) || !finite(c.LongitudeDeg) || c.LatitudeDeg < -90 || c.LatitudeDeg > 90 || c.LongitudeDeg < -180 || c.LongitudeDeg > 360 || c.Source == "") {
			return nil, fmt.Errorf("site %q: invalid coordinate or missing source", s.ID)
		}
		st.byID[s.ID] = s
	}
	for i := range st.sites {
		s := &st.sites[i]
		for _, n := range s.Nearby {
			if _, ok := st.byID[n]; !ok || n == s.ID {
				return nil, fmt.Errorf("site %q: unknown nearby site %q", s.ID, n)
			}
		}
		ser, err := seriesOf(s)
		if err != nil {
			return nil, fmt.Errorf("site %q: %w", s.ID, err)
		}
		if ser == nil {
			continue
		}
		if ser.SiteID != s.ID {
			return nil, fmt.Errorf("site %q: series belongs to %q", s.ID, ser.SiteID)
		}
		st.series[s.ID] = ser
	}
	return st, nil
}

func loadSeries(fsys fs.FS, name, wantSHA string) (*siteSeries, error) {
	raw, err := fs.ReadFile(fsys, path.Clean(name))
	if err != nil {
		return nil, fmt.Errorf("read series: %w", err)
	}
	if !sha256Pattern.MatchString(wantSHA) {
		return nil, fmt.Errorf("catalog entry for %s needs series_sha256 (64 lowercase hex)", name)
	}
	if got := sha256Hex(raw); got != wantSHA {
		return nil, fmt.Errorf("series file %s does not match series_sha256 (catalog %s…, file %s…)", name, wantSHA[:12], got[:12])
	}
	var s siteSeries
	if err := decodeStrict(raw, &s); err != nil {
		return nil, fmt.Errorf("parse series: %w", err)
	}
	if err := validateSeries(&s); err != nil {
		return nil, err
	}
	return &s, nil
}

// validateSeries checks a parsed series and fills its derived time fields.
// start_utc is normalised to RFC3339 UTC so content hashes are stable.
func validateSeries(s *siteSeries) error {
	var err error
	if s.Schema != "braspace.site-series.v1" {
		return fmt.Errorf("unsupported series schema %q", s.Schema)
	}
	if !scienceStatuses[s.ScienceStatus] {
		return fmt.Errorf("invalid science_status %q", s.ScienceStatus)
	}
	// A stored label is not a scientific validation receipt. Do not accept
	// VALIDATED until independent reference evidence is enforced at ingestion.
	if s.ScienceStatus == "VALIDATED" {
		return errors.New("VALIDATED requires independent science attestation; this engine does not support it")
	}
	p := s.Provenance
	if p.TerrainDatasetID == "" || p.EphemerisID == "" || p.Frame != "MOON_ME" || p.Generator == "" {
		return errors.New("series provenance incomplete (terrain, ephemeris, MOON_ME frame, generator)")
	}
	if !finite(s.ObserverHeightM) || s.ObserverHeightM < 0 || s.ObserverHeightM > 100 {
		return errors.New("observer_height_m out of range")
	}
	if s.start, err = time.Parse(time.RFC3339, s.StartUTC); err != nil {
		return errors.New("start_utc must be RFC3339")
	}
	s.start = s.start.UTC()
	s.StartUTC = s.start.Format(time.RFC3339)
	if s.StepSeconds < 60 || s.StepSeconds > 86400 {
		return errors.New("step_seconds must be 60..86400")
	}
	s.step = time.Duration(s.StepSeconds) * time.Second
	if len(s.Samples) < 2 || len(s.Samples) > 200000 {
		return errors.New("samples must contain 2..200000 entries")
	}
	for i, smp := range s.Samples {
		if !validDirection(smp.Sun) || !validDirection(smp.Earth) {
			return fmt.Errorf("sample %d: invalid look angle", i)
		}
	}
	probe := visibilityRequest{SiteID: s.SiteID, EpochUTC: s.StartUTC, Sun: s.Samples[0].Sun, Earth: s.Samples[0].Earth,
		TerrainHorizon: s.TerrainHorizon, Provenance: provenance{TerrainDatasetID: p.TerrainDatasetID, EphemerisID: p.EphemerisID, Frame: p.Frame}}
	if err := validate(probe); err != nil {
		return fmt.Errorf("series rejected by engine contract: %w", err)
	}
	return nil
}

func decodeStrict(raw []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err != nil { return err }
		return errors.New("trailing JSON document")
	}
	return nil
}

// greatCircleKm uses a spherical Moon (R = 1737.4 km, the LOLA reference radius).
func greatCircleKm(a, b coordinate) float64 {
	la1, la2 := a.LatitudeDeg*math.Pi/180, b.LatitudeDeg*math.Pi/180
	dla, dlo := la2-la1, (b.LongitudeDeg-a.LongitudeDeg)*math.Pi/180
	h := math.Sin(dla/2)*math.Sin(dla/2) + math.Cos(la1)*math.Cos(la2)*math.Sin(dlo/2)*math.Sin(dlo/2)
	return 2 * moonRadiusKm * math.Asin(math.Min(1, math.Sqrt(h)))
}

type nearbySite struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	DistanceKm *float64 `json:"distance_km,omitempty"`
	HasSeries  bool     `json:"has_series"`
}

// nearby returns explicitly linked sites first, then the closest catalog sites
// by great-circle distance between source feature centers.
func (st *siteStore) nearby(id string, limit int, onlyWithSeries bool) []nearbySite {
	s, ok := st.byID[id]
	if !ok {
		return nil
	}
	var out []nearbySite
	seen := map[string]bool{id: true}
	add := func(o *site, dist *float64) {
		_, has := st.series[o.ID]
		if seen[o.ID] || (onlyWithSeries && !has) {
			return
		}
		seen[o.ID] = true
		out = append(out, nearbySite{ID: o.ID, Name: o.Name, DistanceKm: dist, HasSeries: has})
	}
	for _, n := range s.Nearby {
		add(st.byID[n], nil)
	}
	if s.Coordinate != nil {
		type cand struct {
			s *site
			d float64
		}
		var cands []cand
		for i := range st.sites {
			o := &st.sites[i]
			if o.Coordinate != nil && o.ID != id {
				cands = append(cands, cand{o, greatCircleKm(*s.Coordinate, *o.Coordinate)})
			}
		}
		sort.Slice(cands, func(i, j int) bool {
			if cands[i].d != cands[j].d {
				return cands[i].d < cands[j].d
			}
			return cands[i].s.ID < cands[j].s.ID
		})
		for _, c := range cands {
			d := math.Round(c.d*100) / 100
			add(c.s, &d)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

var (
	defaultStoreOnce sync.Once
	defaultStore     *siteStore
	defaultStoreErr  error
)

// loadDefaultStore reads PostgreSQL when DATABASE_URL is set, else SITE_DATA_DIR,
// else the embedded data. The store is loaded once at startup.
func loadDefaultStore() (*siteStore, error) {
	defaultStoreOnce.Do(func() {
		if url := os.Getenv("DATABASE_URL"); url != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			db, err := openPool(ctx, url)
			if err != nil {
				defaultStoreErr = err
				return
			}
			defer db.Close()
			defaultStore, defaultStoreErr = loadStoreFromDB(ctx, db)
			return
		}
		var fsys fs.FS
		if dir := os.Getenv("SITE_DATA_DIR"); dir != "" {
			fsys = os.DirFS(dir)
		} else {
			fsys, defaultStoreErr = fs.Sub(embeddedSiteData, "sitedata")
			if defaultStoreErr != nil {
				return
			}
		}
		defaultStore, defaultStoreErr = loadStore(fsys)
	})
	return defaultStore, defaultStoreErr
}
