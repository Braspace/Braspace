import { mountShell } from "../core/shell.js";
import { mountTerrain, shadeValue } from "../core/terrain.js";
import { loadSites, loadRegion, sealFor } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t } from "../core/i18n.js";
import { getState, setState, hrefTo, DEFAULT_RULES } from "../core/state.js";
import { qrSvg } from "./qr.js";

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
    "act.s4d": "link or QR, no login",
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
    "act.notesBody": "Concept: at the lunar pole, the Sun skims the horizon, so a hill decides light.",
    "act.notesBody2": "Model simplification: ideal battery, no temperature effect (SIM).",
    "act.shareTitle": "Step 4 · share with the class",
    "act.copy": "Copy link",
    "act.copied": "Copied!",
    "act.present": "Present on projector",
    "act.tSiteD": "among the scenarios",
    "act.tDateD": "stays on {date}",
    "act.tProofD": "sources and tables",
    "act.tRulesD": "assumed limits {night} h and {blackout} h stay fixed",
    "act.tLabD": "as an extra challenge",
    "act.students": "students",
    "act.access": "Students join without an account · you follow the answers here",
    "act.qrLabel": "QR code of the share link",
    "act.layers": "Layers"
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
    "act.s4d": "link ou QR, sem login",
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
    "act.notesBody": "Conceito: no polo, o Sol anda rente ao horizonte, então um morro decide se há luz.",
    "act.notesBody2": "Simplificação do modelo: bateria ideal, sem efeito de temperatura (SIM).",
    "act.shareTitle": "Passo 4 · compartilhar com a turma",
    "act.copy": "Copiar link",
    "act.copied": "Copiado!",
    "act.present": "Apresentar no projetor",
    "act.tSiteD": "entre os cenários",
    "act.tDateD": "fica em {date}",
    "act.tProofD": "fontes e tabelas",
    "act.tRulesD": "limites assumidos de {night} h e {blackout} h ficam fixos",
    "act.tLabD": "como desafio extra",
    "act.students": "alunos",
    "act.access": "Alunos entram sem conta · você acompanha as respostas aqui",
    "act.qrLabel": "QR code do link de compartilhamento",
    "act.layers": "Camadas"
  }
});

// The board has no context bar on this screen: context null hides it (core/shell.js).
mountShell({ screen: "compare", context: null, onLang: draw });
const doc = await loadSites();
const scenarios = doc.sites.slice(0, 3);
const grid = await loadRegion();
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
const PRESENT_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="1.5" width="11" height="13" rx="2"/><path d="M5.5 11V8.5M8 11V5.5M10.5 11V7.5" stroke-linecap="round"/></svg>';
const LAYERS = [["answer", "act.l1"], ["why", "act.l2"], ["proof", "act.l3"]];

// location.href keeps the scenario (site, start, rules…) and the activity switches ride on the query string.
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

