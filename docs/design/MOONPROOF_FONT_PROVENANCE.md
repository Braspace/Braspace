# MoonProof — local typography provenance and secure serving

**Current main:** BRASPACE integrated Heloísa's MoonProof core via [#182](https://github.com/Braspace/Braspace/pull/182), including the exact files from her [#171](https://github.com/Braspace/Braspace/pull/171).

The seven original local WOFF2 files under `web/moonproof/fonts/` are Manrope (400/500/600/700/800) and IBM Plex Mono (400/600). The respective `OFL-Manrope.txt` and `OFL-IBMPlexMono.txt` files contain the upstream **SIL Open Font License 1.1**. The CSS source in `web/moonproof/core/tokens.css` points to these seven assets and preserves the 8/13/21/34 px spacing rhythm and Jade `#2EC4A0`.

## Security and automated QA delta

This PR does **not duplicate fonts or replace Heloísa's component CSS**. It narrows the web preview font route from any arbitrarily named `.woff2` to exactly the seven shipped filenames. It preserves `font/woff2` MIME, `font-src 'self'` CSP and the existing request traversal guard.

`web/moonproof/tests/font-assets.test.mjs` validates actual WOFF2 signatures, each CSS reference, the license files, spacing/color tokens, denied unexpected font paths, and a real loopback HTTP/CSP test. Run it through `npm --prefix web test` and through Docker's full test target. No need for a remote font CDN or unreviewed license changes.

**Merge gate:** real CI Node 20/22 and Docker tests on this PR's exact HEAD plus review. GitHub Actions currently fails before checkout steps (issue #146); source readback alone is not a CI pass. This is an isolated code/test/documentation hardening change, not pixel-perfect design or flight certification.