// G · Debrief do pouso. Reads the last attempt that F stored in sessionStorage. No attempt → says so and links to F.
import { mountShell } from "../core/shell.js";
import { sealFor, loadSites, DATA_BASE } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, hrefTo } from "../core/state.js";
import { TerrainGrid } from "../../lab/terrain.js";
import { TEXTS } from "./landing-texts.js";
import { ASSUMED, loadAttempts, evaluateRules, rulesMet, verdictKey, descentBars, keyPoints, brakingAssessment, fuelFrac } from "./landing-model.js";

register(TEXTS);
const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fmt = (v, d = 0) => Number.isFinite(v) ? String(fmtNum(v, d)).replace("-", "−") : t("nd");
const attempts = loadAttempts(sessionStorage);
const pick = Number(new URLSearchParams(location.search).get("attempt"));
const A = attempts.find(a => a.n === pick) || attempts.at(-1) || null;
const shell = mountShell({ screen: "debrief", context: null, onLang: draw });
const doc = await loadSites().catch(() => null);
let tile = null;
if (A && doc) { const s = doc.sites.find(x => x.id === A.site); if (s?.local_tile) tile = await TerrainGrid.load(DATA_BASE + s.local_tile).catch(() => null); }

function ctxBar() {
  const s = doc?.sites.find(x => x.id === A?.site);
  const ctx = document.querySelector(".mp-context"); if (!ctx) return;
  ctx.hidden = false;
  const b = el("b", "", t("deb.context"));
  const parts = [b, " · ", A ? `${s ? s.n + " · " : ""}${A.siteName}` : t("nd"), " · ", A ? t("deb.attempt", { n: A.n }) : t("nd")];
  const change = el("a", "mp-pill", t("deb.change") + " ⌄"); change.href = hrefTo("explore.html");
  ctx.replaceChildren(...parts, sealEl("SIM"), change);
}

