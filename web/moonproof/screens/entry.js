// V3-1 · task entry. The choice only sets task + opening layer in the URL; nothing is guessed.
import { t, apply, setLang, pickLang, lang } from "../core/i18n.js";
import { getState, setState, hrefTo, TASKS } from "../core/state.js";

const ICONS = {
  explore: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  class: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 17v-3M12 17v-6M15 17v-8"/></svg>',
  plan: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/></svg>',
};

function render() {
  const st = getState();
  const chosen = st.task || "explore";
  const cards = document.getElementById("cards");
  cards.replaceChildren(...Object.keys(TASKS).map(task => {
    const a = document.createElement("a"); a.className = "mp-task"; a.setAttribute("role", "listitem");
    a.dataset.task = task; a.setAttribute("aria-current", String(task === chosen));
    a.href = hrefTo("mission.html", { ...st, task, layer: TASKS[task] });
    a.innerHTML = `<span class="mp-task-icon">${ICONS[task]}</span><h2></h2><p class="who"></p><ul><li></li><li></li><li></li></ul><p class="opens"></p>`;
    a.querySelector("h2").textContent = t(`entry.${task}.title`);
    a.querySelector(".who").textContent = t(`entry.${task}.who`);
    a.querySelectorAll("li").forEach((li, i) => li.textContent = t(`entry.${task}.b${i + 1}`));
    a.querySelector(".opens").textContent = t("entry.opensIn", { layer: t("layer." + TASKS[task]) });
    a.addEventListener("focus", () => cards.querySelectorAll(".mp-task").forEach(c => c.setAttribute("aria-current", String(c === a))));
    return a;
  }));
  const hint = document.getElementById("hint");
  const [pre, mid, post] = t("entry.hint", { a: "\u0000", b: "\u0001" }).split(/[\u0000\u0001]/);
  const A = document.createElement("b"), B = document.createElement("b"); A.textContent = t("nav.class"); B.textContent = t("nav.plan");
  hint.replaceChildren("ⓘ ", pre, A, mid, B, post);
  document.getElementById("skip").href = hrefTo("mission.html");
  apply();
}

setLang(pickLang(getState().lang));
document.getElementById("lang").addEventListener("click", () => { const l = lang() === "en" ? "pt-BR" : "en"; setState({ lang: l }); setLang(l); render(); });
render();
