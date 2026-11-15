package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"time"
)

const cliUsage = `usage: api <command> [flags]   (DATABASE_URL must be set)

  migrate                         apply database migrations
  ingest [-data DIR] [-manifest FILE]  migrate, then load catalog, series and NASA manifest
  verify [-data DIR] [-manifest FILE]  compare database contents with the source files
  vector-ingest (-input FILE | -lexical) [-apply]   validate or import reviewed layer metadata embeddings

Without -data the embedded api/sitedata is used.
`

// runCLI handles the database subcommands; it returns a process exit code.
func runCLI(args []string) int {
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, cliUsage)
		return 2
	}
	if args[0] == "vector-ingest" {
		return runVectorIngestCLI(args[1:])
	}
	fset := flag.NewFlagSet(args[0], flag.ContinueOnError)
	dataDir := fset.String("data", "", "site data directory (catalog.json + series)")
	manifestPath := fset.String("manifest", "", "NASA source manifest (data/manifest.json)")
	if err := fset.Parse(args[1:]); err != nil {
		return 2
	}
	cmd := args[0]
	if cmd != "migrate" && cmd != "ingest" && cmd != "verify" {
		fmt.Fprint(os.Stderr, cliUsage)
		return 2
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	db, err := openPool(ctx, url)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer db.Close()

	var fsys fs.FS
	if *dataDir != "" {
		fsys = os.DirFS(*dataDir)
	} else if fsys, err = fs.Sub(embeddedSiteData, "sitedata"); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	var manifest []byte
	if *manifestPath != "" {
		if manifest, err = os.ReadFile(*manifestPath); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
	}

	var out any
	switch cmd {
	case "migrate":
		out, err = migrate(ctx, db)
	case "ingest":
		if _, err = migrate(ctx, db); err == nil {
			out, err = ingest(ctx, db, fsys, manifest)
		}
	case "verify":
		var rep *readbackReport
		rep, err = verifyReadback(ctx, db, fsys, manifest)
		out = rep
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s failed: %v\n", cmd, err)
		return 1
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
	if rep, ok := out.(*readbackReport); ok && !rep.OK {
		return 1
	}
	return 0
}
