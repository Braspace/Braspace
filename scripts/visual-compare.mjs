#!/usr/bin/env node
// Visual comparator: our MoonProof screens vs the design drawings, 1440x900 scale 1.
// No npm dependency: Node (>=22) + system Chrome headless over raw CDP + own PNG codec.
// Usage:
//   node scripts/visual-compare.mjs --refs <dir-with-1440-refs> [--root <repo>] [--out <dir>] [--only a.html,b.html] [--chrome <bin>] [--no-server]
//   node scripts/visual-compare.mjs --refs <dir> --calibrate [--out <dir>]
// Output: <out>/scores.json, <out>/relatorio.html, <out>/shots/*.png, <out>/sbs/*.png (side by side: ours | design)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const W = 1440, H = 900;
// Regions in 1440x900 (disjoint). Measured on the design A/B boards.
export const REGIONS = {
  nav:     {x: 0,    y: 0,   w: 1440, h: 76},
  context: {x: 0,    y: 76,  w: 1440, h: 66},
  left:    {x: 0,    y: 142, w: 380,  h: 638},
  right:   {x: 1050, y: 142, w: 390,  h: 638},
  center:  {x: 380,  y: 142, w: 670,  h: 638},
  footer:  {x: 0,    y: 780, w: 1440, h: 120}
};
const PANEL_REGIONS = ["left", "right"];
const DARK_T = 46;      // luminance (0-255) below which a pixel counts as panel/card
const PANEL_FRAC = 0.5; // a row/column belongs to the panel box if >50% of its pixels are dark
export const PAGE_WEIGHT = {nav: 1, context: 1, left: 1.5, right: 1.5, center: 1.5, footer: 1};

