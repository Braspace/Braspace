// Full-screen terrain: hillshade of the NASA LOLA 400 m south-pole grid (web/lab/terrain.js
// TerrainGrid), numbered site markers at their stereographic x/y and a dotted route.
// BR91: the relief is shaded per DEVICE pixel (bilinear heights, devicePixelRatio) instead of
// stretching an 850×850 bitmap, and the view keeps the chosen site in the FREE area of the
// screen (viewport minus the fixed panels laid over the map).
import { loadRegion, loadRegionHeader } from "./data.js";
import { t } from "./i18n.js";
// Read at load: core/state rewrites the query string once the screen starts.
const RELIEF_2D = typeof location !== "undefined" && new URLSearchParams(location.search).get("relief") === "2d";
// @ts-ignore TS7016
import { southStereoForward } from "../../lab/coords.js";
// Two lights (key from the upper left, soft fill from the right) + slope occlusion, grey ramp.
const KEY = norm([-0.62, 0.52, 0.58]), FILL = norm([0.7, -0.2, 0.68]);
function norm(v) { const k = Math.hypot(...v); return v.map(x => x / k); }
function hAt(grid, fi, fj) {
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= grid.nx - 1 || j >= grid.ny - 1)
        return NaN;
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
            if (!Number.isFinite(hx + hy)) {
                d[p] = 7;
                d[p + 1] = 9;
                d[p + 2] = 12;
                d[p + 3] = 255;
                continue;
            }
            const v = shadeValue(hx, hy);
            d[p] = v;
            d[p + 1] = v + 2;
            d[p + 2] = v + 7;
            d[p + 3] = 255;
        }
    }
    return img;
}
export function freeArea(W, H, rects) {
    let l = 0, tp = 0, r = W, b = H;
    for (const q of rects) {
        if (!q || q.width < 4 || q.height < 4)
            continue;
        if (q.top < H * .25 && q.bottom > H * .75)
            continue; // full-height overlay (rays SVG, glass backdrop): not a panel
        if (q.width < W * .45 && q.right < W * .42)
            l = Math.max(l, q.right);
        else if (q.width < W * .45 && q.left > W * .58)
            r = Math.min(r, q.left);
        else if (q.bottom < H * .4)
            tp = Math.max(tp, q.bottom);
        else if (q.top > H * .5 || q.bottom > H * .6)
            b = Math.min(b, q.top); // phone sheet starts near 43%
    }
    const pad = 36; // marker radius + label
    l += pad;
    tp += pad;
    r -= pad;
    b -= pad + 18;
    if (r - l < W * .2) {
        const c = (l + r) / 2;
        l = c - W * .1;
        r = c + W * .1;
    }
    // Cramped (phone: context bar + sheet): keep the marker between the real bars with a tight pad (radius 24 above, label 40 below) instead of growing into them.
    if (b - tp < H * .2) {
        tp -= pad - 24;
        b += pad + 18 - 40;
    }
    if (b - tp < 8) {
        const c = (tp + b) / 2;
        tp = c - 4;
        b = c + 4;
    }
    return { l, t: tp, r, b };
}
function overlayRects(container) {
    const out = [];
    for (const el of document.body.querySelectorAll("body > *")) {
        if (el === container || el.contains(container) || el.hidden)
            continue;
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none")
            continue; // decorations (Sun/Earth icons and tags) never move the frame
        out.push(el.getBoundingClientRect());
    }
    return out;
}
export function placeLabels(items, blocked = []) {
    const hit = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
    const out = [], taken = blocked.map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }));
    for (const it of items) {
        for (const [ox, oy] of [[0, 0], [0, -it.h - 2], [0, it.h + 2], [it.w / 2 + 8, 0], [-it.w / 2 - 8, 0]]) {
            const b = { ...it, x: it.x + ox, y: it.y + oy };
            if (!taken.some(q => hit(b, q))) {
                out.push(b);
                taken.push(b);
                break;
            }
        }
    }
    return out;
}
// IAU/USGS names (data/features.json, label only). Lat/lon → stereo metres with the same forward
// transform as the sites; a failed fetch means no labels, never invented ones.
const MAX_LABELS = 8;
let featP = null;
function loadFeatures() {
    return featP ||= fetch(new URL("../data/features.json", import.meta.url)).then(r => r.ok ? r.json() : { features: [] })
        .then((d) => (d.features || []).map(f => { const [x, y] = southStereoForward(f.lat, f.lon_e); return { name: f.name, type: f.type, d: f.diameter_km, stereo_x_m: x, stereo_y_m: y }; }))
        .catch(() => []);
}
export async function mountTerrain(container, { sites = [], selected = null, route = [], onSelect, labels = true, progressive = false, onDraw } = {}) {
    container.classList.add("mp-terrain");
    // No background yet: until a relief is drawn the page's decorative poster (moon-hd/preview.css) shows through,
    // instead of a black box. The heights (1.4 MB) load in parallel; only the ~1 KB header is awaited here.
    Object.assign(container.style, { position: "fixed", inset: "0", overflow: "hidden" });
    const head = await loadRegionHeader();
    const geo = { nx: head.nx, dx: head.spacing_m, x0: head.origin_x_m, y0: head.origin_y_m };
    let grid = null;
    const cv = document.createElement("canvas");
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", t("terrain.label"));
    Object.assign(cv.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    const labelsEl = document.createElement("div");
    labelsEl.className = "mp-terrain-labels";
    labelsEl.setAttribute("aria-hidden", "true");
    const layer = document.createElement("div");
    Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    container.append(cv, labelsEl, layer);
    // Joel Moon HD relief (same LOLA grids as the 3D viewer, 80 m near the pole) under the 2D canvas, in the
    // same stereographic projection, so markers, rays and routes stay where they are. Hardware WebGL only;
    // ?relief=2d, no WebGL or a lost context keep the original LOLA 400 m hillshade. Phones get the 320 m grid
    // only (the existing wideOnly level of detail): the 80 m grid is 8.4 MB.
    // All state the async loaders below touch is declared first: a cached grid resolves in a microtask and
    // would otherwise hit these bindings in their temporal dead zone (ReferenceError on explore/compare).
    // view: centre (metres) and span (metres across the free area's short side).
    const xs = sites.map(s => s.stereo_x_m), ys = sites.map(s => s.stereo_y_m);
    const view = { cx: xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy: ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0,
        span: xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.6 + 30000 : geo.nx * geo.dx };
    let features = [];
    let lastMpp = 0, lastSx = 0, lastSy = 0, lastW = 0, lastH = 0;
    let sel = selected, focus = selected, free = null, relief = null, reliefKey = "";
    const ext = geo.nx * geo.dx;
    let hd = null;
    container.dataset.relief = "lola-2d";
    // While the Moon HD relief is on its way (WebGL2 present), do not spend the main thread on the per-pixel 2D
    // hillshade only to throw it away a moment later (~0.5 s of CPU on a mid phone, and a visible swap). The 2D
    // relief is drawn if HD is refused (no hardware WebGL), fails, is lost, or takes longer than HD_WAIT_MS.
    const HD_WAIT_MS = 2500;
    let hdPending = !RELIEF_2D && typeof globalThis.WebGL2RenderingContext === "function";
    const stopWaiting = () => { if (hdPending) {
        hdPending = false;
        reliefKey = "";
        draw();
    } };
    if (hdPending)
        setTimeout(stopWaiting, HD_WAIT_MS);
    if (!RELIEF_2D)
        import("../../moon-hd/stereo-relief.js")
            .then(m => m.mountStereoRelief(container, cv, () => { hd = null; container.dataset.relief = "lola-2d"; reliefKey = ""; draw(); }, { wideOnly: typeof matchMedia === "function" && matchMedia("(max-width:700px)").matches }))
            .then(r => { if (r) {
            hd = r;
            hdPending = false;
            container.dataset.relief = "moonhd";
            draw();
        }
        else
            stopWaiting(); })
            .catch(stopWaiting);
    // The 2D hillshade needs the heights: draw as soon as they arrive (a failed load keeps the poster, no map).
    const gridP = loadRegion().then(g => { grid = g; reliefKey = ""; draw(); });
    if (!progressive)
        await gridP;
    else
        gridP.catch(() => { container.dataset.relief = "none"; });
    // Crater and mons names on the map (IAU/USGS, web/moonproof/data/features.json, label only), added when they arrive.
    container.dataset.features = "0";
    const featuresP = labels ? loadFeatures().then(f => { features = f; container.dataset.features = String(f.length); draw(); }) : null;
    if (!progressive)
        await featuresP;
    function frame(W, H) {
        const fr = free = freeArea(W, H, overlayRects(container));
        const fw = fr.r - fr.l, fh = fr.b - fr.t;
        // metres per CSS px so that `span` fits the free area; never zoom out past the grid.
        let mpp = view.span / Math.min(fw, fh);
        mpp = Math.min(mpp, ext / Math.max(W, H));
        // Free-area centre in metres → screen centre in metres.
        const fcx = (fr.l + fr.r) / 2, fcy = (fr.t + fr.b) / 2;
        // Keep the mosaic filling the screen (no hard black edge). Clamping may move the chosen point
        // off the free-area centre: then zoom in step by step until it is back inside the free area.
        const place = (m) => {
            const hw = W * m / 2, hh = H * m / 2;
            let x = view.cx - (fcx - W / 2) * m, y = view.cy + (fcy - H / 2) * m;
            x = Math.min(geo.x0 + ext - hw, Math.max(geo.x0 + hw, x));
            y = Math.min(geo.y0 + ext - hh, Math.max(geo.y0 + hh, y));
            const px = W / 2 + (view.cx - x) / m, py = H / 2 - (view.cy - y) / m;
            return { x, y, ok: px >= fr.l && px <= fr.r && py >= fr.t && py <= fr.b };
        };
        let pl = place(mpp);
        for (let k = 0; k < 12 && !pl.ok; k++) {
            mpp *= .85;
            pl = place(mpp);
        }
        const sx = pl.x, sy = pl.y;
        return { mpp, sx, sy };
    }
    function draw() {
        const W = container.clientWidth, H = container.clientHeight, dpr = Math.min(3, devicePixelRatio || 1);
        if (!W || !H)
            return;
        // Nothing georeferenced is drawn before a relief exists: markers over the decorative poster would read as a map.
        if (!grid && !hd)
            return;
        container.style.background = "var(--bg)";
        const { mpp, sx, sy } = frame(W, H);
        lastMpp = mpp;
        lastSx = sx;
        lastSy = sy;
        lastW = W;
        lastH = H;
        container.dataset.free = [free.l, free.t, free.r, free.b].map(Math.round).join(",");
        const w = Math.round(W * dpr), h = Math.round(H * dpr);
        if (cv.width !== w || cv.height !== h) {
            cv.width = w;
            cv.height = h;
        }
        const g = cv.getContext("2d");
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (hd) {
            hd.draw(sx, sy, W, H, mpp);
            g.clearRect(0, 0, w, h);
        }
        else if (hdPending)
            g.clearRect(0, 0, w, h); // HD relief on its way: markers and labels now, relief when it lands
        else {
            const key = [w, h, sx.toFixed(1), sy.toFixed(1), mpp.toFixed(4)].join();
            if (key !== reliefKey && grid) {
                relief = renderRelief(grid, w, h, sx - W * mpp / 2, sy + H * mpp / 2, mpp / dpr);
                reliefKey = key;
            }
            if (relief)
                g.putImageData(relief, 0, 0);
            else
                g.clearRect(0, 0, w, h);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .78);
        vg.addColorStop(0, "rgba(7,9,12,0)");
        vg.addColorStop(1, "rgba(7,9,12,.88)");
        g.fillStyle = vg;
        g.fillRect(0, 0, W, H);
        const toPx = (x, y) => [W / 2 + (x - sx) / mpp, H / 2 - (y - sy) / mpp];
        const pts = route.map(id => sites.find(s => s.id === id)).filter((s) => !!s).map(s => toPx(s.stereo_x_m, s.stereo_y_m));
        if (pts.length > 1) {
            g.setLineDash([1, 9]);
            g.lineCap = "round";
            g.lineWidth = 2.4;
            g.strokeStyle = "#F2F4F5";
            g.beginPath();
            pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
            g.stroke();
            g.setLineDash([]);
        }
        layer.replaceChildren(...sites.map(s => {
            const [x, y] = toPx(s.stereo_x_m, s.stereo_y_m);
            const b = document.createElement("button");
            b.type = "button";
            b.className = "mp-marker";
            b.dataset.site = s.id;
            b.textContent = String(s.n);
            b.setAttribute("aria-label", t("terrain.marker", { n: s.n, name: s.name }));
            b.setAttribute("aria-pressed", String(s.id === sel));
            Object.assign(b.style, { left: x + "px", top: y + "px" });
            b.onclick = () => { api.select(s.id); onSelect && onSelect(s.id); };
            const lab = document.createElement("span");
            lab.className = "mp-marker-label";
            lab.textContent = s.name ?? null;
            b.append(lab);
            return b;
        }));
        onDraw?.();
        // A marker under a panel is hidden (not focusable): the site stays reachable by the ‹ › selector.
        requestAnimationFrame(() => {
            for (const b of layer.children) {
                const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const hit = cx >= 0 && cy >= 0 && cx < W && cy < H ? document.elementFromPoint(cx, cy) : null;
                b.dataset.covered = String(!(hit && (hit === b || b.contains(hit))) && b.getAttribute("aria-pressed") !== "true");
            }
            // Site names under the markers: with many sites near the pole they collide. The selected site keeps its name;
            // the others keep theirs in order (catalogue number) unless it would overlap one already shown or another
            // marker — those show the name on hover/focus only (.is-quiet). The marker itself is never hidden here.
            quietSiteLabels(layer);
            // Names: plain text, larger features first; hidden under panels, visible markers and each other.
            const marks = [...layer.querySelectorAll(".mp-marker:not([data-covered=true]), .mp-marker:not([data-covered=true]) .mp-marker-label")].map(e => e.getBoundingClientRect());
            const cands = features.filter(f => !sites.some(s => s.name && s.name.startsWith(f.name))).sort((a, b) => b.d - a.d)
                .map(f => { const [x, y] = toPx(f.stereo_x_m, f.stereo_y_m); return { f, x, y, w: f.name.length * 7 + 6, h: 16 }; })
                .filter(c => c.x > c.w / 2 && c.y > c.h / 2 && c.x < W - c.w / 2 && c.y < H - c.h / 2);
            const placed = placeLabels(cands, [...overlayRects(container), ...marks]).slice(0, MAX_LABELS);
            labelsEl.replaceChildren(...placed.map(p => {
                const e = document.createElement("span");
                e.className = "mp-feature";
                e.dataset.type = p.f.type;
                e.textContent = p.f.name;
                Object.assign(e.style, { left: p.x + "px", top: p.y + "px" });
                return e;
            }));
            container.dataset.labels = String(placed.length);
        });
    }
    const api = { el: container, get grid() { return grid; }, view,
        select(id) { sel = id; focus = id; const s = sites.find(x => x.id === id); if (s) {
            view.cx = s.stereo_x_m;
            view.cy = s.stereo_y_m;
        } draw(); },
        zoom(f) { view.span = Math.min(ext, Math.max(4000, view.span / f)); draw(); }, redraw: draw,
        get free() { return free; }, get mpp() { return lastMpp; },
        /** false until the map has been drawn at a non-zero size (a hidden or 0 x 0 viewport never frames it):
         *  toPx/fromPx have no scale yet and would divide by zero. Callers that place things on the map check this. */
        get ready() { return lastMpp > 0; },
        /** The projection actually drawn: stereo metres <-> CSS px of the container. */
        toPx(x, y) { return [lastW / 2 + (x - lastSx) / lastMpp, lastH / 2 - (y - lastSy) / lastMpp]; },
        fromPx(px, py) { return [lastSx + (px - lastW / 2) * lastMpp, lastSy - (py - lastH / 2) * lastMpp]; } };
    // Panels are rendered after the map: re-frame when the overlays change size or appear.
    let pending = 0, lastFree = "";
    const reframe = () => {
        if (pending)
            return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            const f = JSON.stringify(freeArea(container.clientWidth, container.clientHeight, overlayRects(container)));
            if (f !== lastFree) {
                lastFree = f;
                draw();
            }
        });
    };
    new MutationObserver(reframe).observe(document.body, { childList: true, subtree: true });
    if (globalThis.ResizeObserver) {
        const ro = new ResizeObserver(reframe);
        for (const el of document.body.children)
            if (el !== container)
                ro.observe(el);
    }
    addEventListener("resize", draw);
    if (document.fonts?.ready)
        document.fonts.ready.then(reframe);
    draw();
    return api;
}
/** Rectangle overlap with a small gap (CSS px). */
const overlaps = (a, b, pad = 2) => a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
/**
 * Greedy declutter of the site-name labels of a marker layer (see the call in draw()). Exported for tests:
 * returns the ids of the sites whose label was made quiet.
 */
export function quietSiteLabels(layer) {
    const marks = [...layer.querySelectorAll(".mp-marker:not([data-covered=true])")];
    for (const m of marks)
        m.classList.remove("is-quiet");
    const order = [...marks].sort((a, b) => Number(b.getAttribute("aria-pressed") === "true") - Number(a.getAttribute("aria-pressed") === "true"));
    const markerRects = marks.map(m => m.getBoundingClientRect());
    const shown = [], quiet = [];
    for (const m of order) {
        const lab = m.querySelector(".mp-marker-label");
        if (!lab)
            continue;
        const r = lab.getBoundingClientRect();
        if (!r.width)
            continue;
        const hitsLabel = shown.some(o => overlaps(r, o));
        const hitsMarker = markerRects.some((mr, i) => marks[i] !== m && overlaps(r, mr));
        if (m.getAttribute("aria-pressed") !== "true" && (hitsLabel || hitsMarker)) {
            m.classList.add("is-quiet");
            quiet.push(m.dataset.site || "");
        }
        else
            shown.push(r);
    }
    return quiet;
}
