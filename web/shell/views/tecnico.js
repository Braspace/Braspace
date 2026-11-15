// Comparação técnica (#/comparar/tecnico) — design V3ComparePlan (Planejamento kit):
// editable rules (assumptions), full metric table with margins and origin, exports and a reproducible link.
import { h, badge, num } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { hourlyRows } from "../data.js";
import { METRICS, RULE_DEFAULTS, rulesToQuery } from "../compare.js";
import { loadComparison, sitePickers, fmtMetric } from "./comparar.js";
import { contextBar, LETTERS, isoHour, download, setQuery } from "./common.js";

const short = n => n.replace(/\s*\(.*\)$/, "");

export async function render(outlet, ctx) {
  const { sc, entries, rules, result } = await loadComparison(ctx);
  const { rows } = result;

  const head = h("div", { class: "page-head" },
    h("div", {}, h("p", { class: "lbl-s", text: "Kit Planejamento" }),
      h("h1", { "data-route-title": "", text: "Comparação técnica" })),
    contextBar(ctx, sc, { siteSelect: false }));

  // editable rules — premissas, never mission requirements
  const field = (key, label, unit) => h("label", { class: "fld" }, h("span", { class: "lbl-s", text: label + " (" + unit + ")" }),
    h("input", { type: "number", min: "0", step: "1", name: key, value: String(rules[key]), inputmode: "numeric" }),
    h("small", { class: "t3", text: "padrão do protótipo: " + RULE_DEFAULTS[key] }));
  const form = h("form", { class: "solid card rules", "aria-labelledby": "rules-t" },
    h("h2", { class: "h-card", id: "rules-t", text: "Regras (premissas editáveis)" }),
    h("div", { class: "cards3" }, field("maxNightH", "Noite máxima", "h"), field("maxEarthLossH", "Perda máxima da Terra", "h"), field("minSunPct", "Sol visível mínimo", "%")),
    h("p", { class: "t3 small", text: "Altura do mastro, declividade e piso de bateria: N/D nesta versão (não calculados para as séries reais)." }),
    h("div", { class: "row wrap" }, h("button", { type: "submit", class: "btnA", text: "Recalcular" }),
      h("button", { type: "button", class: "btnG", text: "Voltar ao padrão", onclick: () => setQuery(ctx, rulesToQuery(RULE_DEFAULTS)) })));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(form), r = {};
    for (const k of Object.keys(RULE_DEFAULTS)) r[k] = Number(fd.get(k));
    setQuery(ctx, rulesToQuery(r));
  });

  // full metric table: Métrica, Unid., A, B, C, Regra, Margem por local, Origem
  const table = h("table", { class: "mtab" },
    h("caption", { class: "sr", text: "Métricas por local na janela de " + sc.days + " dias" }),
    h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Métrica" }), h("th", { scope: "col", text: "Unid." }),
      rows.map((r, i) => h("th", { scope: "col", text: LETTERS[i] + " · " + short(r.name) })),
      h("th", { scope: "col", text: "Regra" }), h("th", { scope: "col", text: "Margem (" + LETTERS.slice(0, rows.length).join(" / ") + ")" }), h("th", { scope: "col", text: "Origem" }))),
    h("tbody", {},
      METRICS.map(m => h("tr", {}, h("th", { scope: "row", text: m.label }), h("td", { text: m.unit }),
        rows.map(r => h("td", { class: "num", text: r.computed ? fmtMetric(r.w[m.key], m.unit) : "N/D" })),
        h("td", { text: m.rule ? m.text(rules) : "—" }),
        h("td", { class: "num", text: m.rule ? rows.map(r => { const c = r.checks.find(x => x.key === m.key); return c && Number.isFinite(c.margin) ? (c.margin >= 0 ? "+" : "") + num(c.margin, 0) : "N/D"; }).join(" / ") : "—" }),
        h("td", {}, badge("est"), " LOLA + SPICE"))),
      h("tr", {}, h("th", { scope: "row", text: "Folga da bateria" }), h("td", { text: "Wh" }), rows.map(() => h("td", { text: "N/D" })), h("td", { text: "—" }), h("td", { text: "N/D" }), h("td", {}, badge("nd"), " não calculado")),
      h("tr", {}, h("th", { scope: "row", text: "Altura do relevo" }), h("td", { text: "m" }), rows.map(r => h("td", { class: "num", text: num(r.site.site_height_m, 0) })), h("td", { text: "—" }), h("td", { text: "—" }), h("td", {}, badge("est"), " LOLA LDEM_80S_80M"))));

  const passport = () => ({
    schema: "moonproof.passport.v1",
    generated_utc: new Date().toISOString(),
    link: location.href,
    window: { start_utc: isoHour(sc.t0), days: sc.days, step_minutes: 60 },
    rules: { ...rules, note: "prototype assumptions, not mission requirements" },
    sites: rows.map((r, i) => ({
      letter: LETTERS[i], id: r.id, name: r.name, lat: r.site.lat, lon: r.site.lon, source: r.site.source,
      metrics: r.computed ? Object.fromEntries(METRICS.map(m => [m.key, r.w[m.key]])) : null, battery_margin: "N/D",
      passes_all_rules: r.computed ? r.passAll : null,
      series_sha256: r.series ? r.series.meta.series.sha256 : null, science_status: r.series ? r.series.meta.science_status : null,
      provenance: r.series ? r.series.meta.provenance : null,
    })),
    disclaimer: "Preliminary, not NASA-reviewed. No flight recommendation.",
  });
  const exp = h("section", { class: "solid card" }, h("h2", { class: "h-card", text: "Exportar e reproduzir" }),
    h("div", { class: "row wrap" },
      h("button", { type: "button", class: "btnG", text: "CSV horário", onclick: () => {
        const lines = ["site,utc,sun_az_deg,sun_el_deg,sun_margin_deg,earth_az_deg,earth_el_deg,earth_margin_deg"];
        for (const r of rows) if (r.series) for (const row of hourlyRows(r.series, sc.t0, sc.hours)) lines.push(r.id + "," + row.map(x => (typeof x === "number" ? x.toFixed(3) : x)).join(","));
        download("moonproof_" + isoHour(sc.t0).slice(0, 10) + "_" + sc.days + "d.csv", lines.join("\n"), "text/csv");
      } }),
      h("button", { type: "button", class: "btnG", text: "JSON", onclick: () => download("moonproof_comparacao.json", JSON.stringify({ rules, rows: rows.map(r => ({ id: r.id, w: r.w, checks: r.checks, passAll: r.passAll })) }, null, 2), "application/json") }),
      h("button", { type: "button", class: "btnG", text: "Passaporte", onclick: () => download("moonproof_passaporte.json", JSON.stringify(passport(), null, 2), "application/json") })),
    h("label", { class: "fld share" }, h("span", { class: "lbl-s", text: "Link reproduzível" }),
      h("input", { type: "text", readonly: "", value: location.href, onfocus: e => e.target.select() })),
    h("button", { type: "button", class: "btnL", text: "Copiar link", onclick: async e => {
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copiado"; } catch { e.target.textContent = "Copie o link acima"; }
    } }));

  outlet.append(head, sitePickers(ctx, sc, entries), form,
    h("section", { class: "solid card tablewrap" }, h("h2", { class: "h-card", text: "Todas as métricas" }), table,
      h("p", { class: "t3 small", text: "Margem = folga até a regra (positivo atende). Valores da série horária LOLA + SPICE, prévios e não revisados pela NASA." })),
    exp,
    h("a", { class: "chipg", href: buildHash("/comparar", ctx.query), text: "← Voltar à resposta direta" }));
}