// ---------- PNG codec ----------
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let p = 8, w = 0, h = 0, ct = 0, bd = 0, il = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bd !== 8 || il !== 0 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported PNG bd=${bd} ct=${ct} il=${il}`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, s = x * bpp; out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = bpp === 4 ? line[s + 3] : 255; }
    prev = line;
  }
  return {w, h, data: out};
}
export function encodePng({w, h, data}) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, "latin1"); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)) >>> 0, 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// Fit to exactly 1440x900 (crop or pad with black); refs are expected to be 1440x900(-1) already.
function fit(img) {
  if (img.w === W && img.h === H) return img;
  const out = Buffer.alloc(W * H * 4); for (let i = 3; i < out.length; i += 4) out[i] = 255;
  for (let y = 0; y < Math.min(H, img.h); y++) img.data.copy(out, y * W * 4, y * img.w * 4, y * img.w * 4 + Math.min(W, img.w) * 4);
  return {w: W, h: H, data: out};
}
export function sideBySide(a, b) {
  const gap = 8, w = a.w + gap + b.w, h = Math.max(a.h, b.h), out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = 242; out[i + 1] = 244; out[i + 2] = 245; out[i + 3] = 255; }
  for (let y = 0; y < a.h; y++) a.data.copy(out, y * w * 4, y * a.w * 4, (y + 1) * a.w * 4);
  for (let y = 0; y < b.h; y++) b.data.copy(out, (y * w + a.w + gap) * 4, y * b.w * 4, (y + 1) * b.w * 4);
  return encodePng({w, h, data: out});
}

// ---------- metrics ----------
const lum = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
function regionStats(img, r) {
  const d = img.data, hist = new Map(); let n = 0, sum = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const o = (y * W + x) * 4; sum += lum(d, o); n++;
    const k = ((d[o] >> 4) << 8) | ((d[o + 1] >> 4) << 4) | (d[o + 2] >> 4); hist.set(k, (hist.get(k) || 0) + 1);
  }
  let best = 0, bk = 0; for (const [k, c] of hist) if (c > best) { best = c; bk = k; }
  const dom = [((bk >> 8) & 15) * 16 + 8, ((bk >> 4) & 15) * 16 + 8, (bk & 15) * 16 + 8];
  return {meanLum: sum / n, dominant: dom};
}
function pixDiff(a, b, r) { // mean |L_a - L_b| / 255 per pixel
  let s = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const o = (y * W + x) * 4; s += Math.abs(lum(a.data, o) - lum(b.data, o)); n++; }
  return s / n / 255;
}
// Panel box by threshold: rows/columns where > PANEL_FRAC of the pixels are dark. Returns null if none.
export function panelBox(img, r) {
  const rows = new Array(r.h).fill(0), cols = new Array(r.w).fill(0);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (lum(img.data, ((r.y + y) * W + r.x + x) * 4) < DARK_T) { rows[y]++; cols[x]++; }
  const ys = rows.map((c, i) => c / r.w > PANEL_FRAC * 0.25 ? i : -1).filter(i => i >= 0);
  const xs = cols.map((c, i) => c / r.h > PANEL_FRAC * 0.25 ? i : -1).filter(i => i >= 0);
  if (!ys.length || !xs.length) return null;
  return {x: r.x + xs[0], y: r.y + ys[0], w: xs.at(-1) - xs[0] + 1, h: ys.at(-1) - ys[0] + 1};
}
export function iou(a, b) {
  if (!a && !b) return 1; if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = a.w * a.h + b.w * b.h - i;
  return u ? i / u : 0;
}
const clamp01 = v => Math.max(0, Math.min(1, v));
// score 0-100 for one region. Components 0-1; lumPix 0.10 mean abs diff -> 0, lumMean 0.10 -> 0, color dist 0.20 -> 0.
export function compareImages(ours, ref) {
  ours = fit(ours); ref = fit(ref);
  const regions = {};
  for (const [name, r] of Object.entries(REGIONS)) {
    const sa = regionStats(ours, r), sb = regionStats(ref, r);
    const lumPix = pixDiff(ours, ref, r), lumMean = Math.abs(sa.meanLum - sb.meanLum) / 255;
    const colorDist = Math.hypot(...sa.dominant.map((v, i) => v - sb.dominant[i])) / 441.67;
    const comp = {lum_pixel: 1 - clamp01(lumPix / 0.10), lum_mean: 1 - clamp01(lumMean / 0.10), color: 1 - clamp01(colorDist / 0.20)};
    const rec = {lum_pixel_diff: +lumPix.toFixed(4), lum_mean_diff: +lumMean.toFixed(4), dominant_ours: sa.dominant, dominant_ref: sb.dominant, dominant_dist: +colorDist.toFixed(4)};
    let score;
    if (PANEL_REGIONS.includes(name)) {
      const ba = panelBox(ours, r), bb = panelBox(ref, r), o = iou(ba, bb);
      Object.assign(rec, {panel_box_ours: ba, panel_box_ref: bb, panel_iou: +o.toFixed(4)});
      score = 0.35 * comp.lum_pixel + 0.15 * comp.lum_mean + 0.2 * comp.color + 0.3 * o;
    } else score = 0.45 * comp.lum_pixel + 0.2 * comp.lum_mean + 0.35 * comp.color;
    rec.score = +(100 * score).toFixed(1); regions[name] = rec;
  }
  let ws = 0, wt = 0; for (const [k, v] of Object.entries(regions)) { ws += v.score * PAGE_WEIGHT[k]; wt += PAGE_WEIGHT[k]; }
  return {score: +(ws / wt).toFixed(1), regions};
}

// ---------- CDP (raw, Node global WebSocket) ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej); });
async function waitHttp(url, tries = 60) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); return r; } catch { await sleep(250); } } throw new Error("timeout " + url); }
async function startChrome(bin) {
  const port = await freePort(), prof = "/tmp/X05-chrome";
  fs.mkdirSync(prof, {recursive: true});
  const proc = spawn(bin, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--window-size=1440,900", "about:blank"], {stdio: "ignore"});
  await waitHttp(`http://127.0.0.1:${port}/json/version`);
  return {proc, port};
}
async function cdpTarget(port) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: "PUT"})).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(), waiters = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const {res, rej} = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else if (m.method) waiters.forEach(w => w(m)); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, {res, rej}); ws.send(JSON.stringify({id: i, method, params})); });
  const waitEvent = (name, ms) => new Promise(res => { const to = setTimeout(() => res(false), ms); const w = m => { if (m.method === name) { clearTimeout(to); waiters.splice(waiters.indexOf(w), 1); res(true); } }; waiters.push(w); });
  return {send, waitEvent, close: () => { ws.close(); fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {}); }};
}
async function shot(cdp, url, file, settle) {
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {width: W, height: H, deviceScaleFactor: 1, mobile: false});
  const ld = cdp.waitEvent("Page.loadEventFired", 20000);
  await cdp.send("Page.navigate", {url}); await ld; await sleep(settle);
  const r = await cdp.send("Page.captureScreenshot", {format: "png", clip: {x: 0, y: 0, width: W, height: H, scale: 1}});
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
}

