# MoonProof — audit fixes and known gaps (15 Nov 2026)

Source: the user's 13:50 and 15:00 Chrome review of the published /moonproof prototype.
Baseline: \`96411afd58748313f3ed336dfbe30084a49852dd\`.

## In scope and implemented

- **True entry-by-task:** Explore opens \`explore.html\`; Teach opens \`activity.html\` (with the existing projector path in \`present.html\`); Plan opens the existing \`plan.html\` with editable rules and exports; Skip goes to Explore. Remove the false claim that the unused first-visit 3-step tour is already built.
- **No global task-as-layer mode:** Remove the global Class/Plan state toggles and context-bar "Open in" dropdown. Per-card Answer / Why / Proof controls remain unchanged. Reorder existing navigation by selected task without deleting any destination.
- **Compare context and safe-looking UI:** The first default comparison is the actual selected \`?site=\`, if present in the catalog. Selecting a failing scenario does not make it green. A failing or uncomputed scenario offers the explanation layer instead of advertising a passing landing; valid scenarios can still open the explicitly educational landing simulator.
- **Language / nomenclature:** Mobile and desktop Evidence labels agree; PT-BR Landing Lab / Debrief labels are translated. Browser-tab titles update from the selected language in entry and shell.
- **Exit to source:** Landing Lab's back link returns to a supported same-origin referring MoonProof page; direct visits fall back to Compare.
- **Synchronized source / runtime:** Update both TypeScript/TSX source files and committed JS artifacts, and add a regression test.

## Still open / not claimed fixed

- **Numerical integrity:** Cockpit displays synthetic model results; do not compare its solar angles as if they were real LOLA/SPICE samples. A separate verified onboard science integration is necessary. Audit dynamic catalog/series counts and scientific provenance before changing labels.
- **Site/scenario legend:** Standardize \`N · location\` identifiers across Explore/Compare/Recover. Clarify B′/B″ and remove duplicate map letters/loose pin. Not changed to avoid an unreviewed relabelling of scenario identities.
- **Recover:** Its +48 h default still skips the "choose a delay" step. Correct this as an explicit product-state change, with tests, rather than silently altering scientific calculations.
- **Visual bugs:** Lower dock versus "Sun in the window" chart, fixed floating Explore CTA, crater labels over panels, Compare loading skeleton, truncated comparison chips, markers under header, vertical-speed tick spacing and clipped units, the untranslated strings remaining across panels.
- **Access:** Complete mobile, keyboard and screen-reader audit; remove 0×0 focus targets and ensure real interactive map targets are discoverable. No claim of WCAG compliance in this PR.
- **Landing navigation:** Back is improved, but the full persistent shared menu is not implemented inside the immersive simulation.
- **Parallel changes:** Separate PRs already address canonical Cockpit, accessibility, and performance. Coordinate conflicts before merging.

## Required verification before production

1. \`npm --prefix web run build:ts\` and ensure generated files are in sync; \`npm --prefix web run check:ts\`.
2. \`npm --prefix web run lint\`; \`npm --prefix web test\`; \`node --test web/moonproof/tests/audit-task-flow-20261115.test.mjs\`.
3. Browser smoke: all three entry cards; selected site carried Explore → Compare; a failing scenario never shown green; valid scenario can open Landing; source-aware back navigation works.
4. Chrome desktop 1490×760 and Safari/WebKit mobile ~390px with keyboard focus and screenshot review.
5. Final HEAD checks, review, deployment and signed-off NASA submission are separate actions. None are claimed completed here.

No scientific dataset or mission result is modified by this patch.