import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, sealFor } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t, fmtNum } from "../core/i18n.js";
import { getState, hrefTo, DEFAULT_RULES } from "../core/state.js";

register({
  en: {
    "present.badge": "Presenting · Mission",
    "present.exit": "Exit",
    "present.qOf": "Question {n} of 4",
    "present.q1": "Where would you land?",
    "present.q2": "Which site stays within the battery limit?",
    "present.q3": "Which site keeps Earth radio contact?",
    "present.q4": "Which scenario meets both mission rules?",
    "present.rules": "Battery limit: {night} h in darkness (assumed limit). Radio needs Earth at least every {blackout} h (assumed limit).",
    "present.timer": "Discuss in pairs",
    "present.privacy": "Teacher notes appear only on your laptop, not on the projector.",
    "present.night": "Longest night",
    "present.blackout": "Without seeing Earth",
    "present.reveal": "Reveal answer",
    "present.hide": "Hide answer",
    "present.next": "Next question"
  },
  "pt-BR": {
    "present.badge": "Apresentando · Missão",
    "present.exit": "Sair",
    "present.qOf": "Pergunta {n} de 4",
    "present.q1": "Onde vocês pousariam?",
    "present.q2": "Qual local fica dentro do limite da bateria?",
    "present.q3": "Qual local mantém contato de rádio com a Terra?",
    "present.q4": "Qual cenário atende às duas regras da missão?",
    "present.rules": "A bateria aguenta {night} h no escuro (limite assumido). O rádio precisa ver a Terra pelo menos a cada {blackout} h (limite assumido).",
    "present.timer": "Discutam em dupla",
    "present.privacy": "Notas do professor aparecem só no seu notebook, não no projetor.",
    "present.night": "Maior noite",
    "present.blackout": "Sem ver a Terra",
    "present.reveal": "Revelar resposta",
    "present.hide": "Ocultar resposta",
    "present.next": "Próxima pergunta"
  }
});

const doc = await loadSites();
const scenarios = doc.sites.slice(0, 3);
const st = getState();
const nightLimit = Number(st.night ?? DEFAULT_RULES.night);
const blackoutLimit = Number(st.blackout ?? DEFAULT_RULES.blackout);

await mountTerrain(document.getElementById("terrain"), {
  sites: scenarios,
  selected: st.site || scenarios[0]?.id
});

const metrics = await Promise.all(scenarios.map((s) => windowMetrics(doc, s, st.start, st.hours || 336)));

let qIndex = 1;
let revealed = false;
let secondsLeft = 120;
let running = true;

setInterval(() => {
  if (running && secondsLeft > 0) {
    secondsLeft -= 1;
    const valEl = document.getElementById("timer-val");
    if (valEl) valEl.textContent = fmtClock(secondsLeft);
  }
}, 1000);

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function evaluateScenario(m) {
  const n = m.longestDarkH.value;
  const b = m.longestBlackoutH.value;
  if (n == null || b == null) return null;
  return n <= nightLimit && b <= blackoutLimit;
}

function draw() {
  document.getElementById("present-badge").textContent = t("present.badge");
  const exitEl = document.getElementById("present-exit");
  exitEl.textContent = `× ${t("present.exit")}`;
  exitEl.href = hrefTo("activity.html");

  const progEl = document.getElementById("present-progress");
  progEl.innerHTML = [1, 2, 3, 4].map((i) => `<span class="mp-progress-seg ${i <= qIndex ? "is-done" : ""}"></span>`).join("");

  const qKey = `present.q${qIndex}`;
  document.getElementById("present-question").innerHTML = `
    <div class="mp-q-idx">${t("present.qOf", { n: qIndex })}</div>
    <h1>${t(qKey)}</h1>
    <p>${t("present.rules", { night: nightLimit, blackout: blackoutLimit })}</p>
  `;

  const timerEl = document.getElementById("present-timer");
  timerEl.innerHTML = `<span>${t("present.timer")}</span><span id="timer-val" class="mp-timer-val">${fmtClock(secondsLeft)}</span>`;
  timerEl.onclick = () => { running = !running; };

  document.getElementById("present-privacy").textContent = t("present.privacy");

  const cardsEl = document.getElementById("present-cards");
  cardsEl.innerHTML = "";
  scenarios.forEach((s, idx) => {
    const m = metrics[idx];
    const pass = evaluateScenario(m);
    const card = document.createElement("article");
    card.className = "mp-glass mp-sc-card" + (revealed ? (pass === true ? " is-winner" : pass === false ? " is-fail" : "") : "");
    const nVal = m.longestDarkH.value == null ? t("nd") : `${fmtNum(m.longestDarkH.value)} h`;
    const bVal = m.longestBlackoutH.value == null ? t("nd") : `${fmtNum(m.longestBlackoutH.value)} h`;
    card.innerHTML = `
      <div class="mp-sc-head"><span>${s.n} · ${s.name}</span><span class="mp-sc-seal"></span></div>
      <div class="mp-sc-row"><span>${t("present.night")}</span><strong>${nVal}</strong></div>
      <div class="mp-sc-row"><span>${t("present.blackout")}</span><strong>${bVal}</strong></div>
    `;
    card.querySelector(".mp-sc-seal").appendChild(sealEl(sealFor(m.longestDarkH.value == null ? "NOT_COMPUTED" : doc.status)));
    cardsEl.appendChild(card);
  });

  const btnReveal = document.getElementById("btn-reveal");
  btnReveal.textContent = revealed ? t("present.hide") : t("present.reveal");
  btnReveal.onclick = () => { revealed = !revealed; draw(); };

  const btnNext = document.getElementById("btn-next");
  btnNext.textContent = t("present.next");
  btnNext.onclick = () => {
    qIndex = qIndex >= 4 ? 1 : qIndex + 1;
    revealed = false;
    draw();
  };
}

draw();
