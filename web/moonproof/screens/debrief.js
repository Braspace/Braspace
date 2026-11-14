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
// Line icons (24 px grid, 1.5 stroke) as in the design. Static markup only.
const ico = (d, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICO = {
  check: '<path d="M5 12l5 5 9-10"/>', vz: '<path d="M12 3v18"/><path d="M8 7l4-4 4 4"/><path d="M4 21h16"/>', dist: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  slope: '<path d="M3 20h18L3 8z"/><path d="M8 20a5 5 0 0 0-1.5-3.6"/>', fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h4"/>',
  again: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>', compare: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>',
  explore: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', chev: '<path d="M6 9l6 6 6-6"/>',
};
const MODULE_PATH = "M9 4h6l2 7H7z M7 11l-3 8M17 11l3 8M10 11l-1 8M14 11l1 8 M2 19h5M17 19h5";
// "**bold**" inside a translated tip becomes <b>; the text is ours, never user input.
const rich = (node, str) => { str.split("**").forEach((part, i) => node.append(i % 2 ? Object.assign(el("b"), { textContent: part }) : part)); return node; };
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
  const dot = () => el("span", "deb-dot", "•");
  const parts = [el("b", "", t("deb.context")), dot(), el("span", "", A ? t("deb.attempt", { n: A.n }) : t("nd")), dot(), el("span", "", A ? `${s ? s.n + " · " : ""}${A.siteName}` : t("nd"))];
  const change = el("a", "deb-change", t("deb.change")); change.insertAdjacentHTML("beforeend", ico(ICO.chev, 13)); change.href = hrefTo("explore.html");
  ctx.replaceChildren(...parts, change, sealEl("SIM"));
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
  const good = vk === "safe" || vk === "lowfuel"; // low fuel still landed inside every other rule: same green check as the design
  const ic = el("div", "deb-ic", good ? "" : (["crash", "out"].includes(vk) ? "✕" : "!")); if (good) ic.innerHTML = ico(ICO.check, 28); ic.dataset.k = good ? "ok" : ["crash", "out", "hard"].includes(vk) ? "bad" : "warn"; ic.setAttribute("aria-hidden", "true");
  const used = A.fuelStartKg > 0 ? A.fuelUsedKg / A.fuelStartKg : null;
  const sum = A.burnStart == null ? t("deb.sum.nobrake") : (ba.late ? t("deb.sum.brake", { v: fmt(kp.peak ? -kp.peak.vz : NaN, 1), f: fmt(used == null ? NaN : used * 100), s: fmt(A.flightS - A.burnStart.t) }) : t("deb.sum.ok", { f: fmt(used == null ? NaN : used * 100), s: fmt(A.flightS) }));
  const how = el("section", "deb-card"); how.append(el("div", "mp-label", t("deb.how")));
  const row = el("div", "deb-how"); const tx = el("div"); tx.append(el("p", "deb-verdict", t("deb.v." + vk)), el("p", "deb-sum", sum)); row.append(ic, tx); how.append(row);
  const st = (state, lowWord) => { const s = el("span", "deb-st", state === "ok" ? t("deb.ok") : state === "nd" ? "N/D" : (lowWord ? t("deb.low") : t("deb.fail"))); s.dataset.s = state === "ok" ? "ok" : state === "nd" ? "nd" : (lowWord ? "low" : "fail"); return s; };
  const R = id => rules.find(r => r.id === id);
  const pill = (icon, label, value, stEl) => { const p = el("div", "deb-pill"); p.insertAdjacentHTML("afterbegin", ico(icon)); p.append(el("span", "lb", label), el("span", "v", value), stEl); return p; };
  const pills = el("div", "deb-pills");
  pills.append(
    pill(ICO.vz, t("deb.m.vz"), c ? fmt(-c.vVert, 1) + " m/s" : t("nd"), st(R("soft").state)),
    pill(ICO.dist, t("deb.m.dist"), c ? fmt(c.dist) + " m" : t("nd"), st(R("target").state)),
    pill(ICO.slope, t("deb.m.slope"), c ? fmt(c.slope, 1) + "°" : t("nd"), st(R("slope").state)),
    pill(ICO.fuel, t("deb.m.fuel"), ffEnd == null ? t("nd") : fmt(ffEnd * 100) + "%", st(R("fuel").state, true)));
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
  for (const r of rules) { const li = el("li"); const tag = el("span", "tag", r.state === "ok" ? t("deb.ok") : r.state === "nd" ? "N/D" : (r.id === "fuel" ? t("deb.r.low") : t("deb.fail"))); tag.dataset.s = r.state === "fail" && r.id === "fuel" ? "low" : r.state; li.append(el("span", "", t("deb.r." + r.id)), tag); ul.append(li); }
  rl.append(rh, ul, el("p", "mp-label", t("deb.rules.note")));
  const nx = el("section", "deb-card deb-next"); nx.append(el("h3", "", t("deb.next")));
  const ol = el("ol"); const tips = [];
  const needH = ba.needH != null ? ba.needH : null;
  if (needH != null) tips.push(t("deb.next.brake", { n: fmt(Math.ceil(needH * ASSUMED.brakeMargin / 10) * 10) }));
  if (R("lateral").state === "fail") tips.push(t("deb.next.lateral")); else if (R("fuel").state === "fail") tips.push(t("deb.next.fuel"));
  tips.push(t("deb.next.cam"));
  for (const x of tips) { const li = el("li"); li.append(rich(el("span"), x)); ol.append(li); }
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
  const a = (icon, txt, href, cls) => { const x = el("a", "mp-pill " + cls); x.innerHTML = ico(icon, 17); x.append(txt); x.href = href; return x; };
  const sid = A.site;
  $("actions").replaceChildren(a(ICO.again, t("deb.again"), hrefTo("landing.html"), "is-primary"),
    a(ICO.compare, t("deb.compare"), hrefTo("debrief.html") + (location.search ? "&" : "?") + "compare=1", ""), a(ICO.explore, t("deb.explore", { s: A.siteName }), hrefTo("explore.html", { ...getState(), site: sid }), ""));
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
  const area = mobile ? { l: 16, r: W - 16, t: 120, b: H - 24 } : { l: 28 + 330 + 40, r: W - 28 - 320 - 40, t: 150, b: H - 100 };
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
  // target zone (real radius, scaled)
  const [zx, zy] = P(0, 0), zr = a.zoneRadiusM * sc;
  c.fillStyle = "rgba(46,196,160,.12)"; c.strokeStyle = "#2EC4A0"; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.arc(zx, zy, zr, 0, 7); c.fill(); c.stroke(); c.setLineDash([]);
  // ideal route: straight start → zone centre (geometric reference)
  const st = pts[0]; if (st) { const [sx, sy] = P(st.x, st.y); c.save(); c.globalAlpha = .8; c.strokeStyle = "#2EC4A0"; c.lineWidth = 1.6; c.setLineDash([6, 6]); c.lineCap = "round"; c.beginPath(); c.moveTo(sx, sy); c.lineTo(zx, zy); c.stroke(); c.restore(); }
  // real trajectory: white dotted line
  c.strokeStyle = "#F2F4F5"; c.lineWidth = 2.4; c.setLineDash([1, 9]); c.lineCap = "round"; c.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p.x, p.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
  const FONT = "Manrope,system-ui,sans-serif";
  const icon = (x, y, d, color, size = 18) => { c.save(); c.translate(x - size / 2, y - size / 2); c.scale(size / 24, size / 24); c.strokeStyle = color; c.lineWidth = 1.5; c.lineCap = c.lineJoin = "round"; c.stroke(new Path2D(d)); c.restore(); };
  const node = (p, txt) => { if (!p) return; const [x, y] = P(p.x, p.y); c.fillStyle = "#050607"; c.strokeStyle = "#F2F4F5"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 20, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#fff"; c.font = `800 15px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, x, y + 1); };
  const pillAt = (x, y, txt, bg, centered) => { c.font = `700 11.5px ${FONT}`; const w = c.measureText(txt).width + 20; const l = centered ? x - w / 2 : x; c.fillStyle = bg; c.beginPath(); c.roundRect(l, y - 12, w, 24, 12); c.fill(); c.fillStyle = "#0A0D10"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, l + w / 2, y + 1); };
  const label = (p, txt, orange) => { if (!p) return; const [x, y] = P(p.x, p.y); pillAt(x + 28, y, txt, orange ? "#F29A45" : "#F2F4F5", false); };
  const labelBelow = (p, txt) => { const [x, y] = P(p.x, p.y); pillAt(x, y + 40, txt, a.result === "LANDED" ? "#2EC4A0" : "#F2F4F5", true); };
  if (st) { const [sx, sy] = P(st.x, st.y); c.fillStyle = "#F2F4F5"; c.beginPath(); c.arc(sx, sy, 17, 0, 7); c.fill(); icon(sx, sy, MODULE_PATH, "#04110D"); pillAt(sx, sy - 30, t("deb.start", { d: fmt(a.start?.alt) }), "#F2F4F5", true); }
  const late = brakingAssessment(a).late;
  if (kp.brake) { node(kp.brake, "1"); label(kp.brake, late ? t("deb.p1.late") : t("deb.p1"), false); }
  const same = kp.peak && a.contact && Math.hypot(...P(kp.peak.x, kp.peak.y).map((v, i) => v - P(a.contact.x, a.contact.y)[i])) < 30;
  if (kp.peak) { if (!same) node(kp.peak, "2"); label(same ? { x: kp.peak.x, y: kp.peak.y + 40 / sc } : kp.peak, t("deb.p2", { h: fmt(kp.peak.alt), v: fmt(-kp.peak.vz, 1) }), true); }
  if (a.contact) { const [tx, ty] = P(a.contact.x, a.contact.y); const good = a.result === "LANDED"; c.fillStyle = good ? "#2EC4A0" : "#E5484D"; c.beginPath(); c.arc(tx, ty, 17, 0, 7); c.fill(); if (good) icon(tx, ty, "M5 12l5 5 9-10", "#04110D"); else { c.fillStyle = "#fff"; c.font = `800 14px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("✕", tx, ty + 1); } labelBelow({ x: a.contact.x, y: a.contact.y }, t("deb.touch", { n: fmt(a.contact.dist) })); }
  // legend: ideal route, a glass pill as in the design
  c.font = `600 12px ${FONT}`; const lt = t("deb.ideal"), lw = c.measureText(lt).width + 12 + 16 + 8 + 12, lx = area.l + 10, ly = area.t - 6;
  c.fillStyle = "rgba(12,15,18,.58)"; c.strokeStyle = "rgba(255,255,255,.1)"; c.lineWidth = 1; c.beginPath(); c.roundRect(lx, ly - 15, lw, 30, 15); c.fill(); c.stroke();
  c.strokeStyle = "#2EC4A0"; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(lx + 12, ly); c.lineTo(lx + 28, ly); c.stroke(); c.setLineDash([]);
  c.fillStyle = "#F2F4F5"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(lt, lx + 36, ly + 1);
  { const [zx2, zy2] = P(0, 0); c.font = "700 12.5px Manrope,system-ui,sans-serif"; c.fillStyle = "#2EC4A0"; c.textAlign = "center"; c.fillText(t("deb.zone"), zx2, zy2 - a.zoneRadiusM * sc - 8); }
}
draw();
addEventListener("resize", () => { if (A) draw(); });
