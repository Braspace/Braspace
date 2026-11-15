// moonproof base components (v3): provenance badges, three-layer card, provenance strip.
// Pure DOM builders (no innerHTML with data) so text from data can never inject markup.
// Works as an ES module (shell) and as a classic script (onboard cockpit) via window.MoonproofDS.

/** Provenance kinds. Every number shown in the product carries one of these (unless it equals the page's global badge). */
export const PROV = {
  val: { label: "VAL", title: "Valor calculado de dado real (NASA/JPL)" },
  est: { label: "EST", title: "Estimativa derivada de dado real (modelo nosso)" },
  sim: { label: "SIM", title: "Simulação ou dado sintético" },
  nd: { label: "N/D", title: "Não disponível ou não calculado" },
};

/** h(tag, attrs, ...children) — children are nodes or strings (strings become text nodes). */
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}

/** Badge element. kind ∈ val|est|sim|nd|ok|bad|warn; text overrides the label. */
export function badge(kind, text) {
  const p = PROV[kind];
  return h("span", { class: "prov " + kind, title: p ? p.title : null, text: text || (p ? p.label : kind) });
}

/** Format a number or return "N/D" — never 0 or a placeholder for a missing value. */
export function num(v, digits = 0, unit = "") {
  return Number.isFinite(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + unit : "N/D";
}
/** Hours as "46 h" or "3,2 d" for long spans; N/D when missing. */
export function hours(v) {
  if (!Number.isFinite(v)) return "N/D";
  return v >= 48 ? num(v / 24, 1, " d") : num(v, 0, " h");
}

let l3Seq = 0;
/**
 * Three-layer card. opts:
 *  title, badge (kind) and globalBadge (kind) — the card shows its badge only when it differs from the page's global one;
 *  answer: Node|string (layer 1, plain language); why: Node|string (layer 2, reasoning);
 *  proof: [[label, value], ...] (layer 3, definition/source/limits); level: 0|1|2 initial; surface: "solid"|"glass".
 */
export function layerCard(opts) {
  const id = "l3-" + (++l3Seq);
  const level = Math.max(0, Math.min(2, opts.level ?? 0));
  const card = h("section", { class: "l3 " + (opts.surface || "solid"), "data-level": String(level), "aria-labelledby": id + "-t" });
  const showBadge = opts.badge && opts.badge !== opts.globalBadge;
  card.append(h("header", {}, h("h2", { class: "h-card", id: id + "-t", text: opts.title }), showBadge ? badge(opts.badge) : null));
  card.append(h("p", { class: "l3-ans" }, opts.answer));
  const why = h("div", { class: "l3-why", id: id + "-why" }, h("span", { class: "lbl-s", text: "Por quê" }), typeof opts.why === "string" ? h("p", { text: opts.why }) : opts.why);
  const proof = h("div", { class: "l3-proof", id: id + "-proof" }, h("span", { class: "lbl-s", text: "Prova" }),
    h("dl", {}, (opts.proof || []).map(([k, v]) => [h("dt", { text: k }), h("dd", {}, v)])));
  card.append(why, proof);
  const tabs = h("div", { class: "l3-tabs", role: "group", "aria-label": "Profundidade do cartão " + opts.title });
  ["1 Resposta", "2 Por quê", "3 Prova"].forEach((label, i) => tabs.append(h("button", {
    type: "button", "aria-pressed": String(i === level), "aria-controls": i === 0 ? null : id + (i === 1 ? "-why" : "-proof"), text: label,
    onclick: () => setLevel(card, i),
  })));
  card.append(tabs);
  return card;
}
export function setLevel(card, level) {
  card.dataset.level = String(level);
  card.querySelectorAll(".l3-tabs button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === level)));
}

/**
 * Provenance strip: replaces loose status chips with one component.
 * items: [{kind, text}] (e.g. {kind:"sim", text:"Protótipo · dados sintéticos quando indicado"});
 * api: "ok" | "off" | "unknown" | null.
 */
export function provenanceStrip({ items = [], api = null, note = null } = {}) {
  const strip = h("div", { class: "pstrip glass", role: "status", "aria-label": "Procedência dos dados" }, h("span", { class: "k", text: "Procedência" }));
  for (const it of items) strip.append(h("span", { class: "it" }, badge(it.kind), it.text));
  if (api) strip.append(h("span", { class: "it" }, "API:", h("span", { class: api === "ok" ? "api-ok" : "api-off", text: api === "ok" ? "OK" : api === "off" ? "offline" : "verificando…" })));
  if (note) strip.append(h("span", { class: "it t3", text: note }));
  return strip;
}

/** Set flex-grow/height/width from data-* attributes (CSP-safe sizing via CSSOM). */
export function applySizes(root) {
  root.querySelectorAll("[data-flex]").forEach(e => { e.style.flexGrow = e.dataset.flex; });
  root.querySelectorAll("[data-h]").forEach(e => { e.style.height = e.dataset.h + "%"; });
  root.querySelectorAll("[data-w]").forEach(e => { e.style.width = e.dataset.w + "%"; });
}

if (typeof window !== "undefined") window.MoonproofDS = { PROV, h, badge, num, hours, layerCard, setLevel, provenanceStrip, applySizes };