function draw() {
  document.documentElement.lang = lang();
  document.title = "moonproof · " + t("deb.title");
  ctxBar();
  if (!A) return none();
  const rules = evaluateRules(A), rm = rulesMet(rules), vk = verdictKey(A, rules), lim = A.limits;
  const kp = keyPoints(A), ba = brakingAssessment(A), bars = descentBars(A.trace);
  const ffEnd = fuelFrac(A.fuelEndKg, A.fuelStartKg), c = A.contact;
  // ---- left column
  const ic = el("div", "deb-ic", ["safe"].includes(vk) ? "✓" : (["crash", "out"].includes(vk) ? "✕" : "!")); ic.dataset.k = vk === "safe" ? "ok" : ["crash", "out", "hard"].includes(vk) ? "bad" : "warn"; ic.setAttribute("aria-hidden", "true");
  const used = A.fuelStartKg > 0 ? A.fuelUsedKg / A.fuelStartKg : null;
  const sum = A.burnStart == null ? t("deb.sum.nobrake") : (ba.late ? t("deb.sum.brake", { v: fmt(kp.peak ? -kp.peak.vz : NaN, 1), f: fmt(used == null ? NaN : used * 100), s: fmt(A.flightS - A.burnStart.t) }) : t("deb.sum.ok", { f: fmt(used == null ? NaN : used * 100), s: fmt(A.flightS) }));
  const how = el("section", "deb-card"); how.append(el("div", "mp-label", t("deb.how")));
  const row = el("div", "deb-how"); const tx = el("div"); tx.append(el("p", "deb-verdict", t("deb.v." + vk)), el("p", "deb-sum", sum)); row.append(ic, tx); how.append(row);
  const st = (state, lowWord) => { const s = el("span", "deb-st", state === "ok" ? t("deb.ok") : state === "nd" ? "N/D" : (lowWord ? t("deb.low") : t("deb.fail"))); s.dataset.s = state === "ok" ? "ok" : state === "nd" ? "nd" : (lowWord ? "low" : "fail"); return s; };
  const R = id => rules.find(r => r.id === id);
  const pill = (label, value, stEl) => { const p = el("div", "deb-pill"); p.append(el("span", "lb", label), el("span", "v", value), stEl); return p; };
  const pills = el("div", "deb-pills");
  pills.append(
    pill(t("deb.m.vz"), c ? fmt(-c.vVert, 1) + " m/s" : t("nd"), st(R("soft").state)),
    pill(t("deb.m.dist"), c ? fmt(c.dist) + " m" : t("nd"), st(R("target").state)),
    pill(t("deb.m.slope"), c ? fmt(c.slope, 1) + "°" : t("nd"), st(R("slope").state)),
    pill(t("deb.m.fuel"), ffEnd == null ? t("nd") : fmt(ffEnd * 100) + "%", st(R("fuel").state, true)));
  const peakV = kp.peak ? -kp.peak.vz : null;
  const ch = el("section", "deb-card black deb-chart"); const chh = el("h3", "", t("deb.chart")); chh.append(el("span", "mp-label", bars.interval == null ? t("nd") : t("deb.chart.every", { n: fmt(bars.interval) })));
  const bx = el("div", "deb-bars"); bx.setAttribute("role", "img"); bx.setAttribute("aria-label", t("deb.chart"));
  const max = Math.max(...bars.bars.map(b => b.v), 0) || 1;
  bars.bars.forEach(b => { const i = el("i"); i.style.height = (b.v / max * 100) + "%"; if (b.v >= lim.maxVerticalSpeed && b.v === max) i.classList.add("peak"); i.title = `${fmt(b.from)} s · ${fmt(b.v, 1)} m/s`; bx.append(i); });
  ch.append(chh, bx, el("p", "mp-label", peakV == null ? t("nd") : t("deb.chart.legend", { v: fmt(peakV, 1), b: ba.late ? t("deb.chart.late") : "" })));
  $("left").replaceChildren(how, pills, ch);
  // ---- right column
  const rl = el("section", "deb-card black deb-rules"); const rh = el("h3", "", t("deb.rules")); rh.append(el("span", "deb-count", t("deb.rules.met", { n: rm.met, m: rm.total })));
  const ul = el("ul");
  for (const r of rules) { const li = el("li"); const tag = el("span", "tag", r.state === "ok" ? t("deb.ok") : r.state === "nd" ? "N/D" : (r.id === "fuel" ? t("deb.r.low") : t("deb.fail"))); tag.dataset.s = r.state; li.append(el("span", "", t("deb.r." + r.id)), tag); ul.append(li); }
  rl.append(rh, ul, el("p", "mp-label", t("deb.rules.note")));
  const nx = el("section", "deb-card deb-next black"); nx.append(el("h3", "", t("deb.next")));
  const ol = el("ol"); const tips = [];
  const needH = ba.needH != null ? ba.needH : null;
  if (needH != null) tips.push(t("deb.next.brake", { n: fmt(Math.ceil(needH * ASSUMED.brakeMargin / 10) * 10) }));
  if (R("lateral").state === "fail") tips.push(t("deb.next.lateral")); else if (R("fuel").state === "fail") tips.push(t("deb.next.fuel"));
  tips.push(t("deb.next.cam"));
  for (const x of tips) ol.append(el("li", "", x));
  const lsn = el("li"); lsn.append(t("deb.next.lesson")); const la = el("a", "", t("deb.next.lessonName")); la.href = hrefTo("evidence.html") + "#lessons"; lsn.append(la); ol.append(lsn);
  nx.append(ol);
  const pf = el("section", "deb-card black"); pf.append(el("h3", "", t("deb.proof")));
  const pl = el("div", "deb-proof"); for (const k of ["deb.proof.sim"]) pl.append(el("div", "", t(k)));
  pl.append(el("div", "", t("deb.proof.terrain", { s: A.terrainStatus })), el("div", "", t("deb.proof.ideal")), el("div", "", t("deb.proof.shade")), el("div", "", t("deb.proof.limits")));
  const sl = el("div"); sl.append(sealEl("SIM"), " ", sealEl(sealFor(A.terrainStatus))); pl.append(sl); pf.append(pl);
  const parts = [rl, nx];
  if (getState().layer !== "answer") parts.push(pf);
  if (attempts.length > 1 && new URLSearchParams(location.search).has("compare")) parts.push(history_(attempts));
  $("right").replaceChildren(...parts);
  // ---- actions
  const a = (txt, href, cls) => { const x = el("a", "mp-pill " + cls, txt); x.href = href; return x; };
  const sid = A.site;
  $("actions").replaceChildren(a("↻ " + t("deb.again"), hrefTo("landing.html"), "is-primary"),
    a("▥ " + t("deb.compare"), hrefTo("debrief.html") + (location.search ? "&" : "?") + "compare=1", ""), a("◍ " + t("deb.explore", { s: A.siteName }), hrefTo("explore.html", { ...getState(), site: sid }), ""));
  drawMap(A, kp, rules);
}
function history_(list) {
  const s = el("section", "deb-card black"); s.append(el("h3", "", t("deb.hist")));
  const tb = el("table", "deb-hist"); const hd = el("tr"); for (const k of ["n", "res", "vz", "dist", "fuel"]) hd.append(el("th", "", t("deb.hist." + k))); tb.append(hd);
  for (const a of list) { const r = el("tr"); const ff = fuelFrac(a.fuelEndKg, a.fuelStartKg);
    r.append(el("td", "", String(a.n)), el("td", "", t("deb.res." + a.result)), el("td", "", a.contact ? fmt(-a.contact.vVert, 1) : t("nd")), el("td", "", a.contact ? fmt(a.contact.dist) : t("nd")), el("td", "", ff == null ? t("nd") : fmt(ff * 100))); tb.append(r); }
  s.append(tb); return s;
}
function none() {
  $("left").replaceChildren(); $("right").replaceChildren(); $("actions").replaceChildren();
  const b = el("section", "deb-card deb-none"); b.append(el("h2", "", t("deb.none.title")), el("p", "mp-label", t("deb.none.body")), Object.assign(el("a", "mp-pill is-primary", t("deb.none.go")), { href: hrefTo("landing.html") }));
  b.append(el("div", "")); b.lastChild.append(sealEl("N/D"));
  document.querySelector(".deb-none")?.remove(); document.body.append(b);
  const cv = $("map"); cv.width = innerWidth; cv.height = innerHeight; cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
  cv.setAttribute("aria-label", t("deb.map.label"));
}

