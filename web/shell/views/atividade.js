// Atividade guiada (#/aula/atividade) — design V3Atividade (Aula kit): the teacher picks the sites,
// the window and the first question; the result is a shareable link to #/aula. No accounts, no storage.
import { h, badge } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { QUESTIONS } from "./aula.js";
import { loadComparison, sitePickers } from "./comparar.js";
import { contextBar, setQuery } from "./common.js";

export async function render(outlet, ctx) {
  const { sc, entries } = await loadComparison(ctx);
  const q = Math.min(QUESTIONS.length, Math.max(1, Number(ctx.query.q) || 1));
  const shareQuery = { ...ctx.query, r: null, q: String(q) };
  const link = location.href.split("#")[0] + buildHash("/aula", shareQuery);

  const step = (n, title, ...body) => h("section", { class: "solid card" },
    h("div", { class: "row" }, h("span", { class: "mk", "aria-hidden": "true", text: String(n) }), h("h2", { class: "h-card", text: title })), ...body);

  const qList = h("div", { class: "stack", role: "radiogroup", "aria-label": "Primeira pergunta" }, QUESTIONS.map((Q, i) =>
    h("button", { type: "button", class: "wpill", role: "radio", "aria-checked": String(i + 1 === q), "aria-pressed": String(i + 1 === q),
      onclick: () => setQuery(ctx, { q: String(i + 1) }) }, h("span", { class: "letter", text: String(i + 1) }), Q.q)));

  const copy = h("button", { type: "button", class: "btnA", text: "Copiar link", onclick: async e => {
    try { await navigator.clipboard.writeText(link); e.target.textContent = "Link copiado"; } catch { e.target.textContent = "Copie o link ao lado"; }
  } });

  outlet.append(
    h("div", { class: "page-head" },
      h("div", {}, h("p", { class: "lbl-s", text: "Kit Aula" }), h("h1", { "data-route-title": "", text: "Montar atividade guiada" }))),
    h("div", { class: "split" },
      h("div", { class: "stack" },
        step(1, "Escolha os locais e a janela", sitePickers(ctx, sc, entries), contextBar(ctx, sc, { siteSelect: false })),
        step(2, "Escolha a primeira pergunta", qList),
        step(3, "Compartilhe com a turma",
          h("label", { class: "fld share" }, h("span", { class: "lbl-s", text: "Link da atividade" }), h("input", { type: "text", readonly: "", value: link, onfocus: e => e.target.select() })),
          h("div", { class: "row wrap" }, copy, h("a", { class: "btnL", href: buildHash("/aula", shareQuery), text: "Apresentar no projetor →" })),
          h("p", { class: "t3 small", text: "QR code: N/D nesta versão (sem biblioteca externa). O link abre a mesma pergunta, com a resposta escondida." }))),
      h("div", { class: "stack" },
        h("section", { class: "glass card" }, h("span", { class: "lbl-s", text: "Prévia do aluno" }),
          h("p", { class: "title-l", text: QUESTIONS[q - 1].q }),
          h("p", { class: "t2", text: entries.map(e => e.name.replace(/\s*\(.*\)$/, "")).join(" · ") }),
          h("p", { class: "row t3 small" }, badge("est"), "Dados LOLA + SPICE, prévios. Resposta só aparece quando o professor revela.")),
        h("details", { class: "notes glass card", open: "" }, h("summary", { text: "Notas do professor" }),
          h("ul", { class: "t2" },
            h("li", { text: "Peça palpites antes de revelar; depois peça para explicar o papel do relevo." }),
            h("li", { text: "Visibilidade é geometria: não inclui antena, rádio, painel ou bateria." }),
            h("li", { text: "Os locais são centros de catálogo, não pontos de pouso certificados." }))))));
}
