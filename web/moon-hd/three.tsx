// Typed Three.js bridge: reuse Joel's scene, cap and ephemeris through the existing adapter.
// No second renderer, new geometry, GLB, shader or synthetic Moon is introduced.
import { createMoon } from "./classic-adapter.js";
import type { LunarSite } from "./mission-api.js";
export type MoonController = Awaited<ReturnType<typeof createMoon>>;
export async function mountThree(stage: HTMLElement, status: HTMLElement, start: string, unavailable: () => void, signal: AbortSignal): Promise<MoonController> {
  return createMoon(stage, status, { date: start, onUnavailable: unavailable, signal });
}
export function placeSites(scene: MoonController, sites: LunarSite[], selected?: LunarSite) {
  scene.setSites(sites.map(s => ({ id: s.id, coordinate: { latitude_deg: s.lat, longitude_deg: s.lon } })));
  if (selected) scene.focus(selected.lat, selected.lon);
}
