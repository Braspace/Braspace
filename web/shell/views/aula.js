// Modo apresentação (#/aula) — design V3Apresentar (Aula kit): projector view, one question at a time,
// answer revealed only on request. Questions and answers are computed from the same LOLA + SPICE data.
import { h, badge, num } from "../../ds/components.js";
import { buildHash } from "../../ds/router.js";
import { loadComparison } from "./comparar.js";
import { LETTERS } from "./common.js";

/** The four questions. pick: "max" or "min" of the metric across sites. */
export const QUESTIONS = [
  { key: "sunPct", unit: "%", pick: "max", q: "Qual destes locais vê o Sol por mais tempo?", why: "Mais horas de Sol = mais energia possível. O relevo ao redor esconde o Sol baixo do polo." },
  { key: "longestBlackoutH", unit: "h", pick: "max", q: "Em qual local a Terra some por mais tempo seguido?", why: "Sem a Terra no céu, não há comunicação direta. Montanhas no caminho bloqueiam a linha de visada." },
  { key: "longestDarkH", unit: "h", pick: "max", q: "Qual local tem a noite mais longa?", why: "No polo, a noite depende do relevo, não só da hora do dia. Noite longa exige bateria maior." },
  { key: "bothPct", unit: "%", pick: "max", q: "Onde o Sol e a Terra aparecem juntos por mais tempo?", why: "Para pousar, queremos energia e comunicação ao mesmo tempo." },
];
const short = n => n.replace(/\s*\(.*\)$/, "");
const fmt = (v, u) => (u === "%" ? num(v, 0, "%") : num(v, 0, " h"));

export async function render(outlet, ctx) {
  const { sc, result } = await loadComparison(ctx);
  const rows = result.rows;
  const qi = Math.min(QUESTIONS.length, Math.max(1, Number(ctx.query.q) || 1)) - 1;
  const Q = QUESTIONS[qi];
  const reveal = ctx.query.r === "1";
  const vals = rows.map(r => (r.computed ? r.w[Q.key] : NaN));
  const finite = vals.filter(Number.isFinite);
  const target = finite.length ? (Q.pick === "max" ? Math.max(...finite) : Math.min(...finite)) : NaN;
  const go = patch => buildHash("/aula", { ...ctx.query, ...patch });

  // timer (not persisted); stops when the view is replaced
  let secs = 0, timer = null;
  const tLabel = h("span", { class: "num", text: "0:00" });
  const tBtn = h("button", { type: "button", class: "btnG", "aria-pressed": "false", text: "Iniciar cronômetro" });
  tBtn.addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; tBtn.textContent = "Continuar"; tBtn.setAttribute("aria-pressed", "false"); return; }
    tBtn.textContent = "Pausar"; tBtn.setAttribute("aria-pressed", "true");
    timer = setInterval(() => {
      if (!tLabel.isConnected) { clearInterval(timer); return; }
      secs++; tLabel.textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
    }, 1000);
  });

  const opts = h("div", { class: "opts" }, rows.map((r, i) => {
    const win = reveal && Number.isFinite(vals[i]) && vals[i] === target;
    return h("div", { class: "opt solid" + (win ? " answer-yes" : "") },
      h("span", { class: "lbl-s", text: "Local " + LETTERS[i] }),
      h("strong", { class: "title-l", text: short(r.name) }),
      h("span", { class: "big", text: reveal ? fmt(vals[i], Q.unit) : "?" }),
      win ? h("span", { class: "chipa", text: "✓ Resposta" }) : null);
  }));

  outlet.append(h("div", { class: "present" },
    h("div", { class: "row wrap" }, h("span", { class: "chipg", text: "Pergunta " + (qi + 1) + " de " + QUESTIONS.length }),
      h("span", { class: "row" }, badge("est"), h("span", { class: "t2", text: "Janela de " + sc.days + " dias · dados LOLA + SPICE" })),
      h("span", { class: "row" }, tLabel, tBtn)),
    h("h1", { class: "q", "data-route-title": "", text: Q.q }),
    h("p", { class: "sub t2", text: reveal ? Q.why : "Converse com a turma antes de revelar." }),
    opts,
    h("div", { class: "row wrap" },
      reveal ? h("a", { class: "btnG", href: go({ r: null }), text: "Esconder resposta" }) : h("a", { class: "btnA", href: go({ r: "1" }), text: "Revelar resposta" }),
      qi > 0 ? h("a", { class: "btnG", href: go({ q: String(qi), r: null }), text: "← Pergunta anterior" }) : null,
      qi < QUESTIONS.length - 1 ? h("a", { class: "btnL", href: go({ q: String(qi + 2), r: null }), text: "Próxima pergunta →" }) : null,
      h("a", { class: "chipg", href: buildHash("/aula/atividade", { ...ctx.query, q: null, r: null }), text: "Montar atividade" })),
    h("details", { class: "notes glass card" }, h("summary", { text: "Notas do professor" }),
      h("p", { class: "t2", text: "Os números são prévios e não revisados pela NASA. Visibilidade é geometria (relevo + efemérides), não um enlace de rádio nem um cálculo de energia. Use a pergunta para discutir por que o relevo importa no polo." }))));
}
