// BRASPACE polar elevation map component (no dependencies, ES module).
// Draws web/assets/polar-elevation-87s.webp (our render of NASA LRO LOLA
// LDEM_80S_80M), an SVG graticule, an elevation legend read from the JSON
// metadata, and focusable site markers from GET /api/sites.
// The colours are ELEVATION only. They do not show light or Earth visibility.

export interface PolarMeta {
  projection: { reference_radius_m: number };
  transform: { meters_per_pixel: number; pole_pixel: [number, number] };
  latitude_edge_deg: number;
  width_px: number; height_px: number; image: string; meters_per_pixel: number;
  elevation_m: { min: number; max: number };
  colour_ramp_low_to_high: { hex: string; t: number }[];
  source: { product: string; sha256: string; meters_per_pixel_native: number };
}
export interface PixelPoint { col: number; row: number; }
export interface Box { x1: number; y1: number; x2: number; y2: number; }
export type Anchor = "start" | "end" | "middle";
export interface Placement { dx: number; dy: number; anchor: Anchor; box: Box; hits: number; score?: number; }
/** A catalogue entry from GET /api/sites; only the fields this map reads. */
export interface MapSite { id: string; name: string; coordinate?: { latitude_deg: number; longitude_deg: number; role?: string }; [extra: string]: unknown; }
export interface MountOptions { assetBase?: string; sitesUrl?: string | null; onSelect?: (site: MapSite) => void; }

const SVG = "http://www.w3.org/2000/svg";
const DEG = Math.PI / 180;

/** Forward transform from the metadata: (lat, lon east-positive) -> image pixel. */
export function latLonToPixel(meta: PolarMeta, latDeg: number, lonDeg: number): PixelPoint {
  const R = meta.projection.reference_radius_m;
  const m = meta.transform.meters_per_pixel;
  const [pc, pr] = meta.transform.pole_pixel;
  const rho = 2 * R * Math.tan(((latDeg + 90) * DEG) / 2);
  return { col: pc + (rho * Math.sin(lonDeg * DEG)) / m, row: pr - (rho * Math.cos(lonDeg * DEG)) / m };
}

/** Inverse transform: image pixel -> (lat, lon east-positive in (-180, 180]). */
export function pixelToLatLon(meta: PolarMeta, col: number, row: number): { lat: number; lon: number } {
  const R = meta.projection.reference_radius_m;
  const m = meta.transform.meters_per_pixel;
  const [pc, pr] = meta.transform.pole_pixel;
  const x = (col - pc) * m, y = (pr - row) * m;
  const rho = Math.hypot(x, y);
  return { lat: (2 * Math.atan(rho / (2 * R))) / DEG - 90, lon: Math.atan2(x, y) / DEG };
}


function rectIntersectsSegment(r: Box, x1: number, y1: number, x2: number, y2: number): boolean {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  if (maxX < r.x1 || minX > r.x2 || maxY < r.y1 || minY > r.y2) return false;
  if (x1 === x2) return x1 >= r.x1 && x1 <= r.x2;
  if (y1 === y2) return y1 >= r.y1 && y1 <= r.y2;
  return true;
}

function rectIntersectsCircle(r: Box, cx: number, cy: number, rad: number, pad = 3): boolean {
  const nearX = Math.max(r.x1, Math.min(cx, r.x2));
  const nearY = Math.max(r.y1, Math.min(cy, r.y2));
  const farX = Math.abs(cx - r.x1) > Math.abs(cx - r.x2) ? r.x1 : r.x2;
  const farY = Math.abs(cy - r.y1) > Math.abs(cy - r.y2) ? r.y1 : r.y2;
  const dMin = Math.hypot(nearX - cx, nearY - cy);
  const dMax = Math.hypot(farX - cx, farY - cy);
  return dMin <= rad + pad && dMax >= rad - pad;
}