// Top view: hillshade of the site tile (web/data LOLA 80 m) + real trajectory + ideal line + target zone.
function drawMap(a, kp) {
  document.querySelector(".deb-none")?.remove();
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1); const W = innerWidth, H = cv.clientHeight || innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext("2d"); c.scale(dpr, dpr); cv.setAttribute("aria-label", t("deb.map.label"));
  const mobile = innerWidth <= 700;
  const area = mobile ? { l: 16, r: W - 16, t: 120, b: H - 24 } : { l: 28 + 380 + 40, r: W - 28 - 380 - 40, t: 150, b: H - 100 };
  const pts = a.trace.filter(p => Number.isFinite(p.x)), xs = [...pts.map(p => p.x), 0], ys = [...pts.map(p => p.y), 0];
  const pad = a.zoneRadiusM * 3;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const sc = Math.min((area.r - area.l) / (x1 - x0), (area.b - area.t) / (y1 - y0));
  const cx = (area.l + area.r) / 2 - sc * (x0 + x1) / 2, cy = (area.t + area.b) / 2 + sc * (y0 + y1) / 2;
  const P = (x, y) => [cx + sc * x, cy - sc * y];
  // hillshade, full bleed
  c.fillStyle = "#07090C"; c.fillRect(0, 0, W, H);
  if (tile) {
    const step = Math.max(4, Math.round(6)); const Lg = [-0.6, 0.55, 0.58], k = 1 / Math.hypot(...Lg);
    for (let py = 0; py < H; py += step) for (let px = 0; px < W; px += step) {
      const x = (px - cx) / sc, y = (cy - py) / sc, e = tile.dx;
      const hx = (tile.height(x + e, y) - tile.height(x - e, y)) / (2 * e), hy = (tile.height(x, y + e) - tile.height(x, y - e)) / (2 * e);
      if (!Number.isFinite(hx + hy)) continue;
      const ex = 8, hx2 = hx * ex, hy2 = hy * ex; // vertical exaggeration for legibility of the 80 m relief (visual only)
      const lam = Math.max(0, (-hx2 * Lg[0] - hy2 * Lg[1] + Lg[2]) * k / Math.hypot(hx2, hy2, 1)), v = Math.round(20 + 170 * Math.pow(lam, 1.6));
      c.fillStyle = `rgb(${v},${v + 2},${v + 6})`; c.fillRect(px, py, step, step);
    }
  }
  // target zone
  const [zx, zy] = P(0, 0), zr = a.zoneRadiusM * sc;
  c.fillStyle = "rgba(46,196,160,.18)"; c.strokeStyle = "#2EC4A0"; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.arc(zx, zy, zr, 0, 7); c.fill(); c.stroke(); c.setLineDash([]);
  // ideal route: straight start → zone centre (geometric reference)
  const st = pts[0]; if (st) { const [sx, sy] = P(st.x, st.y); c.strokeStyle = "#2EC4A0"; c.lineWidth = 2.5; c.setLineDash([9, 7]); c.beginPath(); c.moveTo(sx, sy); c.lineTo(zx, zy); c.stroke(); c.setLineDash([]); }
  // real trajectory
  c.strokeStyle = "#F2F4F5"; c.lineWidth = 3; c.setLineDash([2, 6]); c.lineCap = "round"; c.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p.x, p.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
  const node = (p, txt, hl) => { if (!p) return; const [x, y] = P(p.x, p.y); c.fillStyle = "#050607"; c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 13, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#fff"; c.font = "800 13px Manrope,system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, x, y + 1); };
  const label = (p, txt, orange) => { if (!p) return; const [x, y] = P(p.x, p.y); c.font = "700 12.5px Manrope,system-ui,sans-serif"; const w = c.measureText(txt).width + 20; c.fillStyle = orange ? "#F0A04B" : "#F2F4F5"; c.beginPath(); c.roundRect(x + 20, y - 12, w, 24, 12); c.fill(); c.fillStyle = "#07090C"; c.textAlign = "left"; c.fillText(txt, x + 30, y + 1); };
  const labelBelow = (p, txt) => { const [x, y] = P(p.x, p.y); c.font = "700 12.5px Manrope,system-ui,sans-serif"; const w = c.measureText(txt).width + 20; c.fillStyle = a.result === "LANDED" ? "#2EC4A0" : "#F2F4F5"; c.beginPath(); c.roundRect(x - w / 2, y + 18, w, 24, 12); c.fill(); c.fillStyle = "#07090C"; c.textAlign = "center"; c.fillText(txt, x, y + 31); };
  if (st) { const [sx, sy] = P(st.x, st.y); c.fillStyle = "#F2F4F5"; c.beginPath(); c.arc(sx, sy, 12, 0, 7); c.fill(); label(st, t("deb.start", { d: fmt(a.start?.alt) }), false); }
  const late = brakingAssessment(a).late;
  if (kp.brake) { node(kp.brake, "1"); label(kp.brake, late ? t("deb.p1.late") : t("deb.p1"), false); }
  const same = kp.peak && a.contact && Math.hypot(...P(kp.peak.x, kp.peak.y).map((v, i) => v - P(a.contact.x, a.contact.y)[i])) < 30;
  if (kp.peak) { if (!same) node(kp.peak, "2"); label(same ? { x: kp.peak.x, y: kp.peak.y + 36 / sc } : kp.peak, t("deb.p2", { h: fmt(kp.peak.alt), v: fmt(-kp.peak.vz, 1) }), true); }
  if (a.contact) { const [tx, ty] = P(a.contact.x, a.contact.y); const good = a.result === "LANDED"; c.fillStyle = good ? "#2EC4A0" : "#E5484D"; c.beginPath(); c.arc(tx, ty, 11, 0, 7); c.fill(); c.fillStyle = good ? "#04110D" : "#fff"; c.font = "800 14px Manrope,system-ui,sans-serif"; c.textAlign = "center"; c.fillText(good ? "✓" : "✕", tx, ty + 1); labelBelow({ x: a.contact.x, y: a.contact.y }, t("deb.touch", { n: fmt(a.contact.dist) })); }
  // legend: ideal route
  c.strokeStyle = "#2EC4A0"; c.lineWidth = 2.5; c.setLineDash([9, 7]); const lx = area.l + 10, ly = area.t - 6; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 36, ly); c.stroke(); c.setLineDash([]);
  c.fillStyle = "#F2F4F5"; c.font = "700 12.5px Manrope,system-ui,sans-serif"; c.textAlign = "left"; c.fillText(t("deb.ideal"), lx + 44, ly + 1);
  { const [zx2, zy2] = P(0, 0); c.font = "700 12.5px Manrope,system-ui,sans-serif"; c.fillStyle = "#2EC4A0"; c.textAlign = "center"; c.fillText(t("deb.zone"), zx2, zy2 - a.zoneRadiusM * sc - 8); }
}
draw();
addEventListener("resize", () => { if (A) draw(); });
