// Comparar (#/comparar) — design V3Compare: one direct answer, sites A/B/C side by side, rules in sight.
// Values: LOLA + SPICE hourly series over the same window for every site (EST). Battery: N/D (not computed).
import { h, badge, layerCard, setLevel, num } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { windowMetrics } from "../data.js";
import { evaluate, rulesFromQuery, METRICS, bestIndex } from "../compare.js";
import { scenario, contextBar, pickedSites, seriesFor, seriesProof, hourStrip, LETTERS, setQuery } from "./common.js";

const G = "est";

/** Shared loader for #/comparar and #/comparar/tecnico. */
export async function loadComparison(ctx) {
  const sc = await scenario(ctx);
  const sites = pickedSites(sc.data, ctx.query);
  const loaded = await seriesFor(sites);
  const entries = loaded.map(({ site, series, error }) => ({
    id: site.id, name: site.name, site, series,
    w: series ? windowMetrics(series, sc.t0, sc.hours) : { status: "NOT_COMPUTED", reason: error },
  }));
  const rules = rulesFromQuery(ctx.query);
  return { sc, entries, rules, result: evaluate(entries, rules) };
}

export const fmtMetric = (v, unit) => (unit === "%" ? num(v, 0, "%") : num(v, 0, " h"));
const short = n => n.replace(/\s*\(.*\)$/, "");

export function sitePickers(ctx, sc, entries) {
  return h("div", { class: "row wrap", role: "group", "aria-label": "Locais comparados" }, LETTERS.slice(0, entries.length).map((L, i) =>
    h("label", { class: "ctx glass" }, h("span", { class: "wpill-letter", text: L }),
      h("select", { "aria-label": "Local " + L, onchange: e => setQuery(ctx, { [L.toLowerCase()]: e.target.value }) },
        sc.data.sites.map(s => h("option", { value: s.id, text: short(s.name), selected: s.id === entries[i].id ? "" : null }))))));
}

