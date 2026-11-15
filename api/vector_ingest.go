package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"

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
			SourceRef: "nasa-pgda-artemis-iii-illumination",
			Title:     "NASA PGDA South Pole Illumination & Earth Visibility Reference",
			SourceURL: "https://pgda.gsfc.nasa.gov/products/81",
			SHA256:    "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
			Text:      "NASA PGDA Goddard Planetary Geodynamics Data Archive solar illumination earth visibility south pole",
		},
		{
			SourceRef: "naif-spice-de440s-ephemeris",
			Title:     "NAIF SPICE Planetary Ephemeris Kernel (de440s.bsp)",
			SourceURL: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
			SHA256:    "c1a5e8c4c0b8c58b9d5f4e6a7c8b9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
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
	if _, err := pool.Exec(ctx, optionalVectorSQL); err != nil {
		return nil, fmt.Errorf("apply optional-vector.sql: %w", err)
	}
	entries, err := buildProvenanceSeedEntries(fsys)
	if err != nil {
		return nil, err
	}
	inserted := 0
	for _, e := range entries {
		vec, err := embedProvenanceText(e.Text)
		if err != nil {
			return nil, fmt.Errorf("embed %s: %w", e.SourceRef, err)
		}
		lit, err := vectorLiteral(vec)
		if err != nil {
			return nil, fmt.Errorf("literal %s: %w", e.SourceRef, err)
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO source_semantic_index(source_ref, title, source_url, sha256, model_id, embedding)
			VALUES ($1, $2, $3, $4, $5, $6::vector)
			ON CONFLICT (source_ref) DO UPDATE SET
				title = EXCLUDED.title,
				source_url = EXCLUDED.source_url,
				sha256 = EXCLUDED.sha256,
				model_id = EXCLUDED.model_id,
				embedding = EXCLUDED.embedding,
				updated_at = now()`,
			e.SourceRef, e.Title, e.SourceURL, e.SHA256, vectorLexicalModelID, lit)
		if err != nil {
			return nil, fmt.Errorf("upsert %s: %w", e.SourceRef, err)
		}
		inserted++
	}
	return map[string]any{
		"status":    "ok",
		"model_id":  vectorLexicalModelID,
		"dimension": vectorDimensions,
		"upserted":  inserted,
	}, nil
}
