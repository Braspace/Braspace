// Full-screen terrain: hillshade of the NASA LOLA 400 m south-pole grid (web/lab/terrain.js
// TerrainGrid), numbered site markers at their stereographic x/y and a dotted route.
// BR91: the relief is shaded per DEVICE pixel (bilinear heights, devicePixelRatio) instead of
// stretching an 850×850 bitmap, and the view keeps the chosen site in the FREE area of the
// screen (viewport minus the fixed panels laid over the map).
import { loadRegion } from "./data.js";
import { t } from "./i18n.js";

// Two lights (key from the upper left, soft fill from the right) + slope occlusion, grey ramp.
const KEY = norm([-0.62, 0.52, 0.58]), FILL = norm([0.7, -0.2, 0.68]);
function norm(v) { const k = Math.hypot(...v); return v.map(x => x / k); }

/** Height at fractional grid coords (bilinear; NaN outside or on nodata). */
function hAt(grid, fi, fj) {
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= grid.nx - 1 || j >= grid.ny - 1) return NaN;
  const a = fi - i, b = fj - j, d = grid.data, n = grid.nx, p = j * n + i;
  return (d[p] * (1 - a) + d[p + 1] * a) * (1 - b) + (d[p + n] * (1 - a) + d[p + n + 1] * a) * b;
}

/** Shade value 0..255 for a gradient (hx, hy) in m/m; exaggeration z for legibility. */
export function shadeValue(hx, hy, z = 2.2) {
  const nx = -hx * z, ny = -hy * z, nz = 1, len = Math.hypot(nx, ny, nz);
  const k = Math.max(0, (nx * KEY[0] + ny * KEY[1] + nz * KEY[2]) / len);
  const f = Math.max(0, (nx * FILL[0] + ny * FILL[1] + nz * FILL[2]) / len);
  const slope = 1 - nz / len; // 0 flat .. 1 vertical
  const v = 6 + 215 * Math.pow(k, 2.0) + 18 * f - 48 * slope;
  return Math.max(3, Math.min(235, v));
}

/** Render the relief into an ImageData of w×h device pixels for the given view (metres). */
function renderRelief(grid, w, h, left, top, mppDev) {
  const img = new ImageData(w, h), d = img.data, dx = grid.dx, x0 = grid.x0, y0 = grid.y0;
  const e = 0.5; // half-cell step for the gradient, in grid cells (finer than 1 → crisper ridges)
  for (let py = 0; py < h; py++) {
    const y = top - py * mppDev, fj = (y - y0) / dx;
    for (let px = 0; px < w; px++) {
      const x = left + px * mppDev, fi = (x - x0) / dx, p = (py * w + px) * 4;
      const hx = (hAt(grid, fi + e, fj) - hAt(grid, fi - e, fj)) / (2 * e * dx);
      const hy = (hAt(grid, fi, fj + e) - hAt(grid, fi, fj - e)) / (2 * e * dx);
      if (!Number.isFinite(hx + hy)) { d[p] = 7; d[p + 1] = 9; d[p + 2] = 12; d[p + 3] = 255; continue; }
      const v = shadeValue(hx, hy);
      d[p] = v; d[p + 1] = v + 2; d[p + 2] = v + 7; d[p + 3] = 255;
    }
  }
  return img;
}

/**
 * Free map area = viewport minus the fixed overlays (top nav, context bar, side panels, dock,
 * bottom nav, mobile sheet). Exported for tests and screens. Returns {l, t, r, b} in CSS px.
 */
export function freeArea(W, H, rects) {
  let l = 0, tp = 0, r = W, b = H;
  for (const q of rects) {
    if (!q || q.width < 4 || q.height < 4) continue;
    if (q.width < W * .45 && q.right < W * .42) l = Math.max(l, q.right);
    else if (q.width < W * .45 && q.left > W * .58) r = Math.min(r, q.left);
    else if (q.bottom < H * .4) tp = Math.max(tp, q.bottom);
    else if (q.top > H * .5) b = Math.min(b, q.top);
  }
  const pad = 36; // marker radius + label
  l += pad; tp += pad; r -= pad; b -= pad + 18;
  if (r - l < W * .2) { const c = (l + r) / 2; l = c - W * .1; r = c + W * .1; }
  if (b - tp < H * .2) { const c = (tp + b) / 2; tp = c - H * .1; b = c + H * .1; }
  return { l, t: tp, r, b };
}

