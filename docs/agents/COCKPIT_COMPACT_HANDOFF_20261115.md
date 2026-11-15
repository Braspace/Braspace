# Cockpit compact — integration checkpoint, 15 November 2026

## P0 outcome

- Single Cockpit entry, nine independent sections, Moon-only and restore, persistent desktop/narrow preferences (three/timeline sections by default), compact/open all commands.
- #338: persistent lunar site selector in 2D, loading and 3D; compact camera menu, protected pins and focus handling. Shared Artemis asset and Joel terrain stay intact.
- #339: narrower rails (190–270 px), 132 px battery, 12–13 px type, 44 px actionable targets, responsive report/timeline. No global zoom. Original Heloísa tokens, fonts and jade/glass remain.
- Main #337 generic fold controls preserved for other screens; Cockpit excludes them to avoid two controllers for the same panels.
- Entry has the core first-paint signal; planning test now provides the complete hourly API timeline required by the stricter cockpit contract.

## Evidence and limitations

- Parent candidate 813dac7eddf80b96a8ab9e9d47d9258ec0aeaafe; integration reconciles main c8a7cce3c1edaa277e1d0a0b49fbfba92748552a and component commits 052c0bb7ea3a1cec26f83fca8ff63a21517ba7e7, 4ab76462cd2cf3ac81a86c58ab219c984595ddbd.
- Isolated exact-file fixture: strict TypeScript 5.6.3; Node 24.22.1 MoonProof suite 245/245, including real hourly series, fonts/HTTP, geometry and new state/scene tests. Not an EXO-X1 release gate.
- Browser matrix script covers 320/390/768/1024/1440/1920 px, all/individual/Moon-only, persisted choices, alternate lunar site, no horizontal overflow, no page errors. Chromium could not run in this sandbox (socket/ptrace); execute on EXO-X1.
- Production audit still showed persona entry, missing new cockpit JS assets (404), API build 62bf446e and UNVERIFIED_INPUTS. Do not represent candidate as deployed.
- Separate backend P0 #341 guards omitted/null power and consumable fields (production omission of load_w yielded HTTP 200), Go 1.26.11 regression and root/onboard packages PASS; #331 pgvector, #332 physical grid, #334 CI/EXO evidence are separate integration tracks. Exact final integrated backend, database and Rust still require release runs.

## Release checklist — MAC / Worker owner

- [ ] Check final main and candidate SHA, review component PRs without redundant merges.
- [ ] EXO-X1 ci-local GREEN (Node 20/22, Go/Rust, Docker/Postgres/pgvector, science hashes, browser matrix and GPU).
- [ ] Verify actual 3D terrain, shared illustrative lander, pins, fallback, keyboard/touch, portrait/landscape at 100% zoom; capture six widths in both languages.
- [ ] Verify API health/readiness and scenario/site-evaluate/report, zero vs absent power, vector isolation and actual pgvector; no fake science labels.
- [ ] Integrator merges exact reviewed SHA; backend backup/rollback image and Worker version ID recorded by owners.
- [ ] Repeat production QA and record commit/version/HTTP evidence; keep private until official deadline.
