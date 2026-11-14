// Card in 3 layers (Answer → Why → Proof), opening in place. Seal comes from the value's origin only.
import { t } from "./i18n.js";
import { LAYERS } from "./state.js";
import { sealFor } from "./data.js";

export function sealEl(seal) {
  const s = document.createElement("span");
  s.className = "mp-seal"; s.dataset.seal = seal; s.textContent = seal;
  s.title = t("seal." + seal); s.setAttribute("aria-label", seal + " · " + t("seal." + seal));
  return s;
}

/**
 * createLayerCard({ id, title, status, answer, why, proof, layer, onLayer })
 *  - status: origin state string (seal = sealFor(status); VAL only for "VALIDATED")
 *  - answer: string | Node; why: Node | (() => Node); proof: [[label, value], ...] | Node
 *  - layer: "answer" | "why" | "proof" (initial depth)
 * Returns { el, setLayer(layer) }.
 */
export function createLayerCard({ id, title, status, answer, why, proof, layer = "answer", onLayer }) {
  const el = document.createElement("article");
  el.className = "mp-card mp-layer"; if (id) el.id = id;
  el.dataset.status = String(status || "");
  const head = document.createElement("div"); head.className = "mp-layer-head";
  const h = document.createElement("h3"); h.textContent = title; head.append(h, sealEl(sealFor(status)));
  const ans = document.createElement("p"); ans.className = "mp-layer-answer"; ans.append(answer ?? t("nd"));
  const whyS = document.createElement("section"); whyS.innerHTML = `<h4></h4>`; whyS.firstChild.textContent = t("layer.why");
  if (why) whyS.append(typeof why === "function" ? why() : why);
  const proofS = document.createElement("section"); proofS.innerHTML = `<h4></h4>`; proofS.firstChild.textContent = t("layer.proof");
  if (Array.isArray(proof)) {
    const tb = document.createElement("table"); tb.className = "mp-proof";
    for (const [k, v] of proof) { const tr = tb.insertRow(); const th = document.createElement("th"); th.scope = "row"; th.textContent = k; tr.append(th); tr.insertCell().append(v ?? t("nd")); }
    proofS.append(tb);
  } else if (proof) proofS.append(proof);
  const chips = document.createElement("div"); chips.className = "mp-chips"; chips.setAttribute("role", "group"); chips.setAttribute("aria-label", title);
  const btns = LAYERS.map((l, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "mp-chip"; b.dataset.layer = l; b.textContent = `${i + 1} ${t("layer." + l)}`; b.onclick = () => set(l, true); chips.append(b); return b; });
  el.append(head, ans, whyS, proofS, chips);
  function set(l, user) {
    const d = Math.max(0, LAYERS.indexOf(l));
    whyS.hidden = d < 1; proofS.hidden = d < 2;
    btns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === d)));
    el.dataset.layer = LAYERS[d];
    if (user && onLayer) onLayer(LAYERS[d]);
  }
  set(layer, false);
  return { el, setLayer: l => set(l, false) };
}

/** A segmented bar: fractions 0..1 (null = unknown, hatched). */
export function barEl(fracs, color = "var(--sun)") {
  const bar = document.createElement("div"); bar.className = "mp-bar"; bar.setAttribute("role", "img");
  for (const f of fracs) { const i = document.createElement("i"); i.style.flex = "1"; i.style.margin = "0 1px";
    i.style.background = f == null ? "repeating-linear-gradient(135deg,#808C99 0 2px,transparent 2px 4px)" : `linear-gradient(to top, ${color} ${Math.round(f * 100)}%, #1a1f25 0)`;
    bar.append(i); }
  return bar;
}

/** Stat circle: core {value,label,seal} + up to 4 satellites [{value,label}] (12, 3, 6, 9 o'clock). */
export function statCircle({ value, label, seal, satellites = [] }) {
  const el = document.createElement("figure"); el.className = "mp-stat"; el.style.margin = "0";
  const core = document.createElement("div"); core.className = "mp-stat-core";
  const n = document.createElement("span"); n.className = "mp-num"; n.textContent = value;
  const s = document.createElement("small"); s.textContent = label; core.append(n, s);
  if (seal) { const sl = sealEl(seal); sl.style.marginTop = "6px"; core.append(sl); }
  el.append(core);
  for (const [k, sat] of satellites.slice(0, 4).entries()) { const d = document.createElement("div"); d.className = "mp-sat"; d.dataset.pos = String(k); const b = document.createElement("b"); b.textContent = sat.value; const sp = document.createElement("span"); sp.textContent = sat.label; d.append(b, sp); el.append(d); }
  return el;
}
