# Cockpit 3D Artemis / Joel Moon HD

## Scope

This isolated change adds an operational view to MoonProof Cockpit, not a new app. Existing Cockpit API calculations, timelines, site selection, crew and report functionality remain in place. The persistent overlay uses Preact TSX controls and the existing Joel Moon HD (`web/moon-hd/scene.ts`, `polar-math.ts`, `web/data/moonhd/manifest.json`) NASA LRO/LOLA south-cap renderer. It does not calculate mission safety or alter API responses.

- Select a catalogued site from the 3D marker or existing cockpit controls. Markers align to the same polar coordinate and height-grid transform as the shader. Out-of-range coordinates are not invented.
- Hardware WebGL2 only; bounded DPR, 320 m wide grid on mobile, native 80 m inner grid on desktop, on-demand camera updates. Fixed illustrative illumination; no predicted shadows. Zoom and rotation work through touch/drag, wheel and 44px keyboard-accessible controls.
- The illustrative original Artemis-inspired lander geometry is shared by the Cockpit and the existing educational Landing Lab. Its regional display scale and position above the map are exaggerated for visibility. This is not an actual Artemis vehicle, CAD, trajectory, mission altitude, NASA-certified model or a physics change.
- A 2D LOLA registered map remains interactive during loading, cancellation, timeout, unsupported GPU and context loss. Switching to 3D disables duplicate 2D marker keyboard focus and hides the 2D-only rays; scientific values remain in the panels. On return all 2D controls are restored.
- On unmount, dispose the scene and GPU resources. On hidden tabs, no rendering loop runs. Camera orientation is user-controlled rather than automatically animating.

## Reconciliation before merge

Main had one Canvas2D terrain, with no WebGL on Cockpit. #319 adds a background WebGL viewer; #321 adds the separate `mountStereoRelief` WebGL renderer under every 2D map. Do not activate either renderer concurrently with the new cockpit overlay. Remove the Cockpit's lazy background script or scope it to other screens. For #321's `mountTerrain`, add an options-level opt-out for stereo relief in Cockpit (retain the LOLA Canvas2D map). Reconcile the import and initialization hunks of `cockpit.tsx` and the `addLander` hunk of `lab/scene.ts` with those branches. Keep the shared renderer modules and their API contracts. PR #324 adds independent collapsible panel controls in HTML/CSS; this patch follows panel measurements.

## Local evidence

TypeScript 5.6.3 with the repository's strict `web/tsconfig.json` passed on the connector-retrieved module and dependency fixture. The targeted Node tests exercise registered coordinates, native/wide terrain blend, missing/out-of-bounds coordinates, camera limits and shared ship wiring. Generated JS uses that exact TypeScript version. Full repository CI, Cloudflare asset serving, real GPU screenshots, device matrix, assistive technology and visual alignment remain release verification gates.
