// V3 Camadas · rules page: the core (what always shows), the three layers of a card, and the two kits.
// Every number comes from core/data.js or the URL state; nothing from the design sheet is copied here.
import { mountShell } from "../core/shell.js";
import { holdReady, markReady } from "../core/ready.js";
import { loadSites, windowMetrics, dailySun, SEALS } from "../core/data.js";
import { createLayerCard, barEl, sealEl } from "../core/layers.js";
import { register, t, fmtNum, apply } from "../core/i18n.js";
import { getState, hrefTo, TASKS } from "../core/state.js";

register({
  en: {
    "rules.eyebrow": "moonproof · architecture v3",
    "rules.title": "One core, three layers, two kits.",
    "rules.lead": "Instead of three modes that change the whole screen, each card opens in depth. Teachers and planners get kits on top of the same core.",
    "rules.core.h": "The core · what always shows",
    "rules.core.map.t": "Map and numbered sites",
    "rules.core.map.d": "Shaded relief of the lunar south pole from NASA LOLA, with {n} real sites as 44 px markers.",
    "rules.core.ctx.t": "Context bar",
    "rules.core.ctx.d": "Site, date, window, origin seal, live or offline API and \"Open in\". The state is always in view.",
    "rules.core.card.t": "Three-layer card",
    "rules.core.card.d": "Every answer is a card that opens in place: Answer, Why, Proof. No card hides its proof.",
    "rules.core.seal.t": "Origin seals",
    "rules.core.seal.d": "The seal comes from the origin of the value, never from the screen. Missing value: \"—\" and no data.",
    "rules.layers.h": "The same card in three layers · opens in place, no change of screen",
    "rules.example": "Real-data example: site {n} · {name}, {days} days from {date}.",
    "rules.example.nd": "Real-data example unavailable: {msg}",
    "rules.card.title": "Longest night",
    "rules.card.answer": "{h} in the dark. Assumed limit: {limit} h; {margin}.",
    "rules.card.spare": "{d} h to spare",
    "rules.card.over": "{d} h over the limit",
    "rules.card.nodata": "No data for this window.",
    "rules.def.night": "centre of the solar disc below the local terrain horizon",
    "rules.cap.answer": "1 · Answer: one sentence and a few numbers. Where the public stops.",
    "rules.cap.why": "2 · Why: the chart that explains. Where the class happens.",
    "rules.cap.proof": "3 · Proof: definition, source, uncertainty and export. Where the planner checks.",
    "rules.kits.h": "The kits · they add, they never replace",
    "rules.kit.class.t": "Class Kit",
    "rules.kit.class.who": "For teachers and educators. Opens in: Why.",
    "rules.kit.class.b1": "Present on the projector, one question at a time",
    "rules.kit.class.b2": "Build an activity with a link or QR",
    "rules.kit.class.rule": "The kit adds tools over the core. The Answer stays one sentence and the Proof stays one tap away.",
    "rules.kit.class.open": "Open Present",
    "rules.kit.class.open2": "Open Activity",
    "rules.kit.plan.t": "Planning Kit",
    "rules.kit.plan.who": "For planners and researchers. Opens in: Proof.",
    "rules.kit.plan.b1": "Editable rules, shown as assumed limits",
    "rules.kit.plan.b2": "Table with unit, margin, uncertainty and origin",
    "rules.kit.plan.b3": "Export CSV, JSON and a reproducible link",
    "rules.kit.plan.rule": "A changed rule creates a new scenario; the original stays saved.",
    "rules.kit.plan.open": "Open Plan",
    "rules.who.h": "Who opens in what",
    "rules.who.colTask": "Chosen task",
    "rules.who.colOpens": "Opens in",
    "rules.who.colKit": "Kit",
    "rules.who.colExtras": "Extras",
    "rules.who.x.explore": "Landing Lab",
    "rules.who.x.class": "Present, build an activity",
    "rules.who.x.plan": "Editable rules, table, uncertainty, export",
    "rules.who.note": "The choice is the person's, never the system's, and can be changed at any time.",
    "rules.sys.h": "System rules",
    "rules.r1.t": "Every screen has the three layers", "rules.r1.d": "Nobody gets stuck: any card opens up to the Proof.",
    "rules.r2.t": "One vocabulary", "rules.r2.d": "Plain term in the Answer; technical term beside it in the Proof.",
    "rules.r3.t": "Kits add, they don't replace", "rules.r3.d": "Class and Plan add tools over the core.",
    "rules.r4.t": "State always visible", "rules.r4.d": "\"Open in\" and the active kits stay at the top.",
    "rules.r5.t": "No global modes", "rules.r5.d": "The same button never does different things depending on a mode.",
    "rules.r6.t": "No guessing the user", "rules.r6.d": "The system does not change the interface by itself.",
    "rules.yes": "rule that holds", "rules.no": "forbidden"
  },
  "pt-BR": {
    "rules.eyebrow": "moonproof · arquitetura v3",
    "rules.title": "Um núcleo, três camadas, dois kits.",
    "rules.lead": "Em vez de três modos que mudam a tela inteira, cada cartão se abre em profundidade. Educadores e planejadores ganham kits por cima do mesmo núcleo.",
    "rules.core.h": "O núcleo · o que sempre aparece",
    "rules.core.map.t": "Mapa e locais numerados",
    "rules.core.map.d": "Relevo sombreado do polo sul da Lua a partir do LOLA da NASA, com {n} locais reais em marcadores de 44 px.",
    "rules.core.ctx.t": "Barra de contexto",
    "rules.core.ctx.d": "Local, data, janela, selo de origem, API ao vivo ou offline e \"Abrir em\". O estado está sempre à vista.",
    "rules.core.card.t": "Cartão de três camadas",
    "rules.core.card.d": "Toda resposta é um cartão que se abre no lugar: Resposta, Por quê, Prova. Nenhum cartão esconde a prova.",
    "rules.core.seal.t": "Selos de origem",
    "rules.core.seal.d": "O selo vem da origem do valor, nunca da tela. Valor ausente: \"—\" e sem dado.",
    "rules.layers.h": "O mesmo cartão nas três camadas · abre no lugar, sem trocar de tela",
    "rules.example": "Exemplo com dado real: local {n} · {name}, {days} dias a partir de {date}.",
    "rules.example.nd": "Exemplo com dado real indisponível: {msg}",
    "rules.card.title": "Maior noite",
    "rules.card.answer": "{h} no escuro. Limite assumido: {limit} h; {margin}.",
    "rules.card.spare": "sobram {d} h",
    "rules.card.over": "passa {d} h do limite",
    "rules.card.nodata": "Sem dado para esta janela.",
    "rules.def.night": "centro do disco solar abaixo do horizonte local do relevo",
    "rules.cap.answer": "1 · Resposta: uma frase e poucos números. É onde o público para.",
    "rules.cap.why": "2 · Por quê: o gráfico que explica. É onde a aula acontece.",
    "rules.cap.proof": "3 · Prova: definição, fonte, incerteza e exportação. É onde o planejador confere.",
    "rules.kits.h": "Os kits · somam, não substituem",
    "rules.kit.class.t": "Kit Aula",
    "rules.kit.class.who": "Para professores e educadores. Abre em: Por quê.",
    "rules.kit.class.b1": "Apresentar no projetor, uma pergunta por vez",
    "rules.kit.class.b2": "Montar atividade com link ou QR",
    "rules.kit.class.rule": "O kit acrescenta ferramentas sobre o núcleo. A Resposta continua uma frase e a Prova continua a um toque.",
    "rules.kit.class.open": "Abrir Apresentar",
    "rules.kit.class.open2": "Abrir Atividade",
    "rules.kit.plan.t": "Kit Planejamento",
    "rules.kit.plan.who": "Para planejadores e pesquisadores. Abre em: Prova.",
    "rules.kit.plan.b1": "Regras editáveis, mostradas como limites assumidos",
    "rules.kit.plan.b2": "Tabela com unidade, margem, incerteza e origem",
    "rules.kit.plan.b3": "Exportar CSV, JSON e link reproduzível",
    "rules.kit.plan.rule": "Mudar uma regra gera um cenário novo; o original fica salvo.",
    "rules.kit.plan.open": "Abrir Planejar",
    "rules.who.h": "Quem abre em quê",
    "rules.who.colTask": "Tarefa escolhida",
    "rules.who.colOpens": "Abre em",
    "rules.who.colKit": "Kit",
    "rules.who.colExtras": "Extras",
    "rules.who.x.explore": "Landing Lab",
    "rules.who.x.class": "Apresentar, montar atividade",
    "rules.who.x.plan": "Regras editáveis, tabela, incerteza, exportação",
    "rules.who.note": "A escolha é da pessoa, nunca do sistema, e pode ser trocada a qualquer momento.",
    "rules.sys.h": "Regras do sistema",
    "rules.r1.t": "Toda tela tem as três camadas", "rules.r1.d": "Ninguém fica preso: qualquer cartão abre até a Prova.",
    "rules.r2.t": "Um vocabulário só", "rules.r2.d": "Termo simples na Resposta; termo técnico ao lado dele na Prova.",
    "rules.r3.t": "Kits somam, não substituem", "rules.r3.d": "Aula e Planejar acrescentam ferramentas sobre o núcleo.",
    "rules.r4.t": "Estado sempre visível", "rules.r4.d": "\"Abrir em\" e os kits ativos ficam no topo.",
    "rules.r5.t": "Nada de modos globais", "rules.r5.d": "O mesmo botão nunca faz coisas diferentes conforme o modo.",
    "rules.r6.t": "Nada de adivinhar o usuário", "rules.r6.d": "O sistema não muda a interface sozinho.",
    "rules.yes": "regra que vale", "rules.no": "proibido"
  }
});

