import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, apiOnline, sealFor } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t } from "../core/i18n.js";
import { getState, setState, hrefTo } from "../core/state.js";

register({
  en: {
    "act.kit": "Class Kit",
    "act.title": "Build activity",
    "act.s1": "Choose scenarios",
    "act.s1d": "Real sites from Compare",
    "act.s2": "What students can change",
    "act.s2d": "dates locked, sites free",
    "act.s3": "Question & answer",
    "act.s3d": "answer only at the end",
    "act.s4": "Share",
    "act.s4d": "link without login",
    "act.tip": "Classroom tip: let students explore 5 min before showing anything on the projector.",
    "act.previewTitle": "How students will see it",
    "act.laptop": "Laptop",
    "act.mobile": "Mobile",
    "act.badge": "Student preview",
    "act.prompt": "Where would you land? Justify with 2 numbers.",
    "act.promptSub": "Students see only the scenarios, without the answer.",
    "act.openIn": "Opens in:",
    "act.l1": "1 Answer",
    "act.l2": "2 Why",
    "act.l3": "3 Proof",
    "act.ctrlTitle": "Step 2 · what can be changed",
    "act.tSite": "Switch site",
    "act.tDate": "Switch date",
    "act.tProof": "See Proof layer",
    "act.tRules": "Change rules",
    "act.tLab": "Open Landing Lab",
    "act.notesTitle": "Teacher notes · only you see",
    "act.notesBody": "Concept: at the lunar pole, the Sun skims the horizon, so a hill decides light. Model simplification: ideal battery, no temperature effect (SIM).",
    "act.shareTitle": "Step 4 · share with the class",
    "act.copy": "Copy link",
    "act.copied": "Copied!",
    "act.present": "Present on projector"
  },
  "pt-BR": {
    "act.kit": "Kit Aula",
    "act.title": "Montar atividade",
    "act.s1": "Escolher cenários",
    "act.s1d": "Sítios reais do Comparar",
    "act.s2": "O que os alunos podem mexer",
    "act.s2d": "datas travadas, locais livres",
    "act.s3": "Pergunta e resposta",
    "act.s3d": "a resposta só aparece no fim",
    "act.s4": "Compartilhar",
    "act.s4d": "link sem login",
    "act.tip": "Dica de uso em aula: deixe a turma explorar 5 min antes de mostrar qualquer coisa no projetor.",
    "act.previewTitle": "Como os alunos vão ver",
    "act.laptop": "Notebook",
    "act.mobile": "Celular",
    "act.badge": "Prévia do aluno",
    "act.prompt": "Onde vocês pousariam? Justifiquem com 2 números.",
    "act.promptSub": "Os alunos veem só os cenários, sem a resposta.",
    "act.openIn": "Abrem em:",
    "act.l1": "1 Resposta",
    "act.l2": "2 Por quê",
    "act.l3": "3 Prova",
    "act.ctrlTitle": "Passo 2 · o que pode mexer",
    "act.tSite": "Trocar de local",
    "act.tDate": "Trocar a data",
    "act.tProof": "Ver a camada Prova",
    "act.tRules": "Mudar as regras",
    "act.tLab": "Abrir o Landing Lab",
    "act.notesTitle": "Notas do professor · só você vê",
    "act.notesBody": "Conceito: no polo, o Sol anda rente ao horizonte, então um morro decide se há luz. Simplificação do modelo: bateria ideal, sem efeito de temperatura (SIM).",
    "act.shareTitle": "Passo 4 · compartilhar com a turma",
    "act.copy": "Copiar link",
    "act.copied": "Copiado!",
    "act.present": "Apresentar no projetor"
  }
});

const shell = mountShell({ screen: "compare", onLang: draw });
const doc = await loadSites();
const scenarios = doc.sites.slice(0, 3);
await mountTerrain(document.getElementById("terrain"), { sites: doc.sites, selected: getState().site });

const cfg = {
  step: 2,
  device: "laptop",
  openLayer: "why",
  allowSite: true,
  allowDate: false,
  allowProof: false,
  allowRules: false,
  allowLab: true
};

function shareUrl() {
  const u = new URL(location.href);
  u.searchParams.set("layer", cfg.openLayer);
  u.searchParams.set("allowSite", cfg.allowSite ? "1" : "0");
  u.searchParams.set("allowDate", cfg.allowDate ? "1" : "0");
  u.searchParams.set("allowProof", cfg.allowProof ? "1" : "0");
  u.searchParams.set("allowRules", cfg.allowRules ? "1" : "0");
  u.searchParams.set("allowLab", cfg.allowLab ? "1" : "0");
  return u.toString();
}