export function labelBox(name: string, p: PixelPoint, dx: number, dy: number, anchor: Anchor): Box {
  const w = Math.max(24, name.length * 12.2 + 8);
  const x1 = anchor === "start" ? p.col + dx : anchor === "end" ? p.col + dx - w : p.col + dx - w / 2;
  const x2 = x1 + w;
  const y1 = p.row + dy - 18;
  const y2 = p.row + dy + 6;
  return { x1, y1, x2, y2 };
}

export function countGraticuleCrossings(box: Box, meta: PolarMeta): number {
  const c = latLonToPixel(meta, -90, 0);
  const padBox = { x1: box.x1 - 4, y1: box.y1 - 4, x2: box.x2 + 4, y2: box.y2 + 4 };
  let hits = 0;
  for (const lon of [0, 90, 180, -90]) {
    const s = latLonToPixel(meta, -89, lon);
    const e = latLonToPixel(meta, meta.latitude_edge_deg, lon);
    if (rectIntersectsSegment(padBox, s.col, s.row, e.col, e.row)) hits++;
  }
  for (const lat of [-89, -88, -87]) {
    const r = latLonToPixel(meta, lat, 90).col - c.col;
    if (rectIntersectsCircle(box, c.col, c.row, r, 3)) hits++;
  }
  return hits;
}

export function chooseLabelPlacement(name: string, p: PixelPoint, meta: PolarMeta): Placement {
  const W = meta.width_px, H = meta.height_px;
  const preferRight = p.col < W * 0.72;
  const candidates: { dx: number; dy: number; anchor: Anchor }[] = preferRight
    ? [
        { dx: 11, dy: 4, anchor: "start" },
        { dx: 11, dy: -14, anchor: "start" },
        { dx: 11, dy: 24, anchor: "start" },
        { dx: 11, dy: -26, anchor: "start" },
        { dx: 11, dy: 32, anchor: "start" },
        { dx: -11, dy: -14, anchor: "end" },
        { dx: -11, dy: 24, anchor: "end" },
        { dx: -11, dy: -26, anchor: "end" },
        { dx: -11, dy: 32, anchor: "end" },
        { dx: -11, dy: 4, anchor: "end" },
        { dx: 0, dy: -16, anchor: "middle" },
        { dx: 0, dy: 24, anchor: "middle" },
      ]
    : [
        { dx: -11, dy: 4, anchor: "end" },
        { dx: -11, dy: -18, anchor: "end" },
        { dx: -24, dy: -18, anchor: "end" },
        { dx: -11, dy: 24, anchor: "end" },
        { dx: -11, dy: -26, anchor: "end" },
        { dx: -11, dy: 32, anchor: "end" },
        { dx: 11, dy: -18, anchor: "start" },
        { dx: 24, dy: -18, anchor: "start" },
        { dx: 11, dy: 24, anchor: "start" },
        { dx: 11, dy: 4, anchor: "start" },
        { dx: 0, dy: -18, anchor: "middle" },
        { dx: 0, dy: 26, anchor: "middle" },
      ];
  let best: (Placement & { score: number }) | null = null;
  for (const cand of candidates) {
    const box = labelBox(name, p, cand.dx, cand.dy, cand.anchor);
    const out = box.x1 < 12 || box.x2 > W - 12 || box.y1 < 12 || box.y2 > H - 12;
    const hits = countGraticuleCrossings(box, meta);
    const score = (out ? 100 : 0) + hits;
    if (score === 0) return { ...cand, box, hits };
    if (!best || score < best.score) best = { ...cand, box, hits, score };
  }
  return best as Placement;
}

