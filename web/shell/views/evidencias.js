// Fontes e limitações (#/evidencias) — design Evidence: what each badge means, every data source with
// checksums, the independent checks (PGDA, JPL Horizons) and the known limits. Read straight from data/.
import { h, badge, num, layerCard } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { loadSites } from "../data.js";

const getJSON = url => fetch(url).then(r => (r.ok ? r.json() : null), () => null);
const short = n => n.replace(/\s*\(.*\)$/, "");
const link = (url, text) => (url ? h("a", { href: url, rel: "noopener", target: "_blank", text: text || url }) : h("span", { class: "t3", text: "N/D" }));

export async function render(outlet, ctx) {
  const data = await loadSites();
  const [pgda, hor, meta] = await Promise.all([
    getJSON("./data/validation/validation_pgda.json"), getJSON("./data/validation/validation_horizons.json"),
    getJSON("./data/" + data.sites[0].series + ".json")]);
  const prov = meta && meta.provenance;

  const legend = h("section", { class: "solid card" }, h("h2", { class: "h-card", text: "Como ler os selos" }),
    h("dl", { class: "seals" },
      h("dt", {}, badge("val")), h("dd", { text: "Produto oficial NASA/JPL usado como referência (ex.: PGDA, Horizons)." }),
      h("dt", {}, badge("est")), h("dd", { text: "Calculado por nós a partir de dado real (LOLA + SPICE). Prévio, não revisado pela NASA." }),
      h("dt", {}, badge("sim")), h("dd", { text: "Simulação ou dado sintético (painel de bordo, laboratório de pouso)." }),
      h("dt", {}, badge("nd")), h("dd", { text: "Não disponível ou não calculado. Nunca mostramos 0 no lugar de um valor ausente." })));

  const sources = h("section", { class: "solid card tablewrap" }, h("h2", { class: "h-card", text: "Fontes dos dados" }),
    h("table", { class: "mtab" }, h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Dado" }), h("th", { scope: "col", text: "Fonte" }), h("th", { scope: "col", text: "Verificação" }))),
      h("tbody", {},
        h("tr", {}, h("th", { scope: "row", text: "Relevo" }), h("td", { text: prov ? prov.terrain : "N/D" }), h("td", { class: "mono small", text: prov ? "SHA-256 " + prov.terrain_sha256.slice(0, 16) + "…" : "N/D" })),
        ...(prov ? Object.entries(prov.kernel_sha256).map(([k, sha]) => h("tr", {}, h("th", { scope: "row", text: "Efeméride" }),
          h("td", {}, link(prov.kernel_sources && prov.kernel_sources[k], k)), h("td", { class: "mono small", text: "SHA-256 " + sha.slice(0, 16) + "…" }))) : []),
        ...data.sites.map(s => h("tr", {}, h("th", { scope: "row", text: short(s.name) }), h("td", {}, link(s.source_url, s.source)),
          h("td", { class: "small", text: num(s.lat, 2, "°") + ", " + num(s.lon, 2, "°") + " · centro de catálogo" }))))));

  const pgdaCard = layerCard({
    title: "Comparação com NASA PGDA", badge: "val",
    answer: pgda ? "Diferença de Sol entre " + num(Math.min(...pgda.results.map(r => r.diff_sun_pp)), 1) + " e " + num(Math.max(...pgda.results.map(r => r.diff_sun_pp)), 1) + " pontos percentuais nos " + pgda.results.length + " locais." : "N/D",
    why: pgda ? h("ul", { class: "t2" }, pgda.caveats.map(c => h("li", { text: c }))) : "Arquivo de validação indisponível.",
    proof: pgda ? pgda.results.map(r => [short((data.sites.find(s => s.id === r.site) || { name: r.site }).name),
      "Sol " + num(r.pipeline_mean_solar_disc_pct, 1) + "% vs " + num(r.pgda_avg_solar_disc_pct, 1) + "% · Terra " + num(r.pipeline_earth_centre_pct, 1) + "% vs " + num(r.pgda_avg_earth_any_part_pct, 1) + "%"]) : [],
  });
  const horCard = layerCard({
    title: "Conferência com JPL Horizons", badge: "val",
    answer: hor ? "Maior diferença de elevação: " + num(Math.max(...hor.results.flatMap(r => r.comparisons.map(c => c.max_abs_el_diff_deg))), 3) + "° em " + hor.results.reduce((n, r) => n + r.comparisons.reduce((m, c) => m + c.n, 0), 0) + " comparações." : "N/D",
    why: hor ? "Datas espalhadas pela janela 2025–2028 conferidas com a API do JPL Horizons (" + hor.reference + ")." : "Arquivo de validação indisponível.",
    proof: hor ? hor.results.map(r => [short((data.sites.find(s => s.id === r.site) || { name: r.site }).name),
      r.comparisons.map(c => (c.body === "sun" ? "Sol" : "Terra") + " Δel " + num(c.max_abs_el_diff_deg, 3) + "°, Δaz·cos " + num(c.max_abs_az_diff_deg_cos_el, 3) + "°").join(" · ")]) : [],
  });

  const limits = h("section", { class: "solid card" }, h("h2", { class: "h-card", text: "Limitações" }),
    h("ul", { class: "t2" },
      h("li", { text: "Status científico: " + data.raw.science_status + " (prévio, não validado de forma independente)." }),
      h("li", { text: data.raw.note }),
      h("li", { text: "Sol e Terra são pontos (centro do disco) contra o horizonte LOLA; sem refração, sem antena, sem rádio." }),
      h("li", { text: "Energia e bateria não são calculadas para locais reais (N/D). O painel de bordo usa um modelo sintético (SIM)." }),
      h("li", { text: "O sombreado do mapa é ilustrativo (hillshade), não é simulação de iluminação." }),
      h("li", { text: "Sem recomendação de voo. A NASA não endossa esta ferramenta." })),
    h("p", {}, h("a", { class: "chipg", href: buildHash("/bordo/status", { site: ctx.site }), text: "Status do painel de bordo →" })));

  outlet.append(h("div", { class: "ev stack" },
    h("div", { class: "page-head" }, h("div", {}, h("p", { class: "lbl-s", text: "Evidências" }), h("h1", { "data-route-title": "", text: "Fontes e limitações" }))),
    legend, h("div", { class: "cards2" }, pgdaCard, horCard), sources, limits));
}
