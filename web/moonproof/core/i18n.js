// MoonProof i18n: en + pt-BR dictionaries with identical keys.
// Screens add their texts with register(); t(key, vars) formats with {name} placeholders.
export const LANGS = ["en", "pt-BR"];
export const dict = {
  en: {
    "brand": "moonproof",
    "nav.explore": "Explore", "nav.compare": "Compare", "nav.recover": "Replan", "nav.cockpit": "Cockpit",
    "nav.evidence": "Evidence", "nav.evidence.short": "Proof", "nav.landing": "Landing Lab", "nav.debrief": "Debrief", "nav.class": "Class", "nav.plan": "Plan",
    "nav.help": "Help", "nav.moon3d": "Moon 3D", "nav.moon3d.credit": "3D Moon (viewer and page backdrops): NASA SVS CGI Moon Kit, NASA LRO/LOLA, NASA/JPL NAIF SPICE, IAU/USGS, NASA Blue Marble. Illustrative, not independently validated; not a NASA product.", "sheet.grip": "Resize panel (drag or ↑ ↓)", "nav.lang": "Português", "nav.lang.short": "PT", "nav.main": "Main navigation",
    "ctx.days": "{n} days", "ctx.openIn": "Open in", "ctx.offline": "offline · precomputed", "ctx.online": "live API",
    "ctx.site": "Site", "ctx.compare": "Compare",
    "ctx.sunCap": "Sun: upper bound",
    "ctx.sunCapWhy": "Sunlight here is probably overestimated. Our series gives {ours} % and the NASA PGDA map {pgda} % ({diff} points less); the terrain horizon is traced to 100 km only. Read every Sun figure for this site as \"at most\".",
    "layer.answer": "Answer", "layer.why": "Why", "layer.proof": "Proof",
    "layer.seeWhy": "See why", "layer.seeProof": "See proof",
    "seal.VAL": "validated", "seal.PRE": "preliminary, not NASA-reviewed", "seal.EST": "estimate, unverified inputs",
    "seal.SIM": "synthetic simulation", "seal.N/D": "no data", "seal.FALHA": "failed",
    "nd": "—",
    "entry.skip": "Skip", "entry.eyebrow": "Lunar Landing Site Navigator · lunar south pole",
    "entry.title": "What do you want to do today?",
    "entry.lead": "Everyone uses the same tool and the same data. Your choice only changes how much shows at first and which tools are at hand.",
    "entry.explore.title": "Explore the Moon", "entry.explore.who": "Curious people, students, visitors",
    "entry.explore.b1": "Direct answers, no jargon", "entry.explore.b2": "3-step tour the first time", "entry.explore.b3": "Landing Lab to try a landing",
    "entry.class.title": "Teach a class", "entry.class.who": "Teachers and educators",
    "entry.class.b1": "Present on the projector, one question at a time", "entry.class.b2": "Build an activity with a link or QR", "entry.class.b3": "Teacher notes and guided missions",
    "entry.plan.title": "Plan a mission", "entry.plan.who": "Planners and researchers",
    "entry.plan.b1": "Editable rules and scenario comparison", "entry.plan.b2": "Tables with unit and uncertainty", "entry.plan.b3": "Export CSV, JSON and a reproducible link",
    "entry.opensIn": "Opens in: {layer}", "entry.hint": "You can switch at any time with the {a} and {b} buttons at the top.",
    "mission.title": "Mission Control", "mission.sunVisible": "Sun visible", "mission.nights": "longest night",
    "mission.blackout": "Earth loss", "mission.earth": "Earth", "mission.maxSun": "max Sun",
    "mission.card.sun": "Sunlight in the window",
    "mission.answer.sun": "The Sun's centre is above the local horizon {pct} of the {hours} h window.",
    "mission.why.sun": "Yellow = Sun visible, each segment is one day. Computed from the stored hourly series against the LOLA terrain horizon.",
    "proof.definition": "Definition", "proof.definition.sun": "centre of the solar disc above the local terrain horizon",
    "proof.step": "Step", "proof.window": "Window", "proof.source": "Sources", "proof.status": "State", "proof.sha": "Series SHA-256",
    "proof.loading": "loading…", "proof.error": "Data could not be loaded: {msg}",
    "terrain.label": "Shaded relief of the lunar south pole from NASA LOLA (400 m)",
    "terrain.marker": "Site {n}: {name}",
  },
  "pt-BR": {
    "brand": "moonproof",
    "nav.explore": "Explorar", "nav.compare": "Comparar", "nav.recover": "Replanejar", "nav.cockpit": "Cockpit",
    "nav.evidence": "Evidências", "nav.evidence.short": "Provas", "nav.landing": "Landing Lab", "nav.debrief": "Debrief", "nav.class": "Aula", "nav.plan": "Planejar",
    "nav.help": "Ajuda", "nav.moon3d": "Lua 3D", "nav.moon3d.credit": "Lua 3D (visualizador e fundo das páginas): NASA SVS CGI Moon Kit, NASA LRO/LOLA, NASA/JPL NAIF SPICE, IAU/USGS, NASA Blue Marble. Ilustrativa, sem validação independente; não é um produto da NASA.", "sheet.grip": "Redimensionar painel (arraste ou ↑ ↓)", "nav.lang": "English", "nav.lang.short": "EN", "nav.main": "Navegação principal",
    "ctx.days": "{n} dias", "ctx.openIn": "Abrir em", "ctx.offline": "offline · pré-calculado", "ctx.online": "API ao vivo",
    "ctx.site": "Local", "ctx.compare": "Comparar",
    "ctx.sunCap": "Sol: teto",
    "ctx.sunCapWhy": "A luz solar aqui provavelmente está superestimada. Nossa série dá {ours} % e o mapa PGDA da NASA {pgda} % ({diff} pontos a menos); o horizonte do relevo só é traçado até 100 km. Leia todo número de Sol deste local como \"no máximo\".",
    "layer.answer": "Resposta", "layer.why": "Por quê", "layer.proof": "Prova",
    "layer.seeWhy": "Ver por quê", "layer.seeProof": "Ver prova",
    "seal.VAL": "validado", "seal.PRE": "preliminar, sem revisão da NASA", "seal.EST": "estimativa, entradas não verificadas",
    "seal.SIM": "simulação sintética", "seal.N/D": "sem dado", "seal.FALHA": "falhou",
    "nd": "—",
    "entry.skip": "Pular", "entry.eyebrow": "Lunar Landing Site Navigator · polo sul da Lua",
    "entry.title": "O que você quer fazer hoje?",
    "entry.lead": "Todos usam a mesma ferramenta e os mesmos dados. Sua escolha só muda o quanto aparece de início e quais ferramentas ficam à mão.",
    "entry.explore.title": "Explorar a Lua", "entry.explore.who": "Curiosos, estudantes, visitantes",
    "entry.explore.b1": "Respostas diretas, sem jargão", "entry.explore.b2": "Tour de 3 passos na primeira vez", "entry.explore.b3": "Landing Lab para testar um pouso",
    "entry.class.title": "Dar uma aula", "entry.class.who": "Professores e educadores",
    "entry.class.b1": "Apresentar no projetor, uma pergunta por vez", "entry.class.b2": "Montar atividade com link ou QR", "entry.class.b3": "Notas do professor e missões guiadas",
    "entry.plan.title": "Planejar uma missão", "entry.plan.who": "Planejadores e pesquisadores",
    "entry.plan.b1": "Regras editáveis e comparação de cenários", "entry.plan.b2": "Tabelas com unidade e incerteza", "entry.plan.b3": "Exportar CSV, JSON e link reproduzível",
    "entry.opensIn": "Abre em: {layer}", "entry.hint": "Dá para trocar a qualquer momento nos botões {a} e {b} do topo.",
    "mission.title": "Mission Control", "mission.sunVisible": "Sol visível", "mission.nights": "maior noite",
    "mission.blackout": "sem Terra", "mission.earth": "Terra", "mission.maxSun": "Sol máx.",
    "mission.card.sun": "Sol na janela",
    "mission.answer.sun": "O centro do Sol fica acima do horizonte local {pct} da janela de {hours} h.",
    "mission.why.sun": "Amarelo = Sol visível; cada trecho é um dia. Calculado da série horária gravada contra o horizonte do relevo LOLA.",
    "proof.definition": "Definição", "proof.definition.sun": "centro do disco solar acima do horizonte local do relevo",
    "proof.step": "Passo", "proof.window": "Janela", "proof.source": "Fontes", "proof.status": "Estado", "proof.sha": "SHA-256 da série",
    "proof.loading": "carregando…", "proof.error": "Não foi possível carregar o dado: {msg}",
    "terrain.label": "Relevo sombreado do polo sul da Lua a partir do LOLA da NASA (400 m)",
    "terrain.marker": "Local {n}: {name}",
  },
};

/** Add a screen's texts. Both languages must carry the same keys (throws otherwise). */
export function register(texts) {
  const a = Object.keys(texts.en || {}).sort(), b = Object.keys(texts["pt-BR"] || {}).sort();
  if (a.join("|") !== b.join("|")) throw new Error("i18n.register: en and pt-BR keys differ");
  for (const l of LANGS) Object.assign(dict[l], texts[l]);
}

let current = "en";
export function pickLang(param, navLangs = globalThis.navigator?.languages || []) {
  if (LANGS.includes(param)) return param;
  return navLangs.some(l => /^pt/i.test(l)) ? "pt-BR" : "en";
}
export function setLang(l) { current = LANGS.includes(l) ? l : "en"; if (globalThis.document) document.documentElement.lang = current; }
export function lang() { return current; }
export function t(key, vars = {}) {
  const s = dict[current][key] ?? dict.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
/** Fill every [data-i18n] element in root with its text. */
export function apply(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
}
export function fmtNum(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return t("nd");
  return new Intl.NumberFormat(current, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}
