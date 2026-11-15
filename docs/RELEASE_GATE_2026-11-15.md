# MoonProof — release / NASA submission gate (15 Nov 2026)

This is a **snapshot of what is proved and not proved**, not release authorization.
The release `moonproof-2026-11-15.4` points to `43b78e36a73041c1733e53ff20b35d3a78cb008c`.
Newer commits require a **new** exact-SHA run and public deployment check.

## Scientific P0 — no independent validation

The published web catalogue contains 14 NASA-derived, **PRELIMINARY** real-region series (plus 2 explicitly SYNTHETIC API demo sites). NASA/NAIF source input SHA-256 proves byte identity, **not** model validity.

The 100 km skyline is not the scientifically conservative result for two locations. The controlled 200 km experiment in `docs/HORIZON_REACH_STUDY.md` reports:

| Site | Center-Sun share, 100 → 200 km | Longest center-Sun hidden, 100 → 200 km |
|---|---:|---:|
| Malapert Massif | 38.44% → 33.84% | 670 h → 3389 h |
| Peak near Shackleton | 80.38% → 75.52% | 345 h → 381 h |

These are **preliminary same-pipeline results**, not independent replication. Solar-disc partial visibility differs from Sun-center visibility. No person should interpret these as flight suitability or validated safety. The API and web series remain the 100 km revision until regenerated and peer-reviewed. Changing a badge alone does not change the calculations.

Current static catalogue PGDA residuals in percentage points (disc mean minus PGDA): Peak +8.53, de Gerlache Rim 1 +7.95, de Gerlache–Kocher Massif +7.64. A benchmark residual is **not automatically** a strict physical upper bound.

**Scientific owner's decision needed:** (A) regenerate and independently check complete 200+ km series, source hashes, API, web, exports, ranking and scenario limits; or (B) release strictly as an educational preliminary model with all relevant limits disclosed on screens and deck, and written scientific sign-off. Neither path has independent approval here.

## Engineering release gate

- Require the exact source SHA in Worker `/config.js` and backend `/healthz`, with separate expected SHAs when releases are distinct. `BRASPACE_EXPECT_FRONT_COMMIT` checks the Worker through `scripts/smoke-publico.sh`.
- Require a completed CI job with **actual executed steps**, not queued/cancelled/failed before runner assignment. `CI_RUNS_ON` selects the configured runner. The public submission proof workflow now uses it too.
- Run `npm --prefix web run check:ts`, `npm --prefix web test`, `npm --prefix web run lint`, `bash scripts/ci-local.sh --browser` and optional pgvector job with isolated PostgreSQL.
- Verify 320/390/768/1024/1440/1920 widths with/without GPU; especially navigation, selected site/date, no-data, bad-network retry, landing back button, reading labels and evidence.
- Preserve a rollback ID before releasing the Worker. A Git tag or release note alone is **not** proof the live Worker serves that revision.

## Human NASA submission gate

The GitHub release is not a NASA submission. `docs/NASA_FORM_CHECKLIST.md` and `docs/PUBLIC_SUBMISSION_EVIDENCE.md` are historical, incomplete checklists. Only a **portal receipt / ID with timestamp** and a registered human submitter demonstrate submission. A website is not the NASA portal. Check the actual official event deadline in the portal.

Before pressing submit, the registered owner must verify: anonymous public demo + slides, accurate NASA source credits, AI usage declaration, licenses, clear PRELIMINARY/SYNTHETIC labels, known 100 km reach limitations and the complete NASA form. Archive the actual submitted URLs and confirmation screenshot. No automation here claims to submit on anyone's behalf.

## Product-change quarantine

The three-task entry (Explore/Teach/Plan) is present in the deployed `.4` release. A Cockpit-first redesign or nine independent panels must **not** silently replace it without an explicit owner decision, accessibility/mobile/GPU review and a new release test. A standalone habitat pressure/propellant model is outside the core landing-site challenge and does not justify last-minute release risk.