function overlayRects(container) {
  const out = [];
  // Screens may wrap their fixed panels in a non-positioned container: look one level inside it.
  const els = [...document.body.children].flatMap(e => { const c = getComputedStyle(e); return c.display === "contents" || (c.position === "static" && c.display !== "none") ? [...e.children] : [e]; });
  for (const el of els) {
    if (el === container || el.contains(container) || el.hidden) continue;
    const cs = getComputedStyle(el); if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width >= innerWidth * .9 && r.height >= innerHeight * .9) continue; // full-screen overlay (e.g. rays svg), not a panel
    out.push(r);
  }
  return out;
}

// Y01: sharp LOLA backgrounds of PR 178 (web/moonproof/assets/terrain-*.webp + projection .json).
// The image is the base; the 400 m grid stays for altitude lookups only (grid.heightAt etc.).
export const BACKGROUNDS = { shade87: "terrain-shade-87s", shade84: "terrain-shade-84s", altitude87: "terrain-altitude-87s" };
const ASSETS = new URL("../assets/", import.meta.url).href;
const R_MOON = 1737400;

/** Polar stereographic x/y (m) of a lat/lon, same forward transform as the background .json. */
export function stereo(latDeg, lonDeg, R = R_MOON) {
  const rho = 2 * R * Math.tan((90 + latDeg) * Math.PI / 360), l = lonDeg * Math.PI / 180;
  return [rho * Math.sin(l), rho * Math.cos(l)];
}

/** Image pixel (col,row; centre convention) of stereo metres, from the background .json transform. */
export function bgPixel(meta, x, y) {
  const t = meta.transform, [pc, pr] = t.pole_pixel, m = t.meters_per_pixel;
  return [pc + x / m, pr - y / m];
}

/**
 * Greedy label placement: tries centred, above, below, right, left of the anchor; drops a label that
 * collides with a placed one or with a blocked rect (panels/markers). boxes: {x,y,w,h} CSS px, x/y = centre.
 */
export function placeLabels(items, blocked = []) {
  const hit = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  const out = [], taken = blocked.map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }));
  for (const it of items) {
    const offs = [[0, 0], [0, -it.h - 2], [0, it.h + 2], [it.w / 2 + 8, 0], [-it.w / 2 - 8, 0]];
    for (const [ox, oy] of offs) {
      const b = { ...it, x: it.x + ox, y: it.y + oy };
      if (!taken.some(q => hit(b, q))) { out.push(b); taken.push(b); break; }
    }
  }
  return out;
}

async function loadBackground(name) {
  const meta = await fetch(ASSETS + name + ".json").then(r => { if (!r.ok) throw new Error(name + " " + r.status); return r.json(); });
  const img = new Image(); img.decoding = "async"; img.src = ASSETS + meta.image;
  await img.decode();
  return { meta, img };
}
let featP = null;
function loadFeatures() {
  return featP ||= fetch(new URL("../data/features.json", import.meta.url)).then(r => r.ok ? r.json() : { features: [] })
    .then(d => (d.features || []).map(f => { const [x, y] = stereo(f.lat, f.lon_e); return { name: f.name, type: f.type, d: f.diameter_km, stereo_x_m: x, stereo_y_m: y }; }))
    .catch(() => []);
}

/**
 * mountTerrain(container, { sites, selected, route, onSelect })
 *  sites: [{ id, n, name, stereo_x_m, stereo_y_m }]; route: [siteId, ...] dotted line.
 * Returns Promise<{ select(id), zoom(f), redraw(), grid, el }>.
 */
