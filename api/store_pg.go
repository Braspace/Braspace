package main

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed db/migrations/*.sql
var migrationFiles embed.FS

func sha256Hex(b []byte) string { return fmt.Sprintf("%x", sha256.Sum256(b)) }

// querier is satisfied by both *pgxpool.Pool and pgx.Tx.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// contentHash is the hash of a series' canonical JSON encoding. It is the same
// whether the series was read from a file or reassembled from the database.
func contentHash(s *siteSeries) (string, error) {
	b, err := json.Marshal(s)
	if err != nil {
		return "", err
	}
	return sha256Hex(b), nil
}

func openPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, errors.New("DATABASE_URL is not a valid postgres URL")
	}
	cfg.MaxConns = 8
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database unreachable: %w", err)
	}
	return pool, nil
}

// migrate applies embedded migrations in name order, each in its own transaction.
func migrate(ctx context.Context, db *pgxpool.Pool) ([]string, error) {
	if _, err := db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return nil, err
	}
	names, err := fs.Glob(migrationFiles, "db/migrations/*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(names)
	var applied []string
	for _, name := range names {
		base := path.Base(name)
		var done bool
		if err := db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, base).Scan(&done); err != nil {
			return nil, err
		}
		if done {
			continue
		}
		sql, err := migrationFiles.ReadFile(name)
		if err != nil {
			return nil, err
		}
		err = pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, base)
			return err
		})
		if err != nil {
			return nil, fmt.Errorf("migration %s: %w", base, err)
		}
		applied = append(applied, base)
	}
	return applied, nil
}

type ingestReport struct {
	RunID          int64             `json:"run_id"`
	CatalogSHA256  string            `json:"catalog_sha256"`
	Sites          int               `json:"sites"`
	Series         int               `json:"series"`
	Samples        int64             `json:"samples"`
	SeriesSHA256   map[string]string `json:"series_content_sha256"`
	ManifestIDs    []string          `json:"manifest_dataset_ids,omitempty"`
	ManifestSHA256 string            `json:"manifest_sha256,omitempty"`
}

// nasaManifest is the subset of data/manifest.json (BS-003) stored in the database.
type nasaManifest struct {
	Dataset struct {
		ProductFile    string `json:"product_file"`
		PDSDatasetID   string `json:"pds_dataset_id"`
		ProductVersion string `json:"product_version"`
		Raster         struct {
			FileSizeBytes int64 `json:"file_size_bytes"`
		} `json:"raster"`
	} `json:"dataset"`
	Source struct {
		ImageURL string `json:"image_url"`
	} `json:"source"`
	Verification struct {
		Status      string `json:"status"`
		ValidatedAt string `json:"validated_at"`
		SHA256      string `json:"sha256"`
	} `json:"verification"`
}

func (m nasaManifest) datasetID() string {
	return m.Dataset.PDSDatasetID + "/" + strings.TrimSuffix(m.Dataset.ProductFile, ".IMG") + " " + m.Dataset.ProductVersion
}

// ingest validates the catalog and series with the same rules the API uses,
// then replaces their rows in one transaction. manifest may be nil.
func ingest(ctx context.Context, db *pgxpool.Pool, fsys fs.FS, manifest []byte) (*ingestReport, error) {
	st, err := loadStore(fsys)
	if err != nil {
		return nil, fmt.Errorf("source data rejected: %w", err)
	}
	catalogRaw, err := fs.ReadFile(fsys, "catalog.json")
	if err != nil {
		return nil, err
	}
	rep := &ingestReport{CatalogSHA256: sha256Hex(catalogRaw), Sites: len(st.sites), SeriesSHA256: map[string]string{}}

	var man *nasaManifest
	if manifest != nil {
		man = &nasaManifest{}
		if err := json.Unmarshal(manifest, man); err != nil {
			return nil, fmt.Errorf("parse manifest: %w", err)
		}
		if man.Dataset.ProductFile == "" || man.Dataset.PDSDatasetID == "" || man.Source.ImageURL == "" || len(man.Verification.SHA256) != 64 {
			return nil, errors.New("manifest missing product, dataset id, source URL or sha256")
		}
		rep.ManifestSHA256 = sha256Hex(manifest)
		rep.ManifestIDs = []string{man.datasetID()}
	}

	err = pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO ingest_runs (catalog_sha256, status) VALUES ($1, 'running') RETURNING id`, rep.CatalogSHA256).Scan(&rep.RunID); err != nil {
			return err
		}
		if man != nil {
			var validated *time.Time
			if t, err := time.Parse("2006-01-02", man.Verification.ValidatedAt); err == nil {
				validated = &t
			}
			_, err := tx.Exec(ctx, `
				INSERT INTO source_manifest (dataset_id, product_file, product_version, pds_dataset_id, source_url, sha256, size_bytes, verification_status, validated_at, manifest_sha256, raw)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				ON CONFLICT (dataset_id) DO UPDATE SET product_file = EXCLUDED.product_file, product_version = EXCLUDED.product_version,
					pds_dataset_id = EXCLUDED.pds_dataset_id, source_url = EXCLUDED.source_url, sha256 = EXCLUDED.sha256, size_bytes = EXCLUDED.size_bytes,
					verification_status = EXCLUDED.verification_status, validated_at = EXCLUDED.validated_at, manifest_sha256 = EXCLUDED.manifest_sha256,
					raw = EXCLUDED.raw, ingested_at = now()`,
				man.datasetID(), man.Dataset.ProductFile, man.Dataset.ProductVersion, man.Dataset.PDSDatasetID, man.Source.ImageURL,
				man.Verification.SHA256, man.Dataset.Raster.FileSizeBytes, man.Verification.Status, validated, rep.ManifestSHA256, manifest)
			if err != nil {
				return fmt.Errorf("manifest: %w", err)
			}
		}
		// The catalog is the source of truth: sites missing from it are removed.
		if _, err := tx.Exec(ctx, `DELETE FROM sites`); err != nil {
			return err
		}
		for i, s := range st.sites {
			var lat, lon *float64
			c := coordinate{}
			if s.Coordinate != nil {
				c = *s.Coordinate
				lat, lon = &c.LatitudeDeg, &c.LongitudeDeg
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO sites (id, ordinal, name, kind, note, latitude_deg, longitude_deg, coordinate_role, coordinate_frame, coordinate_source, coordinate_inventory, source_accuracy_m)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
				s.ID, i, s.Name, s.Kind, s.Note, lat, lon, c.Role, c.Frame, c.Source, c.Inventory, c.SourceAccuracyM); err != nil {
				return fmt.Errorf("site %s: %w", s.ID, err)
			}
		}
		for _, s := range st.sites {
			for j, n := range s.Nearby {
				if _, err := tx.Exec(ctx, `INSERT INTO site_nearby (site_id, nearby_id, ordinal) VALUES ($1, $2, $3)`, s.ID, n, j); err != nil {
					return err
				}
			}
		}
		for _, s := range st.sites {
			ser, ok := st.series[s.ID]
			if !ok {
				continue
			}
			raw, err := fs.ReadFile(fsys, path.Clean(s.SeriesFile))
			if err != nil {
				return err
			}
			ch, err := contentHash(ser)
			if err != nil {
				return err
			}
			p := ser.Provenance
			if _, err := tx.Exec(ctx, `
				INSERT INTO site_series (site_id, schema, science_status, terrain_dataset_id, terrain_sha256, ephemeris_id, frame, generator, provenance_note,
					observer_height_m, start_utc, step_seconds, sample_count, source_file, file_sha256, content_sha256, ingest_run_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
				s.ID, ser.Schema, ser.ScienceStatus, p.TerrainDatasetID, p.TerrainSHA256, p.EphemerisID, p.Frame, p.Generator, p.Note,
				ser.ObserverHeightM, ser.start, ser.StepSeconds, len(ser.Samples), s.SeriesFile, sha256Hex(raw), ch, rep.RunID); err != nil {
				return fmt.Errorf("series %s: %w", s.ID, err)
			}
			hrows := make([][]any, len(ser.TerrainHorizon))
			for i, h := range ser.TerrainHorizon {
				hrows[i] = []any{s.ID, i, h.AzimuthDeg, h.ElevationDeg}
			}
			if _, err := tx.CopyFrom(ctx, pgx.Identifier{"horizon_samples"}, []string{"site_id", "idx", "azimuth_deg", "elevation_deg"}, pgx.CopyFromRows(hrows)); err != nil {
				return fmt.Errorf("horizon %s: %w", s.ID, err)
			}
			erows := make([][]any, len(ser.Samples))
			for i, smp := range ser.Samples {
				erows[i] = []any{s.ID, i, ser.epoch(i), smp.Sun.AzimuthDeg, smp.Sun.ElevationDeg, smp.Earth.AzimuthDeg, smp.Earth.ElevationDeg}
			}
			if _, err := tx.CopyFrom(ctx, pgx.Identifier{"ephemeris_samples"},
				[]string{"site_id", "idx", "epoch_utc", "sun_azimuth_deg", "sun_elevation_deg", "earth_azimuth_deg", "earth_elevation_deg"}, pgx.CopyFromRows(erows)); err != nil {
				return fmt.Errorf("ephemeris %s: %w", s.ID, err)
			}
			rep.Series++
			rep.Samples += int64(len(ser.Samples))
			rep.SeriesSHA256[s.ID] = ch
		}
		_, err := tx.Exec(ctx, `UPDATE ingest_runs SET finished_at = now(), site_count = $2, series_count = $3, sample_count = $4, status = 'ok' WHERE id = $1`,
			rep.RunID, rep.Sites, rep.Series, rep.Samples)
		return err
	})
	if err != nil {
		return nil, err
	}
	return rep, nil
}

// loadStoreFromDB reassembles the catalog and series and runs the same
// validation as the file loader. Gaps in indices or epochs are rejected.
func loadStoreFromDB(ctx context.Context, pool *pgxpool.Pool) (*siteStore, error) {
	// One REPEATABLE READ snapshot so a concurrent ingest cannot mix old and new rows.
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	return loadStoreFromSnapshot(ctx, tx)
}

func loadStoreFromSnapshot(ctx context.Context, db querier) (*siteStore, error) {
	cat := siteCatalog{Schema: "braspace.site-catalog.v1", Note: "Loaded from PostgreSQL."}
	rows, err := db.Query(ctx, `
		SELECT s.id, s.name, s.kind, s.note, s.latitude_deg, s.longitude_deg, s.coordinate_role, s.coordinate_frame,
		       s.coordinate_source, s.coordinate_inventory, s.source_accuracy_m, COALESCE(ss.source_file, ''), COALESCE(ss.file_sha256, '')
		FROM sites s LEFT JOIN site_series ss ON ss.site_id = s.id ORDER BY s.ordinal`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var s site
		var lat, lon *float64
		var c coordinate
		if err := rows.Scan(&s.ID, &s.Name, &s.Kind, &s.Note, &lat, &lon, &c.Role, &c.Frame, &c.Source, &c.Inventory, &c.SourceAccuracyM, &s.SeriesFile, &s.SeriesSHA256); err != nil {
			rows.Close()
			return nil, err
		}
		if lat != nil {
			c.LatitudeDeg, c.LongitudeDeg = *lat, *lon
			s.Coordinate = &c
		}
		cat.Sites = append(cat.Sites, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(cat.Sites) == 0 {
		return nil, errors.New("database has no sites; run `api ingest` first")
	}
	nearby := map[string][]string{}
	rows, err = db.Query(ctx, `SELECT site_id, nearby_id FROM site_nearby ORDER BY site_id, ordinal`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var a, b string
		if err := rows.Scan(&a, &b); err != nil {
			rows.Close()
			return nil, err
		}
		nearby[a] = append(nearby[a], b)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range cat.Sites {
		cat.Sites[i].Nearby = nearby[cat.Sites[i].ID]
	}
	st, err := buildStore(cat, func(s *site) (*siteSeries, error) {
		if s.SeriesFile == "" {
			return nil, nil
		}
		return loadSeriesFromDB(ctx, db, s.ID)
	})
	if err != nil {
		return nil, err
	}
	st.source = "postgres"
	return st, nil
}

func loadSeriesFromDB(ctx context.Context, db querier, id string) (*siteSeries, error) {
	s := &siteSeries{SiteID: id}
	var start time.Time
	var count int
	var stored string
	err := db.QueryRow(ctx, `
		SELECT schema, science_status, terrain_dataset_id, terrain_sha256, ephemeris_id, frame, generator, provenance_note,
		       observer_height_m, start_utc, step_seconds, sample_count, content_sha256
		FROM site_series WHERE site_id = $1`, id).Scan(&s.Schema, &s.ScienceStatus, &s.Provenance.TerrainDatasetID, &s.Provenance.TerrainSHA256,
		&s.Provenance.EphemerisID, &s.Provenance.Frame, &s.Provenance.Generator, &s.Provenance.Note,
		&s.ObserverHeightM, &start, &s.StepSeconds, &count, &stored)
	if err != nil {
		return nil, err
	}
	s.StartUTC = start.UTC().Format(time.RFC3339)
	step := time.Duration(s.StepSeconds) * time.Second

	rows, err := db.Query(ctx, `SELECT idx, azimuth_deg, elevation_deg FROM horizon_samples WHERE site_id = $1 ORDER BY idx`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var i int
		var h horizonSample
		if err := rows.Scan(&i, &h.AzimuthDeg, &h.ElevationDeg); err != nil {
			rows.Close()
			return nil, err
		}
		if i != len(s.TerrainHorizon) {
			rows.Close()
			return nil, fmt.Errorf("horizon gap at index %d", len(s.TerrainHorizon))
		}
		s.TerrainHorizon = append(s.TerrainHorizon, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = db.Query(ctx, `
		SELECT idx, epoch_utc, sun_azimuth_deg, sun_elevation_deg, earth_azimuth_deg, earth_elevation_deg
		FROM ephemeris_samples WHERE site_id = $1 ORDER BY idx`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var i int
		var epoch time.Time
		var smp seriesSample
		if err := rows.Scan(&i, &epoch, &smp.Sun.AzimuthDeg, &smp.Sun.ElevationDeg, &smp.Earth.AzimuthDeg, &smp.Earth.ElevationDeg); err != nil {
			rows.Close()
			return nil, err
		}
		n := len(s.Samples)
		if i != n || !epoch.Equal(start.Add(time.Duration(n)*step)) {
			rows.Close()
			return nil, fmt.Errorf("ephemeris gap or off-grid epoch at index %d", n)
		}
		s.Samples = append(s.Samples, smp)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(s.Samples) != count {
		return nil, fmt.Errorf("expected %d samples, found %d", count, len(s.Samples))
	}
	if err := validateSeries(s); err != nil {
		return nil, err
	}
	got, err := contentHash(s)
	if err != nil {
		return nil, err
	}
	if got != stored {
		return nil, fmt.Errorf("content hash mismatch (stored %s, read back %s)", stored[:12], got[:12])
	}
	return s, nil
}

type readbackReport struct {
	OK       bool              `json:"ok"`
	Checks   map[string]string `json:"checks"`
	Problems []string          `json:"problems"`
}

// verifyReadback compares the database against the source files and manifest:
// file hashes, canonical content hashes and the manifest checksum.
func verifyReadback(ctx context.Context, db *pgxpool.Pool, fsys fs.FS, manifest []byte) (*readbackReport, error) {
	rep := &readbackReport{Checks: map[string]string{}, Problems: []string{}}
	src, err := loadStore(fsys)
	if err != nil {
		return nil, err
	}
	dbStore, err := loadStoreFromDB(ctx, db)
	if err != nil {
		rep.Problems = append(rep.Problems, "database load: "+err.Error())
		return rep, nil
	}
	srcCat, _ := json.Marshal(src.sites)
	dbCat, _ := json.Marshal(dbStore.sites)
	if string(srcCat) != string(dbCat) {
		rep.Problems = append(rep.Problems, "catalog differs from source (sites, names, coordinates, nearby links or series association)")
	} else {
		rep.Checks["catalog"] = fmt.Sprintf("%d sites, sha256 %s", len(src.sites), sha256Hex(srcCat)[:12])
	}
	for id := range dbStore.series {
		if _, ok := src.series[id]; !ok {
			rep.Problems = append(rep.Problems, id+": series in database but not in source")
		}
	}
	for id, ser := range src.series {
		want, _ := contentHash(ser)
		got, ok := dbStore.series[id]
		if !ok {
			rep.Problems = append(rep.Problems, id+": series missing in database")
			continue
		}
		have, _ := contentHash(got)
		raw, _ := fs.ReadFile(fsys, path.Clean(src.byID[id].SeriesFile))
		var fileHash string
		_ = db.QueryRow(ctx, `SELECT file_sha256 FROM site_series WHERE site_id = $1`, id).Scan(&fileHash)
		switch {
		case want != have:
			rep.Problems = append(rep.Problems, id+": content differs from source")
		case fileHash != sha256Hex(raw):
			rep.Problems = append(rep.Problems, id+": source file changed since ingest")
		default:
			rep.Checks[id] = "content " + want[:12] + " file " + fileHash[:12]
		}
	}
	if manifest != nil {
		var m nasaManifest
		if err := json.Unmarshal(manifest, &m); err != nil {
			return nil, err
		}
		var stored, storedManifest string
		err := db.QueryRow(ctx, `SELECT sha256, manifest_sha256 FROM source_manifest WHERE dataset_id = $1`, m.datasetID()).Scan(&stored, &storedManifest)
		switch {
		case err != nil:
			rep.Problems = append(rep.Problems, "manifest "+m.datasetID()+": not in database")
		case stored != m.Verification.SHA256 || storedManifest != sha256Hex(manifest):
			rep.Problems = append(rep.Problems, "manifest "+m.datasetID()+": checksum differs from source manifest")
		default:
			rep.Checks["manifest:"+m.datasetID()] = "sha256 " + stored[:12]
		}
	}
	rep.OK = len(rep.Problems) == 0
	return rep, nil
}