export async function render(outlet, ctx) {
  const { sc, entries, rules, result } = await loadComparison(ctx);
  const { rows, best, closest } = result;
  const letterOf = id => LETTERS[rows.findIndex(r => r.id === id)];

  const head = h("div", { class: "page-head" },
    h("div", {}, h("p", { class: "lbl-s", text: "Comparar locais de pouso" }),
      h("h1", { "data-route-title": "", text: "Qual local atende às regras nesta janela?" })),
    contextBar(ctx, sc, { siteSelect: false }));

  const answerText = best
    ? [h("span", { class: "big", text: letterOf(best.id) + " · " + short(best.name) }), "atende às três regras e tem mais horas com Sol e Terra juntos."]
    : closest
      ? [h("span", { class: "big", text: "Nenhum atende a tudo" }), "O mais próximo é " + letterOf(closest.id) + " · " + short(closest.name) + " (" + closest.fails + " regra(s) falham)."]
      : [h("span", { class: "big", text: "N/D" }), "Não há série calculada para esta janela."];
  const answer = layerCard({
    title: "Resposta", badge: best || closest ? "est" : "nd", globalBadge: G, surface: "glass",
    answer: answerText,
    why: "Só geometria: Sol, Terra e noite a partir do relevo LOLA e das efemérides SPICE. As regras são premissas do protótipo, editáveis na comparação técnica. Energia e bateria não entram (N/D).",
    proof: [["Regras", "Maior noite ≤ " + rules.maxNightH + " h · Maior perda da Terra ≤ " + rules.maxEarthLossH + " h · Sol visível ≥ " + rules.minSunPct + "%"],
      ["Desempate", "mais horas com Sol e Terra juntos"], ...seriesProof(entries[0] && entries[0].series, sc)],
  });

  const scen = h("div", { class: "scen" }, rows.map((r, i) => h("a", {
    class: "wpill" + (best && best.id === r.id ? " on" : ""), href: buildHash("/explorar", { site: r.id, t: ctx.query.t, d: ctx.query.d }) },
    h("span", { class: "letter", text: LETTERS[i] }),
    h("span", {}, short(r.name), h("small", { text: !r.computed ? "N/D · série indisponível" : r.passAll ? "Atende às regras" : "Falha em " + r.fails + " regra(s)" })),
    h("span", { class: "v" }, r.computed ? (r.passAll ? "✓ Atende" : "✕ Falha") : "N/D"))));

  const metricCards = METRICS.map(m => {
    const bi = bestIndex(rows, m);
    const vals = h("div", { class: "vals" }, rows.map((r, i) => {
      const v = r.computed ? r.w[m.key] : NaN;
      const chk = r.checks.find(c => c.key === m.key);
      const fail = chk && chk.pass === false;
      return h("div", { class: "v" + (i === bi ? " best" : "") + (fail ? " fail" : "") },
        h("span", { text: LETTERS[i] + (i === bi ? " · melhor" : "") + (fail ? " · falha" : "") }), h("b", { text: fmtMetric(v, m.unit) }));
    }));
    vals.style.setProperty("--n", String(rows.length));
    return layerCard({
      title: m.label, badge: "est", globalBadge: G,
      answer: [vals, m.rule ? h("span", { class: "rule", text: "Regra: " + m.text(rules) + " (premissa)" }) : h("span", { class: "rule", text: "Sem regra: só informativo" })],
      why: m.key === "longestDarkH" ? "Noite longa exige bateria maior: é a sequência mais longa de horas sem Sol."
        : m.key === "longestBlackoutH" ? "Tempo seguido sem a Terra no céu: sem comunicação direta (geometria, não rádio)."
        : m.key === "sunPct" ? "Fração das horas com o centro do Sol acima do relevo." : "Fração das horas da janela, mesma definição do Explorar.",
      proof: rows.map((r, i) => [LETTERS[i] + " · " + short(r.name), r.computed ? fmtMetric(r.w[m.key], m.unit) + (m.rule ? " · margem " + fmtMetric(r.checks.find(c => c.key === m.key).margin, m.unit) : "") : "N/D"]),
    });
  });
  metricCards.push(layerCard({
    title: "Folga da bateria", badge: "nd", globalBadge: G,
    answer: [h("span", { class: "big", text: "N/D" }), "Não calculada para locais reais."],
    why: "A bateria depende de painel, carga e reserva. Esse modelo só existe no painel de bordo, com dados sintéticos (SIM), e não é aplicado aqui.",
    proof: [["Status", "não calculado"], ["Por quê", "sem modelo de energia validado para séries reais"]],
  }));

  const strips = h("section", { class: "solid card" }, h("h2", { class: "h-card", text: "Sol hora a hora na janela" }),
    h("div", { class: "stripes" }, rows.map((r, i) => h("div", { class: "s" }, h("span", { text: LETTERS[i] }),
      r.series ? hourStrip(r.series, sc.t0, sc.hours, "sun") : h("span", { class: "t3", text: "N/D" })))),
    h("p", { class: "t3 small row" }, h("i", { class: "sw sw-sun", "aria-hidden": "true" }), "Sol visível", h("i", { class: "sw sw-none", "aria-hidden": "true" }), "Sol abaixo do relevo"));

  const all = h("div", { class: "cards2" }, ...metricCards);
  const openAll = h("button", { type: "button", class: "btnG", onclick: () => outlet.querySelectorAll(".l3").forEach(c => setLevel(c, 2)) }, "Abrir tudo em Prova");

  outlet.append(head, sitePickers(ctx, sc, entries),
    h("div", { class: "split" },
      h("div", { class: "stack" }, answer, scen, strips,
        h("div", { class: "row wrap" }, h("a", { class: "btnA", href: buildHash("/comparar/tecnico", ctx.query), text: "Comparação técnica →" }), openAll)),
      h("div", { class: "stack" }, all)));
}
