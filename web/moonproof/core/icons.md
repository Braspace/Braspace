# MoonProof icons (`core/icons.js`)

`import { icon, ICON_NAMES } from "./icons.js"; el.innerHTML = icon("sun");`

24×24 viewBox, stroke 1.5, round caps/joins, `fill="none"`, `stroke="currentColor"`. Size with CSS/`width`/`height`. Original drawings by the BRASPACE team (agent Luana), no third-party library. Only `logo` accent uses `var(--jade, currentColor)`.

| name | use |
|---|---|
| explore, compare, replan, cockpit, evidence, lab | nav pills + mobile bottom bar (Explorar, Comparar, Replanejar, Cockpit, Evidências, Landing Lab) |
| logo | moonproof crescent with jade sparkle |
| sun, earth | Sol / Terra markers |
| lander, compass, antenna, sunset | lander module, compass, antenna, sunset |
| pause, restart, help, close | controls |
| arrow-left/right/up/down, chevron-left/right/down | arrows |
| plus, minus, download, check, fail | actions; `fail` = ✕ failure (never colour only) |
| elevation, slope, source | metric rows / principle chip |

Unknown name throws. Test: `moonproof/tests/core-icons.test.mjs`.
