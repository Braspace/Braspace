// Cockpit front end for the educational onboard simulator.
// Flow: form (ENTRADA) -> synthetic track (model.js) -> validated request (request.js)
//       -> POST /api/onboard/evaluate (energy and risks) -> panels.
// All text from the API is inserted with textContent. Nothing is parsed as HTML.
(function () {
  "use strict";

  const M = OnboardModel, R = OnboardRequest, F = OnboardFeatures;
  const $ = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const API_PATH = "/api/onboard/evaluate";
  const REPLAN_DELAYS = [0, 24, 48, 72];
  const DATE_OFFSETS_DAYS = [0, 1, 2, 3, 4, 5, 6, 7];

  const S = {
    site: "synthetic-demo-a",
    startLocal: "2026-12-01T00:00",
    durationH: 720,
    stepMin: 120,
    audience: "technical",
    lat: "", lon: "",
    power: { battery_capacity_wh: 200, initial_charge_wh: 150, reserve_wh: 50, solar_generation_w: 110, load_w: 80, max_comm_blackout_hours: 1 },
    tab: "entrada",
    t: 0,
    playing: null,
    api: null,            // last successful response
    apiError: null,
    saved: [],
    sens: null
  };

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function svg(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const f1 = (v, d) => (typeof v === "number" && Number.isFinite(v)) ? v.toFixed(d === undefined ? 1 : d) : "—";
  const tag = (s) => h("span", { class: "tag " + s, text: F.LABEL[s] || s });
  const startMs = () => Date.parse(S.startLocal + ":00Z");
  const iso = ms => new Date(ms).toISOString().replace(".000Z", "Z");
  const fmt = ms => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const edu = text => S.audience === "educational" ? h("p", { class: "note", text }) : null;

  function count() { return Math.floor((S.durationH * 60) / S.stepMin); }

  // ---------- model computation ----------
  function track(delayH) {
    return M.track({ siteId: S.site, startMs: startMs(), stepMin: S.stepMin, count: count(), delayH: delayH || 0 });
  }
  function scenario() {
    const tr = track(0);
    const sum = M.summary(tr, S.stepMin);
    const life = M.lifeSupport(S.durationH);
    return { tr, sum, life, viol: M.violations(sum, life) };
  }

  // ---------- API ----------
  function buildApiRequest(delays) {
    const cands = delays.map(d => {
      const tr = track(d);
      return {
        id: "atraso-" + d + "h",
        site_id: S.site,
        start_utc: iso(startMs() + d * 3600e3),
        source_claim: "SYNTHETIC-NOT-NASA",
        step_minutes: S.stepMin,
        max_comm_blackout_hours: S.power.max_comm_blackout_hours,
        power: {
          battery_capacity_wh: S.power.battery_capacity_wh,
          initial_charge_wh: S.power.initial_charge_wh,
          reserve_wh: S.power.reserve_wh,
          solar_generation_w: S.power.solar_generation_w,
          load_w: S.power.load_w
        },
        samples: tr.map(s => ({ sun_visible: s.sun_visible, earth_visible: s.earth_visible }))
      };
    });
    return R.buildRequest("BRASPACE-COCKPIT-" + S.site, cands);
  }

  async function calculate() {
    const btn = $("calc");
    const req = buildApiRequest(REPLAN_DELAYS);
    if (!req.ok) { S.apiError = req.errors; S.api = null; renderTab(); return; }
    btn.disabled = true; btn.textContent = "CALCULANDO…";
    try {
      const res = await fetch(API_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      const text = await res.text();
      if (!res.ok) { S.apiError = ["API respondeu " + res.status + ": " + text.slice(0, 240)]; S.api = null; setLamp("bad", "API ERRO"); }
      else { S.api = JSON.parse(text); S.apiError = null; setLamp("ok", "API OK"); }
    } catch (err) {
      S.api = null; S.apiError = ["Sem conexão com a API (" + err.message + "). Suba dev-server.py e a API Go."];
      setLamp("bad", "API OFF");
    } finally {
      btn.disabled = false; btn.textContent = "CALCULAR";
      renderAlarm(); renderTab();
    }
  }
  function setLamp(kind, text) {
    const el = $("lamp-api");
    el.className = kind;
    el.replaceChildren(h("b", { text }));
  }

  // API option for a delay (or null if not calculated)
  function apiOption(delay) {
    if (!S.api) return null;
    return S.api.options.find(o => o.id === "atraso-" + delay + "h") || null;
  }

  // ---------- alarm bar ----------
  // Groups API risks by category and severity, so a risk repeated across delays shows once,
  // with the cenários it appears in.
  function groupedRisks() {
    if (!S.api) return [];
    const map = new Map();
    for (const o of S.api.options) {
      for (const r of o.risks) {
        const key = r.category + "|" + r.severity;
        if (!map.has(key)) map.set(key, { category: r.category, severity: r.severity, explanation: r.explanation, ids: [] });
        map.get(key).ids.push(o.id);
      }
    }
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...map.values()].sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  }
  function renderAlarm() {
    const { viol } = scenario();
    const risks = groupedRisks();
    const list = $("alarm-list");
    const sum = $("alarm-sum");
    const box = $("alarm");
    const items = [
      ...viol.map(v => ({ sev: "HIGH", text: v.text, src: "modelo" })),
      ...risks.map(r => ({ sev: r.severity, text: r.category + " · " + r.explanation, src: "cálculo · " + r.ids.join(", ") }))
    ];
    list.replaceChildren(...items.map(i => h("li", { class: "sev-" + i.sev }, "[" + i.sev + "] " + i.text + "  ·  " + i.src)));
    if (items.length === 0) {
      box.className = "alarm none";
      sum.textContent = S.api ? "SEM ALARMES NESTE CENÁRIO · CÁLCULO SINTÉTICO" : "SEM ALARMES DO MODELO · CALCULE PARA VERIFICAR A ENERGIA";
      box.open = false;
    } else {
      box.className = "alarm on";
      sum.replaceChildren(h("span", { class: "count", text: items.length + " ALARME" + (items.length > 1 ? "S" : "") }), h("span", { class: "dim", text: "clique para ver" }));
      box.open = true;
    }
  }

  // ---------- clocks ----------
  function tickClock() {
    const now = Date.now();
    $("utc").textContent = new Date(now).toISOString().slice(11, 19);
    const diff = startMs() - now;
    const abs = Math.abs(diff);
    const d = Math.floor(abs / 86400e3), hh = Math.floor(abs % 86400e3 / 3600e3), mm = Math.floor(abs % 3600e3 / 60e3);
    $("met").textContent = (diff >= 0 ? "T-" : "T+") + " " + d + "d " + String(hh).padStart(2, "0") + "h " + String(mm).padStart(2, "0") + "m";
  }

  // ---------- views ----------
  const VIEWS = {};

  VIEWS.entrada = () => {
    const sites = Object.entries(M.SITES).map(([id, s]) => h("option", { value: id, selected: id === S.site }, id + " · " + s.name));
    const latInvalid = S.lat !== "" && !(Number(S.lat) >= -90 && Number(S.lat) <= 90);
    const lonInvalid = S.lon !== "" && !(Number(S.lon) >= -180 && Number(S.lon) <= 180);
    const field = (key, label, type, extra) => h("label", {}, label,
      h("input", Object.assign({ type: type || "number", value: S.power[key], "data-power": key, oninput: onPower, step: "any" }, extra || {})));
    return [
      h("section", { class: "panel" },
        h("h2", { text: "01 · Entrada do cenário" }),
        h("div", { class: "fields" },
          h("label", {}, "Sítio sintético", h("select", { id: "site", onchange: e => { S.site = e.target.value; S.api = null; renderAlarm(); renderTab(); } }, sites)),
          h("label", {}, "Data e hora de pouso (UTC)", h("input", { type: "datetime-local", value: S.startLocal, onchange: e => { S.startLocal = e.target.value; S.api = null; renderAlarm(); renderTab(); } })),
          h("label", {}, "Duração (h, até 720)", h("input", { type: "number", min: "1", max: "720", value: S.durationH, onchange: e => { S.durationH = Number(e.target.value); S.api = null; renderAlarm(); renderTab(); } })),
          h("label", {}, "Passo (min, 1 a 360)", h("input", { type: "number", min: "1", max: "360", value: S.stepMin, onchange: e => { S.stepMin = Number(e.target.value); S.api = null; renderAlarm(); renderTab(); } }))),
        h("div", { class: "fields", style: "margin-top:10px" },
          h("label", {}, "Latitude personalizada (°)", h("input", { type: "number", value: S.lat, "aria-invalid": latInvalid, oninput: e => { S.lat = e.target.value; renderTab(); } }),
            h("span", { class: latInvalid ? "hint err" : "hint", text: latInvalid ? "fora de -90 a 90" : "não altera o cálculo: usa o sítio escolhido" })),
          h("label", {}, "Longitude personalizada (°)", h("input", { type: "number", value: S.lon, "aria-invalid": lonInvalid, oninput: e => { S.lon = e.target.value; renderTab(); } }),
            h("span", { class: lonInvalid ? "hint err" : "hint", text: lonInvalid ? "fora de -180 a 180" : "não altera o cálculo" }))),
        h("div", { class: "row", style: "margin-top:12px" },
          h("div", { class: "row" },
            h("button", { type: "button", "aria-pressed": S.audience === "technical", onclick: () => { S.audience = "technical"; renderTab(); } }, "TÉCNICO"),
            h("button", { type: "button", "aria-pressed": S.audience === "educational", onclick: () => { S.audience = "educational"; renderTab(); } }, "EDUCATIVO")),
          h("button", { type: "button", id: "calc", class: "go", onclick: calculate }, "CALCULAR")),
        h("p", { class: "note", text: "Calcular envia o cenário à API para energia e riscos. Os demais painéis usam o modelo sintético do navegador." }),
        edu("Modo educativo: o sítio define o horizonte; a data define onde Sol e Terra estão; a energia depende do que o sol entrega e do que a carga consome.")),
      h("section", { class: "panel" },
        h("h2", { text: "Energia do cenário (entrada)" }),
        h("div", { class: "fields" },
          field("battery_capacity_wh", "Capacidade da bateria (Wh)"),
          field("initial_charge_wh", "Carga inicial (Wh)"),
          field("reserve_wh", "Reserva (Wh)"),
          field("solar_generation_w", "Solar com Sol (W) · premissa"),
          field("load_w", "Carga (W)"),
          field("max_comm_blackout_hours", "Bloqueio máximo da Terra (h)"))),
      S.apiError ? h("div", { class: "caution", role: "alert" }, S.apiError.map(e => h("div", { text: e }))) : null
    ];
  };
  function onPower(e) {
    const k = e.target.dataset.power;
    S.power[k] = e.target.value === "" ? NaN : Number(e.target.value);
    S.api = null;
    renderAlarm();
  }

  VIEWS.geometria = () => {
    const { tr, sum } = scenario();
    if (S.t >= tr.length) S.t = 0;
    const cur = tr[S.t] || tr[0];
    const trS = M.transitions(tr, "sun_visible", S.stepMin);
    const trE = M.transitions(tr, "earth_visible", S.stepMin);
    const nextS = trS.find(x => x.index > S.t);
    const nextE = trE.find(x => x.index > S.t);
    const slider = h("input", { type: "range", min: "0", max: String(Math.max(0, tr.length - 1)), value: String(S.t), "aria-label": "Hora do cenário", oninput: e => { S.t = Number(e.target.value); renderTab(); } });
    return [
      h("section", { class: "panel" },
        h("h2", { text: "02 · Geometria do Sol e da Terra" }),
        h("div", { class: "row" }, h("span", { class: "mono", text: fmt(startMs() + cur.i * S.stepMin * 60e3) }), tag("SINT")),
        h("div", { style: "margin:8px 0" }, slider),
        h("div", { class: "row" },
          h("button", { type: "button", "aria-pressed": !!S.playing, onclick: togglePlay }, S.playing ? "PAUSAR" : "REPRODUZIR"),
          h("span", { class: "dim", text: "passo " + S.stepMin + " min" })),
        h("div", { class: "grid two", style: "margin-top:12px" },
          h("dl", { class: "readout" },
            h("dt", { text: "SOL azimute" }), h("dd", { text: f1(cur.sunAz) + "°" }),
            h("dt", { text: "SOL elevação" }), h("dd", { text: f1(cur.sunEl, 2) + "°" }),
            h("dt", { text: "SOL acima do horizonte" }), h("dd", { text: cur.sun_visible ? "SIM" : "NÃO" })),
          h("dl", { class: "readout" },
            h("dt", { text: "TERRA azimute" }), h("dd", { text: f1(cur.earthAz) + "°" }),
            h("dt", { text: "TERRA elevação" }), h("dd", { text: f1(cur.earthEl, 2) + "°" }),
            h("dt", { text: "TERRA visível" }), h("dd", { text: cur.earth_visible ? "SIM" : "NÃO" }))),
        h("p", { class: "note", text: "Sem refração atmosférica. Ângulos de modelo sintético, não efeméride." })),
      h("section", { class: "panel" },
        h("h2", { text: "Linha do tempo" }),
        strip("Luz do Sol", tr, s => s.sun_visible, "#ffb020"),
        strip("Terra visível", tr, s => s.earth_visible, "#5fd8ff"),
        h("div", { class: "legend" }, h("span", {}, h("i", { style: "background:#ffb020" }), "luz"), h("span", {}, h("i", { style: "background:#5fd8ff" }), "Terra visível"), h("span", {}, h("i", { style: "background:#1c3240" }), "sem")),
        h("dl", { class: "readout", style: "margin-top:10px" },
          h("dt", { text: "PRÓXIMA MUDANÇA DE LUZ" }), h("dd", { text: nextS ? fmt(startMs() + nextS.tH * 0 + nextS.index * S.stepMin * 60e3) + (nextS.to ? " (escurece→luz)" : " (luz→escuro)") : "nenhuma após T" }),
          h("dt", { text: "PRÓXIMA MUDANÇA DA TERRA" }), h("dd", { text: nextE ? fmt(startMs() + nextE.index * S.stepMin * 60e3) : "nenhuma após T" })),
        h("p", { class: "note", text: "Animação por passo fixo. Instante exato por bisseção ainda pendente (4.6)." }),
        edu("Cada barra mostra uma hora (ou o passo escolhido). Luz e Terra visível são coisas diferentes."))
    ];
  };
  function togglePlay() {
    if (S.playing) { clearInterval(S.playing); S.playing = null; renderTab(); return; }
    S.playing = setInterval(() => {
      const { tr } = scenario();
      S.t = (S.t + 1) % tr.length;
      if (S.tab === "geometria") renderTab();
    }, 350);
    renderTab();
  }
  function strip(label, tr, pred, color) {
    const box = h("div", { class: "strip", role: "img", "aria-label": label + ": " + tr.filter(pred).length + " de " + tr.length + " amostras" });
    tr.forEach(s => box.append(h("i", { style: "background:" + (pred(s) ? color : "#1c3240") })));
    return h("div", { style: "margin:8px 0" }, h("div", { class: "dim", text: label }), box);
  }

  // Horizon view: azimuth on X (N at both ends, as in a skyline chart), elevation on Y.
  // The filled area is the synthetic horizon. Faint dots show the Sun and Earth over the
  // whole window; the solid markers show the current time, with a drop line to the horizon.
  VIEWS.horizonte = () => {
    const { tr } = scenario();
    if (S.t >= tr.length) S.t = 0;
    const cur = tr[S.t] || tr[0];
    const site = M.SITES[S.site];
    const W = 640, H = 260, L = 46, R = 16, T = 14, B = 34;
    const EMIN = -4, EMAX = 6;
    const x = a => L + (a / 360) * (W - L - R);
    const y = e => T + ((EMAX - e) / (EMAX - EMIN)) * (H - T - B);
    const box = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img",
      "aria-label": "Horizonte sintético do sítio " + site.name + " com Sol e Terra no instante escolhido" });

    // grid: elevation every 2°, azimuth every 45°
    for (let e = EMIN; e <= EMAX; e += 2) {
      box.append(svg("line", { x1: L, x2: W - R, y1: y(e), y2: y(e), stroke: e === 0 ? "#5fd8ff" : "#1c3240", "stroke-opacity": e === 0 ? ".6" : "1", "stroke-dasharray": e === 0 ? "4 4" : "" }));
      box.append(svg("text", { x: L - 8, y: y(e) + 4, "text-anchor": "end" }, (e > 0 ? "+" : "") + e + "°"));
    }
    const names = { 0: "N", 45: "NE", 90: "L", 135: "SE", 180: "S", 225: "SO", 270: "O", 315: "NO", 360: "N" };
    for (let a = 0; a <= 360; a += 45) {
      box.append(svg("line", { x1: x(a), x2: x(a), y1: T, y2: H - B, stroke: "#1c3240" }));
      box.append(svg("text", { x: x(a), y: H - B + 16, "text-anchor": "middle" }, names[a] + " " + a + "°"));
    }

    // horizon area
    let d = "";
    for (let a = 0; a <= 360; a += 2) d += (a === 0 ? "M" : "L") + x(a).toFixed(1) + "," + y(M.horizonAt(a, site)).toFixed(1) + " ";
    box.append(svg("path", { d: d + "L" + x(360) + "," + y(EMIN) + " L" + x(0) + "," + y(EMIN) + " Z", fill: "#1c3240", "fill-opacity": ".9", stroke: "#6f8b7c", "stroke-width": "1.5" }));

    // whole-window paths as dots (no lines: azimuth wraps at 0/360)
    const stride = Math.max(1, Math.ceil(tr.length / 240));
    tr.forEach((s, i) => {
      if (i % stride) return;
      box.append(svg("circle", { cx: x(s.sunAz), cy: y(s.sunEl), r: 1.6, fill: "#ffb020", "fill-opacity": ".35" }));
      box.append(svg("circle", { cx: x(s.earthAz), cy: y(s.earthEl), r: 1.6, fill: "#5fd8ff", "fill-opacity": ".35" }));
    });

    // current instant: drop lines and markers
    const hs = M.horizonAt(cur.sunAz, site), he = M.horizonAt(cur.earthAz, site);
    box.append(svg("line", { x1: x(cur.sunAz), x2: x(cur.sunAz), y1: y(cur.sunEl), y2: y(hs), stroke: "#ffb020", "stroke-dasharray": "2 2" }));
    box.append(svg("line", { x1: x(cur.earthAz), x2: x(cur.earthAz), y1: y(cur.earthEl), y2: y(he), stroke: "#5fd8ff", "stroke-dasharray": "2 2" }));
    box.append(svg("circle", { cx: x(cur.sunAz), cy: y(cur.sunEl), r: 6, fill: "#ffb020", stroke: "#0b0e11", "stroke-width": 2 }));
    box.append(svg("circle", { cx: x(cur.earthAz), cy: y(cur.earthEl), r: 6, fill: "#5fd8ff", stroke: "#0b0e11", "stroke-width": 2 }));
    // labels flip to the left of the marker near the right edge, so they stay inside the chart
    const lab = (a, e, text, color) => {
      const nearRight = x(a) > W - R - 60;
      box.append(svg("text", { x: x(a) + (nearRight ? -9 : 9), y: y(e) - 8, fill: color, "text-anchor": nearRight ? "end" : "start" }, text));
    };
    lab(cur.sunAz, cur.sunEl, "SOL", "#ffb020");
    lab(cur.earthAz, cur.earthEl, "TERRA", "#5fd8ff");

    const slider = h("input", { type: "range", min: "0", max: String(Math.max(0, tr.length - 1)), value: String(S.t), "aria-label": "Instante do horizonte", oninput: e => { S.t = Number(e.target.value); renderTab(); } });
    const sunMargin = cur.sunEl - hs, earthMargin = cur.earthEl - he;
    return [
      h("section", { class: "panel span2" },
        h("h2", { text: "03 · Horizonte do sítio", },
          h("em", { text: site.name + " · rugosidade " + site.rough })),
        h("div", { class: "row" }, h("span", { class: "mono", text: fmt(startMs() + cur.i * S.stepMin * 60e3) }), tag("SINT")),
        h("div", { style: "margin:10px 0" }, slider),
        box,
        h("div", { class: "legend" },
          h("span", {}, h("i", { style: "background:#ffb020" }), "Sol"),
          h("span", {}, h("i", { style: "background:#5fd8ff" }), "Terra"),
          h("span", {}, h("i", { style: "background:#1c3240" }), "horizonte sintético"),
          h("span", {}, "pontos claros: trajetória no intervalo")),
        edu("Acima da área cinza, o Sol ou a Terra estão visíveis. Abaixo, o relevo esconde o astro. A linha tracejada mostra a altura do horizonte naquele azimute.")),
      h("section", { class: "panel" },
        h("h2", { text: "Neste instante" }),
        h("dl", { class: "readout" },
          h("dt", { text: "Sol · elevação" }), h("dd", { text: f1(cur.sunEl, 2) + "°" }),
          h("dt", { text: "Sol · horizonte neste azimute" }), h("dd", { text: f1(hs, 2) + "°" }),
          h("dt", { text: "Sol · margem" }), h("dd", { class: sunMargin > 0 ? "" : "fuelout", text: (sunMargin >= 0 ? "+" : "") + f1(sunMargin, 2) + "°" }),
          h("dt", { text: "Terra · elevação" }), h("dd", { text: f1(cur.earthEl, 2) + "°" }),
          h("dt", { text: "Terra · horizonte neste azimute" }), h("dd", { text: f1(he, 2) + "°" }),
          h("dt", { text: "Terra · margem" }), h("dd", { class: earthMargin > 0 ? "" : "fuelout", text: (earthMargin >= 0 ? "+" : "") + f1(earthMargin, 2) + "°" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Pendências do horizonte" }),
        h("ul", { class: "note" },
          ...[["3.2", "BLOQ", "leitura do DEM LOLA"], ["3.3", "PEND", "horizonte por raio"], ["3.4", "PEND", "distância máxima documentada"], ["3.5", "PEND", "pixels interpolados"], ["3.6", "PEND", "declive e crateras"]]
            .map(([id, st, t]) => h("li", {}, id + " ", tag(st), " " + t))),
        h("p", { class: "note", text: "Horizonte sintético: uma senoide com rugosidade do sítio. Não é relevo lunar." }))
    ];
  };

  VIEWS.janelas = () => {
    const { tr, sum } = scenario();
    const windows = [];
    let start = null;
    tr.forEach((s, i) => {
      if (s.earth_visible && start === null) start = i;
      if (!s.earth_visible && start !== null) { windows.push([start, i - 1]); start = null; }
    });
    if (start !== null) windows.push([start, tr.length - 1]);
    const at = i => fmt(startMs() + i * S.stepMin * 60e3);
    return [
      h("section", { class: "panel" },
        h("h2", { text: "04 · Janelas de luz e de Terra" }),
        h("dl", { class: "readout" },
          h("dt", { text: "horas com luz" }), h("dd", { text: f1(sum.sunlitH) + " h" }),
          h("dt", { text: "maior escuridão" }), h("dd", { text: f1(sum.darkH) + " h" }),
          h("dt", { text: "horas com Terra visível" }), h("dd", { text: f1(sum.earthH) + " h" }),
          h("dt", { text: "maior bloqueio da Terra" }), h("dd", { text: f1(sum.blockH) + " h" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Janelas de Terra visível (4.7)" }),
        windows.length === 0
          ? h("p", { class: "note", text: "Nenhuma janela de Terra visível no intervalo." })
          : h("div", { class: "scroll" }, h("table", { class: "table" },
              h("thead", {}, h("tr", {}, h("th", { text: "início" }), h("th", { text: "fim" }), h("th", { class: "n", text: "horas" }))),
              h("tbody", {}, windows.map(([a, b]) => h("tr", {}, h("td", { text: at(a) }), h("td", { text: at(b) }), h("td", { class: "n", text: f1((b - a + 1) * S.stepMin / 60) })))))),
        h("p", { class: "note", text: "Visibilidade geométrica. Não garante enlace de rádio. Orçamento de RF não modelado." })),
      h("section", { class: "panel span2" },
        h("h2", { text: "Transições (4.5) · instante por amostra" }),
        h("p", { class: "note", text: "O instante é o da primeira amostra que mudou. Bisseção (4.6) ainda pendente." }),
        transitionsTable(tr))
    ];
  };
  function transitionsTable(tr) {
    const rows = [];
    M.transitions(tr, "sun_visible", S.stepMin).forEach(x => rows.push(["Luz", x.to ? "escuro → luz" : "luz → escuro", x.index]));
    M.transitions(tr, "earth_visible", S.stepMin).forEach(x => rows.push(["Terra", x.to ? "bloqueada → visível" : "visível → bloqueada", x.index]));
    rows.sort((a, b) => a[2] - b[2]);
    if (!rows.length) return h("p", { class: "dim", text: "Sem transições no intervalo." });
    return h("div", { class: "scroll" }, h("table", { class: "table" },
      h("thead", {}, h("tr", {}, h("th", { text: "tipo" }), h("th", { text: "mudança" }), h("th", { text: "instante (UTC)" }))),
      h("tbody", {}, rows.slice(0, 200).map(r => h("tr", {}, h("td", { text: r[0] }), h("td", { text: r[1] }), h("td", { text: fmt(startMs() + r[2] * S.stepMin * 60e3) })))),
    ));
  }

  VIEWS.energia = () => {
    const { tr, sum } = scenario();
    const opt = apiOption(0);
    const sunlitWh = S.power.solar_generation_w * sum.sunlitH;
    const parts = [
      h("section", { class: "panel" },
        h("h2", { text: "05 · Luz disponível ≠ potência elétrica" }),
        h("dl", { class: "readout" },
          h("dt", { text: "horas com luz" }), h("dd", { text: f1(sum.sunlitH) + " h" }),
          h("dt", { text: "energia 'se o sol entregasse' (premissa)" }), h("dd", { text: f1(sunlitWh, 0) + " Wh" }),
          h("dt", { text: "carga consumida (premissa)" }), h("dd", { text: f1(S.power.load_w * sum.durationH, 0) + " Wh" })),
        h("p", { class: "note", text: "Painel: premissa de W com Sol. Sem área, eficiência, ângulo nem perdas." }),
        h("div", { style: "margin-top:8px" }, tag("ESQ"), " ", h("span", { class: "dim", text: "modelo de painel (5.3) sem parâmetros de hardware" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Bateria (cálculo da API)" }),
        opt ? batteryReadout(opt) : h("p", { class: "note", text: "Clique em CALCULAR na ENTRADA para ver a bateria." }),
        opt ? batteryChart(opt) : null,
        h("div", { style: "margin-top:8px" }, tag("SIM"), " ", h("span", { class: "dim", text: "bateria: coeficientes da API, não de hardware" })))
    ];
    return parts;
  };
  function batteryReadout(o) {
    return h("dl", { class: "readout" },
      h("dt", { text: "estado" }), h("dd", { text: o.simulation_status }),
      h("dt", { text: "carga mínima (Wh)" }), h("dd", { text: f1(o.metrics.minimum_charge_wh) }),
      h("dt", { text: "carga final (Wh)" }), h("dd", { text: f1(o.metrics.final_charge_wh) }),
      h("dt", { text: "energia não atendida (Wh)" }), h("dd", { text: f1(o.metrics.total_unserved_energy_wh) }));
  }
  function batteryChart(o) {
    const W = 600, H = 150, pad = 24;
    const tl = o.timeline, max = Math.max(1, ...tl.map(s => s.charge_wh));
    const x = i => pad + (tl.length <= 1 ? 0 : (i / (tl.length - 1)) * (W - pad * 2));
    const y = v => H - pad - (v / max) * (H - pad * 2);
    const box = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Carga da bateria ao longo do cenário" });
    box.append(svg("line", { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: "#1c3240" }));
    box.append(svg("text", { x: 2, y: pad + 4 }, max.toFixed(0) + " Wh"));
    const color = { NOMINAL: "#6dff9c", SAFE_MODE: "#ffb020", POWER_LOSS: "#ff4d4d" };
    for (let i = 1; i < tl.length; i++) box.append(svg("line", { x1: x(i - 1), y1: y(tl[i - 1].charge_wh), x2: x(i), y2: y(tl[i].charge_wh), stroke: color[tl[i].mode] || "#5fd8ff", "stroke-width": 2 }));
    return h("div", { style: "margin-top:8px" }, box,
      h("div", { class: "legend" }, h("span", {}, h("i", { style: "background:#6dff9c" }), "NOMINAL"), h("span", {}, h("i", { style: "background:#ffb020" }), "SAFE_MODE"), h("span", {}, h("i", { style: "background:#ff4d4d" }), "POWER_LOSS")));
  }

  VIEWS.vida = () => {
    const { life, sum } = scenario();
    const fuelPct = Math.max(0, Math.min(100, life.fuelRemainingKg / 450 * 100));
    return [
      h("section", { class: "panel" },
        h("h2", { text: "06 · Combustível (ilustrativo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "restante (kg)" }), h("dd", { text: life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg) : "ESGOTADO", class: life.fuelRemainingKg > 0 ? "" : "fuelout" }),
          h("dt", { text: "reserva mínima (kg)" }), h("dd", { text: "150.0" }),
          h("dt", { text: "margem (kg)" }), h("dd", { text: f1(life.fuelMarginKg), class: life.fuelMarginKg < 0 ? "fuelout" : "" })),
        h("div", { class: "bar " + (life.fuelMarginKg < 0 ? "bad" : ""), style: "margin-top:8px" }, h("span", { style: "width:" + fuelPct + "%" })),
        h("div", { style: "margin-top:8px" }, tag("SINT"), " ", tag("ESQ"), " ", h("span", { class: "dim", text: "consumo 1,2 kg/h · escopo não decidido (#7)" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Alimentação (ilustrativo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "tripulação" }), h("dd", { text: life.people + " pessoas" }),
          h("dt", { text: "estoque restante (kg)" }), h("dd", { text: f1(life.foodLeftKg) }),
          h("dt", { text: "racionamento" }), h("dd", { text: life.foodLeftKg > 100 ? "NORMAL" : "REDUZIDO" })),
        h("div", { style: "margin-top:8px" }, tag("SINT"), " ", h("span", { class: "dim", text: "0,62 kg/pessoa/dia · sem fonte" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Pressurização e O2 (ilustrativo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "pressão da cabine (kPa)" }), h("dd", { text: f1(life.cabinKpa) + " · faixa 95–105" }),
          h("dt", { text: "pressão parcial O2 (kPa)" }), h("dd", { text: f1(life.o2PartialKpa) + " · mín. 19" }),
          h("dt", { text: "estoque O2 (kg)" }), h("dd", { text: f1(life.o2StockKg) })),
        h("div", { style: "margin-top:8px" }, tag("SINT"), " ", h("span", { class: "dim", text: "valores fixos · não usar para segurança" }))),
      h("section", { class: "panel span2" },
        h("div", { class: "caution", text: "Esta área não tem base de dados nem validação. Os valores são constantes para exemplo e não devem ser lidos como condição de vida." }),
        edu("Suporte de vida não está na lista de requisitos do desafio. A inclusão depende da decisão do time (#7)."))
    ];
  };

  VIEWS.replan = () => {
    const sites = Object.keys(M.SITES);
    const opt = d => apiOption(d);
    const rows = REPLAN_DELAYS.map(d => {
      const tr = track(d);
      const sum = M.summary(tr, S.stepMin);
      const life = M.lifeSupport(S.durationH);
      const v = M.violations(sum, life);
      const o = opt(d);
      if (o) {
        if (o.metrics.minimum_charge_wh < S.power.reserve_wh) v.push({ code: "BATT", text: "bateria abaixo da reserva" });
        if (o.risks.some(r => r.category === "ENERGY_LOSS")) v.push({ code: "ENERGY_LOSS", text: "perda de energia" });
      }
      return { d, sum, v, o, verdict: M.verdict(v, life.fuelMarginKg) };
    });

    const dateRows = DATE_OFFSETS_DAYS.map(off => {
      const saved = S.startLocal;
      const ms = startMs() + off * 86400e3;
      const tr = M.track({ siteId: S.site, startMs: ms, stepMin: S.stepMin, count: count(), delayH: 0 });
      const sum = M.summary(tr, S.stepMin);
      return { off, ms, sum, verdict: M.verdict(M.violations(sum, M.lifeSupport(S.durationH)), undefined) };
    });

    const siteRows = sites.map(id => {
      const tr = M.track({ siteId: id, startMs: startMs(), stepMin: S.stepMin, count: count(), delayH: 0 });
      const sum = M.summary(tr, S.stepMin);
      return { id, sum, verdict: M.verdict(M.violations(sum, undefined), undefined) };
    });

    return [
      h("section", { class: "panel span2" },
        h("h2", { text: "07 · Replanejamento por atraso (7.1–7.3)" }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "atraso" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "escuridão (h)" }), h("th", { class: "n", text: "bloqueio (h)" }), h("th", { class: "n", text: "carga mín. (Wh)" }), h("th", { text: "restrições" }))),
          h("tbody", {}, rows.map(r => h("tr", {},
            h("td", { text: r.d ? "+" + r.d + " h" : "sem atraso" }),
            h("td", {}, verdictTag(r.verdict)),
            h("td", { class: "n", text: f1(r.sum.darkH) }),
            h("td", { class: "n", text: f1(r.sum.blockH) }),
            h("td", { class: "n", text: r.o ? f1(r.o.metrics.minimum_charge_wh) : "—" }),
            h("td", { text: r.v.length ? r.v.map(x => x.text).join("; ") : "nenhuma" })))))),
        h("p", { class: "note", text: S.api ? "Bateria e riscos vêm da API para o sítio atual. Escuridão e bloqueio são do modelo." : "Bateria só aparece depois de CALCULAR. Escuridão e bloqueio são do modelo." })),
      h("section", { class: "panel" },
        h("h2", { text: "Busca de data no mesmo sítio (7.4)" }),
        h("p", { class: "note", text: "Grade de 24 h, até 7 dias, sem otimização. Não é busca completa." }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "início (UTC)" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "escuridão (h)" }))),
          h("tbody", {}, dateRows.map(r => h("tr", {}, h("td", { text: fmt(r.ms) }), h("td", {}, verdictTag(r.verdict)), h("td", { class: "n", text: f1(r.sum.darkH) })))))),
        h("div", { style: "margin-top:8px" }, tag("PARC"), " ", h("span", { class: "dim", text: "grade fixa; sem explicação quando nenhuma data serve (7.6)" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Comparação de sítios (7.5 · 8.7)" }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "sítio" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "luz (h)" }), h("th", { class: "n", text: "escuridão (h)" }), h("th", { class: "n", text: "Terra (h)" }))),
          h("tbody", {}, siteRows.map(r => h("tr", {}, h("td", { text: (r.id === S.site ? "▶ " : "") + M.SITES[r.id].name }), h("td", {}, verdictTag(r.verdict)), h("td", { class: "n", text: f1(r.sum.sunlitH) }), h("td", { class: "n", text: f1(r.sum.darkH) }), h("td", { class: "n", text: f1(r.sum.earthH) })))))),
        h("p", { class: "note", text: "Sem fonte por sítio: os três são sintéticos. Bateria só para o sítio atual." }),
        h("div", { style: "margin-top:8px" }, tag("PARC"), " ", tag("BLOQ"), " ", h("span", { class: "dim", text: "fonte real por sítio (7.5) bloqueada (#5, #52)" }))),
      h("section", { class: "panel span2" },
        h("h2", { text: "Explicação (7.6)" }),
        h("p", { class: "note", text: rows.every(r => r.verdict === "NAO_VIAVEL") ? "Nenhum atraso testado é viável neste cenário. Motivos: escuridão, bloqueio ou bateria, conforme a tabela acima." : "Há pelo menos um cenário viável neste modelo sintético." }),
        edu("Atraso não é só mudar a data: muda o que o Sol e a Terra fazem durante a missão."))
    ];
  };
  function verdictTag(v) {
    const map = { VIAVEL: ["SIM", "VIÁVEL"], MARGEM_REDUZIDA: ["PARC", "MARGEM REDUZIDA"], NAO_VIAVEL: ["BLOQ", "NÃO VIÁVEL"] };
    const [st, label] = map[v] || ["PEND", v];
    return h("span", { class: "tag " + st, text: label });
  }

  VIEWS.visual = () => {
    const W = 320, cx = 160, cy = 160, R0 = 150;
    const box = svg("svg", { viewBox: "0 0 320 320", width: "100%", style: "max-width:440px;display:block;margin:0 auto", role: "img", "aria-label": "Mapa polar ampliado com os sítios sintéticos" });
    [60, 120, R0].forEach(r => box.append(svg("circle", { cx, cy, r, fill: "none", stroke: "#1c3240", "stroke-dasharray": r === R0 ? "" : "3 3" })));
    box.append(svg("circle", { cx, cy, r: 3, fill: "#6f8b7c" }));
    box.append(svg("text", { x: cx + 6, y: cy - 6 }, "polo sul"));
    Object.entries(M.SITES).forEach(([id, s]) => {
      const r = (s.lat + 90) * 60, rad = s.lon * Math.PI / 180;
      const x = cx + r * Math.cos(rad), y = cy + r * Math.sin(rad);
      const on = id === S.site;
      box.append(svg("circle", { cx: x, cy: y, r: on ? 7 : 5, fill: on ? "#5fd8ff" : "#ffb020" }));
      box.append(svg("text", { x: x + 9, y: y + 4, fill: on ? "#5fd8ff" : undefined }, s.name));
    });
    return [
      h("section", { class: "panel" },
        h("h2", { text: "08 · Mapa polar do sítio" }),
        box,
        h("p", { class: "note", text: "Projeção ampliada: raio = colatitude × 60 px/°. Sem escala real. Posições dos sítios são sintéticas." }),
        h("div", { style: "margin-top:8px" }, tag("SIM"), " ", tag("BLOQ"), " ", h("span", { class: "dim", text: "mapa 2D com LOLA (8.5) e 3D (8.6) bloqueados" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Pendências visuais" }),
        h("ul", { class: "note" },
          ...[["8.5", "BLOQ", "mapa 2D com dado LOLA"], ["8.6", "BLOQ", "3D do terreno"], ["8.8", "PARC", "animação sem destaque de transição"]]
            .map(([id, st, t]) => h("li", {}, id + " ", tag(st), " " + t)))),
        edu("O mapa mostra onde ficam os sítios em relação ao polo. Não mostra o relevo.")
    ];
  };

  VIEWS.sens = () => {
    const base = M.summary(track(0), S.stepMin);
    const rows = M.SENS_VARIANTS.map(v => {
      const stepMin = v.opts.stepMul ? S.stepMin * v.opts.stepMul : S.stepMin;
      const cnt = Math.floor((S.durationH * 60) / stepMin);
      const tr = M.track({ siteId: S.site, startMs: startMs(), stepMin, count: cnt, delayH: 0, dh: v.opts.dh, roughMult: v.opts.roughMult });
      return { v, sum: M.summary(tr, stepMin) };
    });
    const d = (x, b) => { const diff = x - b; return f1(x) + " h" + (Math.abs(diff) < 1e-9 ? "" : " (" + (diff >= 0 ? "+" : "") + f1(diff) + ")"); };
    return [
      h("section", { class: "panel span2" },
        h("h2", { text: "09 · Sensibilidade (sintética)" }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "variação" }), h("th", { class: "n", text: "luz" }), h("th", { class: "n", text: "escuridão" }), h("th", { class: "n", text: "Terra visível" }))),
          h("tbody", {}, rows.map(r => h("tr", {}, h("td", { text: r.v.label }), h("td", { class: "n", text: d(r.sum.sunlitH, base.sunlitH) }), h("td", { class: "n", text: d(r.sum.darkH, base.darkH) }), h("td", { class: "n", text: d(r.sum.earthH, base.earthH) })))))),
        h("p", { class: "note", text: "Variações dentro do modelo sintético. Não é incerteza calibrada nem probabilidade." }),
        h("div", { style: "margin-top:8px" }, tag("SIM"), " ", tag("PEND"), " ", h("span", { class: "dim", text: "método com DEM real (9.4) e Pareto (9.6) pendentes" }))),
      h("section", { class: "panel span2" },
        h("h2", { text: "Compromissos ciência × engenharia (9.5)" }),
        h("p", { class: "note", text: "Luz, comunicação e energia pedem coisas diferentes. Não há ranking único entre elas." }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "critério" }), h("th", { text: "situação" }), h("th", { text: "leitura" }))),
          h("tbody", {},
            h("tr", {}, h("td", { text: "mais luz" }), h("td", { text: base.sunlitH >= 40 ? "favorece energia" : "limita energia" }), h("td", { text: "Sol mais alto aumenta o tempo com luz." })),
            h("tr", {}, h("td", { text: "mais Terra visível" }), h("td", { text: base.earthH >= 36 ? "favorece comunicação" : "limita comunicação" }), h("td", { text: "Não é enlace de rádio." })),
            h("tr", {}, h("td", { text: "menos escuridão" }), h("td", { text: base.darkH <= M.LIMITS.darkH ? "dentro do limite" : "acima do limite" }), h("td", { text: "Escuridão longa exige bateria." }))))),
        edu("Ciência e engenharia pedem coisas diferentes. A escolha entre elas é do time, não do software."))
    ];
  };

  VIEWS.historico = () => {
    const { sum } = scenario();
    const opt = apiOption(0);
    const record = {
      site: M.SITES[S.site].name, start_utc: iso(startMs()), duration_h: S.durationH, step_min: S.stepMin,
      sunlit_h: sum.sunlitH, dark_h: sum.darkH, earth_visible_h: sum.earthH, earth_blocked_h: sum.blockH,
      battery_min_wh: opt ? opt.metrics.minimum_charge_wh : null, api_status: opt ? opt.simulation_status : "NAO_CALCULADO",
      synthetic: true
    };
    const exportObj = { version: "0.1.0", status: "unverified", synthetic: true, scenarios: S.saved, provenance: { terrain: "SINTÉTICO", ephemeris: "SINTÉTICO", frame: "MOON_ME (rótulo)", generated_by: "cockpit-js" } };
    return [
      h("section", { class: "panel" },
        h("h2", { text: "10 · Registro de cenários" }),
        h("button", { type: "button", class: "go", onclick: () => { S.saved.push(record); renderTab(); } }, "SALVAR CENÁRIO ATUAL"),
        h("p", { class: "note", text: "Só nesta sessão. Se a página fechar, o registro some." }),
        S.saved.length === 0 ? h("p", { class: "dim", text: "Nenhum cenário salvo." }) :
          h("div", { class: "scroll" }, h("table", { class: "table" },
            h("thead", {}, h("tr", {}, h("th", { text: "sítio" }), h("th", { text: "início" }), h("th", { class: "n", text: "dur. h" }), h("th", { class: "n", text: "carga mín." }), h("th", { text: "estado" }))),
            h("tbody", {}, S.saved.map(r => h("tr", {}, h("td", { text: r.site }), h("td", { text: r.start_utc }), h("td", { class: "n", text: r.duration_h }), h("td", { class: "n", text: r.battery_min_wh === null ? "—" : f1(r.battery_min_wh) }), h("td", { text: r.api_status })))))),
      ),
      h("section", { class: "panel" },
        h("h2", { text: "Exportar (copiar JSON)" }),
        h("textarea", { id: "export", readonly: true, "aria-label": "JSON exportado", text: JSON.stringify(exportObj, null, 2) }),
        h("div", { class: "row", style: "margin-top:8px" },
          h("button", { type: "button", onclick: copyExport }, "COPIAR"),
          h("span", { class: "dim", id: "copy-msg" })),
        h("p", { class: "note", text: "Cópia manual: download de arquivo não está disponível neste ambiente." }),
        h("div", { style: "margin-top:8px" }, tag("SIM"), " ", tag("PEND"), " ", h("span", { class: "dim", text: "recibo com versão e fontes (10.3) pendente" })))
    ];
  };
  function copyExport() {
    const ta = document.getElementById("export");
    const msg = document.getElementById("copy-msg");
    if (!ta) return;
    const done = () => { if (msg) msg.textContent = "copiado"; };
    const fail = () => { ta.select(); if (msg) msg.textContent = "selecione e copie manualmente"; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fail);
    else fail();
  }

  VIEWS.lanc = () => {
    const items = F.FEATURES.filter(x => x.id.startsWith("11."));
    return [
      h("section", { class: "panel span2" },
        h("h2", { text: "11 · Lançamentos e falhas (contexto)" }),
        h("div", { class: "caution", text: "Lançamentos não entram no cálculo de viabilidade. Esta seção está pendente de decisão de escopo (#7) e de integração pelo backend." }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "id" }), h("th", { text: "item" }), h("th", { text: "estado" }), h("th", { text: "nota" }))),
          h("tbody", {}, items.map(x => h("tr", {}, h("td", { text: x.id }), h("td", { text: x.title }), h("td", {}, tag(x.status)), h("td", { text: x.note })))))),
        h("p", { class: "note", text: "Dados de referência verificados em VARREDURA_APIS_LANCAMENTOS.md: Launch Library 2 com 15 requisições por hora sem chave; relatório de falha do New Glenn NG-3 citado por imprensa." }))
    ];
  };

  VIEWS.status = () => {
    const counts = {};
    F.FEATURES.forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);
    const total = F.FEATURES.length;
    const bars = ["SIM", "PARC", "ESQ", "PEND", "BLOQ"].map(s => h("div", { style: "margin:4px 0" },
      h("div", { class: "row" }, tag(s), h("span", { class: "mono", text: (counts[s] || 0) + " de " + total })),
      h("div", { class: "bar " + (s === "BLOQ" ? "bad" : s === "PEND" || s === "ESQ" ? "warn" : ""), style: "margin-top:4px" }, h("span", { style: "width:" + ((counts[s] || 0) / total * 100) + "%" }))));
    const sources = [
      ["PGDA · DEMs LOLA do polo sul", "https://pgda.gsfc.nasa.gov/products/78"],
      ["NAIF · kernels de quadro lunar", "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/"],
      ["JPL Horizons · API", "https://ssd-api.jpl.nasa.gov/doc/horizons.html"],
      ["Launch Library 2 · documentação", "https://thespacedevs.com/llapi"]
    ];
    return [
      h("section", { class: "panel" },
        h("h2", { text: "12 · Estado das funcionalidades" }),
        bars,
        h("p", { class: "note", text: "Estados: OK·SINTÉTICO = implementado com dado sintético. PARCIAL, PENDENTE, BLOQUEADO (depende de dado, decisão ou CI) e ESQUEMA (só no schema)." })),
      h("section", { class: "panel" },
        h("h2", { text: "Fontes oficiais (10.4)" }),
        h("ul", { class: "note" }, sources.map(([t, u]) => h("li", {}, h("a", { href: u, target: "_blank", rel: "noopener", text: t })))),
        h("div", { class: "caution", style: "margin-top:8px", text: "Nenhuma fonte está baixada nem usada no cálculo. Todas estão como candidatas." }),
        h("p", { class: "note", text: "Limitações (10.5): não é software de voo; não validado; sem refração; sem enlace de rádio; combustível e vida são ilustrativos." })),
      h("section", { class: "panel span2" },
        h("h2", { text: "Checklist completo (75 itens)" }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "id" }), h("th", { text: "funcionalidade" }), h("th", { text: "estado" }), h("th", { text: "requisito" }), h("th", { text: "issue" }), h("th", { text: "nota" }))),
          h("tbody", {}, F.FEATURES.map(x => h("tr", {}, h("td", { text: x.id }), h("td", { text: x.title }), h("td", {}, tag(x.status)), h("td", { text: x.req }), h("td", { text: x.issue }), h("td", { text: x.note })))))),
        h("p", { class: "note", text: "Idioma inglês (12.6) e declaração de IA (12.8) ainda pendentes." }))
    ];
  };

  // ---------- API panels (linked to the Go API in main) ----------
  // Each panel calls one endpoint on demand and keeps the last response in S.apiResults.
  // Nothing here replaces the synthetic panels: they are shown above them, labelled as API data.
  S.apiResults = {};
  const CATALOG_IDS = []; // filled from /api/sites
  S.catalog = null;

  function kvRow(label, value) { return h("tr", {}, h("td", { text: label }), h("td", { class: "n", text: value })); }
  function apiError(res) {
    return h("div", { class: "caution", role: "alert" }, "API indisponível: " + (res.error || ("HTTP " + res.status)) +
      ". Suba a API Go (e o Rust engine, se o endpoint pedir) e o dev-server.py.");
  }
  function apiPanelFrame(title, note, button, body) {
    return h("section", { class: "panel span2" },
      h("h2", { text: title }),
      h("div", { class: "row" }, h("span", { class: "dim", text: note }), button),
      body);
  }
  function callButton(label, onClick) {
    const b = h("button", { type: "button", class: "go", text: label });
    b.addEventListener("click", async () => { b.disabled = true; b.textContent = "CONSULTANDO…"; await onClick(); b.disabled = false; b.textContent = label; renderTab(); });
    return b;
  }

  function delayPanel() {
    const r = S.apiResults.delay;
    const button = callButton("CONSULTAR REPLANEJAMENTO", async () => {
      const body = {
        site_id: S.site, start_utc: iso(startMs()), duration_hours: S.durationH,
        delays_hours: [24, 48, 72],
        constraints: { max_continuous_dark_hours: M.LIMITS.darkH, min_earth_fraction: 0.5 },
        include_nearby: true, max_nearby: 2
      };
      S.apiResults.delay = await OnboardApi.scenarioDelay(body);
    });
    let body = h("p", { class: "dim", text: "Ainda não consultado. Usa a API /api/scenarios/delay com sítios que têm série de dados." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) {
      const d = r.data;
      body = h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "opção" }), h("th", { text: "sítio" }), h("th", { class: "n", text: "atraso h" }), h("th", { text: "restrições" }))),
        h("tbody", {}, (d.options || []).map(o => h("tr", {},
          h("td", { text: o.kind || "—" }),
          h("td", { text: o.site_id || "—" }),
          h("td", { class: "n", text: o.delay_hours !== undefined && o.delay_hours !== null ? String(o.delay_hours) : "—" }),
          h("td", { text: (o.checks || []).map(c => c.criterion + ": " + (c.passed ? "ok" : "violada")).join(" · ") || (o.data_status || "—") }))))),
        h("p", { class: "note", text: "Estado: " + (d.outcome ? d.outcome.status : "—") + (d.outcome && d.outcome.message ? " · " + d.outcome.message : "") + " · request " + (d.scenario_sha256 || "—").slice(0, 12) + "…" }));
    }
    return apiPanelFrame("API · Replanejamento por atraso (/api/scenarios/delay)", "Dados de série do sítio atual, sem dado de série o resultado é NO_SERIES_DATA.", button, body);
  }

  function comparePanel() {
    const r = S.apiResults.compare;
    const button = callButton("COMPARAR SÍTIOS (API)", async () => {
      const ids = (S.sitesApi || []).map(s => s.id);
      const pick = ids.length ? ids : ["synthetic-demo-a", "synthetic-demo-b", "malapert-massif"];
      S.apiResults.compare = await OnboardApi.compare({ site_ids: pick, start_utc: iso(startMs()), duration_hours: S.durationH, include_series: false });
    });
    let body = h("p", { class: "dim", text: "Ainda não consultado. Compara sítios do catálogo, com dados de série quando existirem." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) {
      body = h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "sítio" }), h("th", { text: "dados" }), h("th", { class: "n", text: "luz" }), h("th", { class: "n", text: "escuridão h" }), h("th", { text: "ciência" }))),
        h("tbody", {}, (r.data.results || []).map(s => {
          const m = s.evaluation && s.evaluation.metrics;
          const id = typeof s.site === "object" && s.site ? (s.site.id || s.site.name) : s.site;
          return h("tr", {},
            h("td", { text: id || "—" }),
            h("td", {}, tag(s.data_status === "AVAILABLE" ? "SIM" : "PEND"), " ", h("span", { class: "dim", text: s.data_status || "—" })),
            h("td", { class: "n", text: m ? (m.sun_visible_fraction * 100).toFixed(0) + "%" : "—" }),
            h("td", { class: "n", text: m ? f1(m.longest_continuous_dark_hours) : "—" }),
            h("td", { text: s.science_status || "—" }));
        }))));
    }
    return apiPanelFrame("API · Comparação de sítios (/api/compare)", "Sítios sem série aparecem como NO_SERIES_DATA, sem números.", button, body);
  }

  function siteEvalPanel() {
    const r = S.apiResults.siteEval;
    const button = callButton("AVALIAR COM SÉRIE (API)", async () => {
      const body = {
        mission_id: "cockpit-" + S.site, start_utc: iso(startMs()), duration_hours: S.durationH,
        candidates: [{ id: "planejado", site_id: S.site, delay_hours: 0 }, { id: "atraso-48h", site_id: S.site, delay_hours: 48 }],
        power: {
          battery_capacity_wh: S.power.battery_capacity_wh, initial_charge_wh: S.power.initial_charge_wh,
          reserve_wh: S.power.reserve_wh, solar_generation_w: S.power.solar_generation_w, load_w: S.power.load_w
        },
        max_comm_blackout_hours: S.power.max_comm_blackout_hours
      };
      S.apiResults.siteEval = await OnboardApi.siteEvaluate(body);
    });
    let body = h("p", { class: "dim", text: "Ainda não consultado. Só sítios com série ingerida (synthetic-demo-a e -b) são aceitos." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) {
      const c0 = (r.data.candidates || [])[0] || {};
      body = h("dl", { class: "readout" },
        h("dt", { text: "decisão combinada" }), h("dd", { text: r.data.combined_decision || "—" }),
        h("dt", { text: "simulador de energia (estado)" }), h("dd", { text: r.data.onboard ? r.data.onboard.simulation_status : "—" }),
        h("dt", { text: "ciência do primeiro candidato" }), h("dd", { text: c0.science_status || "—" }),
        h("dt", { text: "riscos quebrados (primeiro candidato)" }), h("dd", { text: (c0.breached_risks || []).length ? String(c0.breached_risks.length) : "nenhum" }));
    }
    return apiPanelFrame("API · Energia com série de visibilidade (/api/onboard/site-evaluate)", "Sol e Terra vêm da série do servidor, não do navegador.", button, body);
  }

  function reportPanel() {
    const r = S.apiResults.report;
    const button = callButton("GERAR RELATÓRIO", async () => {
      const req = buildApiRequest(REPLAN_DELAYS);
      if (!req.ok) { S.apiResults.report = { ok: false, error: req.errors.join("; ") }; return; }
      const res = await OnboardApi.report(req.body);
      S.apiResults.report = res;
      if (res.ok) {
        const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
        window.open(url, "_blank", "noopener");
      }
    });
    let body = h("p", { class: "dim", text: "Relatório HTML imprimível a partir do mesmo pedido de ENTRADA (/api/onboard/report)." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) body = h("p", { class: "note", text: "Relatório gerado e aberto em nova aba (" + Math.round(r.data.length / 1024) + " KB)." });
    return apiPanelFrame("API · Relatório (/api/onboard/report)", "Gera HTML a partir das amostras sintéticas. Não é documento de submissão.", button, body);
  }

  const API_EXTRA = { replan: delayPanel, visual: comparePanel, energia: siteEvalPanel, historico: reportPanel };
  for (const k of Object.keys(API_EXTRA)) {
    const base = VIEWS[k];
    VIEWS[k] = () => [API_EXTRA[k](), ...base()];
  }

  async function loadHealth() {
    const r = await OnboardApi.health();
    if (r.status === 503) { setLamp("warn", "API OK · ENGINE INDISPONÍVEL"); return; }
    if (!r.ok) { setLamp("bad", "API OFF"); return; }
    const eng = r.data && r.data.engine ? String(r.data.engine) : "desconhecido";
    setLamp(eng === "available" ? "ok" : "warn", "API OK · ENGINE " + eng.toUpperCase());
  }
  async function loadSites() {
    const r = await OnboardApi.sites();
    if (r.ok) S.sitesApi = (r.data.sites || []).map(s => ({ id: s.id, name: s.name, series: !!s.series }));
  }

  // ---------- rendering ----------
  function renderTab() {
    const box = $("views");
    const nodes = VIEWS[S.tab]();
    box.replaceChildren(...nodes.filter(Boolean));
    document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === S.tab ? "true" : "false"));
  }
  function selectTab(name) {
    S.tab = name;
    if (name !== "geometria" && S.playing) { clearInterval(S.playing); S.playing = null; }
    renderTab();
  }

  const TAB_NAMES = ["entrada", "geometria", "horizonte", "janelas", "energia", "vida", "replan", "visual", "sens", "historico", "lanc", "status"];
  function tabFromHash() {
    const name = (location.hash || "").replace("#", "");
    return TAB_NAMES.includes(name) ? name : null;
  }
  function init() {
    document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => {
      selectTab(b.dataset.tab);
      history.replaceState(null, "", "#" + b.dataset.tab);
    }));
    window.addEventListener("hashchange", () => { const t = tabFromHash(); if (t) selectTab(t); });
    const initial = tabFromHash();
    if (initial) S.tab = initial;
    tickClock(); setInterval(tickClock, 1000);
    loadHealth();
    loadSites();
    renderAlarm();
    renderTab();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