async function draw() {
  const online = await apiOnline();
  shell.setContext({
    site: `${scenarios.length} cenários`,
    date: (getState().start || "2027-03-14T06:00:00Z").slice(0, 10),
    days: "14",
    seal: sealFor(doc.status),
    online
  });

  const stepsEl = document.getElementById("act-steps");
  const steps = [
    [1, t("act.s1"), t("act.s1d")],
    [2, t("act.s2"), t("act.s2d")],
    [3, t("act.s3"), t("act.s3d")],
    [4, t("act.s4"), t("act.s4d")]
  ];
  stepsEl.innerHTML = `
    <div><small style="color:var(--jade);font-weight:700">${t("act.kit")}</small><h2 style="margin:2px 0 0">${t("act.title")}</h2></div>
    ${steps.map(([n, title, sub]) => `
      <div class="mp-step-item ${n < cfg.step ? "is-done" : n === cfg.step ? "is-active" : ""}" data-step="${n}">
        <span class="mp-step-num">${n < cfg.step ? "✓" : n}</span>
        <div><strong style="font-size:13px">${title}</strong><div style="font-size:12px;color:var(--text-dim)">${sub}</div></div>
      </div>
    `).join("")}
    <p style="font-size:12px;color:var(--text-dim);margin-top:auto">${t("act.tip")}</p>
  `;
  stepsEl.querySelectorAll("[data-step]").forEach((el) => {
    el.onclick = () => { cfg.step = Number(el.dataset.step); draw(); };
  });

  const prevEl = document.getElementById("act-preview");
  prevEl.innerHTML = `
    <div class="mp-act-head">
      <h2>${t("act.previewTitle")}</h2>
      <div class="mp-chip-row">
        <button class="mp-chip ${cfg.device === "laptop" ? "is-active" : ""}" data-dev="laptop" type="button">${t("act.laptop")}</button>
        <button class="mp-chip ${cfg.device === "mobile" ? "is-active" : ""}" data-dev="mobile" type="button">${t("act.mobile")}</button>
      </div>
    </div>
    <div class="mp-preview-frame ${cfg.device === "mobile" ? "is-mobile" : ""}">
      <div class="mp-act-head">
        <span style="background:var(--pill-white);color:var(--pill-ink);padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700">${t("act.badge")}</span>
        <span id="prev-seal"></span>
      </div>
      <div style="font-size:13px;color:var(--text-dim)">${scenarios.map((s) => `${s.n} · ${s.name}`).join("  |  ")}</div>
      <div>
        <strong style="font-size:15px">${t("act.prompt")}</strong>
        <div style="font-size:12.5px;color:var(--text-dim);margin-top:4px">${t("act.promptSub")}</div>
      </div>
    </div>
    <div class="mp-act-head">
      <span style="font-size:12.5px;color:var(--text-dim)">${t("act.openIn")}</span>
      <div class="mp-chip-row">
        <button class="mp-chip ${cfg.openLayer === "answer" ? "is-active" : ""}" data-layer="answer" type="button">${t("act.l1")}</button>
        <button class="mp-chip ${cfg.openLayer === "why" ? "is-active" : ""}" data-layer="why" type="button">${t("act.l2")}</button>
        <button class="mp-chip ${cfg.openLayer === "proof" ? "is-active" : ""}" data-layer="proof" type="button">${t("act.l3")}</button>
      </div>
    </div>
  `;
  prevEl.querySelector("#prev-seal").appendChild(sealEl(sealFor(doc.status)));
  prevEl.querySelectorAll("[data-dev]").forEach((b) => { b.onclick = () => { cfg.device = b.dataset.dev; draw(); }; });
  prevEl.querySelectorAll("[data-layer]").forEach((b) => {
    b.onclick = () => { cfg.openLayer = b.dataset.layer; setState({ layer: cfg.openLayer }); draw(); };
  });

  const ctrlEl = document.getElementById("act-controls");
  const toggles = [
    ["allowSite", t("act.tSite")],
    ["allowDate", t("act.tDate")],
    ["allowProof", t("act.tProof")],
    ["allowRules", t("act.tRules")],
    ["allowLab", t("act.tLab")]
  ];
  ctrlEl.innerHTML = `
    <div class="mp-act-head"><h2>${t("act.ctrlTitle")}</h2></div>
    ${toggles.map(([k, label]) => `
      <div class="mp-toggle-row">
        <span>${label}</span>
        <button class="mp-switch ${cfg[k] ? "is-on" : ""}" data-toggle="${k}" type="button" aria-pressed="${cfg[k]}"></button>
      </div>
    `).join("")}
    <div class="mp-teacher-notes">
      <strong>${t("act.notesTitle")}</strong>
      <p style="margin:6px 0 0">${t("act.notesBody")}</p>
    </div>
  `;
  ctrlEl.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = () => { cfg[b.dataset.toggle] = !cfg[b.dataset.toggle]; draw(); };
  });

  const shareEl = document.getElementById("act-share");
  const url = shareUrl();
  shareEl.innerHTML = `
    <div style="flex:1;min-width:220px">
      <strong style="font-size:14px">${t("act.shareTitle")}</strong>
      <div class="mp-share-url">${url}</div>
    </div>
    <div class="mp-chip-row">
      <button id="btn-copy" class="mp-btn-outline" type="button">${t("act.copy")}</button>
      <a class="mp-btn-jade" href="${hrefTo("present.html")}">${t("act.present")}</a>
    </div>
  `;
  shareEl.querySelector("#btn-copy").onclick = async () => {
    try { await navigator.clipboard?.writeText(url); } catch {}
    shareEl.querySelector("#btn-copy").textContent = t("act.copied");
  };
}

draw();
