// Shared, deterministic classroom handoff. No telemetry or scientific calculations.
import { parseHash } from "./scenario-calc.js";
/** Keep up to three Compare scenarios (including repeated sites with different windows). */
export function classroomWindows(sites, hash, defaults) {
    const requested = parseHash(hash).sc.flatMap(ref => {
        const site = sites.find(s => s.id === ref.site);
        return site ? [{ site, start: ref.start ?? defaults.start, hours: ref.hours ?? defaults.hours }] : [];
    });
    return requested.length ? requested : sites.slice(0, 3).map(site => ({ site, start: defaults.start, hours: defaults.hours }));
}

/** UTC label for a classroom scenario. Never invent the catalogue's default start. */
export function classroomWindowLabel(item) {
    const ms = item.start == null ? NaN : Date.parse(item.start);
    return {
        startUtc: Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : null,
        hours: item.hours || 336,
    };
}
