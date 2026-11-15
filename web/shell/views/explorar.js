// Explorar (#/explorar) — design V3Main + Explorer: LOLA map with numbered sites and three-layer cards
// for the selected site. All values: hourly LOLA + SPICE series (EST, the page's global badge).
import { h, badge, layerCard, num } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { windowMetrics, hourlyRows } from "../data.js";
import { scenarioQuery, scenario, contextBar, regionMap, seriesFor, seriesProof, pct, hrs, fmtDate, hourStrip, download, setQuery } from "./common.js";

const G = "est"; // global badge of this page (see the provenance strip)

export async function render(outlet, ctx) {
  const sc = await scenario(ctx);
  const [{ series, error }] = await seriesFor([sc.site]);
  const w = series ? windowMetrics(series, sc.t0, sc.hours) : { status: "NOT_COMPUTED", reason: error };
  const ok = w.status === "COMPUTED";
  const v = k => (ok ? w[k] : NaN);

  const head = h("div", { class: "page-head" },
    h("div", {}, h("p", { class: "lbl-s", text: "Explorar o polo sul" }),
      h("h1", { "data-route-title": "", text: sc.site.name })),
    contextBar(ctx, sc));

  const map = await regionMap(sc.data.sites, sc.site.id, id => setQuery(ctx, { site: id }));

  // "Agora" — at the window start: is the Sun up, and for how long?
  const now = h("div", { class: "glass card nowcard" },
    h("span", { class: "lbl-s", text: "No início da janela · " + fmtDate(sc.t0) }),
    h("p", { class: "answer" }, ok ? (w.sunUpNow ? "Sol acima do horizonte" : "Sol abaixo do horizonte") : "N/D",
      ok && Number.isFinite(w.nextChangeH) ? h("span", { class: "t2", text: " · muda em " + num(w.nextChangeH, 0, " h") }) : null));

  const cards = [
    layerCard({
      title: "Luz do Sol", badge: ok ? "est" : "nd", globalBadge: G,
      answer: [h("span", { class: "big", text: pct(v("sunPct")) }), "das horas com o centro do Sol acima do relevo."],
      why: h("div", {}, h("p", { text: "Conta as horas da janela em que o centro do disco solar fica acima do horizonte do terreno ao redor do local. Mais horas de Sol significam mais energia possível para painéis." }),
        series ? h("div", { class: "stripes" }, h("div", { class: "s" }, h("span", { text: "Sol" }), hourStrip(series, sc.t0, sc.hours, "sun"))) : null),
      proof: seriesProof(series, sc, [["Definição", "centro do disco acima do horizonte LOLA (sem refração)"],
        ["Ref. PGDA", [badge("val"), " " + num(sc.site.pgda_sun_pct, 1, "%") + " (média longa, disco parcial — não comparável 1:1)"]]]),
    }),
    layerCard({
      title: "Contato com a Terra", badge: ok ? "est" : "nd", globalBadge: G,
      answer: [h("span", { class: "big", text: pct(v("earthPct")) }), "das horas com a Terra visível. Maior perda seguida: " + hrs(v("longestBlackoutH")) + "."],
      why: h("div", {}, h("p", { text: "Visibilidade geométrica do centro da Terra. Não é um enlace de rádio: antena, potência e relé não entram neste número." }),
        series ? h("div", { class: "stripes" }, h("div", { class: "s" }, h("span", { text: "Terra" }), hourStrip(series, sc.t0, sc.hours, "earth"))) : null),
      proof: seriesProof(series, sc, [["Definição", "centro da Terra acima do horizonte LOLA"], ["Perdas", ok ? num(w.losses, 0) + " na janela" : "N/D"],
        ["Ref. PGDA", [badge("val"), " " + num(sc.site.pgda_earth_pct, 1, "%") + " (qualquer parte do disco)"]]]),
    }),
    layerCard({
      title: "Maior noite", badge: ok ? "est" : "nd", globalBadge: G,
      answer: [h("span", { class: "big", text: hrs(v("longestDarkH")) }), ok && w.darkStart ? "começando em " + fmtDate(w.darkStart) + "." : "sem noite nesta janela ou N/D."],
      why: "A noite mais longa define quanto a bateria precisa guardar. É a sequência mais longa de horas seguidas sem o centro do Sol acima do relevo.",
      proof: seriesProof(series, sc, [["Definição", "maior sequência de horas com Sol abaixo do horizonte"], ["Noites", ok ? num(w.nights, 0) : "N/D"]]),
    }),
    layerCard({
      title: "Energia e bateria", badge: "nd", globalBadge: G,
      answer: [h("span", { class: "big", text: "N/D" }), "Energia não calculada para locais reais nesta versão."],
      why: "Calcular a bateria exige um modelo de painel, carga e reserva. Hoje esse modelo existe só no painel de bordo, com dados sintéticos (SIM).",
      proof: [["Status", "não calculado"], ["Onde existe", h("a", { href: buildHash("/bordo/energia", {}), text: "Painel de bordo → Energia (SIM)" })]],
    }),
    layerCard({
      title: "Terreno", badge: "est", globalBadge: G,
      answer: [h("span", { class: "big", text: num(sc.site.site_height_m, 0, " m") }), "acima da esfera de referência (1.737,4 km)."],
      why: "Altura do relevo LOLA no ponto do catálogo. Declividade e rugosidade aparecem no Terreno 3D.",
      proof: [["Coordenadas", num(sc.site.lat, 2, "°") + ", " + num(sc.site.lon, 2, "°")], ["Fonte do ponto", sc.site.source_url ? h("a", { href: sc.site.source_url, rel: "noopener", target: "_blank", text: sc.site.source }) : sc.site.source],
        ["Nota", sc.data.raw.note], ["3D", h("a", { href: buildHash("/terreno", scenarioQuery(sc)), text: "Abrir no Terreno 3D" })]],
    }),
  ];

  const csv = h("button", { type: "button", class: "btnG", disabled: series ? null : "", onclick: () => {
    const rows = hourlyRows(series, sc.t0, sc.hours);
    download(sc.site.id + "_" + sc.days + "d.csv", "utc,sun_az_deg,sun_el_deg,sun_margin_deg,earth_az_deg,earth_el_deg,earth_margin_deg\n" + rows.map(r => r.map(x => (typeof x === "number" ? x.toFixed(3) : x)).join(",")).join("\n"), "text/csv");
  } }, "Baixar CSV horário");

  outlet.append(head,
    ok ? "" : h("p", { class: "notice glass-in row", role: "status" }, badge("nd"), "Série indisponível para esta janela: " + (w.reason || "N/D")),
    h("div", { class: "split" },
      h("div", { class: "stack" }, map.el, now,
        h("div", { class: "row wrap" }, csv, h("a", { class: "btnL", href: buildHash("/comparar", { site: sc.site.id, t: ctx.query.t, d: ctx.query.d }), text: "Comparar com outros locais →" }))),
      h("div", { class: "stack" }, ...cards)));
}
