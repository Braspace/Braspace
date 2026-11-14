// MoonProof shell: top navigation, context bar, "Open in", kits Class/Plan, language, mobile bottom nav.
import { t, setLang, pickLang, apply, lang } from "./i18n.js";
import { getState, setState, hrefTo, LAYERS } from "./state.js";
import { sealEl } from "./layers.js";

export const SCREENS = [
  { id: "explore", page: "explore.html", key: "nav.explore" },
  { id: "compare", page: "compare.html", key: "nav.compare" },
  { id: "recover", page: "recover.html", key: "nav.recover" },
  { id: "cockpit", page: "cockpit.html", key: "nav.cockpit" },
  { id: "evidence", page: "evidence.html", key: "nav.evidence", short: "nav.evidence.short" },
  { id: "landing", page: "landing.html", key: "nav.landing", sim: true },
  { id: "debrief", page: "debrief.html", key: "nav.debrief", sim: true },
];

// Pages that are a view of a nav screen (A · Mission Control is the overview of Explore, as in capture A).
const ALIAS = { mission: "explore" };
/** Which nav pill is current for a page's screen id ("" = none). */
export function currentNav(screen) { const id = ALIAS[screen] || screen; return SCREENS.some(s => s.id === id) ? id : ""; }

// Line icons (24 px grid, 1.7 stroke) as in the design's nav pills.
const P = {
  explore: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  compare: '<path d="M5 20V9M12 20V4M19 20v-7"/>',
  recover: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  cockpit: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
  evidence: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  debrief: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  landing: '<path d="M12 3l3 7H9z"/><path d="M9 10l-3 9M15 10l3 9M7 19h3M14 19h3"/>',
};
const icon = id => P[id] ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[id]}</svg>` : "";

function pill(text, { href, current, cls = "", onClick, pressed, ico, label } = {}) {
  const el = document.createElement(href ? "a" : "button");
  el.className = "mp-pill " + cls; el.innerHTML = icon(ico); el.append(text);
  if (href) el.href = href; else el.type = "button";
  if (current) el.setAttribute("aria-current", "page");
  if (label) { el.setAttribute("aria-label", label); el.title = label; }
  if (pressed != null) el.setAttribute("aria-pressed", String(pressed));
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

/**
 * mountShell({ screen, context, onLang })
 *  screen: id from SCREENS, or "mission" (A, the overview of Explore) — sets aria-current on that one pill only.
 *  context: { site, date, days, status, online, action: { label, href } } or null (no context bar).
 * Re-renders on language switch; calls onLang() so the screen redraws its own texts.
 * Returns { setContext(ctx) }.
 */
export function mountShell({ screen, context = null, onLang } = {}) {
  setLang(pickLang(getState().lang));
  const top = document.createElement("header"); top.className = "mp-top";
  const ctx = document.createElement("div"); ctx.className = "mp-context"; ctx.setAttribute("role", "status");
  const bottom = document.createElement("nav"); bottom.className = "mp-bottomnav";
  document.body.prepend(top, ctx); document.body.append(bottom);
  let cur = context;
  const active = currentNav(screen);
  function render() {
    const st = getState();
    const brand = document.createElement("a"); brand.className = "mp-brand"; brand.href = hrefTo("index.html");
    brand.innerHTML = '<span class="mp-logo" aria-hidden="true"></span>'; brand.append(t("brand"));
    const nav = document.createElement("nav"); nav.className = "mp-nav"; nav.setAttribute("aria-label", t("nav.main"));
    for (const s of SCREENS) nav.append(pill(t(s.key), { href: hrefTo(s.page), current: s.id === active, cls: s.sim ? "is-sim" : "", ico: s.id }));
    const right = document.createElement("div"); right.className = "mp-nav-right";
    right.append(
      pill(t("nav.class"), { cls: "mp-kit", pressed: st.task === "class", onClick: () => { setState({ task: st.task === "class" ? null : "class" }); render(); } }),
      pill(t("nav.plan"), { cls: "mp-kit", pressed: st.task === "plan", onClick: () => { setState({ task: st.task === "plan" ? null : "plan" }); render(); } }),
      helpPill(),
      pill(t("nav.lang.short"), { cls: "is-round mp-lang", label: t("nav.lang"), onClick: () => { const l = lang() === "en" ? "pt-BR" : "en"; setState({ lang: l }); setLang(l); render(); apply(); onLang && onLang(l); } }),
    );
    top.replaceChildren(brand, nav, right);
    bottom.setAttribute("aria-label", t("nav.main"));
    bottom.replaceChildren(...SCREENS.filter(s => !s.sim).map(s => pill(t(s.short || s.key), { href: hrefTo(s.page), current: s.id === active, ico: s.id })));
    renderCtx();
  }
  function renderCtx() {
    ctx.hidden = !cur; if (!cur) return;
    const st = getState();
    const b = document.createElement("b"); b.textContent = cur.site ?? t("nd");
    const txt = document.createElement("span"); txt.className = "mp-ctx-text";
    txt.append(b, " • ", cur.date ?? t("nd"), " • ", cur.days != null ? t("ctx.days", { n: cur.days }) : t("nd"));
    const parts = [txt];
    const seal = sealEl(cur.seal || "N/D");
    const net = document.createElement("span"); net.className = "mp-label"; net.textContent = cur.online ? t("ctx.online") : t("ctx.offline");
    const lab = document.createElement("label"); lab.className = "mp-label"; lab.textContent = t("ctx.openIn") + " ";
    const sel = document.createElement("select");
    for (const l of LAYERS) { const o = new Option(t("layer." + l), l, false, l === st.layer); sel.append(o); }
    sel.onchange = () => { setState({ layer: sel.value }); };
    lab.append(sel);
    ctx.replaceChildren(...parts, seal, net, lab);
    if (cur.action) ctx.append(pill(cur.action.label, { href: cur.action.href, cls: "is-primary" }));
  }
  render(); apply();
  wireSheet();
  return { setContext(c) { cur = c; renderCtx(); }, render };
}

/** "?" — legend of the seals (each seal's meaning comes from i18n, nothing invented). */
function helpPill() {
  const b = pill("?", { cls: "is-round mp-help" }); b.setAttribute("aria-label", t("nav.help")); b.setAttribute("aria-expanded", "false");
  b.onclick = () => {
    let pop = document.getElementById("mp-help"); const open = !pop;
    if (pop) pop.remove();
    else {
      pop = document.createElement("div"); pop.id = "mp-help"; pop.className = "mp-glass mp-help-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", t("nav.help"));
      for (const k of ["VAL", "PRE", "EST", "SIM", "N/D", "FALHA"]) { const r = document.createElement("p"); r.append(sealEl(k), " ", t("seal." + k)); pop.append(r); }
      document.body.append(pop);
    }
    b.setAttribute("aria-expanded", String(open));
  };
  return b;
}

/**
 * Mobile bottom sheet (≤700 px), M1/M2: the screen's side panel ([data-mp-sheet], or #panel / #right)
 * becomes a sheet with a grip; drag (pointer) or keyboard (↑ ↓ on the grip) between 18 % and 82 % of the height.
 */
function wireSheet() {
  const el = document.querySelector("[data-mp-sheet]") || document.getElementById("panel") || document.getElementById("right");
  if (!el || !globalThis.matchMedia) return;
  const mq = matchMedia("(max-width:700px)");
  el.setAttribute("data-mp-sheet", "");
  const grip = document.createElement("button"); grip.type = "button"; grip.className = "mp-sheet-grip";
  grip.setAttribute("aria-label", t("sheet.grip"));
  el.prepend(grip);
  // The panel may be re-rendered by the screen (replaceChildren): keep the grip first.
  new MutationObserver(() => { if (el.firstChild !== grip) el.prepend(grip); }).observe(el, { childList: true });
  const H = () => innerHeight, MIN = .18, MAX = .82;
  let frac = .34;
  const set = f => { frac = Math.min(MAX, Math.max(MIN, f)); el.style.setProperty("--sheet-h", Math.round(frac * H()) + "px"); grip.setAttribute("aria-valuenow", String(Math.round(frac * 100))); };
  grip.setAttribute("role", "slider"); grip.setAttribute("aria-valuemin", String(MIN * 100)); grip.setAttribute("aria-valuemax", String(MAX * 100));
  let y0 = 0, f0 = 0, moved = false;
  grip.addEventListener("pointerdown", e => { if (!mq.matches) return; y0 = e.clientY; f0 = frac; moved = false; grip.setPointerCapture(e.pointerId); el.classList.add("is-dragging"); });
  grip.addEventListener("pointermove", e => { if (!grip.hasPointerCapture(e.pointerId)) return; const dy = y0 - e.clientY; if (Math.abs(dy) > 3) moved = true; set(f0 + dy / H()); });
  grip.addEventListener("pointerup", e => { if (!grip.hasPointerCapture(e.pointerId)) return; grip.releasePointerCapture(e.pointerId); el.classList.remove("is-dragging");
    if (!moved) set(frac < .5 ? MAX : .34); else set([MIN, .34, .58, MAX].reduce((a, b) => Math.abs(b - frac) < Math.abs(a - frac) ? b : a)); });
  grip.addEventListener("keydown", e => { if (e.key === "ArrowUp") { set(frac + .12); e.preventDefault(); } if (e.key === "ArrowDown") { set(frac - .12); e.preventDefault(); } });
  addEventListener("resize", () => set(frac));
  set(frac);
}
