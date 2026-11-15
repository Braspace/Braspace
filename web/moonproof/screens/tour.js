// Accessible, opt-out, contextual MoonProof tours. Pure UI: no NASA data or mission state changes.
export const TOUR_STEPS = {
  explore: [
    { targets: ["#terrain"], en: ["This is the Moon", "Move around the map to see the lunar surface. Its shapes come from terrain measurements."], pt: ["Esta é a Lua", "Explore o mapa para conhecer a superfície lunar. As formas mostram o relevo da região."] },
    { targets: ["#left .ex-tabs", "#chips"], en: ["Choose what to see", "Switch between terrain, sunlight and Earth views. Each view answers a different question."], pt: ["Escolha o que observar", "Alterne entre terreno, luz do Sol e visão da Terra. Cada opção mostra algo diferente."] },
    { targets: ["#right #card-site", "#sheet", "#left .ex-list"], en: ["Choose a place", "Select a known location to see its measurements. You can compare places later."], pt: ["Escolha um lugar", "Selecione uma região conhecida para ver suas informações e depois compará-la com outras."] },
    { targets: ["#right #card-horizon", "#sheet-body", "#right"], en: ["Why light and Earth matter", "Sunlight helps power equipment. Seeing Earth helps send messages. Hills can block either view."], pt: ["Por que Sol e Terra importam", "A luz ajuda a gerar energia. Ver a Terra ajuda na comunicação. Morros podem bloquear os dois."] },
    { targets: ["#dock", "#sheet"], en: ["Keep exploring", "Use these controls to switch places. When ready, compare possibilities or try the landing activity."], pt: ["Continue explorando", "Use estes controles para mudar de lugar. Depois, compare regiões ou experimente um pouso."] }
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
  let hasSeen = false;
  try { hasSeen = localStorage.getItem(key) === "done"; } catch {}
  const lang = () => document.documentElement.lang.toLowerCase().startsWith("pt") ? "pt" : "en";
  const words = () => WORDS[lang()];
  const help = document.createElement("button");
  help.type = "button";
  help.className = "mp-tour-help";
  help.textContent = "? " + words().help;
  help.setAttribute("aria-label", words().help);
  help.addEventListener("click", () => open(false));
  document.body.append(help);
  const remember = () => { try { localStorage.setItem(key, "done"); } catch {} };
  function close() {
    if (!dialog) return;
    remember();
    dialog.remove(); cover.remove(); spotlight.remove();
    dialog = cover = spotlight = null;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    (previousFocus?.isConnected ? previousFocus : help).focus();
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
  let attempts = 0;
  const timer = setInterval(() => {
    if (!help.isConnected || attempts++ > 65) { clearInterval(timer); return; }
    if (!document.documentElement.classList.contains("mp-ready") || !bestTarget(steps[0], document)) return;
    clearInterval(timer);
    if (!hasSeen) open(true);
  }, 180);
  const langWatcher = new MutationObserver(() => { help.textContent = "? " + words().help; help.setAttribute("aria-label", words().help); if(dialog) show(); });
  langWatcher.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  return () => {clearInterval(timer);langWatcher.disconnect();close();help.remove();};
}
if (typeof document !== "undefined") {
  const script = document.querySelector("script[data-moon-tour]");
  if (script) mountTour(script.dataset.moonTour);
}