function el(name: string, attrs: Record<string, unknown> = {}, text?: string): SVGElement {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function fmt(v: number): string { return Math.round(v).toLocaleString("en-US"); }

/**
 * Mount the map.
 * @param {HTMLElement} container
 * @param {{assetBase?: string, sitesUrl?: string|null, onSelect?: (site)=>void}} [opts]
 */
export async function mountPolarMap(container: HTMLElement, opts: MountOptions = {}): Promise<{ meta: PolarMeta; siteCount: number }> {
  const base = opts.assetBase ?? "assets/";
  const sitesUrl = opts.sitesUrl === undefined ? "/api/sites" : opts.sitesUrl;
  const meta: PolarMeta = await (await fetch(base + "polar-elevation-87s.json")).json();
  const W = meta.width_px, H = meta.height_px;

  container.classList.add("pm");
  container.replaceChildren();
  const figure = document.createElement("figure");
  figure.className = "pm-figure";
  const frame = document.createElement("div");
  frame.className = "pm-frame";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "pm-svg", role: "group",
    "aria-label": "Lunar south pole elevation map, 87°S to 90°S, polar stereographic" });
  const img = el("image", { href: base + meta.image, x: 0, y: 0, width: W, height: H,
    preserveAspectRatio: "none" });
  img.setAttribute("aria-hidden", "true");
  // Circular crop at the 87°S edge: the square image corners reach 85.6°S
  // (sides 86.9°S), outside the extent the title states.
  const c = latLonToPixel(meta, -90, 0);
  const rEdge = latLonToPixel(meta, meta.latitude_edge_deg, 90).col - c.col;
  const defs = el("defs");
  const clip = el("clipPath", { id: "pm-clip-87s" });
  clip.append(el("circle", { cx: c.col, cy: c.row, r: rEdge }));
  defs.append(clip);
  img.setAttribute("clip-path", "url(#pm-clip-87s)");
  svg.append(defs, el("rect", { x: 0, y: 0, width: W, height: H, class: "pm-outside" }), img);

  // Graticule: latitude circles and four meridians from 89°S to the 87°S edge.
  // Each line is drawn twice (white halo, then black) so it stays visible over
  // dark low terrain.
  const grid = el("g", { class: "pm-grid", "aria-hidden": "true" });
  const halo = el("g", { class: "pm-grid-halo" });
  const ink = el("g", { class: "pm-grid-ink" });
  const both = (name: string, attrs: Record<string, unknown>) => { halo.append(el(name, attrs)); ink.append(el(name, attrs)); };
  const labels: SVGElement[] = [];
  for (const lat of [-89, -88, -87]) {
    const r = latLonToPixel(meta, lat, 90).col - c.col;
    both("circle", { cx: c.col, cy: c.row, r });
    const p = latLonToPixel(meta, lat, 45);
    labels.push(el("text", { x: p.col + 6, y: p.row - 6, class: "pm-gridlabel" }, `${-lat}°S`));
  }
  for (const lon of [0, 90, 180, -90]) {
    const s = latLonToPixel(meta, -89, lon), e = latLonToPixel(meta, meta.latitude_edge_deg, lon);
    both("line", { x1: s.col, y1: s.row, x2: e.col, y2: e.row, "data-lon": lon });
  }
  grid.append(halo, ink, ...labels);
  svg.append(grid);

  // 20 km scale bar (true scale at the pole; stereographic scale grows <0.07% by 87°S).
  const barPx = 20000 / meta.meters_per_pixel;
  const sb = el("g", { class: "pm-scale", "aria-hidden": "true", transform: `translate(${W - barPx - 40} ${H - 40})` });
  sb.append(el("rect", { x: -8, y: -30, width: barPx + 16, height: 42, class: "pm-scale-bg" }));
  sb.append(el("line", { x1: 0, y1: 0, x2: barPx, y2: 0 }));
  sb.append(el("text", { x: barPx / 2, y: -10, "text-anchor": "middle" }, "20 km"));
  svg.append(sb);

  const sitesLayer = el("g", { class: "pm-sites" });
  svg.append(sitesLayer);
  frame.append(svg);

  // Meridian labels in the margin.
  for (const [cls, txt] of [["top", "0°E"], ["right", "90°E"], ["bottom", "180°E"], ["left", "90°W"]]) {
    const s = document.createElement("span");
    s.className = `pm-lon pm-lon-${cls}`;
    s.textContent = txt;
    frame.append(s);
  }

  // Legend from the JSON extremes.
  const e = meta.elevation_m;
  const legend = document.createElement("div");
  legend.className = "pm-legend";
  const stops = meta.colour_ramp_low_to_high.slice().reverse()
    .map((s: { hex: string; t: number }) => `${s.hex} ${Math.round((1 - s.t) * 100)}%`).join(", ");
  legend.innerHTML = `<div class="pm-legend-title">Elevation (meters)</div>
    <div class="pm-legend-body"><div class="pm-legend-bar"></div>
    <div class="pm-legend-ticks"><span></span><span></span><span></span></div></div>`;
  (legend.querySelector(".pm-legend-bar") as HTMLElement).style.background = `linear-gradient(to bottom, ${stops})`;
  const ticks = legend.querySelectorAll(".pm-legend-ticks span");
  ticks[0].textContent = `${fmt(e.max)} (high)`;
  ticks[1].textContent = fmt((e.max + e.min) / 2);
  ticks[2].textContent = `${fmt(e.min)} (low)`;
  frame.append(legend);

  const credit = document.createElement("figcaption");
  credit.className = "pm-credit";
  credit.textContent = `Elevation: NASA/GSFC/LOLA (LRO LOLA ${meta.source.product}, sha256 ${meta.source.sha256.slice(0, 12)}…), `
    + `resampled from ${meta.source.meters_per_pixel_native} m/px to ${meta.meters_per_pixel} m/px (2x2 mean), polar stereographic, R = 1737.4 km; heights relative to that sphere. `
    + `Shading uses a synthetic light direction for relief. Rendering: BRASPACE. Colors show elevation only.`;
  const status = document.createElement("p");
  status.className = "pm-status";
  status.setAttribute("role", "status");
  figure.append(frame, credit, status);
  container.append(figure);

  let count = 0;
  if (sitesUrl) {
    try {
      const res = await fetch(sitesUrl, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const site of (body.sites ?? []) as MapSite[]) {
        const co = site.coordinate;
        if (!co || !Number.isFinite(co.latitude_deg) || !Number.isFinite(co.longitude_deg)) continue;
        if (co.latitude_deg > meta.latitude_edge_deg) continue; // outside this map
        const p = latLonToPixel(meta, co.latitude_deg, co.longitude_deg);
        if (p.col < 0 || p.row < 0 || p.col > W || p.row > H) continue;
        const label = `${site.name}, ${Math.abs(co.latitude_deg).toFixed(4)}°S ${Math.abs(co.longitude_deg).toFixed(4)}°${co.longitude_deg < 0 ? "W" : "E"} (${co.role ?? "coordinate"})`;
        const g = el("g", { class: "pm-site", tabindex: 0, role: "button", "aria-label": label,
          transform: `translate(${p.col.toFixed(2)} ${p.row.toFixed(2)})`, "data-site-id": site.id });
        g.append(el("title", {}, label));
        g.append(el("circle", { r: 7, class: "pm-site-dot" }));
        const place = chooseLabelPlacement(site.name, p, meta);
        g.append(el("text", { x: place.dx, y: place.dy, class: "pm-site-label",
          "text-anchor": place.anchor }, site.name));
        const pick = () => { opts.onSelect?.(site); status.textContent = `Selected ${label}`; };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
        sitesLayer.append(g);
        count++;
      }
      status.textContent = `${count} catalogued sites inside 87°S. Markers are source feature centers, not landing recommendations.`;
    } catch (err) {
      status.textContent = `Sites unavailable (${(err as Error).message}). Map shown without markers.`;
    }
  }
  return { meta, siteCount: count };
}

// Auto-mount for pages that only include the script (keeps CSP script-src 'self').
if (typeof document !== "undefined") {
  for (const node of document.querySelectorAll("[data-polar-map]")) {
    mountPolarMap(node as HTMLElement, { assetBase: (node as HTMLElement).dataset.assetBase || "assets/", sitesUrl: (node as HTMLElement).dataset.sitesUrl ?? "/api/sites" });
  }
}