/** Hillshade of the real LOLA grid fitted to the scenarios, drawn once per size; markers use the same transform. */
const reliefCache = { key: "", canvas: null };
function hAt(i, j) {
  const a = Math.floor(i), b = Math.floor(j);
  if (a < 0 || b < 0 || a >= grid.nx - 1 || b >= grid.ny - 1) return NaN;
  const u = i - a, v = j - b, d = grid.data, n = grid.nx, q = b * n + a;
  return (d[q] * (1 - u) + d[q + 1] * u) * (1 - v) + (d[q + n] * (1 - u) + d[q + n + 1] * u) * v;
}
function paintPreviewTerrain(frame) {
  const W = frame.clientWidth, H = frame.clientHeight;
  if (!W || !H || !scenarios.length) return;
  const xs = scenarios.map((s) => s.stereo_x_m), ys = scenarios.map((s) => s.stereo_y_m);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // usable area keeps markers clear of the badge (top) and the question glass (bottom)
  const pad = 40, top = 48, bot = H - 100;
  const mpp = Math.max((x1 - x0) / (W - 2 * pad), (y1 - y0) / (bot - top), grid.dx / 4);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, py = (top + bot) / 2;
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(W * dpr), h = Math.round(H * dpr);
  const key = [w, h, mpp.toFixed(2), cx.toFixed(0), cy.toFixed(0)].join();
  if (reliefCache.key !== key) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const img = new ImageData(w, h), px = img.data, e = 0.5, m = mpp / dpr;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const x = cx + (c - w / 2) * m, y = cy - (r - py * dpr) * m, fi = (x - grid.x0) / grid.dx, fj = (y - grid.y0) / grid.dx, p = (r * w + c) * 4;
      const hx = (hAt(fi + e, fj) - hAt(fi - e, fj)) / (2 * e * grid.dx), hy = (hAt(fi, fj + e) - hAt(fi, fj - e)) / (2 * e * grid.dx);
      const v = Number.isFinite(hx + hy) ? shadeValue(hx, hy) : 7;
      px[p] = v; px[p + 1] = v + 2; px[p + 2] = v + 7; px[p + 3] = 255;
    }
    cv.getContext("2d").putImageData(img, 0, 0);
    reliefCache.key = key; reliefCache.canvas = cv;
  }
  const host = frame.querySelector(".mp-pv-map");
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.setAttribute("aria-hidden", "true");
  cv.getContext("2d").drawImage(reliefCache.canvas, 0, 0);
  host.replaceChildren(cv, ...scenarios.map((s) => {
    const mk = document.createElement("span"); mk.className = "mp-pv-marker"; mk.textContent = s.n; mk.setAttribute("aria-hidden", "true");
    mk.style.left = W / 2 + (s.stereo_x_m - cx) / mpp + "px"; mk.style.top = py - (s.stereo_y_m - cy) / mpp + "px";
    return mk;
  }));
}

