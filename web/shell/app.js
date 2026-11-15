// moonproof v3 shell: one hash router for every route of the static site.
// Views are lazy-loaded ES modules in ./views/. The board (onboard cockpit) and the 3D terrain lab
// keep their own pages (their CSP and scripts differ) and are reached through the same routes.
import { startRouter, buildHash, bordoURL, loadLastRoute, parseHash } from "../ds/router.js";
import { h, provenanceStrip } from "../ds/components.js";

const ICONS = {
  explorar: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9z",
  comparar: "M3 4h5v16H3zM10 4h5v16h-5zM17 4h4v16h-4z",
  bordo: "M3 5h18v12H3zM8 21h8M12 17v4",
  evidencias: "M12 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM9 15l-2 6 5-2 5 2-2-6M9.5 10l2 2 3-3.5",
  terreno: "M9 4h6l2 7H7zM7 11l-3 8M17 11l3 8M10 11l-1 8M14 11l1 8M2 19h5M17 19h5",
  aula: "M3 6h18v11H3zM8 21h8M12 17v4M7 10h6",
};
const icon = d => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "i"); s.setAttribute("aria-hidden", "true"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); return s; };

export const ROUTE_NAMES = {
  "/": "Escolha", "/explorar": "Explorar o polo sul", "/comparar": "Comparar locais", "/comparar/tecnico": "Comparação técnica",
  "/aula": "Modo apresentação", "/aula/atividade": "Atividade guiada", "/bordo": "Painel de bordo", "/evidencias": "Fontes e limitações", "/terreno": "Terreno 3D",
};

const view = (name) => async (outlet, ctx) => {
  let mod;
  try { mod = await import(`./views/${name}.js`); }
  catch (e) {
    outlet.append(h("section", { class: "glass card" }, h("h1", { class: "title-l", "data-route-title": "", text: ROUTE_NAMES[ctx.path] || name }),
      h("p", { class: "t2", text: "Esta tela ainda não foi carregada: " + e.message })));
    return;
  }
  await mod.render(outlet, ctx);
};

const routes = [
  { path: "/", title: "Escolha", render: view("escolha") },
  { path: "/explorar", title: "Explorar o polo sul", render: view("explorar") },
  { path: "/comparar", title: "Comparar locais", render: view("comparar") },
  { path: "/comparar/tecnico", title: "Comparação técnica", render: view("tecnico") },
  { path: "/aula", title: "Modo apresentação", render: view("aula") },
  { path: "/aula/atividade", title: "Atividade guiada", render: view("atividade") },
  { path: "/evidencias", title: "Fontes e limitações", render: view("evidencias") },
  // Board and 3D lab live on their own pages; replace() keeps the back button working (no redirect loop).
  { path: "/bordo", prefix: true, title: "Painel de bordo", external: ctx => location.replace(bordoURL("onboard/cockpit.html", ctx.parts, ctx.query)) },
  { path: "/terreno", title: "Terreno 3D", external: ctx => { const q = new URLSearchParams(); if (ctx.site) q.set("site", ctx.site); if (ctx.query.t) q.set("t", ctx.query.t); if (ctx.query.d) q.set("d", ctx.query.d); location.replace("lab.html" + (q.size ? "#" + q : "")); } },
  { path: "*", notFound: true, title: "Página não encontrada", render: (outlet) => {
    outlet.append(h("section", { class: "glass card" }, h("h1", { class: "title-l", "data-route-title": "", text: "Página não encontrada" }),
      h("p", { class: "t2", text: "Este endereço não existe nesta versão." }), h("a", { class: "btnA", href: "#/", text: "Voltar para a escolha" })));
  } },
];

const NAV = [
  { path: "/explorar", label: "Explorar", ic: "explorar" },
  { path: "/comparar", label: "Comparar", ic: "comparar" },
  { path: "/bordo", label: "Painel de bordo", ic: "bordo" },
  { path: "/evidencias", label: "Evidências", ic: "evidencias" },
  { path: "/terreno", label: "Terreno 3D", ic: "terreno", cls: "lab" },
];
const KITS = [{ path: "/aula", label: "Aula" }, { path: "/comparar/tecnico", label: "Planejar" }];
const BOTTOM = [
  { path: "/explorar", label: "Explorar", ic: "explorar" }, { path: "/comparar", label: "Comparar", ic: "comparar" },
  { path: "/bordo", label: "Bordo", ic: "bordo" }, { path: "/aula", label: "Aula", ic: "aula" }, { path: "/evidencias", label: "Provas", ic: "evidencias" },
];

function isCurrent(path, current) { return current === path || (path !== "/" && current.startsWith(path + "/") && path !== "/comparar"); }

function paintChrome(ctx) {
  const q = { site: ctx.site, t: ctx.query.t, d: ctx.query.d }; // scenario travels with every nav link
  const nav = document.getElementById("nav");
  nav.replaceChildren(...NAV.map(n => h("a", { class: "navp" + (n.cls ? " " + n.cls : ""), href: buildHash(n.path, q), "aria-current": isCurrent(n.path, ctx.path) || (n.path === "/comparar" && ctx.path === "/comparar") ? "page" : null }, icon(ICONS[n.ic]), n.label)));
  document.getElementById("kits").replaceChildren(...KITS.map(k => h("a", { class: "navp", href: buildHash(k.path, q), "aria-current": ctx.path === k.path || ctx.path.startsWith(k.path + "/") ? "page" : null }, k.label)));
  document.getElementById("bottomnav").replaceChildren(...BOTTOM.map(n => h("a", { href: buildHash(n.path, q), "aria-current": isCurrent(n.path, ctx.path) || (n.path === "/comparar" && ctx.path.startsWith("/comparar")) ? "page" : null }, icon(ICONS[n.ic]), n.label)));
  const slot = document.getElementById("pstrip");
  // The Escolha shows its own short provenance notice above the task cards.
  slot.replaceChildren(ctx.path === "/" ? "" : provenanceStrip({
    items: [{ kind: "est", text: "Luz e Terra: LOLA + SPICE, prévio, não revisado pela NASA" }, { kind: "sim", text: "Simulações marcadas com SIM" }],
    note: "Sem recomendação de voo",
  }));
}

export function lastRouteLabel() {
  const last = loadLastRoute();
  if (!last) return null;
  const { path } = parseHash(last);
  const base = Object.keys(ROUTE_NAMES).filter(p => p !== "/" && (path === p || path.startsWith(p + "/"))).sort((a, b) => b.length - a.length)[0];
  return base ? { hash: last, label: ROUTE_NAMES[base] } : null;
}

startRouter({ routes, outlet: document.getElementById("view"), onAfter: paintChrome });
