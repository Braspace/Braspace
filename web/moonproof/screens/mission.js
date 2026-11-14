// Core demo (A · Mission Control, minimal): terrain, 5 real sites, context bar, stat circle, one 3-layer card.
// Every number comes from web/data/ (PRELIMINARY → seal PRE). The full screen A is card BR77.
import { mountShell, dockEl, hintEl } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, dailySun, sealFor, apiOnline } from "../core/data.js";
import { createLayerCard, statCircle, barEl } from "../core/layers.js";
import { t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState } from "../core/state.js";

const shell = mountShell({ screen: "mission", context: null, onLang: () => draw() });
const doc = await loadSites();
const st0 = getState();
if (!doc.sites.some(s => s.id === st0.site)) setState({ site: doc.sites[0].id });
const DAY = 24;
const hours = () => getState().hours || 14 * DAY; // window length is a user parameter (?hours=)
const online = await apiOnline();
const terrain = await mountTerrain(document.getElementById("terrain"), {
  sites: doc.sites, selected: getState().site, route: doc.sites.map(s => s.id),
  onSelect: id => setState({ site: id }),
});
terrain.select(getState().site);

async function draw() {
  const st = getState(); const site = doc.sites.find(s => s.id === st.site);
  const m = await windowMetrics(doc, site, st.start, hours());
  const fmtDate = d => new Intl.DateTimeFormat(lang(), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
  shell.setContext({ site: `${site.n} · ${site.name}`, date: fmtDate(new Date(m.t0)), days: fmtNum(hours() / DAY),
    seal: sealFor(doc.status), online, action: { label: t("ctx.compare"), href: "compare.html" + location.search } });
  const v = (x, d = 0) => x.value == null ? t("nd") : fmtNum(x.value, d) + (x.unit === "%" ? "%" : x.unit === "°" ? "°" : "\u00a0" + x.unit);
  document.getElementById("left").replaceChildren(statCircle({
    value: v(m.sunPct), label: t("mission.sunVisible"), seal: m.sunPct.seal,
    satellites: [{ value: v(m.longestDarkH), label: t("mission.nights") }, { value: v(m.earthPct), label: t("mission.earth") },
      { value: v(m.longestBlackoutH), label: t("mission.blackout") }, { value: v(m.maxSunElDeg, 1), label: t("mission.maxSun") }] }));
  const why = document.createElement("div");
  const p = document.createElement("p"); p.className = "mp-label"; p.textContent = t("mission.why.sun");
  why.append(barEl(dailySun(m.series, m.t0, hours())), p);
  const card = createLayerCard({ id: "card-sun", title: t("mission.card.sun"), status: m.sunPct.status,
    answer: t("mission.answer.sun", { pct: v(m.sunPct), hours: fmtNum(hours()) }), why, layer: st.layer,
    onLayer: layer => setState({ layer }),
    proof: [[t("proof.definition"), t("proof.definition.sun")], [t("proof.step"), m.sunPct.detail.step],
      [t("proof.window"), `${m.sunPct.detail.start} · ${fmtNum(hours())} h`],
      [t("proof.source"), `${m.series.meta.site?.source || site.source} · ${m.sunPct.source}`],
      [t("proof.sha"), Object.assign(document.createElement("code"), { className: "mp-coord", textContent: m.sunPct.detail.sha256 })],
      [t("proof.status"), `${m.sunPct.status} · ${t("seal." + m.sunPct.seal)}`]] });
  document.getElementById("right").replaceChildren(card.el);
  const i = doc.sites.indexOf(site), n = doc.sites.length;
  document.getElementById("dock").replaceChildren(dockEl({ label: `${t("ctx.site")} ${site.n}`,
    onPrev: () => setState({ site: doc.sites[(i + n - 1) % n].id }), onNext: () => setState({ site: doc.sites[(i + 1) % n].id }),
    onSelect: () => terrain.select(site.id), onZoomOut: () => terrain.zoom(0.7), onZoomIn: () => terrain.zoom(1.4) }), hintEl(t("hint.map")));
}
let last = getState().site;
onState(s => { if (s.site !== last) { last = s.site; terrain.select(s.site); } draw(); });
draw();