holdReady();
const shell = mountShell({ screen: "evidence", onLang: draw });
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtH = v => v == null ? t("nd") : fmtNum(v, 1) + " h";

let doc = null, site = null, m = null, hours = 0, failure = null;
try {
  doc = await loadSites();
  const st = getState();
  site = doc.sites.find(s => s.id === st.site) || doc.sites[0];
  hours = st.hours || 336;
  m = await windowMetrics(doc, site, st.start, hours);
} catch (e) { failure = String(e?.message || e); }

function coreTiles() {
  const n = doc ? fmtNum(doc.sites.length) : t("nd");
  return ["map", "ctx", "card", "seal"].map(id => {
    const tile = el("article", "mp-card mp-rules-tile");
    tile.append(el("h3", "", t(`rules.core.${id}.t`)), el("p", "", t(`rules.core.${id}.d`, { n })));
    if (id === "seal") {
      const list = el("div", "mp-rules-seals");
      for (const k of SEALS) { const row = el("div"); row.append(sealEl(k), t("seal." + k)); list.append(row); }
      tile.append(list);
    }
    return tile;
  });
}

function layerCard(layer) {
  const night = m?.longestDarkH;
  const limit = getState().night; // assumed limit (editable default, never a measured value)
  let answer = t("rules.card.nodata");
  if (night?.value != null) {
    const diff = limit - night.value;
    const margin = diff >= 0 ? t("rules.card.spare", { d: fmtNum(diff, 1) }) : t("rules.card.over", { d: fmtNum(-diff, 1) });
    answer = t("rules.card.answer", { h: fmtH(night.value), limit: fmtNum(limit), margin });
  }
  const why = el("div");
  if (m) why.append(barEl(dailySun(m.series, m.t0, hours)));
  why.append(el("p", "mp-label", t("mission.why.sun")));
  const d = night?.detail || {};
  const proof = [
    [t("proof.definition"), t("rules.def.night")],
    [t("proof.step"), d.step ?? null],
    [t("proof.window"), d.start ? `${d.start.slice(0, 10)} · ${fmtNum(d.hours)} h` : null],
    [t("proof.source"), night?.source || null],
    [t("proof.sha"), d.sha256 ?? null],
    [t("proof.status"), night?.status ?? null],
  ];
  return createLayerCard({ title: t("rules.card.title"), status: night?.status, answer, why, proof, layer });
}