// ---------- main ----------
function args() {
  const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true; } return o;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function report(out, data) {
  const names = Object.keys(REGIONS);
  const rows = data.screens.map(s => `<tr><td>${esc(s.page)}</td><td>${esc(s.ref)}</td><td><b>${s.error ? "—" : s.score}</b></td>${names.map(n => `<td>${s.error ? "" : s.regions[n].score}</td>`).join("")}<td>${esc(s.error || "")}</td></tr>`).join("");
  const imgs = data.screens.filter(s => s.sbs).map(s => `<h3>${esc(s.page)} · ${s.score} <small>(ours | design)</small></h3><img src="${esc(s.sbs)}" style="max-width:100%">`).join("");
  const cal = data.calibration ? `<p>Calibration: reference vs itself = <b>${data.calibration.self}</b>; reference vs a different design screen = <b>${data.calibration.cross}</b></p>` : "";
  fs.writeFileSync(path.join(out, "relatorio.html"), `<!doctype html><meta charset="utf-8"><title>X05 visual compare</title><style>body{font:14px sans-serif;margin:24px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>
<h1>Screen × design</h1><p>${esc(data.label)} · ${data.viewport} · generated ${esc(data.generated)}</p>${cal}
<table><tr><th>page</th><th>reference</th><th>score</th>${names.map(n => `<th>${n}</th>`).join("")}<th>note</th></tr>${rows}</table>
<p>Scores 0–100 measure pixel similarity to an illustrative design; they are not scientific data and do not validate anything.</p>${imgs}`);
}
async function main() {
  const o = args(), here = path.dirname(fileURLToPath(import.meta.url));
  if (!o.refs) { console.error("usage: visual-compare.mjs --refs <dir> [--root <repo>] [--out <dir>] [--only a.html,b.html] [--calibrate]"); process.exit(2); }
  const refs = path.resolve(o.refs), root = path.resolve(o.root || path.join(here, "..")), out = path.resolve(o.out || path.join(root, "visual-compare-out"));
  const map = JSON.parse(fs.readFileSync(path.join(here, "visual-compare.map.json"), "utf8")); delete map._note;
  fs.mkdirSync(path.join(out, "shots"), {recursive: true}); fs.mkdirSync(path.join(out, "sbs"), {recursive: true});
  const loadRef = f => fit(decodePng(fs.readFileSync(path.join(refs, f))));
  const data = {label: o.label || path.basename(root), viewport: `${W}x${H}@1`, generated: new Date().toISOString(), screens: []};
  const files = Object.values(map).filter(f => fs.existsSync(path.join(refs, f)));
  // calibration: ref vs itself, ref vs different screen (next one in list)
  if (files.length > 1) {
    const pairs = files.map((f, i) => ({f, g: files[(i + 1) % files.length], self: compareImages(loadRef(f), loadRef(f)).score, cross: compareImages(loadRef(f), loadRef(files[(i + 1) % files.length])).score}));
    const avg = k => +(pairs.reduce((s, p) => s + p[k], 0) / pairs.length).toFixed(1);
    data.calibration = {self: avg("self"), cross: avg("cross"), pairs: pairs.map(p => ({ref: p.f, other: p.g, self: p.self, cross: p.cross}))};
    console.log(`calibration: self=${data.calibration.self} cross(avg)=${data.calibration.cross} min=${Math.min(...pairs.map(p => p.cross))} max=${Math.max(...pairs.map(p => p.cross))}`);
  }
  if (!o.calibrate) {
    const dir = path.join(root, "web", "moonproof");
    let pages = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".html")).sort() : [];
    if (o.only) pages = pages.filter(p => String(o.only).split(",").includes(p));
    if (!pages.length) console.log(`no web/moonproof/*.html in ${root}`);
    let server = null, base = o.base;
    if (pages.length && !base) {
      const port = await freePort(); base = `http://127.0.0.1:${port}`;
      server = spawn(process.execPath, [path.join(root, "web", "dev-server.mjs")], {env: {...process.env, BRASPACE_WEB_PORT: String(port)}, stdio: "ignore"});
      await waitHttp(base + "/", 40);
    }
    let chrome = null;
    try {
      if (pages.length) chrome = await startChrome(o.chrome || process.env.CHROME_BIN || "/usr/bin/google-chrome");
      for (const p of pages) {
        const refName = map[p], s = {page: p, ref: refName || null};
        try {
          if (!refName) throw new Error("no reference in map");
          if (!fs.existsSync(path.join(refs, refName))) throw new Error("reference file missing in --refs");
          const cdp = await cdpTarget(chrome.port), file = path.join(out, "shots", p.replace(/\.html$/, ".png"));
          const res = await fetch(`${base}/moonproof/${p}`); if (!res.ok) throw new Error(`dev-server answered ${res.status} for /moonproof/${p}`);
          try { await shot(cdp, `${base}/moonproof/${p}`, file, Number(o.settle || 2500)); } finally { cdp.close(); }
          const ours = fit(decodePng(fs.readFileSync(file))), ref = loadRef(refName);
          Object.assign(s, compareImages(ours, ref));
          s.sbs = `sbs/${p.replace(/\.html$/, ".png")}`; fs.writeFileSync(path.join(out, s.sbs), sideBySide(ours, ref));
          s.shot = `shots/${p.replace(/\.html$/, ".png")}`;
        } catch (e) { s.error = String(e.message || e); }
        console.log(`${p.padEnd(14)} ${s.error ? "ERROR " + s.error : s.score + "  " + Object.entries(s.regions).map(([k, v]) => `${k}=${v.score}`).join(" ")}`);
        data.screens.push(s);
      }
    } finally { chrome?.proc.kill(); server?.kill(); }
  }
  fs.writeFileSync(path.join(out, "scores.json"), JSON.stringify(data, null, 2)); report(out, data);
  console.log(`wrote ${out}/scores.json and relatorio.html`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
