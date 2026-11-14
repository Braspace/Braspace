// Shared pieces for the shell views: scenario context (site / date / window) carried in the URL,
// the LOLA hillshade map with numbered markers, and small formatting helpers.
// Every number comes from data/ (LOLA + SPICE pipeline). Missing data is "N/D", never 0.
import { h, badge, num } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { loadSites, siteSeries, regionGrid, timeFromQuery, isoHour, fmtDate, HOUR_MS } from "../data.js";

export const WINDOWS = [7, 14, 28, 56];          // window length options (days)
export const LETTERS = ["A", "B", "C"];

/** Scenario from the URL: { data, site, t0, days, hours }. Unknown ?site falls back to the first real site. */
export async function scenario(ctx) {
  const data = await loadSites();
  const site = data.sites.find(s => s.id === ctx.site) || data.sites[0];
  const days = WINDOWS.includes(Number(ctx.query.d)) ? Number(ctx.query.d) : 28;
  let t0 = timeFromQuery(ctx.query, data.window);
  // keep the whole window inside the computed series
  t0 = Math.min(t0, data.window.end - days * 24 * HOUR_MS);
  return { data, site, t0, days, hours: days * 24 };
}

/** Sites picked for comparison (?a=&b=&c=), defaulting to the first three real sites. */
export function pickedSites(data, query) {
  const ids = LETTERS.map((L, i) => query[L.toLowerCase()] || (data.sites[i] && data.sites[i].id));
  return ids.map(id => data.sites.find(s => s.id === id)).filter(Boolean);
}

/** Navigate to the same route with an updated query (keeps the rest of it). */
export function setQuery(ctx, patch) {
  location.hash = buildHash(ctx.path, { ...ctx.query, ...patch });
}

/** Context bar: site · date · window. Changes go to the URL so links reproduce the view. */
export function contextBar(ctx, sc, { siteSelect = true } = {}) {
  const bar = h("div", { class: "ctx glass", role: "group", "aria-label": "Cenário" });
  if (siteSelect) {
    const sel = h("select", { "aria-label": "Local", onchange: e => setQuery(ctx, { site: e.target.value }) },
      sc.data.sites.map(s => h("option", { value: s.id, text: s.name, selected: s.id === sc.site.id ? "" : null })));
    bar.append(h("label", { class: "row" }, h("span", { class: "lbl-s", text: "Local" }), sel), h("span", { class: "dot", "aria-hidden": "true", text: "·" }));
  }
  const min = isoHour(sc.data.window.start).slice(0, 10), max = isoHour(sc.data.window.end - sc.hours * HOUR_MS).slice(0, 10);
  const date = h("input", { type: "date", "aria-label": "Início da janela (UTC)", value: isoHour(sc.t0).slice(0, 10), min, max,
    onchange: e => e.target.value && setQuery(ctx, { t: e.target.value }) });
  const win = h("select", { "aria-label": "Duração da janela", onchange: e => setQuery(ctx, { d: e.target.value }) },
    WINDOWS.map(d => h("option", { value: String(d), text: d + " dias", selected: d === sc.days ? "" : null })));
  bar.append(h("label", { class: "row" }, h("span", { class: "lbl-s", text: "Início" }), date),
    h("span", { class: "dot", "aria-hidden": "true", text: "·" }), win);
  return bar;
}

/** Series for several sites; a failed load becomes { error } so the view shows N/D for it. */
export async function seriesFor(sites) {
  return Promise.all(sites.map(s => siteSeries(s).then(series => ({ site: s, series }), e => ({ site: s, error: e.message }))));
}

export const pct = v => num(v, 0, "%");
export const hrs = v => num(v, 0, " h");
export { fmtDate, isoHour, HOUR_MS };

/** "VAL/EST/SIM/N/D" helper for a metric value: N/D when not finite, else the given kind. */
export function sealFor(v, kind) { return Number.isFinite(v) ? (kind ? badge(kind) : null) : badge("nd"); }

/** Shared proof rows for the LOLA + SPICE window metrics (definition, horizon, step, ephemeris, version). */
export function seriesProof(series, sc, extra = []) {
  const p = series && series.meta && series.meta.provenance;
  return [
    ...extra,
    ["Janela", fmtDate(sc.t0) + " → " + sc.days + " dias (passo 1 h)"],
    ["Horizonte", p ? "Raios sobre LOLA LDEM_80S_80M, 1° de azimute, até " + num(p.ray_parameters.max_distance_m / 1000, 0, " km") : "N/D"],
    ["Efeméride", p ? p.ephemeris : "N/D"],
    ["Versão", p ? p.generator : "N/D"],
    ["Status", series && series.meta ? series.meta.science_status : "N/D"],
  ];
}

/** Text download (CSV/JSON) without a server; Blob URL revoked after use. */
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * LOLA region hillshade (illustrative shading — NOT an illumination simulation) with numbered site markers.
 * Returns { el, select(id) }. Marker positions come from the sites' stereographic x/y (data/sites.json).
 */
