package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed db/optional-vector.sql
var optionalVectorSQL string

type vectorSeedEntry struct {
	SourceRef string
	Title     string
	SourceURL string
	SHA256    string
	Text      string
}

func buildProvenanceSeedEntries(fsys fs.FS) ([]vectorSeedEntry, error) {
	entries := []vectorSeedEntry{
		{
			SourceRef: "nasa-lro-lola-ldem-80s-80m",
			Title:     "NASA LRO LOLA South Pole DEM (LDEM_80S_80M.IMG, 80 m/px)",
			SourceURL: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img",
			SHA256:    "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc",
			Text:      "NASA LRO LOLA LDEM_80S_80M Lunar Orbiter Laser Altimeter South Pole DEM elevation terrain horizon 80m",
		},
		{
			// Values copied from data/ASSET_REGISTRY.json (asset_id pgda-69-avgvisib-85s-60m).
			SourceRef: "pgda-69-avgvisib-85s-60m",
			Title:     "NASA PGDA Lunar Polar Illumination: average solar illumination 85S-90S, 60 m/px (AVGVISIB_85S_060M_201608)",
			SourceURL: "https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF",
			SHA256:    "ccf67d4f39e0a970c111196da7d6551ffcf50d075470b93067fb3904c0b05806",
			Text:      "NASA PGDA Goddard Planetary Geodynamics Data Archive average solar illumination south pole 85S 60m",
		},
		{
			SourceRef: "naif-spice-de440s-ephemeris",
			Title:     "NAIF SPICE Planetary Ephemeris Kernel (de440s.bsp)",
			SourceURL: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
			SHA256:    "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2", // data/ASSET_REGISTRY.json, NAIF review_note
			Text:      "NAIF JPL SPICE de440s bsp planetary ephemeris sun earth moon geometry azimuth elevation",
		},
	}

	rawCatalog, err := fs.ReadFile(fsys, "catalog.json")
	if err != nil {
		return entries, nil
	}
	var cat struct {
		Sites []struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			Kind       string `json:"kind"`
			SeriesSHA  string `json:"series_sha256"`
			Note       string `json:"note"`
			Coordinate struct {
				Source string `json:"source"`
			} `json:"coordinate"`
		} `json:"sites"`
	}
	if json.Unmarshal(rawCatalog, &cat) != nil {
		return entries, nil
	}
	for _, s := range cat.Sites {
		if len(s.SeriesSHA) != 64 {
			continue
		}
		entries = append(entries, vectorSeedEntry{
			SourceRef: "site-" + s.ID,
			Title:     fmt.Sprintf("%s — %s", s.Name, s.Coordinate.Source),
			SourceURL: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
			SHA256:    s.SeriesSHA,
			Text:      fmt.Sprintf("%s %s %s %s %s", s.ID, s.Name, s.Kind, s.Coordinate.Source, s.Note),
		})
	}
	return entries, nil
}

func ingestVectorMetadata(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS) (map[string]any, error) {
	if pool == nil {
		return nil, errors.New("vector database pool is nil")
	}
	entries, err := buildProvenanceSeedEntries(fsys)
	if err != nil {
		return nil, err
	}
	// Publish the optional schema and all seed rows in one transaction.
	if err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('braspace:vector-ingest', 0))`); err != nil {
			return fmt.Errorf("lock vector ingest: %w", err)
		}
		if _, err := tx.Exec(ctx, optionalVectorSQL); err != nil {
			return fmt.Errorf("apply optional-vector.sql: %w", err)
		}
		for _, e := range entries {
			vec, err := embedProvenanceText(e.Text)
			if err != nil {
				return fmt.Errorf("embed %s: %w", e.SourceRef, err)
			}
			lit, err := vectorLiteral(vec)
			if err != nil {
				return fmt.Errorf("literal %s: %w", e.SourceRef, err)
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO source_semantic_index AS current_index(source_ref, title, source_url, sha256, model_id, embedding)
				VALUES ($1, $2, $3, $4, $5, $6::vector)
				ON CONFLICT (source_ref) DO UPDATE SET
					title = EXCLUDED.title,
					source_url = EXCLUDED.source_url,
					sha256 = EXCLUDED.sha256,
					model_id = EXCLUDED.model_id,
					embedding = EXCLUDED.embedding,
					updated_at = now()
				WHERE (current_index.title, current_index.source_url, current_index.sha256, current_index.model_id, current_index.embedding)
				      IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.source_url, EXCLUDED.sha256, EXCLUDED.model_id, EXCLUDED.embedding)`,
				e.SourceRef, e.Title, e.SourceURL, e.SHA256, vectorLexicalModelID, lit)
			if err != nil {
				return fmt.Errorf("upsert %s: %w", e.SourceRef, err)
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	return map[string]any{
		"status":    "ok",
		"model_id":  vectorLexicalModelID,
		"dimension": vectorDimensions,
		"upserted":  len(entries),
	}, nil
}
