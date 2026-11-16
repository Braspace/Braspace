// MoonProof i18n: en + pt-BR dictionaries with identical keys.
// Screens add their texts with register(); t(key, vars) formats with {name} placeholders.
export type Lang = "en" | "pt-BR";
export type Dict = Record<string, string>;
export type Texts = Record<Lang, Dict>;
export const LANGS: Lang[] = ["en", "pt-BR"];
export const dict: Texts = {
  en: {
    "brand": "moonproof",
    "nav.explore": "Explore", "nav.compare": "Compare", "nav.recover": "Replan", "nav.cockpit": "Cockpit",
    "nav.evidence": "Evidence", "nav.evidence.short": "Evidence", "nav.landing": "Landing Lab", "nav.debrief": "Debrief", "nav.class": "Class", "nav.plan": "Plan",
    "nav.help": "Help", "nav.moon3d": "Moon 3D", "nav.moon3d.credit": "3D Moon (viewer and page backdrops): NASA SVS CGI Moon Kit, NASA LRO/LOLA, NASA/JPL NAIF SPICE, IAU/USGS, NASA Blue Marble. Illustrative, not independently validated; not a NASA product.", "sheet.grip": "Resize panel (drag or ↑ ↓)", "nav.lang": "Português", "nav.lang.short": "PT", "nav.main": "Main navigation",
    "ctx.days": "{n} days", "ctx.openIn": "Open in", "ctx.offline": "offline · precomputed", "ctx.online": "live API",
    "ctx.site": "Site", "ctx.compare": "Compare",
    "ctx.sunCap": "Sun: upper bound",
    "ctx.sunCapWhy": "Sunlight here is probably overestimated. Our series gives {ours} % and the NASA PGDA map {pgda} % ({diff} points less); the terrain horizon is traced to 100 km only. Read every Sun figure for this site as \"at most\".",
    "ctx.reachCap": "Sun: upper bound · Night: lower bound",
    "ctx.reachCapWhy": "The 100 km terrain horizon likely overstates sunlight and understates the longest darkness. A preliminary 200 km sensitivity study changes Sun-centre visibility from {sun100} to {sun200} % and longest darkness from {dark100} to {dark200} h. The longer-range result is not independently validated; see the horizon reach study.",
    "layer.answer": "Answer", "layer.why": "Why", "layer.proof": "Proof",
    "layer.seeWhy": "See why", "layer.seeProof": "See proof",
    "seal.VAL": "validated", "seal.PRE": "preliminary, not NASA-reviewed", "seal.EST": "estimate, unverified inputs",
    "seal.SIM": "synthetic simulation", "seal.N/D": "no data", "seal.FALHA": "failed",
    "nd": "—",
    "entry.skip": "Skip", "entry.eyebrow": "Lunar Landing Site Navigator · lunar south pole",
    "entry.title": "What do you want to do today?",
    "entry.lead": "Choose a task to open its own working tool. All tasks share the same scientific sources and mission context.",
    "entry.explore.title": "Explore the Moon", "entry.explore.who": "Curious people, students, visitors",
    "entry.explore.b1": "Direct answers, no jargon", "entry.explore.b2": "Inspect Sun, Earth and the terrain", "entry.explore.b3": "Landing Lab to try a landing",
    "entry.class.title": "Teach a class", "entry.class.who": "Teachers and educators",
    "entry.class.b1": "Present on the projector, one question at a time", "entry.class.b2": "Build an activity with a link or QR", "entry.class.b3": "Teacher notes and guided missions",
    "entry.plan.title": "Plan a mission", "entry.plan.who": "Planners and researchers",
    "entry.plan.b1": "Editable rules and scenario comparison", "entry.plan.b2": "Tables with unit and uncertainty", "entry.plan.b3": "Export CSV, JSON and a reproducible link",
    "entry.destination.explore": "Start exploring real sites", "entry.destination.class": "Start with the activity kit · projector available", "entry.destination.plan": "Open editable planning rules", "entry.hint": "You can change tasks from the MoonProof logo or the navigation links.",
    "mission.title": "Mission Control", "mission.sunVisible": "Sun visible", "mission.nights": "longest night",
    "mission.blackout": "Earth loss", "mission.earth": "Earth", "mission.maxSun": "max Sun",
    "mission.card.sun": "Sunlight in the window",
    "mission.answer.sun": "The Sun's centre is above the local horizon {pct} of the {hours} h window.",
    "mission.why.sun": "Yellow = Sun visible, each segment is one day. Computed from the stored hourly series against the LOLA terrain horizon.",
    "proof.definition": "Definition", "proof.definition.sun": "centre of the solar disc above the local terrain horizon",
    "proof.step": "Step", "proof.window": "Window", "proof.source": "Sources", "proof.src.compare": "Live API (comparison)", "proof.status": "State", "proof.sha": "Series SHA-256",
    "proof.loading": "loading…", "proof.error": "Data could not be loaded: {msg}",
    "terrain.label": "Shaded relief of the lunar south pole from NASA LOLA (400 m)",
    "terrain.marker": "{n} {name} (site)",
  },
  "pt-BR": {
    "brand": "moonproof",
    "nav.explore": "Explorar", "nav.compare": "Comparar", "nav.recover": "Replanejar", "nav.cockpit": "Cockpit",
    "nav.evidence": "Evidências", "nav.evidence.short": "Evidências", "nav.landing": "Laboratório de pouso", "nav.debrief": "Análise do pouso", "nav.class": "Aula", "nav.plan": "Planejar",
    "nav.help": "Ajuda", "nav.moon3d": "Lua 3D", "nav.moon3d.credit": "Lua 3D (visualizador e fundo das páginas): NASA SVS CGI Moon Kit, NASA LRO/LOLA, NASA/JPL NAIF SPICE, IAU/USGS, NASA Blue Marble. Ilustrativa, sem validação independente; não é um produto da NASA.", "sheet.grip": "Redimensionar painel (arraste ou ↑ ↓)", "nav.lang": "English", "nav.lang.short": "EN", "nav.main": "Navegação principal",
    "ctx.days": "{n} dias", "ctx.openIn": "Abrir em", "ctx.offline": "offline · pré-calculado", "ctx.online": "API ao vivo",
    "ctx.site": "Local", "ctx.compare": "Comparar",
    "ctx.sunCap": "Sol: teto",
    "ctx.sunCapWhy": "A luz solar aqui provavelmente está superestimada. Nossa série dá {ours} % e o mapa PGDA da NASA {pgda} % ({diff} pontos a menos); o horizonte do relevo só é traçado até 100 km. Leia todo número de Sol deste local como \"no máximo\".",
    "ctx.reachCap": "Sol: teto · Noite: mínimo",
    "ctx.reachCapWhy": "O horizonte de 100 km provavelmente superestima a luz solar e subestima a maior escuridão. Um estudo preliminar com 200 km muda a visibilidade do centro do Sol de {sun100} para {sun200} % e a maior escuridão de {dark100} para {dark200} h. O resultado de maior alcance não foi validado independentemente; veja o estudo do alcance do horizonte.",
    "layer.answer": "Resposta", "layer.why": "Por quê", "layer.proof": "Prova",
    "layer.seeWhy": "Ver por quê", "layer.seeProof": "Ver prova",
    "seal.VAL": "validado", "seal.PRE": "preliminar, sem revisão da NASA", "seal.EST": "estimativa, entradas não verificadas",
    "seal.SIM": "simulação sintética", "seal.N/D": "sem dado", "seal.FALHA": "falhou",
    "nd": "—",
    "entry.skip": "Pular", "entry.eyebrow": "Lunar Landing Site Navigator · polo sul da Lua",
    "entry.title": "O que você quer fazer hoje?",
    "entry.lead": "Escolha uma tarefa para abrir sua ferramenta. Todas compartilham as mesmas fontes científicas e o contexto da missão.",
    "entry.explore.title": "Explorar a Lua", "entry.explore.who": "Curiosos, estudantes, visitantes",
    "entry.explore.b1": "Respostas diretas, sem jargão", "entry.explore.b2": "Explore Sol, Terra e relevo", "entry.explore.b3": "Laboratório de pouso para testar um pouso",
    "entry.class.title": "Dar uma aula", "entry.class.who": "Professores e educadores",
    "entry.class.b1": "Apresentar no projetor, uma pergunta por vez", "entry.class.b2": "Montar atividade com link ou QR", "entry.class.b3": "Notas do professor e missões guiadas",
    "entry.plan.title": "Planejar uma missão", "entry.plan.who": "Planejadores e pesquisadores",
    "entry.plan.b1": "Regras editáveis e comparação de cenários", "entry.plan.b2": "Tabelas com unidade e incerteza", "entry.plan.b3": "Exportar CSV, JSON e link reproduzível",
    "entry.destination.explore": "Começar a explorar os locais reais", "entry.destination.class": "Começar pelo Kit Aula · apresentação disponível", "entry.destination.plan": "Abrir regras editáveis de planejamento", "entry.hint": "Para trocar de tarefa, volte pelo logo do MoonProof ou use os links de navegação.",
    "mission.title": "Mission Control", "mission.sunVisible": "Sol visível", "mission.nights": "maior noite",
    "mission.blackout": "sem Terra", "mission.earth": "Terra", "mission.maxSun": "Sol máx.",
    "mission.card.sun": "Sol na janela",
    "mission.answer.sun": "O centro do Sol fica acima do horizonte local {pct} da janela de {hours} h.",
    "mission.why.sun": "Amarelo = Sol visível; cada trecho é um dia. Calculado da série horária gravada contra o horizonte do relevo LOLA.",
    "proof.definition": "Definição", "proof.definition.sun": "centro do disco solar acima do horizonte local do relevo",
    "proof.step": "Passo", "proof.window": "Janela", "proof.source": "Fontes", "proof.src.compare": "API ao vivo (comparação)", "proof.status": "Estado", "proof.sha": "SHA-256 da série",
    "proof.loading": "carregando…", "proof.error": "Não foi possível carregar o dado: {msg}",
    "terrain.label": "Relevo sombreado do polo sul da Lua a partir do LOLA da NASA (400 m)",
    "terrain.marker": "{n} {name} (local)",
  },
};

/** Add a screen's texts. Both languages must carry the same keys (throws otherwise). */
export function register(texts: Texts): void {
  const a = Object.keys(texts.en || {}).sort(), b = Object.keys(texts["pt-BR"] || {}).sort();
  if (a.join("|") !== b.join("|")) throw new Error("i18n.register: en and pt-BR keys differ");
  for (const l of LANGS) Object.assign(dict[l], texts[l]);
}

let current: Lang = "en";
const isLang = (l: unknown): l is Lang => LANGS.includes(l as Lang);
export function pickLang(param?: string | null, navLangs: readonly string[] = globalThis.navigator?.languages || []): Lang {
  if (isLang(param)) return param;
  return navLangs.some(l => /^pt/i.test(l)) ? "pt-BR" : "en";
}
export function setLang(l?: string | null): void { current = isLang(l) ? l : "en"; if (globalThis.document) document.documentElement.lang = current; }
export function lang(): Lang { return current; }
export function t(key: string, vars: Record<string, unknown> = {}): string {
  const s = dict[current][key] ?? dict.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
/** Fill every [data-i18n] element in root with its text. */
export function apply(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria!));
}
export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return t("nd");
  return new Intl.NumberFormat(current, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}
