# BRASPACE — Audited pull requests and merge gates
**Snapshot date:** 2026-11-14, before Space Apps submission. Default branch `main`; repository stays private. Refresh all HEAD SHA and reviews prior to merge.

## Merge results verified during this cycle
- `main` at `7814f1314a2daeeee6432ef93b1c4d2514e72207` includes #134 (server-side raw traversal guard) and earlier #131 (native-step next Sun/Earth transitions). These merges were **performed by parallel work**, not by this Studio session.
- No other PR has been merged by this Studio session. GitHub API `mergeable=true` alone means mechanically mergeable, not approved or valid.

## Priority matrix
| PR | Current branch / content | Evidence and caution | Merge policy |
| --- | --- | --- | --- |
| [#136](https://github.com/Braspace/Braspace/pull/136) | New Mission Studio: 7 screens + documented Heloísa A–H, V3, mobile, API sky/compare/recover; Go sky false attestation; agents task ledger | Draft. Chromium previously failed mobile pointer interception; test/fix ongoing on new HEAD. Node web checks green on earlier commits. | Keep draft until final HEAD green, UX/science/QA reviewed and staging served. |
| [#137](https://github.com/Braspace/Braspace/pull/137) | GitHub Pages NASA texture/GLB proxy to public API | Draft. Verify origin allowlist, asset licensing, no redirects/SSRF, anonymous deployment. | Do not bypass public asset security review. |
| [#115](https://github.com/Braspace/Braspace/pull/115) | Onboard API live values and fallback; bug `OnboardLive is not defined` was reproduced on earlier HEAD in Chromium | Parallel work subsequently added `config.js`, `live.js` static allowlist and `/v1/capabilities` proxy. Recheck **current** CI and reviewer @Ninzinhu. | No merge until final Chromium and Go/Rust/Postgres jobs pass + owner review. |
| [#102](https://github.com/Braspace/Braspace/pull/102) | Original Heloísa Polar Lab data and scientific pipeline maintenance (10-file current diff) | Eight workflow groups PASS on `2f0bf696c0f3e3366db4f5388dd5824d54b1e88d`; source-derived preliminary series not independently verified. | Human science/author review; merge only the current diff, never the stale original 67-file summary. |
| [#135](https://github.com/Braspace/Braspace/pull/135) | P0 false-validated badge guard stacked atop #116 | All four workflow groups PASS at recorded head, draft and awaits Heloísa approval. | Integrate with #116 after retarget, preserve guard. |
| [#116](https://github.com/Braspace/Braspace/pull/116) | Live bridge from Heloísa Lab to Go sites/sky/compare/recover | All four workflow groups green at stored head, but targets previous integration branch not main. | Reconcile #135 hardening first, retarget to main, rerun CI. |
| [#92](https://github.com/Braspace/Braspace/pull/92) | Source-hash-gated 87°S polar elevation asset and map component | Five group CI PASS. Human source/geo/rights reviewers requested but no submitted approvals as of snapshot. | Feature remains independent; integrate after scientific asset check. |
| [#91](https://github.com/Braspace/Braspace/pull/91) | Alternative mission dashboard shell with incomplete placeholder tabs | Only two workflow groups PASS, duplicate UI with Studio. | Product owner decides consolidation/superseding; avoid conflicting global navigation. |
| [#89](https://github.com/Braspace/Braspace/pull/89) | JPL Horizons independent angle benchmark | Draft, 53 files, evidence review. | Science owner must validate raw Horizons responses and compare methods. |
| [#90](https://github.com/Braspace/Braspace/pull/90) | Polar source evidence and visual asset rights | Draft, metadata changes, source/license checks pending. | @maccachera approval before public inclusion. |
| [#75](https://github.com/Braspace/Braspace/pull/75) | LOLA terrain horizon prototype | Draft, historical branch conflicts, math review pending. | Reconcile first, no blind merge. |
| [#82](https://github.com/Braspace/Braspace/pull/82) | Three-site visibility pipeline on #75 | Some earlier values superseded by #86 pixel correction. | Recompute/check against corrected math before merging outputs. |
| [#86](https://github.com/Braspace/Braspace/pull/86) | Half-pixel/aberration correction stacked on #75 | Parent-dependent branch. | Independent science review and exact SHA alignment. |
| [#98](https://github.com/Braspace/Braspace/pull/98) | PGDA illumination benchmark stacked on #86 | Compare percentage denominators and epochs, do not equate different definitions. | Science signoff, then parent stack merge. |
| [#80](https://github.com/Braspace/Braspace/pull/80) | SHA integrity gate stacked on #75 | Hash matching proves reproducibility, not physical accuracy. | Retarget to merged science branch. |

As of audit no submitted human reviews were recorded for the open PR set; requests for review are **not approvals**. Verify again whenever the PR head changes.

## New Studio integration facts
- Existing `web/lab/` data (Heloísa) already in main and `web/onboard/` (João Victor) not overwritten. Seven Studio screens and original A–H mockup specs live only on branch `feature/mission-studio-role-based-ux-20261114` until #136 merges.
- The public Heloísa artifact `https://claude.ai/artifact/QV5ykVW5q9HvyZsH68SPf1` exposes screenshot text, A–H mockups, V3 response/why/proof kits and tokens but **not** the private system prompt or editable canvas source. Original percentages/altitudes are expressly illustrative.
- Go `/api/sites/{id}/sky` has a native-step `next_transitions` block (from #131). Studio renders it with source-step interval rather than pretending second-accurate event timing; `scientifically_validated:false` is explicit until independently reviewed.
- `POST /api/compare` shows numbers only when `data_status=AVAILABLE`. `POST /api/scenarios/delay` receives caller-declared limits. Missing API never yields fake data.
- The 1000 task ledger and model lane specs are in `docs/agents/`. **No independent Claude Opus/Sonnet/Haiku/Hydrogen job has been started or verified by this ledger.**

## Final review/merge steps
1. Re-read HEAD and base SHA and changed file list, verify conflicts, include branches from peers and avoid accidental reversion.
2. All required Web Node 20/22, Go API, Rust, Docker/Postgres, Chromium (desktop + 390px mobile) and scientific source integrity CI green on exact new head.
3. @lisanogueira checks design fidelity and mobile; @Ninzinhu checks cockpit; @gfreiresjrp checks backend contracts; @joeljato checks science/provenance.
4. Verify original screenshot's illustrative sample values never masquerade as source-backed measurements.
5. Public app and seven-slide deck must be anonymous-accessible; repository itself can remain private. NASA submission receipt is separate; do not mark completed without evidence.
