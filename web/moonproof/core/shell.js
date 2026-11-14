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
];

function pill(text, { href, current, cls = "", onClick, pressed } = {}) {
  const el = document.createElement(href ? "a" : "button");
  el.className = "mp-pill " + cls; el.textContent = text;
  if (href) el.href = href; else el.type = "button";
  if (current) el.setAttribute("aria-current", "page");
  if (pressed != null) el.setAttribute("aria-pressed", String(pressed));
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

/**
 * mountShell({ screen, context, onLang })
 *  screen: id from SCREENS ("mission" = A, highlighted as none) — sets aria-current.
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
  function render() {
    const st = getState();
    const brand = document.createElement("a"); brand.className = "mp-brand"; brand.href = hrefTo("index.html");
    brand.innerHTML = '<span class="mp-logo" aria-hidden="true"></span>'; brand.append(t("brand"));
    const nav = document.createElement("nav"); nav.className = "mp-nav"; nav.setAttribute("aria-label", t("nav.main"));
    for (const s of SCREENS) nav.append(pill(t(s.key), { href: hrefTo(s.page), current: s.id === screen, cls: s.sim ? "is-sim" : "" }));
    const right = document.createElement("div"); right.className = "mp-nav-right";
    right.append(
      pill(t("nav.class"), { cls: "mp-kit", pressed: st.task === "class", onClick: () => { setState({ task: st.task === "class" ? null : "class" }); render(); } }),
      pill(t("nav.plan"), { cls: "mp-kit", pressed: st.task === "plan", onClick: () => { setState({ task: st.task === "plan" ? null : "plan" }); render(); } }),
      pill(t("nav.lang"), { onClick: () => { const l = lang() === "en" ? "pt-BR" : "en"; setState({ lang: l }); setLang(l); render(); apply(); onLang && onLang(l); } }),
    );
    top.replaceChildren(brand, nav, right);
    bottom.setAttribute("aria-label", t("nav.main"));
    bottom.replaceChildren(...SCREENS.filter(s => !s.sim).map(s => pill(t(s.short || s.key), { href: hrefTo(s.page), current: s.id === screen })));
    renderCtx();
  }
  function renderCtx() {
    ctx.hidden = !cur; if (!cur) return;
    const st = getState();
    const b = document.createElement("b"); b.textContent = cur.site ?? t("nd");
    const parts = [b, " · ", cur.date ?? t("nd"), " · ", cur.days != null ? t("ctx.days", { n: cur.days }) : t("nd")];
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
  return { setContext(c) { cur = c; renderCtx(); }, render };
}
