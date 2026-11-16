// Accessible, opt-out, contextual MoonProof tours. Pure UI: no NASA data or mission state changes.
export const TOUR_STEPS = {
  entry: [
    { targets: ["#cards", ".mp-entry-cards"], en: ["Choose how to use MoonProof", "Three modes are available. Pick the one that matches your goal; you can switch to another mode later."], pt: ["Escolha como usar o MoonProof", "Há três modos diferentes. Escolha o que combina com seu objetivo; você pode mudar de modo depois."] },
    { targets: ['#cards [data-task="explore"]'], en: ["Explore the Moon", "Get to know lunar regions and see sunlight, Earth visibility and terrain without technical jargon."], pt: ["Explorar a Lua", "Conheça regiões lunares e observe luz do Sol, visibilidade da Terra e relevo de forma simples."] },
    { targets: ['#cards [data-task="class"]'], en: ["Teach a class", "Prepare an activity, share it with students and open a guided presentation with questions."], pt: ["Dar uma aula", "Prepare uma atividade, compartilhe com a turma e abra uma apresentação guiada com perguntas."] },
    { targets: ['#cards [data-task="plan"]'], en: ["Plan a mission", "Compare scenarios and adjust mission assumptions. Results are educational and must be checked against their evidence labels."], pt: ["Planejar uma missão", "Compare cenários e ajuste hipóteses da missão. Os resultados são educativos; confira sempre os selos das evidências."] }
  ],
  cockpit: [
    { targets: ["#terrain"], en: ["Welcome to the lunar Cockpit", "This is the MoonProof map. Explore candidate regions at the lunar south pole; the prototype is not flight-certified."], pt: ["Bem-vinda ao Cockpit lunar", "Este é o mapa do MoonProof. Explore regiões candidatas no polo sul da Lua; o protótipo não é certificado para voo."] },
    { targets: [".mp-context", "#ck-panel-controls"], en: ["Check the mission context", "The top bar shows the selected site, time window and evidence status. Missing values remain N/D."], pt: ["Confira o contexto da missão", "A barra superior informa o local selecionado, o período e o estado das evidências. Dados ausentes continuam como N/D."] },
    { targets: ["#ck-panel-controls .ck-panel-menu summary", "#ck-panel-controls"], en: ["Make the Cockpit your own", "Open Panels to show or hide nine groups. Moon only hides them; Restore panels brings them back."], pt: ["Personalize o Cockpit", "Abra Painéis para mostrar ou ocultar nove grupos. Só a Lua os recolhe; Restaurar painéis os traz de volta."] },
    { targets: ["#left .mp-visrow", "#left", "#sheet"], en: ["Energy, Sun and Earth", "Follow battery, lighting and Earth-visibility information. Read the PRELIMINARY or SYNTHETIC labels before interpreting results."], pt: ["Energia, Sol e Terra", "Acompanhe bateria, iluminação e visibilidade da Terra. Confira os selos PRELIMINARY ou SYNTHETIC antes de interpretar resultados."] },
    { targets: ["#right .mp-rules", "#right", "#sheet"], en: ["Rules, alerts and crew", "Use the mission rules, fault scenarios and crew panels to explore consequences. This is an educational simulation."], pt: ["Regras, alertas e tripulação", "Use regras, cenários de falha e painéis da tripulação para explorar consequências. Esta é uma simulação educacional."] },
    { targets: ["#player", "#play"], en: ["Play through the mission", "Start, pause, change speed or move through the timeline to see how the simulated mission evolves."], pt: ["Acompanhe a missão no tempo", "Inicie, pause, ajuste a velocidade ou percorra a linha do tempo para observar a evolução da missão simulada."] },
    { targets: [".moon-ui .moon-open", "#terrain"], en: ["Explore the shared 3D Moon", "When available, Explore the Moon opens the existing 3D view. Press Esc to return; use View tutorial any time to revisit these steps."], pt: ["Explore a Lua 3D compartilhada", "Quando disponível, Explorar a Lua abre a cena 3D existente. Pressione Esc para voltar e use Ver tutorial para rever estas etapas."] }
  ],
  explore: [
    { targets: ["#terrain"], en: ["This is the Moon", "Move around the map to see the lunar surface. Its shapes come from terrain measurements."], pt: ["Esta é a Lua", "Explore o mapa para conhecer a superfície lunar. As formas mostram o relevo da região."] },
    { targets: ["#left .ex-tabs", "#chips"], en: ["Choose what to see", "Switch between terrain, sunlight and Earth views. Each view answers a different question."], pt: ["Escolha o que observar", "Alterne entre terreno, luz do Sol e visão da Terra. Cada opção mostra algo diferente."] },
    { targets: ["#right #card-site", "#sheet", "#left .ex-list"], en: ["Choose a place", "Select a known location to see its measurements. You can compare places later."], pt: ["Escolha um lugar", "Selecione uma região conhecida para ver suas informações e depois compará-la com outras."] },
    { targets: ["#right #card-horizon", "#sheet-body", "#right"], en: ["Why light and Earth matter", "Sunlight helps power equipment. Seeing Earth helps send messages. Hills can block either view."], pt: ["Por que Sol e Terra importam", "A luz ajuda a gerar energia. Ver a Terra ajuda na comunicação. Morros podem bloquear os dois."] },
    { targets: ["#dock", "#sheet"], en: ["Keep exploring", "Use these controls to switch places. When ready, compare possibilities or try the landing activity."], pt: ["Continue explorando", "Use estes controles para mudar de lugar. Depois, compare regiões ou experimente um pouso."] }
  ],
  present: [
    { targets: ["#present-question"], en: ["One question at a time", "Read the question and the mission rules before choosing a place."], pt: ["Uma pergunta por vez", "Leia a pergunta e as regras da missão antes de escolher um lugar."] },
    { targets: ["#present-cards"], en: ["Choose an answer", "Select A, B or C. More than one scenario may work. The numbers help you decide."], pt: ["Escolha uma resposta", "Selecione A, B ou C. Pode haver mais de uma resposta válida. Use os números para decidir."] },
    { targets: ["#btn-none"], en: ["None is also an answer", "If no place meets the rule, choose None. If data are missing, the quiz says it cannot decide."], pt: ["Nenhum também vale", "Se nenhum lugar atender à regra, escolha Nenhum. Se faltarem dados, o quiz dirá que não é possível concluir."] },
    { targets: ["#btn-reveal", "#btn-next"], en: ["Reveal, then continue", "Reveal the answer and its explanation. Next question starts a new round."], pt: ["Revele e avance", "Mostre a resposta e a explicação. Próxima pergunta começa uma nova rodada."] }
  ],
  compare: [
    { targets: ["#left", "#sheet"], en: ["Build a comparison", "Choose scenarios and adjust each site and time window."], pt: ["Monte a comparação", "Escolha cenários e ajuste o local e a janela de cada um."] },
    { targets: ["#right", "#sheet"], en: ["Compare results", "Read each scenario’s indicators and evidence labels before selecting one."], pt: ["Compare os resultados", "Leia os indicadores e os selos de evidência de cada cenário antes de escolher."] }
  ],
  mission: [
    { targets: [".mp-context", "#terrain"], en: ["Check the mission context", "Confirm the site and time window used to evaluate the scenario."], pt: ["Defina o contexto", "Confira o local e o período usados para avaliar o cenário."] },
    { targets: ["#left", "#right", "#dock"], en: ["Read the indicators", "Use the panels to review illumination, Earth visibility and mission margins."], pt: ["Leia os indicadores", "Use os painéis para consultar iluminação, visibilidade da Terra e margens da missão."] }
  ],
  recover: [
    { targets: ["#left", "#sheet"], en: ["Try a fault scenario", "Adjust the scenario and see how assumptions affect recovery."], pt: ["Experimente uma falha", "Ajuste o cenário e observe como as hipóteses afetam a recuperação."] },
    { targets: ["#time", "#dock"], en: ["Review the simulation", "Use the timeline and check margins before and after the fault."], pt: ["Percorra a simulação", "Use a linha do tempo e confira as margens antes e depois da falha."] }
  ],
  debrief: [
    { targets: ["#left", "#map"], en: ["Review the landing", "Check the simulator’s recorded outcome and available trajectory."], pt: ["Revise o pouso", "Confira o resultado registrado no simulador e a trajetória disponível."] },
    { targets: ["#actions", "#right"], en: ["Choose the next step", "Use the debrief actions to continue your analysis or return to landing."], pt: ["Escolha o próximo passo", "Use as ações do debriefing para continuar a análise ou voltar ao pouso."] }
  ],
  evidence: [
    { targets: ["#menu", "#ev"], en: ["Find evidence", "Use the menu to navigate the documented topics."], pt: ["Encontre uma evidência", "Use o menu para navegar entre os temas documentados."] },
    { targets: ["#sources", "#trust", "#main"], en: ["Check provenance", "Review sources, limitations and confidence before interpreting a value."], pt: ["Confira a origem", "Leia as fontes, as limitações e o nível de confiança antes de interpretar um dado."] }
  ],
  landing: [
    { targets: ["#stage"], en: ["Get to know the landing view", "Follow the vehicle in this educational simulation."], pt: ["Conheça a cena de pouso", "Acompanhe o veículo nesta simulação educacional."] },
    { targets: ["#bottom", "#touch", "#bar"], en: ["Find the controls", "Read the instructions and watch the indicators while practicing the landing."], pt: ["Encontre os controles", "Consulte as instruções e acompanhe os indicadores ao praticar o pouso."] }
  ],
  plan: [
    { targets: ["#plan-rules", "#plan-root"], en: ["Review the rules", "Review the criteria and assumptions that guide planning."], pt: ["Confira as regras", "Revise os critérios e as hipóteses que orientam o planejamento."] },
    { targets: ["#plan-table", "#plan-export"], en: ["Review and export", "Check the results table before using the export options."], pt: ["Revise e exporte", "Confira a tabela de resultados antes de usar as opções de exportação."] }
  ],
  rules: [
    { targets: ["#rules-core", "#rules-root"], en: ["Understand the rules", "Read how mission criteria are applied to scenarios."], pt: ["Entenda as regras", "Leia como os critérios de missão são aplicados aos cenários."] },
    { targets: ["#rules-layers", "#rules-example"], en: ["Interpret the layers", "Use the examples and layer descriptions to interpret results."], pt: ["Interprete as camadas", "Consulte os exemplos e a descrição das camadas para interpretar os resultados."] }
  ],
  tasks: [
    { targets: ["#cards"], en: ["Choose a tool", "Open a task to explore the Moon, prepare a class or plan a scenario."], pt: ["Escolha uma ferramenta", "Abra uma tarefa para explorar a Lua, preparar uma aula ou planejar um cenário."] },
    { targets: ["#skip"], en: ["Go straight to the mission", "Use the shortcut to open the mission screen."], pt: ["Vá direto à missão", "Use o atalho para abrir a tela de missão."] }
  ],
  moonhd: [
    { targets: ["#loading.error .moon-preview-actions", ".views"], en: ["Choose how to explore the Moon", "Switch between the globe and the south pole. If 3D is unavailable, retry or open the south pole map."], pt: ["Escolha como explorar a Lua", "Alterne entre o globo e o polo sul. Se o 3D estiver indisponível, tente novamente ou abra o mapa do Polo Sul."] },
    { targets: ["#loading.error #moon-preview-map", ".panel"], en: ["Explore the scene or open the map", "In 3D, change time or lighting to see the scene respond. Use the 2D map for site details when 3D is unavailable."], pt: ["Explore a cena ou abra o mapa", "No 3D, ajuste o tempo ou a iluminação para ver a cena mudar. Use o mapa 2D para consultar os locais se o 3D estiver indisponível."] }
  ],
  class: [
    { targets: ["#act-steps"], en: ["Plan your class", "These four steps help you prepare an activity, from choosing places to sharing it."], pt: ["Prepare sua aula", "Estes quatro passos ajudam a montar uma atividade, da escolha dos lugares ao compartilhamento."] },
    { targets: ["#act-preview"], en: ["See the student view", "Preview what your class will see on a laptop or phone before presenting."], pt: ["Veja como a turma verá", "Confira como a atividade aparece no computador ou no celular dos alunos."] },
    { targets: ["#act-controls"], en: ["Guide the activity", "These switches show your suggestions for the class. They do not lock a student's browser."], pt: ["Oriente a atividade", "Estas opções mostram suas sugestões para a turma. Elas não bloqueiam os botões dos alunos."] },
    { targets: ["#btn-present"], en: ["Ask the questions", "Open the presentation, select A, B, C or None, then reveal the explanation. Missing data are not wrong answers."], pt: ["Faça as perguntas", "Abra a apresentação, escolha A, B, C ou Nenhum e revele a explicação. Dados ausentes não contam como erro."] },
    { targets: ["#act-share"], en: ["Share with the class", "Copy the link or QR for the presentation. Students can join without an account; answers are discussed together."], pt: ["Compartilhe com a turma", "Envie o link ou QR da apresentação. Não é preciso cadastro; as respostas são discutidas em aula."] }
  ]
};
const WORDS = {
  pt: { help:"Ver tutorial", welcome:"Quer conhecer esta tela?", welcomeBody:"Um tour rápido mostra onde clicar e para que serve cada parte. Você pode fechar quando quiser.", start:"Começar", skip:"Pular tutorial", close:"Fechar tutorial", next:"Próximo", prev:"Voltar", done:"Começar a usar", progress:"Passo", of:"de" },
  en: { help:"View tutorial", welcome:"Want a quick tour?", welcomeBody:"A short walkthrough shows what each area does and where to start. You can close it any time.", start:"Start", skip:"Skip tutorial", close:"Close tutorial", next:"Next", prev:"Back", done:"Start using", progress:"Step", of:"of" }
};
export function tourStorageKey(mode) { return "moonproof.tour." + mode + ".v1"; }
/** One automatic introduction per browser/site, regardless of which MoonProof screen opens first. */
export const SITE_WELCOME_KEY = "moonproof.tour.welcome.v1";
export function shouldAutoOpenTour(mode, alreadyWelcomed) {
  return mode !== "present" && mode !== "moonhd" && !alreadyWelcomed;
}
export function hasCompletedSiteWelcome(storage) {
  return [SITE_WELCOME_KEY, ...Object.keys(TOUR_STEPS).map(tourStorageKey)]
    .some(key => storage.getItem(key) === "done");
}
export function bestTarget(step, root) {
  for (const selector of step.targets) {
    const node = root.querySelector(selector);
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    if (rect.width > 5 && rect.height > 5 && style.display !== "none" && style.visibility !== "hidden")
      return { node, rect };
  }
  return null;
}
export function mountTour(mode) {
  if (!TOUR_STEPS[mode] || typeof document === "undefined") return () => {};
  const steps = TOUR_STEPS[mode];
  const key = tourStorageKey(mode);
  let index = -1, dialog = null, cover = null, spotlight = null, previousFocus = null;
  // Respect both new site-wide completion and old per-screen completion keys.
  let alreadyWelcomed = false;
  try { alreadyWelcomed = hasCompletedSiteWelcome(localStorage); } catch {}
  const lang = () => document.documentElement.lang.toLowerCase().startsWith("pt") ? "pt" : "en";
  const words = () => WORDS[lang()];
  const directButtons = [...document.querySelectorAll("[data-mp-tour-slot]")].map(slot => {
    const button = createTourButton();
    slot.append(button);
    return button;
  });
  function onOpen() { open(false); }
  function fillMenu(event) { event.detail.prepend(createTourButton()); }
  document.addEventListener("mp-tour-open", onOpen);
  document.addEventListener("mp-tour-slot", fillMenu);
  const remember = () => { try { localStorage.setItem(key, "done"); localStorage.setItem(SITE_WELCOME_KEY, "done"); } catch {} };
  function close() {
    if (!dialog) return;
    remember();
    dialog.remove(); cover.remove(); spotlight.remove();
    dialog = cover = spotlight = null;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    (previousFocus?.isConnected && previousFocus !== document.body ? previousFocus :
      directButtons[0] || document.querySelector("[data-mp-tour-opener]") || document.querySelector(".mp-top .mp-help"))?.focus();
  }
  function onKey(event) {
    if (!dialog) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const buttons = [...dialog.querySelectorAll("button:not([disabled])")].filter(b => !b.hidden);
    if (!buttons.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function place() {
    if (!dialog || !spotlight) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const selected = index < 0 ? null : bestTarget(steps[index], document);
    const card = dialog.getBoundingClientRect();
    if (!selected) {
      spotlight.hidden = true;
      cover.style.background = "rgba(2, 6, 12, .72)";
      dialog.style.left = Math.max(12, (vw - card.width) / 2) + "px";
      dialog.style.top = Math.max(12, (vh - card.height) / 2) + "px";
      return;
    }
    cover.style.background = "transparent";
    spotlight.hidden = false;
    const r = selected.rect;
    const left = Math.max(5, Math.min(vw - 5, r.left - 5)), top = Math.max(5, Math.min(vh - 5, r.top - 5));
    const width = Math.min(vw - left - 5, Math.max(30, r.width + 10));
    const height = Math.min(vh - top - 5, Math.max(30, r.height + 10));
    Object.assign(spotlight.style, { left:left+"px", top:top+"px", width:width+"px", height:height+"px" });
    const x = Math.max(12, Math.min(vw - card.width - 12, r.left + r.width / 2 - card.width / 2));
    const bottom = r.bottom + 18, above = r.top - card.height - 18;
    const y = bottom + card.height < vh - 12 ? bottom : above > 12 ? above : Math.max(12, (vh - card.height) / 2);
    dialog.style.left = x + "px";
    dialog.style.top = y + "px";
  }
  function show() {
    if (!dialog) return;
    const w = words(), isWelcome = index < 0;
    const [title, body] = isWelcome ? [w.welcome, w.welcomeBody] : steps[index][lang()];
    dialog.querySelector("#mp-tour-title").textContent = title;
    dialog.querySelector("#mp-tour-copy").textContent = body;
    const progress = dialog.querySelector("#mp-tour-progress");
    progress.textContent = isWelcome ? "" : w.progress + " " + (index + 1) + " " + w.of + " " + steps.length;
    const prev = dialog.querySelector("#mp-tour-prev");
    prev.textContent = "← " + w.prev;
    prev.setAttribute("aria-label", w.prev);
    prev.hidden = index <= 0;
    const next = dialog.querySelector("#mp-tour-next");
    next.textContent = isWelcome ? w.start : index === steps.length - 1 ? w.done : w.next;
    dialog.querySelector("#mp-tour-skip").textContent = w.skip;
    dialog.querySelector("#mp-tour-close").setAttribute("aria-label", w.close);
    dialog.classList.remove("mp-tour-animate");
    void dialog.offsetWidth;
    dialog.classList.add("mp-tour-animate");
    requestAnimationFrame(place);
    next.focus();
  }
  function open(auto) {
    if (dialog) return;
    previousFocus = document.activeElement;
    index = auto ? -1 : 0;
    cover = document.createElement("div");
    cover.className = "mp-tour-cover";
    cover.setAttribute("aria-hidden", "true");
    spotlight = document.createElement("div");
    spotlight.className = "mp-tour-spotlight";
    spotlight.setAttribute("aria-hidden", "true");
    spotlight.hidden = true;
    dialog = document.createElement("section");
    dialog.className = "mp-tour-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "mp-tour-title");
    dialog.setAttribute("aria-describedby", "mp-tour-copy");
    dialog.innerHTML = '<button type="button" class="mp-tour-x" id="mp-tour-close" aria-label="Close">×</button>' +
      '<p class="mp-tour-progress" id="mp-tour-progress"></p><h2 id="mp-tour-title"></h2><p class="mp-tour-copy" id="mp-tour-copy"></p>' +
      '<div class="mp-tour-actions"><button type="button" class="mp-tour-skip" id="mp-tour-skip"></button>' +
      '<button type="button" class="mp-tour-prev" id="mp-tour-prev"></button>' +
      '<button type="button" class="mp-tour-next" id="mp-tour-next"></button></div>';
    document.body.append(cover, spotlight, dialog);
    dialog.querySelector("#mp-tour-close").onclick = close;
    dialog.querySelector("#mp-tour-skip").onclick = close;
    dialog.querySelector("#mp-tour-prev").onclick = () => { index = Math.max(0, index - 1); show(); };
    dialog.querySelector("#mp-tour-next").onclick = () => { if (index === steps.length - 1) close(); else { index++; show(); } };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    show();
  }
  // The welcome screen has no spotlight target: it can open before the API,
  // terrain and panels finish loading. Waiting for mp-ready could silently
  // suppress onboarding on a slow connection or an unavailable backend.
  const timer = setTimeout(() => {
    if (shouldAutoOpenTour(mode, alreadyWelcomed)) open(true);
  }, 350); // Leave one browser paint for locale/shell initialization.
  const langWatcher = new MutationObserver(() => {
    for (const button of document.querySelectorAll(".mp-tour-help")) button.textContent = words().help;
    if (dialog) show();
  });
  langWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => {
    clearTimeout(timer);
    langWatcher.disconnect();
    document.removeEventListener("mp-tour-open", onOpen);
    document.removeEventListener("mp-tour-slot", fillMenu);
    close();
    for (const button of directButtons) button.remove();
  };
}
function createTourButton() {
  const locale = document.documentElement.lang.toLowerCase().startsWith("pt") ? "pt" : "en";
  const help = document.createElement("button");
  help.type = "button";
  help.className = "mp-tour-help";
  help.textContent = WORDS[locale].help;
  help.addEventListener("click", () => document.dispatchEvent(new Event("mp-tour-open")));
  return help;
}
if (typeof document !== "undefined") {
  const script = document.querySelector("script[data-moon-tour]");
  if (script) mountTour(script.dataset.moonTour);
}
