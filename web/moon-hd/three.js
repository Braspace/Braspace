// Typed Three.js bridge: reuse Joel's scene, cap and ephemeris through the existing adapter.
// No second renderer, new geometry, GLB, shader or synthetic Moon is introduced.
import { createMoon } from "./classic-adapter.js";
export async function mountThree(stage, status, start, unavailable, signal) {
    return createMoon(stage, status, { date: start, onUnavailable: unavailable, signal });
}
export function placeSites(scene, sites, selected) {
    scene.setSites(sites.map(s => ({ id: s.id, coordinate: { latitude_deg: s.lat, longitude_deg: s.lon } })));
    if (selected)
        scene.focus(selected.lat, selected.lon);
}