function kit(id, links, bullets) {
  const a = el("article", "mp-card mp-rules-kit");
  const ul = el("ul"); for (let i = 1; i <= bullets; i++) ul.append(el("li", "", t(`rules.kit.${id}.b${i}`)));
  const actions = el("div", "mp-rules-actions");
  for (const [key, page] of links) {
    const link = el("a", "mp-pill is-white", t(key));
    link.href = hrefTo(page, { ...getState(), task: id, layer: TASKS[id] });
    actions.append(link);
  }
  a.append(el("h3", "", t(`rules.kit.${id}.t`)), el("p", "mp-label", t(`rules.kit.${id}.who`)), ul, el("p", "", t(`rules.kit.${id}.rule`)), actions);
  return a;
}

function whoTable() {
  const kitOf = { explore: t("nd"), class: t("rules.kit.class.t"), plan: t("rules.kit.plan.t") };
  const tb = el("table");
  const head = tb.createTHead().insertRow();
  for (const k of ["Task", "Opens", "Kit", "Extras"]) { const th = el("th", "", t(`rules.who.col${k}`)); th.scope = "col"; head.append(th); }
  const body = tb.createTBody();
  for (const task of Object.keys(TASKS)) {
    const tr = body.insertRow();
    const a = el("a", "", t(`entry.${task}.title`)); a.href = hrefTo("mission.html", { ...getState(), task, layer: TASKS[task] });
    tr.insertCell().append(a);
    tr.insertCell().textContent = t("layer." + TASKS[task]);
    tr.insertCell().textContent = kitOf[task];
    const x = tr.insertCell(); x.className = "x"; x.textContent = t(`rules.who.x.${task}`);
  }
  return tb;
}

