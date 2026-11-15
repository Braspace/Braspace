# Archived web surfaces (2026-11-15)

Owner decision: **MoonProof is the only product surface** (`web/moonproof/`, plus the Three.js
viewer `web/moon-hd.html`). Everything here was moved with `git mv`, so history and authorship are
kept; nothing is served by `web/dev-server.mjs` and nothing here is compiled or tested by CI.

| Archived | Original owner / PR |
|---|---|
| `index.html`, `shell/`, `ds/`, `assets/` — v3 task-first shell (`/#/explorar`, …) | team, PRs #281/#287 |
| `classic.html`, `app.*`, `moon3d.*`, `styles.css` — MoonProof Classic | team |
| `lab.html`, `lab/app.*`, `lab/live.*`, `lab/backend-widget.*`, `lab/lab.css` — Polar Lab page | Heloísa, PR #102 |
| `studio/` — Mission Studio | PR #136 |
| `onboard/` — onboard trainer and cockpit | João Victor, PR #115 |
| `dashboard/`, `polar-map*` | team |
| `moon-hd/classic-adapter.*` — Classic's Moon HD adapter | Joel/BRASPACE |
| `tests/` — tests that only cover the surfaces above | — |

Still live and **not** archived: the shared Lab modules MoonProof imports
(`web/lab/{coords,data,physics,scene,terrain,backend-bridge}`), `web/moon-hd/*`, `web/data/`, the Go API,
Rust engine and PostgreSQL/pgvector.

To restore a surface: `git mv archive/web-legacy/<path> web/<path>`, add its routes back to the
`web/dev-server.mjs` allowlist, its files to `npm run lint`, and its tests to `web/tests/`.
