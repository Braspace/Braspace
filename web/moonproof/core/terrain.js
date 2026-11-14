// Full-screen terrain: hillshade of the NASA LOLA 400 m south-pole grid (web/lab/terrain.js
// TerrainGrid), numbered site markers at their stereographic x/y and a dotted route.
import { loadRegion } from "./data.js";
import { t } from "./i18n.js";

function shade(grid) {
  const { nx, ny } = grid, img = new ImageData(nx, ny), d = img.data;
  const L = [-0.6, 0.55, 0.58], e2 = 2 * grid.dx, k = 1 / Math.hypot(...L);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const hx = (grid.at(i + 1, j) - grid.at(i - 1, j)) / e2, hy = (grid.at(i, j + 1) - grid.at(i, j - 1)) / e2;
    const p = ((ny - 1 - j) * nx + i) * 4; // canvas row 0 = max y
    if (!Number.isFinite(hx + hy)) { d[p + 3] = 255; continue; }
    const len = Math.hypot(hx, hy, 1), lam = Math.max(0, (-hx * L[0] - hy * L[1] + L[2]) * k / len);
    const v = Math.round(18 + 190 * Math.pow(lam, 1.4));
    // False-colour altitude: blue low ground to gold high ground, modulated
    // by the real LOLA surface normal. This is a VISUAL ENCODING, not LROC imagery.
    const altitude = grid.at(i,j), t = Math.max(0,Math.min(1,(altitude+5000)/10000));
    const stops = [[17,49,95],[52,78,123],[124,132,137],[201,181,136],[255,217,117]];
    const f = t*4, k0 = Math.min(3,Math.floor(f)), blend = f-k0;
    const sh = .30 + .70*(v/210);
    for(let c=0;c<3;c++)d[p+c] = Math.round((stops[k0][c]*(1-blend)+stops[k0+1][c]*blend)*sh);
    d[p+3]=255;
  }
  return img;
}

/**
 * mountTerrain(container, { sites, selected, route, onSelect })
 *  sites: [{ id, n, name, stereo_x_m, stereo_y_m }]; route: [siteId, ...] dotted line.
 * Returns Promise<{ select(id), zoom(f), grid, el }>.
 */
export async function mountTerrain(container, { sites = [], features = [], selected = null, route = [], onSelect } = {}) {
  container.classList.add("mp-terrain");
  Object.assign(container.style, { position: "fixed", inset: "0", overflow: "hidden", background: "var(--bg)" });
  const grid = await loadRegion();
  const base = document.createElement("canvas"); base.width = grid.nx; base.height = grid.ny;
  base.getContext("2d").putImageData(shade(grid), 0, 0);
  const cv = document.createElement("canvas"); cv.setAttribute("role", "img"); cv.setAttribute("aria-label", t("terrain.label"));
  Object.assign(cv.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  const layer = document.createElement("div"); Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  container.append(cv, layer);
  // view: centre (metres) and metres per CSS pixel; default frames all sites.
  const xs = sites.map(s => s.stereo_x_m), ys = sites.map(s => s.stereo_y_m);
  const view = { cx: xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy: ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0, span: xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.5 + 20000 : grid.nx * grid.dx };
  let sel = selected;
  const toPx = (x, y, W, H, mpp) => [W / 2 + (x - view.cx) / mpp, H / 2 - (y - view.cy) / mpp];
  function draw() {
    const W = container.clientWidth, H = container.clientHeight, dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingQuality = "high";
    // Keep the viewport inside the LOLA grid, so the map always fills the screen.
    const ext = grid.nx * grid.dx, gx0 = grid.x0, gy0 = grid.y0;
    view.span = Math.min(view.span, ext * Math.min(W, H) / Math.max(W, H));
    const mpp = view.span / Math.min(W, H), hw = W * mpp / 2, hh = H * mpp / 2;
    view.cx = Math.min(gx0 + ext - hw, Math.max(gx0 + hw, view.cx));
    view.cy = Math.min(gy0 + ext - hh, Math.max(gy0 + hh, view.cy));
    const [x0, y0] = toPx(grid.x0, grid.y0 + (grid.ny - 1) * grid.dx, W, H, mpp);
    g.fillStyle = "#07090C"; g.fillRect(0, 0, W, H);
    g.drawImage(base, x0, y0, (grid.nx * grid.dx) / mpp, (grid.ny * grid.dx) / mpp);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
    vg.addColorStop(0, "rgba(7,9,12,0)"); vg.addColorStop(1, "rgba(7,9,12,.75)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const pts = route.map(id => sites.find(s => s.id === id)).filter(Boolean).map(s => toPx(s.stereo_x_m, s.stereo_y_m, W, H, mpp));
    if (pts.length > 1) { g.setLineDash([2, 7]); g.lineCap = "round"; g.lineWidth = 2.5; g.strokeStyle = "rgba(255,255,255,.85)"; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]); }
    const featureLabels=features.filter(f=>Number.isFinite(f.stereo_x_m)&&Number.isFinite(f.stereo_y_m))
      .map(f=>{
        const [x,y]=toPx(f.stereo_x_m,f.stereo_y_m,W,H,mpp);
        const label=document.createElement("span");label.className="mp-feature-label";
        label.textContent=f.name;label.style.left=x+"px";label.style.top=y+"px";
        label.title="IAU feature centre · label only, NOT a landing site";
        return label;
      });
    layer.replaceChildren(...featureLabels,...sites.map(s => {
      const [x, y] = toPx(s.stereo_x_m, s.stereo_y_m, W, H, mpp);
      const b = document.createElement("button"); b.type = "button"; b.className = "mp-marker"; b.dataset.site = s.id;
      b.textContent = s.n; b.setAttribute("aria-label", t("terrain.marker", { n: s.n, name: s.name })); b.setAttribute("aria-pressed", String(s.id === sel));
      Object.assign(b.style, { left: x + "px", top: y + "px" });
      b.onclick = () => { api.select(s.id); onSelect && onSelect(s.id); };
      const lab = document.createElement("span"); lab.className = "mp-marker-label"; lab.textContent = s.name; b.append(lab);
      return b;
    }));
  }
  const api = { el: container, grid, view,
    select(id) { sel = id; const s = sites.find(x => x.id === id); if (s) { view.cx = s.stereo_x_m; view.cy = s.stereo_y_m; } draw(); },
    zoom(f) { view.span = Math.min(grid.nx * grid.dx, Math.max(5000, view.span / f)); draw(); }, redraw: draw };
  addEventListener("resize", draw); draw();
  return api;
}
