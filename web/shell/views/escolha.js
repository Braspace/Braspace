// Escolha (#/) — task-first home (design V3Entrada). Entry is by TASK, never by profile.
// Always the home page: the last route is offered as a link, never auto-redirected.
import { h, badge } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { lastRouteLabel } from "../app.js";

const TASKS = [
  { path: "/explorar", verb: "Explorar o polo sul", line: "Ver o terreno e os locais de pouso.", bullets: ["Relevo real (LOLA) e locais numerados", "Luz do Sol e Terra à vista por local", "Cada cartão abre em Resposta → Por quê → Prova"], icon: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18" },
  { path: "/comparar", verb: "Comparar locais de pouso", line: "Luz, escuridão e visibilidade da Terra lado a lado.", bullets: ["Uma resposta direta, regras à vista", "Mesma janela para todos os locais", "Comparação técnica com exportação"], icon: "M3 4h5v16H3zM10 4h5v16h-5zM17 4h4v16h-4z" },
  { path: "/aula", verb: "Dar uma aula", line: "Modo projetor e atividade guiada.", bullets: ["Uma pergunta por vez, resposta no fim", "Montar atividade com link para a turma", "Notas do professor separadas"], icon: "M3 6h18v11H3zM8 21h8M12 17v4" },
  { path: "/bordo", verb: "Acompanhar a missão", line: "Painel de bordo do módulo.", bullets: ["Energia, contato e vida", "Replanejar após atraso", "Selos de origem em cada número"], icon: "M3 5h18v12H3zM8 21h8M12 17v4" },
];

function svg(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "i"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); return s;
}

export function render(outlet, ctx) {
  const q = { site: ctx.site };
  const last = lastRouteLabel();
  outlet.append(
    h("div", { class: "backdrop", "aria-hidden": "true" }, h("img", { src: "./assets/polar-elevation-87s.webp", alt: "" })),
    h("div", { class: "escolha" },
      h("section", { class: "hero" },
        h("span", { class: "chipg", text: "Lunar Landing Site Navigator · polo sul da Lua" }),
        h("h1", { class: "title-xl", "data-route-title": "", text: "O que você quer fazer hoje?" }),
        h("p", { class: "t2", text: "Todos usam a mesma ferramenta e os mesmos dados. A tarefa só muda por onde você começa." })),
      h("p", { class: "notice glass-in row" }, badge("sim", "Protótipo"), "Protótipo. Dados sintéticos quando indicado."),
      last ? h("a", { class: "resume wpill", href: last.hash }, "Continuar de onde parou →", h("span", { class: "v", text: last.label })) : null,
      h("nav", { class: "tasks", "aria-label": "Tarefas" }, TASKS.map(t =>
        h("a", { class: "task glass", href: buildHash(t.path, q) },
          h("span", { class: "ic" }, svg(t.icon)),
          h("span", { class: "verb", text: t.verb }),
          h("span", { class: "t2", text: t.line }),
          h("ul", {}, t.bullets.map(b => h("li", { text: b }))),
          h("span", { class: "go" }, h("span", { class: "lbl-s", text: "Abrir" }), h("span", { class: "chipa", "aria-hidden": "true", text: "→" }))))),
      h("div", { class: "row" },
        h("a", { class: "chipg", href: buildHash("/evidencias", q), text: "Ver fontes e limitações →" }),
        h("a", { class: "chipg", href: "./moon-hd.html?view=pole&lang=pt", text: "Ver a Lua em 3D (polo sul) →" })),
      h("p", { class: "t3 small", text:"Fundo: Lua 3D (imagens LRO, relevo LOLA, Sol pelo SPICE) quando o navegador tem WebGL; sem ele, o relevo LOLA do polo sul. Uso ilustrativo, sem validação independente." })));
}