function draw() {
  const focusKey = document.activeElement?.dataset?.focus;
  const startDate = (getState().start || "2027-03-14T06:00:00Z").slice(0, 10);
  const stepsEl = document.getElementById("act-steps");
  const steps = [
    [1, t("act.s1"), t("act.s1d")],
    [2, t("act.s2"), t("act.s2d")],
    [3, t("act.s3"), t("act.s3d")],
    [4, t("act.s4"), t("act.s4d")]
  ];
  stepsEl.innerHTML = `
    <div><span class="mp-act-kicker">${t("act.kit")}</span><h1 class="mp-act-h1">${t("act.title")}</h1></div>
    ${steps.map(([n, title, sub]) => `
      <button class="mp-step-item ${n < cfg.step ? "is-done" : n === cfg.step ? "is-active" : ""}" data-step="${n}" data-focus="step${n}" type="button" ${n === cfg.step ? 'aria-current="step"' : ""}>
        <span class="mp-step-num">${n < cfg.step ? "✓" : n}</span>
        <span class="mp-step-txt"><strong>${title}</strong><span>${sub}</span></span>
      </button>
    `).join("")}
    <p class="mp-act-tip">${t("act.tip")}</p>
  `;
  stepsEl.querySelectorAll("[data-step]").forEach((el) => {
    el.onclick = () => { cfg.step = Number(el.dataset.step); draw(); };
  });

  const prevEl = document.getElementById("act-preview");
  const openIdx = LAYERS.findIndex(([k]) => k === cfg.openLayer);
  prevEl.innerHTML = `
    <div class="mp-act-head">
      <h2>${t("act.previewTitle")}</h2>
      <div class="mp-chip-row">
        <button class="mp-chip ${cfg.device === "laptop" ? "is-active" : ""}" data-dev="laptop" data-focus="dev-laptop" type="button" aria-pressed="${cfg.device === "laptop"}">${t("act.laptop")}</button>
        <button class="mp-chip ${cfg.device === "mobile" ? "is-active" : ""}" data-dev="mobile" data-focus="dev-mobile" type="button" aria-pressed="${cfg.device === "mobile"}">${t("act.mobile")}</button>
      </div>
    </div>
    <div class="mp-preview-frame ${cfg.device === "mobile" ? "is-mobile" : ""}">
      <div class="mp-pv-map"></div>
      <span class="mp-pv-badge">${t("act.badge")}</span>
      <span id="prev-seal" class="mp-pv-seal"></span>
      <div class="mp-pv-q mp-glass">
        <strong>${t("act.prompt")}</strong>
        <span>${t("act.promptSub")}</span>
      </div>
    </div>
    <div class="mp-act-head mp-act-open">
      <span>${t("act.openIn")}</span>
      <div class="mp-chip-row mp-layer-tabs" role="tablist" aria-label="${t("act.layers")}">
        ${LAYERS.map(([k, label], i) => `<button role="tab" class="mp-layer-tab ${i < openIdx ? "is-open" : ""} ${k === cfg.openLayer ? "is-active" : ""}" data-layer="${k}" data-focus="layer-${k}" type="button" aria-selected="${k === cfg.openLayer}" tabindex="${k === cfg.openLayer ? 0 : -1}">${t(label)}</button>`).join("")}
      </div>
    </div>
  `;
  prevEl.querySelector("#prev-seal").appendChild(sealEl(sealFor(doc.status)));
  prevEl.querySelectorAll("[data-dev]").forEach((b) => { b.onclick = () => { cfg.device = b.dataset.dev; draw(); }; });
  prevEl.querySelectorAll("[data-layer]").forEach((b) => {
    b.onclick = () => { cfg.openLayer = b.dataset.layer; setState({ layer: cfg.openLayer }); draw(); };
    b.onkeydown = (ev) => {
      const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      cfg.openLayer = LAYERS[(LAYERS.findIndex(([k]) => k === cfg.openLayer) + d + LAYERS.length) % LAYERS.length][0];
      setState({ layer: cfg.openLayer }); draw();
    };
  });
  paintPreviewTerrain(prevEl.querySelector(".mp-preview-frame"));

  const ctrlEl = document.getElementById("act-controls");
  const vars = { date: startDate, night: DEFAULT_RULES.night, blackout: DEFAULT_RULES.blackout };
  const toggles = [
    ["allowSite", "act.tSite", "act.tSiteD"],
    ["allowDate", "act.tDate", "act.tDateD"],
    ["allowProof", "act.tProof", "act.tProofD"],
    ["allowRules", "act.tRules", "act.tRulesD"],
    ["allowLab", "act.tLab", "act.tLabD"]
  ];
  ctrlEl.innerHTML = `
    <div class="mp-act-head"><h2>${t("act.ctrlTitle")}</h2><span class="mp-act-students">${t("act.students")}</span></div>
    ${toggles.map(([k, label, sub]) => `
      <label class="mp-toggle-row">
        <span class="mp-toggle-txt"><span>${t(label)}</span><small>${t(sub, vars)}</small></span>
        <button class="mp-switch ${cfg[k] ? "is-on" : ""}" data-toggle="${k}" data-focus="sw-${k}" type="button" role="switch" aria-checked="${cfg[k]}"></button>
      </label>
    `).join("")}
    <div class="mp-teacher-notes">
      <strong>${t("act.notesTitle")}</strong>
      <p>${t("act.notesBody")}</p>
      <p>${t("act.notesBody2")}</p>
    </div>
  `;
  ctrlEl.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = () => { cfg[b.dataset.toggle] = !cfg[b.dataset.toggle]; draw(); };
  });

  const shareEl = document.getElementById("act-share");
  const url = shareUrl();
  let qr = "";
  try { qr = qrSvg(url, { label: t("act.qrLabel") }); } catch { qr = ""; } // too long for a QR: omit it, the link stays
  shareEl.innerHTML = `
    ${qr ? `<div class="mp-qr">${qr}</div>` : ""}
    <div class="mp-share-main">
      <strong>${t("act.shareTitle")}</strong>
      <div class="mp-share-url" id="share-url"></div>
      <div class="mp-share-note">${t("act.access")}</div>
    </div>
    <div class="mp-chip-row mp-share-btns">
      <button id="btn-copy" class="mp-btn-outline" data-focus="copy" type="button">${t("act.copy")}</button>
      <a class="mp-btn-jade" id="btn-present">${PRESENT_ICON}${t("act.present")}</a>
    </div>
  `;
  shareEl.querySelector("#share-url").textContent = url;
  shareEl.querySelector("#btn-present").href = hrefTo("present.html"); // set as a property: the URL state never enters the markup string
  shareEl.querySelector("#btn-copy").onclick = async () => {
    try { await navigator.clipboard?.writeText(url); } catch {}
    shareEl.querySelector("#btn-copy").textContent = t("act.copied");
  };

  if (focusKey) document.querySelector(`[data-focus="${focusKey}"]`)?.focus();
}

addEventListener("resize", () => { const f = document.querySelector(".mp-preview-frame"); if (f) paintPreviewTerrain(f); });
draw();