export async function mountTerrain(container, { sites = [], selected = null, route = [], onSelect, labels: showLabels = true, background = "shade87" } = {}) {
  container.classList.add("mp-terrain");
  Object.assign(container.style, { position: "fixed", inset: "0", overflow: "hidden", background: "var(--bg)" });
  const [grid, bgs, features] = await Promise.all([loadRegion(),
    Promise.all([loadBackground(BACKGROUNDS[background] || BACKGROUNDS.shade87), loadBackground(BACKGROUNDS.shade84)]).catch(() => null), showLabels ? loadFeatures() : []]);
  const cv = document.createElement("canvas"); cv.setAttribute("role", "img"); cv.setAttribute("aria-label", t("terrain.label"));
  Object.assign(cv.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  const labels = document.createElement("div"); labels.className = "mp-terrain-labels"; labels.setAttribute("aria-hidden", "true");
  const layer = document.createElement("div"); Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  container.append(cv, labels, layer);
  container.dataset.background = bgs ? bgs[0].meta.image : "grid";
  const xs = sites.map(s => s.stereo_x_m), ys = sites.map(s => s.stereo_y_m);
  const view = { cx: xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy: ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0,
    span: xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.6 + 30000 : grid.nx * grid.dx };
  container.dataset.features = String(features.length);
  let lastMpp = 0, sel = selected, free = null, relief = null, reliefKey = "";
  // Extent the view may show: the wider background (84°S) when loaded, else the grid.
  const ext = bgs ? 2 * bgs[1].meta.bounds.square_half_width_m : grid.nx * grid.dx;
  const ox = bgs ? -ext / 2 : grid.x0, oy = bgs ? -ext / 2 : grid.y0;
  function frame(W, H) {
    free = freeArea(W, H, overlayRects(container));
    const fw = free.r - free.l, fh = free.b - free.t;
    let mpp = view.span / Math.min(fw, fh); mpp = Math.min(mpp, ext / Math.max(W, H));
    const fcx = (free.l + free.r) / 2, fcy = (free.t + free.b) / 2;
    const place = m => { const hw = W * m / 2, hh = H * m / 2;
      let x = view.cx - (fcx - W / 2) * m, y = view.cy + (fcy - H / 2) * m;
      x = Math.min(ox + ext - hw, Math.max(ox + hw, x)); y = Math.min(oy + ext - hh, Math.max(oy + hh, y));
      const px = W / 2 + (view.cx - x) / m, py = H / 2 - (view.cy - y) / m;
      return { x, y, ok: px >= free.l && px <= free.r && py >= free.t && py <= free.b }; };
    let pl = place(mpp);
    for (let k = 0; k < 12 && !pl.ok; k++) { mpp *= .85; pl = place(mpp); }
    return { mpp, sx: pl.x, sy: pl.y };
  }
  // Draw one background image so that stereo metres map through its own .json transform.
  function drawBg(g, bg, W, H, sx, sy, mpp) {
    const m = bg.meta.transform.meters_per_pixel, [c0, r0] = bgPixel(bg.meta, sx - W * mpp / 2, sy + H * mpp / 2);
    const k = m / mpp; // CSS px per image px
    g.drawImage(bg.img, 0, 0, bg.img.naturalWidth, bg.img.naturalHeight, -(c0 + .5) * k, -(r0 + .5) * k, bg.img.naturalWidth * k, bg.img.naturalHeight * k);
  }
  function draw() {
    const W = container.clientWidth, H = container.clientHeight, dpr = Math.min(3, devicePixelRatio || 1);
    if (!W || !H) return;
    const { mpp, sx, sy } = frame(W, H); lastMpp = mpp;
    container.dataset.free = [free.l, free.t, free.r, free.b].map(Math.round).join(",");
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#07090C"; g.fillRect(0, 0, W, H);
    if (bgs) {
      g.imageSmoothingQuality = "high";
      // One image per frame (no seam): the sharp 87°S one when the whole view fits in it, else the 84°S one.
      const half = bgs[0].meta.bounds.square_half_width_m, hw = W * mpp / 2, hh = H * mpp / 2;
      const inner = Math.abs(sx) + hw <= half && Math.abs(sy) + hh <= half, bg = inner ? bgs[0] : bgs[1];
      container.dataset.background = bg.meta.image; drawBg(g, bg, W, H, sx, sy, mpp);
    } else {
      const key = [w, h, sx.toFixed(1), sy.toFixed(1), mpp.toFixed(4)].join();
      if (key !== reliefKey) { relief = renderRelief(grid, w, h, sx - W * mpp / 2, sy + H * mpp / 2, mpp / dpr); reliefKey = key; }
      g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(relief, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Design A: dark, cool night tone over the relief (cosmetic grade, no data meaning).
    g.fillStyle = "rgba(10,22,48,.08)"; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .78);
    vg.addColorStop(0, "rgba(7,9,12,0)"); vg.addColorStop(1, "rgba(7,9,12,.6)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const toPx = (x, y) => [W / 2 + (x - sx) / mpp, H / 2 - (y - sy) / mpp];
    const pts = route.map(id => sites.find(s => s.id === id)).filter(Boolean).map(s => toPx(s.stereo_x_m, s.stereo_y_m));
    if (pts.length > 1) { g.setLineDash([1, 9]); g.lineCap = "round"; g.lineWidth = 2.4; g.strokeStyle = "#F2F4F5"; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]); }
    layer.replaceChildren(...sites.map(s => {
      const [x, y] = toPx(s.stereo_x_m, s.stereo_y_m);
      const b = document.createElement("button"); b.type = "button"; b.className = "mp-marker"; b.dataset.site = s.id;
      b.textContent = s.n; b.setAttribute("aria-label", t("terrain.marker", { n: s.n, name: s.name })); b.setAttribute("aria-pressed", String(s.id === sel));
      Object.assign(b.style, { left: x + "px", top: y + "px" });
      b.onclick = () => { api.select(s.id); onSelect && onSelect(s.id); };
      const lab = document.createElement("span"); lab.className = "mp-marker-label"; lab.textContent = s.name; b.append(lab);
      return b;
    }));
    requestAnimationFrame(() => {
      const panels = overlayRects(container);
      for (const b of layer.children) {
        const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = cx >= 0 && cy >= 0 && cx < W && cy < H ? document.elementFromPoint(cx, cy) : null;
        b.dataset.covered = String(!(hit && (hit === b || b.contains(hit))) && b.getAttribute("aria-pressed") !== "true");
      }
      // IAU names: white, no box; larger features first; hidden under panels, markers and each other.
      const marks = [...layer.querySelectorAll(".mp-marker:not([data-covered=true]), .mp-marker:not([data-covered=true]) .mp-marker-label")].map(e => e.getBoundingClientRect());
      const cands = features.filter(f => !sites.some(s => s.name && f.name && s.name.startsWith(f.name))).sort((a, b) => b.d - a.d)
        .map(f => { const [x, y] = toPx(f.stereo_x_m, f.stereo_y_m); return { f, x, y, w: f.name.length * 7 + 6, h: 16 }; })
        .filter(c => c.x > c.w / 2 && c.y > 8 && c.x < W - c.w / 2 && c.y < H - 8);
      const placed = placeLabels(cands, [...panels, ...marks]).slice(0, 8);
      labels.replaceChildren(...placed.map(p => { const s = document.createElement("span"); s.className = "mp-feature";
        s.dataset.type = p.f.type; s.textContent = p.f.name; Object.assign(s.style, { left: p.x + "px", top: p.y + "px" }); return s; }));
      container.dataset.labels = String(placed.length);
    });
  }
  const api = { el: container, grid, view,
    select(id) { sel = id; const s = sites.find(x => x.id === id); if (s) { view.cx = s.stereo_x_m; view.cy = s.stereo_y_m; } draw(); },
    zoom(f) { view.span = Math.min(ext, Math.max(4000, view.span / f)); draw(); }, redraw: draw,
    get free() { return free; }, get mpp() { return lastMpp; } };
  let pending = 0, lastFree = "";
  const reframe = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0;
    const f = JSON.stringify(freeArea(container.clientWidth, container.clientHeight, overlayRects(container)));
    if (f !== lastFree) { lastFree = f; draw(); } }); };
  new MutationObserver(reframe).observe(document.body, { childList: true, subtree: true });
  if (globalThis.ResizeObserver) { const ro = new ResizeObserver(reframe); for (const el of document.body.children) if (el !== container) ro.observe(el); }
  addEventListener("resize", draw);
  if (document.fonts?.ready) document.fonts.ready.then(reframe);
  draw();
  return api;
}