export async function regionMap(sites, selectedId, onSelect) {
  const grid = await regionGrid();
  // crop to the sites' bounding box plus a margin so the markers are readable
  // square frame around the sites (plus margin) so the map never gets taller than it is wide
  const xs = sites.map(s => s.stereo_x_m), ys = sites.map(s => s.stereo_y_m), pad = 25000;
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + pad;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x0 = Math.max(grid.x0, cx - half), x1 = Math.min(grid.x0 + grid.nx * grid.dx, cx + half);
  const y0 = Math.max(grid.y0, cy - half), y1 = Math.min(grid.y0 + grid.ny * grid.dx, cy + half);
  const i0 = Math.floor((x0 - grid.x0) / grid.dx), i1 = Math.ceil((x1 - grid.x0) / grid.dx);
  const j0 = Math.floor((y0 - grid.y0) / grid.dx), j1 = Math.ceil((y1 - grid.y0) / grid.dx);
  const W = i1 - i0, H = j1 - j0;
  const canvas = h("canvas", { width: String(W), height: String(H), role: "img",
    "aria-label": "Relevo LOLA do polo sul com " + sites.length + " locais numerados. Sombreamento ilustrativo, não é simulação de iluminação." });
  const g = canvas.getContext("2d"), img = g.createImageData(W, H);
  const lx = -0.6, ly = 0.6, lz = 0.53; // fixed light direction for hillshade (illustrative only)
  for (let r = 0; r < H; r++) {
    const j = j1 - 1 - r; // canvas row 0 = max y (north up in the stereographic frame)
    for (let c = 0; c < W; c++) {
      const i = i0 + c, k = (r * W + c) * 4;
      const z = grid.at(i, j), zx = grid.at(Math.min(i + 1, grid.nx - 1), j) - grid.at(Math.max(i - 1, 0), j), zy = grid.at(i, Math.min(j + 1, grid.ny - 1)) - grid.at(i, Math.max(j - 1, 0));
      let v = 0;
      if (Number.isFinite(z) && Number.isFinite(zx) && Number.isFinite(zy)) {
        const nx = -zx / (2 * grid.dx), ny = -zy / (2 * grid.dx), n = Math.hypot(nx, ny, 1);
        const shade = Math.max(0, (nx * lx + ny * ly + lz) / n);
        const elev = (z - grid.min) / (grid.max - grid.min);
        v = Math.round(20 + 150 * shade + 60 * elev);
      }
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.min(255, v); img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const labels = h("div", { class: "mlabels" });
  const markers = sites.map((s, n) => {
    const left = ((s.stereo_x_m - (grid.x0 + i0 * grid.dx)) / (W * grid.dx)) * 100;
    const top = (1 - (s.stereo_y_m - (grid.y0 + j0 * grid.dx)) / (H * grid.dx)) * 100;
    const mk = h("button", { type: "button", class: "mk", "aria-label": (n + 1) + ". " + s.name, "aria-pressed": String(s.id === selectedId), text: String(n + 1), onclick: () => onSelect && onSelect(s.id) });
    const name = h("span", { class: "mname" + (s.id === selectedId ? " sel" : ""), text: s.name.replace(/\s*\(.*\)$/, "") });
    mk.style.left = name.style.left = left + "%"; mk.style.top = name.style.top = top + "%"; // CSSOM: allowed by the CSP
    labels.append(name, mk);
    return { id: s.id, mk, name };
  });
  const km = ((W * grid.dx) / 1000).toFixed(0);
  const legend = h("div", { class: "maplegend glass" },
    h("strong", { text: "Relevo LOLA (LDEM 80 m → 400 m)" }),
    h("div", { class: "ramp", "aria-hidden": "true" }),
    h("div", { class: "t3", text: "Sombreado ilustrativo, não é iluminação. Quadro ≈ " + km + " km, norte da grade estereográfica para cima." }));
  const el = h("div", { class: "mapcard solid" }, canvas, labels, legend);
  return {
    el, select(id) {
      markers.forEach(m => { m.mk.setAttribute("aria-pressed", String(m.id === id)); m.name.classList.toggle("sel", m.id === id); });
    },
  };
}

/** One canvas strip per site: hourly Sun (or Earth) visibility over the window. */
export function hourStrip(series, t0, hours, body) {
  const W = Math.min(hours, 1344), c = h("canvas", { width: String(W), height: "14", class: "hstrip", role: "img" });
  const g = c.getContext("2d"), m = body === "sun" ? series.sunMargin : series.earthMargin;
  const cs = getComputedStyle(document.documentElement);
  const on = cs.getPropertyValue(body === "sun" ? "--c-sun" : "--c-earth").trim(), off = cs.getPropertyValue("--c-track").trim(), nd = cs.getPropertyValue("--c-unk").trim();
  const i0 = Math.ceil((t0 - series.start) / HOUR_MS);
  let vis = 0, n = 0;
  for (let x = 0; x < W; x++) {
    const i = i0 + Math.floor((x * hours) / W);
    const ok = i >= 0 && i < series.count;
    g.fillStyle = ok ? (m[i] >= 0 ? on : off) : nd;
    if (ok) { n++; if (m[i] >= 0) vis++; }
    g.fillRect(x, 0, 1, 14);
  }
  c.setAttribute("aria-label", (body === "sun" ? "Sol" : "Terra") + " visível em " + (n ? Math.round((100 * vis) / n) : "N/D") + "% das horas da janela");
  return c;
}
