// Canonical product entry: one MoonProof cockpit; preserve scenario, locale, layer and fragment.
// Optional Explore/Teach/Plan tools remain at tasks.html (unchanged Preact entry module).
export function cockpitEntryURL(href: string): string {
  const current = new URL(href);
  if (current.pathname.endsWith("/moonproof")) current.pathname += "/";
  const target = new URL("cockpit.html", current);
  target.search = current.search;
  target.hash = current.hash;
  return target.href;
}

export function openCockpit(locationRef: Pick<Location, "href" | "replace">, fallback?: Pick<HTMLAnchorElement, "href"> | null): void {
  const target = cockpitEntryURL(locationRef.href);
  if (fallback) fallback.href = target;
  locationRef.replace(target);
}

if (typeof document !== "undefined") openCockpit(location, document.querySelector<HTMLAnchorElement>("#cockpit-entry"));
