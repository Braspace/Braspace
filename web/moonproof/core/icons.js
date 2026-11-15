// MoonProof icon set. Original line drawings, 24x24, 1.5 stroke, round caps/joins, currentColor.
// Only the logo accent uses var(--jade, currentColor) (a token, not a fixed color).
const B = {
  explore: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="3.8" ry="9"/><path d="M3 12h18"/>',
  compare: '<rect x="3.5" y="5" width="4.5" height="14" rx="1.5"/><rect x="9.75" y="5" width="4.5" height="14" rx="1.5"/><rect x="16" y="5" width="4.5" height="14" rx="1.5"/>',
  replan: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4.5v3.7h3.7"/><path d="M12 8v4l2.5 1.5"/>',
  cockpit: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M3 17h18"/><path d="M12 17l3.5-5"/>',
  evidence: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4"/><path d="M9 12.5h6M9 16h4"/>',
  lab: '<path d="M12 4 6 19M12 4l6 15"/><path d="M8.2 14h7.6"/><path d="M4.5 19.5h3M16.5 19.5h3"/>',
  logo: '<path d="M16.5 4.2A8.5 8.5 0 1 0 19.8 15 6.6 6.6 0 0 1 16.5 4.2z"/><path d="M18.5 7.5l.5-1.6.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5z" stroke="var(--jade, currentColor)"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  earth: '<circle cx="12" cy="12" r="9"/><path d="M5 8.5c2.5.5 3.5 2 3 3.5s1 2.5 2 3.5M14 4c-.5 2 1 3 3 3.5s2.5 2.5 2.5 4"/>',
  lander: '<path d="M8 10h8l1 5H7z"/><path d="M9 10V7.5a3 3 0 0 1 6 0V10"/><path d="M7 15l-3 5M17 15l3 5M3 20h3M18 20h3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  antenna: '<path d="M12 12v8M8.5 20h7"/><circle cx="12" cy="10" r="2"/><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4"/>',
  sunset: '<path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 4v5M9.5 6.5 12 9l2.5-2.5"/><path d="M5.5 12l1.5 1.2M18.5 12 17 13.2"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1.9-1.1 1.8"/><path d="M12 16.8v.01"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
  "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"/>',
  "chevron-left": '<path d="M15 5l-7 7 7 7"/>',
  "chevron-right": '<path d="M9 5l7 7-7 7"/>',
  "chevron-down": '<path d="M5 9l7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M5 19.5h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  fail: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  elevation: '<path d="M12 18V5M6.5 10.5 12 5l5.5 5.5"/><path d="M6 20.5h12"/>',
  slope: '<path d="M4 18.5h16L4 7z"/><path d="M10 18.5a6 6 0 0 0-1.5-4"/>',
  source: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5 7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>',
};

export const ICON_NAMES = Object.keys(B);

export function icon(name) {
  const body = B[name];
  if (!body) throw new Error(`icon: unknown name "${name}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-icon="${name}">${body}</svg>`;
}
