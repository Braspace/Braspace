// Shared, deterministic classroom handoff. No telemetry or scientific calculations.
import { parseHash } from "./scenario-calc.js";

export interface ClassroomWindow<T extends { id: string }> {
  site: T;
  start: string | null;
  hours: number | null;
}

/** Keep up to three Compare scenarios (including repeated sites with different windows). */
export function classroomWindows<T extends { id: string }>(
  sites: readonly T[], hash: string, defaults: { start: string | null; hours: number | null }
): ClassroomWindow<T>[] {
  const requested = parseHash(hash).sc.flatMap(ref => {
    const site = sites.find(s => s.id === ref.site);
    return site ? [{ site, start: ref.start ?? defaults.start, hours: ref.hours ?? defaults.hours }] : [];
  });
  return requested.length ? requested : sites.slice(0, 3).map(site => ({ site, start: defaults.start, hours: defaults.hours }));
}
