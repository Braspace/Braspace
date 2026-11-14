# MoonProof V3 — typographic fidelity: Manrope + IBM Plex Mono

**Design reference:** Heloísa's MoonProof V3 (A–H, mobile and classroom/planner kits). **Integration scope:** typography only. This change does not claim pixel-perfect fidelity, flight validation, or unrestricted access to the original private Claude artifact.

## Provenance and licensing

- Both type families are reused by **exact Git blob SHA** from [BRASPACE PR #171](https://github.com/Braspace/Braspace/pull/171), not copied from an unverified font mirror.
- Manrope weights: 400, 500, 600, 700, 800.
- IBM Plex Mono weights: 400, 600.
- WOFF2 assets are in `web/moonproof/fonts/`. The complete licenses are in `OFL-Manrope.txt` and `OFL-IBMPlexMono.txt` alongside them. Both families are under **SIL Open Font License 1.1**.
- `core/tokens.css` defines self-hosted `@font-face` declarations and preserves existing Fibonacci spacing and Jade `#2EC4A0` tokens.
- `web/dev-server.mjs` serves only the seven exact allowlisted font names, with `font/woff2` MIME. No exposure of design notes, licensed text files or arbitrary directory paths.
- Production `Dockerfile.web` already copies `web/`, so the font files are included without introducing network dependencies; the existing `font-src 'self'` CSP is retained.

## Reproducible test evidence

Run `npm --prefix web test` for the complete Node suite. This includes `web/moonproof/tests/font-assets.test.mjs`, which checks WOFF2 signatures and size, CSS declarations, design tokens, licenses, allowlist restrictions and a loopback HTTP fetch including content type and CSP.

**Execution status:** created as an isolated draft PR pending CI and Heloísa's visual review. The real EXO-X1/VPS and GitHub runners must execute the test before a green claim. The fonts alone do not close PR #171: its navigation/glass/terrain improvements remain a distinct, reviewable integration.