function draw() {
  $("rules-core").replaceChildren(...coreTiles());

  const ex = $("rules-example");
  if (site && m) {
    ex.replaceChildren(t("rules.example", { n: site.n, name: site.name, days: fmtNum(hours / 24), date: new Date(m.t0).toISOString().slice(0, 10) }), sealEl(m.longestDarkH.seal));
  } else ex.replaceChildren(t("rules.example.nd", { msg: failure ?? t("nd") }), sealEl("N/D"));

  const cols = $("rules-layers"); cols.replaceChildren();
  for (const layer of ["answer", "why", "proof"]) {
    const col = el("div", "mp-rules-col");
    const cap = el("span"); const [head, ...rest] = t(`rules.cap.${layer}`).split(": ");
    cap.append(el("b", "", head), ": " + rest.join(": "));
    col.append(layerCard(layer).el, cap); cols.append(col);
  }

  $("rules-kits").replaceChildren(
    kit("class", [["rules.kit.class.open", "present.html"], ["rules.kit.class.open2", "activity.html"]], 2),
    kit("plan", [["rules.kit.plan.open", "plan.html"]], 3));
  $("rules-who").replaceChildren(whoTable());

  $("rules-sys").replaceChildren(...[1, 2, 3, 4, 5, 6].map(i => {
    const li = el("li"); const no = i > 4; if (no) li.dataset.no = "";
    const mk = el("span", "mk", no ? "✕" : "✓"); mk.setAttribute("role", "img"); mk.setAttribute("aria-label", t(no ? "rules.no" : "rules.yes"));
    const txt = el("div"); txt.append(el("b", "", t(`rules.r${i}.t`)), el("span", "d", t(`rules.r${i}.d`)));
    li.append(mk, txt); return li;
  }));
  apply();
}
draw();
markReady();
