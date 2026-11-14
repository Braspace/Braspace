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
    tab: "visao",
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
  const tag = (s) => h("span", { class: "tag " + s, text: s === "SINT" ? "PROTÓTIPO" : (F.LABEL[s] || s) });
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
    const btn = $("calc") || $("fab");
    const req = buildApiRequest(REPLAN_DELAYS);
    if (!req.ok) { S.apiError = req.errors; S.api = null; renderTab(); return; }
    const fab = $("fab");
    if (fab) fab.setAttribute("aria-busy", "true");
    if ($("calc")) { $("calc").disabled = true; }
    try {
      const res = await fetch(API_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      const text = await res.text();
      if (!res.ok) { S.apiError = ["API respondeu " + res.status + ": " + text.slice(0, 240)]; S.api = null; setLamp("bad", "API ERRO"); }
      else { S.api = JSON.parse(text); S.apiError = null; setLamp("ok", "API OK"); }
    } catch (err) {
      S.api = null; S.apiError = ["Sem conexão com a API (" + err.message + "). Suba dev-server.py e a API Go."];
      setLamp("bad", "API OFF");
    } finally {
      if (fab) fab.setAttribute("aria-busy", "false");
      if ($("calc")) { $("calc").disabled = false; }
      renderAlarm(); renderTab();
    }
  }
  function setLamp(kind, text) {
    const el = $("lamp-api");
    const map = { ok: "chip ok", warn: "chip warn", bad: "chip bad" };
    el.className = map[kind] || "chip info";
    el.textContent = text;
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
      box.hidden = false;
    } else {
      box.className = "alarm on";
      sum.replaceChildren(h("span", { class: "count", text: items.length + " ALARME" + (items.length > 1 ? "S" : "") }), h("span", { class: "dim", text: "clique para ver" }));
      box.open = false;
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

  // Entry tab: four numbered cards (lugar, janela, energia, público), a live summary on top and
  // one primary action. Problems are listed next to the top of the page and block CALCULAR.
  const DEFAULT_POWER = { battery_capacity_wh: 200, initial_charge_wh: 150, reserve_wh: 50, solar_generation_w: 110, load_w: 80, max_comm_blackout_hours: 1 };
  const POWER_FIELDS = [
    ["battery_capacity_wh", "Capacidade da bateria", "Wh", "Energia máxima que a bateria guarda."],
    ["initial_charge_wh", "Carga inicial", "Wh", "Energia da bateria no começo do cenário."],
    ["reserve_wh", "Reserva mínima", "Wh", "Abaixo deste valor a bateria entra em alerta."],
    ["solar_generation_w", "Painel com Sol", "W", "Premissa: potência do painel enquanto há luz."],
    ["load_w", "Carga da nave", "W", "Potência que a nave consome o tempo todo."],
    ["max_comm_blackout_hours", "Bloqueio máximo da Terra", "h", "Tempo sem contato com a Terra que ainda é aceitável."]
  ];

  // Problems with the current entry, in plain words. Empty list = ready to calculate.
  function entryProblems() {
    const out = [];
    const count = Math.floor((S.durationH * 60) / S.stepMin);
    if (!(S.durationH >= 1 && S.durationH <= 720)) out.push("A duração deve ficar entre 1 e 720 h.");
    if (!(S.stepMin >= 1 && S.stepMin <= 360)) out.push("O passo deve ficar entre 1 e 360 min.");
    if (S.durationH >= 1 && S.stepMin >= 1 && count > 480) out.push("Muitas amostras (" + count + "). Aumente o passo ou reduza a duração: o máximo é 480.");
    POWER_FIELDS.forEach(([k, label]) => { const v = S.power[k]; if (!(Number.isFinite(v) && v >= 0)) out.push(label + " precisa ser um número igual ou maior que zero."); });
    if (Number.isFinite(S.power.reserve_wh) && Number.isFinite(S.power.battery_capacity_wh) && S.power.reserve_wh > S.power.battery_capacity_wh) out.push("A reserva não pode ser maior que a capacidade da bateria.");
    if (Number.isFinite(S.power.initial_charge_wh) && Number.isFinite(S.power.battery_capacity_wh) && S.power.initial_charge_wh > S.power.battery_capacity_wh) out.push("A carga inicial não pode ser maior que a capacidade.");
    return out;
  }

  function entryCard(num, title, hint, children) {
    return h("section", { class: "panel" },
      h("h2", { text: num + " · " + title }),
      h("p", { class: "note", text: hint }),
      h("div", { style: "margin-top:12px" }, children));
  }

  VIEWS.entrada = () => {
    const opts = siteOptions();
    const cur = opts.find(o => o.id === S.site);
    const sky = skyData();
    const skyErr = S.sky[S.site] && S.sky[S.site].status === "erro";
    const dataStatus = sky ? { k: "ok", t: "série da API" }
      : (S.skyLoading[S.site] ? { k: "info", t: "carregando série…" }
      : (skyErr ? { k: "bad", t: "API indisponível" } : { k: "warn", t: "modelo local" }));
    const problems = entryProblems();
    const count = Math.floor((S.durationH * 60) / S.stepMin);
    const placeName = cur ? cur.label.replace(" (sem série)", "").split(" · ").slice(1).join(" · ") : S.site;
    const change = () => { S.api = null; S.t = 0; renderAlarm(); renderTab(); };

    const summary = h("section", { class: "panel span2" },
      h("div", { class: "grid four" },
        h("div", {}, h("div", { class: "label", text: "Lugar" }), h("strong", { text: S.site + " · " + placeName })),
        h("div", {}, h("div", { class: "label", text: "Início (UTC)" }), h("strong", { class: "num", text: fmt(startMs()) })),
        h("div", {}, h("div", { class: "label", text: "Duração · passo" }), h("strong", { class: "num", text: S.durationH + " h · " + S.stepMin + " min · " + count + " amostras" })),
        h("div", {}, h("div", { class: "label", text: "Dados" }), h("span", { class: "chip " + dataStatus.k, text: dataStatus.t }))),
      problems.length
        ? h("div", { class: "caution", role: "alert", style: "margin-top:12px" }, problems.map(p => h("div", { text: "• " + p })))
        : h("p", { class: "note", style: "margin-top:12px", text: "Entrada válida. Pronto para calcular." }));

    const placeCard = entryCard("1", "Lugar", "De onde Sol e Terra são vistos. Só aparecem como disponíveis os lugares com série no servidor.",
      h("label", {}, "Lugar sintético",
        h("select", { id: "site", onchange: e => { if (!e.target.selectedOptions[0].disabled) { S.site = e.target.value; change(); } } },
          opts.map(o => h("option", { value: o.id, selected: o.id === S.site, disabled: !o.ok }, o.label)))));

    const coverage = sky && sky.start_utc && sky.end_utc
      ? h("p", { class: "note", text: "Cobertura da série deste lugar: " + fmt(Date.parse(sky.start_utc)) + " até " + fmt(Date.parse(sky.end_utc)) + "." })
      : null;
    const windowCard = entryCard("2", "Janela", "Quando a missão começa e quanto dura. O passo define a resolução.",
      h("div", {},
        h("div", { class: "fields" },
          h("label", {}, "Início (UTC)",
            h("input", { type: "datetime-local", value: S.startLocal, onchange: e => { S.startLocal = e.target.value; change(); } })),
          h("label", {}, "Duração (h, 1 a 720)",
            h("input", { type: "number", min: "1", max: "720", value: S.durationH, "aria-invalid": S.durationH >= 1 && S.durationH <= 720 ? "false" : "true", onchange: e => { S.durationH = Number(e.target.value); change(); } })),
          h("label", {}, "Passo (min, 1 a 360)",
            h("input", { type: "number", min: "1", max: "360", value: S.stepMin, "aria-invalid": S.stepMin >= 1 && S.stepMin <= 360 ? "false" : "true", onchange: e => { S.stepMin = Number(e.target.value); change(); } }))),
        h("div", { class: "seg", role: "group", "aria-label": "Duração rápida", style: "margin-top:12px" },
          [[24, "1 dia"], [72, "3 dias"], [168, "1 semana"], [720, "30 dias"]].map(([hh, lab]) =>
            h("button", { type: "button", "aria-pressed": S.durationH === hh ? "true" : "false", onclick: () => { S.durationH = hh; change(); } }, lab))),
        coverage,
        sky && sky.start_utc && Date.parse(sky.start_utc) > startMs()
          ? h("button", { type: "button", style: "margin-top:10px", onclick: () => { S.startLocal = sky.start_utc.slice(0, 16); S.durationH = Math.min(720, Math.floor((Date.parse(sky.end_utc) - Date.parse(sky.start_utc)) / 3600000)); change(); } }, "USAR A COBERTURA DA SÉRIE")
          : null));

    const energyCard = entryCard("3", "Energia", "Premissas do modelo, não são dados de hardware real.",
      h("div", {},
        h("div", { class: "fields" }, POWER_FIELDS.map(([k, label, unit, help]) =>
          h("label", {}, label + " (" + unit + ")",
            h("input", { type: "number", step: "any", value: S.power[k], "data-power": k, "aria-invalid": Number.isFinite(S.power[k]) && S.power[k] >= 0 ? "false" : "true",
              onchange: e => { onPower(e); renderTab(); } }),
            h("span", { class: "hint", text: help })))),
        h("div", { class: "row", style: "margin-top:12px" },
          h("span", { class: "dim", text: "Exemplo ilustrativo." }),
          h("button", { type: "button", onclick: () => { S.power = { ...DEFAULT_POWER }; S.api = null; renderAlarm(); renderTab(); } }, "RESTAURAR EXEMPLO"))));

    const audCard = entryCard("4", "Público", "Muda o nível de explicação dos painéis.",
      h("div", { class: "seg", role: "group", "aria-label": "Público" },
        h("button", { type: "button", "aria-pressed": S.audience === "technical" ? "true" : "false", onclick: () => { S.audience = "technical"; renderTab(); } }, "Técnico"),
        h("button", { type: "button", "aria-pressed": S.audience === "educational" ? "true" : "false", onclick: () => { S.audience = "educational"; renderTab(); } }, "Educativo")),
      h("p", { class: "hint", style: "margin-top:8px", text: S.audience === "educational" ? "Cada painel traz uma explicação em linguagem simples." : "Mostra valores e premissas, sem explicações extras." }));

    const action = h("section", { class: "panel span2" },
      h("div", { class: "row" },
        h("div", {},
          h("strong", { text: "Calcular cenário" }),
          h("div", { class: "dim", text: "Envia o cenário à API para energia e riscos. Os demais painéis usam o modelo do navegador." })),
        h("button", { type: "button", id: "calc", class: "go", disabled: problems.length > 0, onclick: calculate }, "CALCULAR")));

    return [summary, placeCard, windowCard, energyCard, audCard, action,
      S.apiError ? h("div", { class: "caution span2", role: "alert" }, S.apiError.map(e => h("div", { text: e }))) : null];
  };
  function onPower(e) {
    const k = e.target.dataset.power;
    S.power[k] = e.target.value === "" ? NaN : Number(e.target.value);
    S.api = null;
    renderAlarm();
  }

  VIEWS.geometria = () => {
    const tr = timeline();
    if (!tr.length) return [noDataState("02 · Geometria do Sol e da Terra")];
    if (S.t >= tr.length) S.t = 0;
    const cur = tr[S.t] || tr[0];
    const stepM = stepOf(tr);
    const trS = M.transitions(tr, "sun_visible", stepM);
    const trE = M.transitions(tr, "earth_visible", stepM);
    const nextS = trS.find(x => x.index > S.t);
    const nextE = trE.find(x => x.index > S.t);
    const slider = h("input", { type: "range", min: "0", max: String(Math.max(0, tr.length - 1)), value: String(S.t), "aria-label": "Hora do cenário", style: "--p:" + progressPct(S.t, tr.length) + "%", oninput: e => { S.t = Number(e.target.value); renderTab(); } });
    return [
      h("section", { class: "panel" },
        h("h2", { text: "02 · Geometria do Sol e da Terra" }),
        instantLabel(cur),
        h("label", { style: "margin:12px 0 8px" }, "Arraste para escolher o instante (passo de " + stepM + " min)", slider),
        h("div", { class: "row" },
          h("button", { type: "button", "aria-pressed": !!S.playing, onclick: togglePlay }, S.playing ? "PAUSAR" : "REPRODUZIR"),
          h("span", { class: "dim", text: "passo " + stepM + " min" })),
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
        h("div", { class: "axis" }, h("span", { text: fmt(tr[0].ms) }), h("span", { text: fmt(tr[tr.length - 1].ms) })),
        h("dl", { class: "readout", style: "margin-top:10px" },
          h("dt", { text: "PRÓXIMA MUDANÇA DE LUZ" }), h("dd", { text: nextS ? fmt(tr[nextS.index].ms) + (nextS.to ? " (escurece→luz)" : " (luz→escuro)") : "nenhuma após T" }),
          h("dt", { text: "PRÓXIMA MUDANÇA DA TERRA" }), h("dd", { text: nextE ? fmt(tr[nextE.index].ms) : "nenhuma após T" })),
        h("p", { class: "note", text: "Animação por passo fixo. Instante exato por bisseção ainda pendente (4.6)." }),
        edu("Cada barra mostra uma hora (ou o passo escolhido). Luz e Terra visível são coisas diferentes."))
    ];
  };
  // Share of the track already passed, used to fill the slider track up to the thumb.
  function progressPct(i, n) {
    return n <= 1 ? 0 : Math.round((i / (n - 1)) * 1000) / 10;
  }

  // Readable instant: day of the scenario, time of day and the UTC stamp.
  function instantLabel(cur) {
    const ms = Number.isFinite(cur.ms) ? cur.ms : startMs() + cur.i * S.stepMin * 60e3;
    const dayIdx = Math.floor((ms - startMs()) / 86400e3) + 1;
    const days = Math.ceil(S.durationH / 24);
    const hhmm = new Date(ms).toISOString().slice(11, 16);
    const fromApi = cur.src === "api";
    return h("div", { class: "instant" },
      h("span", { class: "big", text: "Dia " + dayIdx + " de " + days + " · " + hhmm }),
      h("span", { class: "small", text: fmt(ms) }),
      h("span", { class: "tag " + (fromApi ? "SIM" : "SINT"), text: fromApi ? "SÉRIE DA API" : "MODELO LOCAL" }));
  }

  // ---------- timeline: API series when available, local model otherwise ----------
  // The API series (GET via POST /api/compare with include_series) gives the visibility flags and
  // margins that the server computed. Azimuth and elevation still come from the local model at the
  // same epoch, and the panel says so.
  S.series = null;      // { key, points } from the API
  S.loadingKey = null;
  function seriesKey() { return S.site + "|" + S.startLocal + "|" + S.durationH; }
  // Sky (API): GET /api/sites/{id}/sky gives the stored terrain horizon and, per stored sample,
  // Sun and Earth azimuth/elevation with their visibility. Values are read-only, never interpolated.
  S.sky = {};          // siteId -> { status: "ok" | "erro", data | error }
  S.skyLoading = {};
  const norm360 = a => ((a % 360) + 360) % 360;
  function loadSky(id) {
    if (S.skyLoading[id] || S.sky[id]) return;
    S.skyLoading[id] = true;
    OnboardApi.sky(id).then(r => {
      S.sky[id] = r.ok ? { status: "ok", data: r.data } : { status: "erro", error: r.error || ("HTTP " + r.status) };
      delete S.skyLoading[id];
      renderTab();
    });
  }
  function skyData() {
    const e = S.sky[S.site];
    return e && e.status === "ok" ? e.data : null;
  }
  // Horizon altitude at an azimuth, from the stored terrain profile (linear between samples).
  function hAt(az) {
    const sky = skyData();
    if (!sky || !sky.terrain_horizon || sky.terrain_horizon.length < 2) return M.horizonAt(az, M.SITES[S.site]);
    const pts = sky.terrain_horizon.slice().sort((p, q) => p.azimuth_deg - q.azimuth_deg);
    const wrapped = pts.concat([{ azimuth_deg: pts[0].azimuth_deg + 360, elevation_deg: pts[0].elevation_deg }]);
    const a = norm360(az) < wrapped[0].azimuth_deg ? norm360(az) + 360 : norm360(az);
    for (let i = 0; i < wrapped.length - 1; i++) {
      const p = wrapped[i], q = wrapped[i + 1];
      if (a >= p.azimuth_deg && a <= q.azimuth_deg) {
        const t = (a - p.azimuth_deg) / ((q.azimuth_deg - p.azimuth_deg) || 1);
        return p.elevation_deg + t * (q.elevation_deg - p.elevation_deg);
      }
    }
    return wrapped[wrapped.length - 1].elevation_deg;
  }
  // Timeline for the current place and window: API samples when the place has a sky series,
  // otherwise the local model (only for the three synthetic places that exist in the browser).
  function timeline() {
    if (!S.sky[S.site] && !S.skyLoading[S.site]) loadSky(S.site);
    const sky = skyData();
    if (sky && sky.samples && sky.samples.length) {
      const t0 = startMs(), t1 = t0 + S.durationH * 3600e3;
      const rows = [];
      sky.samples.forEach(s => {
        const ms = Date.parse(s.epoch_utc);
        if (!(ms >= t0 && ms <= t1)) return;
        rows.push({ ms, tH: ms / 3600e3, src: "api",
          sunAz: s.sun.azimuth_deg, sunEl: s.sun.elevation_deg, earthAz: s.earth.azimuth_deg, earthEl: s.earth.elevation_deg,
          sun_visible: s.sun_visible, earth_visible: s.earth_visible, sun_margin: s.sun_margin_deg, earth_margin: s.earth_margin_deg });
      });
      return rows.map((r, i) => ({ ...r, i }));
    }
    if (M.SITES[S.site] && (!S.sky[S.site] || S.sky[S.site].status === "erro")) {
      return track(0).map((s, i) => ({ ...s, i, ms: startMs() + i * S.stepMin * 60e3, src: "local" }));
    }
    return [];   // loading, or no data for this place in the chosen window
  }
  // Shown instead of a chart when the window has no data.
  function noDataState(what) {
    const e = S.sky[S.site];
    const ok = e && e.status === "ok" ? e.data : null;
    const msg = e && e.status === "erro" ? "A API não respondeu: " + e.error : (S.skyLoading[S.site] ? "Carregando a série do lugar…" : "Sem dados desta janela para o lugar escolhido.");
    const children = [h("strong", { text: msg })];
    if (ok && ok.start_utc && ok.end_utc) {
      const hours = Math.round((Date.parse(ok.end_utc) - Date.parse(ok.start_utc)) / 3600e3);
      children.push(h("span", { text: "Cobertura da série deste lugar: " + fmt(Date.parse(ok.start_utc)) + " até " + fmt(Date.parse(ok.end_utc)) + " (" + hours + " h)." }));
      children.push(h("button", { type: "button", class: "go", style: "justify-self:start", onclick: () => {
        S.startLocal = ok.start_utc.slice(0, 16);
        S.durationH = Math.max(1, Math.min(720, hours));
        S.t = 0; S.api = null; renderAlarm(); renderTab();
      } }, "USAR A COBERTURA DA SÉRIE"));
    }
    return h("section", { class: "panel span2" }, h("h2", {}, what), h("div", { class: "empty" }, ...children));
  }
  function stepOf(tr) {
    return tr.length > 1 ? Math.round((tr[1].ms - tr[0].ms) / 60000) : S.stepMin;
  }
  async function loadSeries(key) {
    const r = await OnboardApi.compare({ site_ids: [S.site], start_utc: iso(startMs()), duration_hours: S.durationH, include_series: true });
    if (key !== seriesKey()) { S.loadingKey = null; return; }   // the user changed the scenario meanwhile
    const res = r.ok && r.data && r.data.results ? r.data.results[0] : null;
    const pts = res && res.data_status === "AVAILABLE" && res.evaluation && res.evaluation.series ? res.evaluation.series : null;
    S.series = { key, points: pts, status: res ? res.data_status : "ERRO" };
    S.loadingKey = null;
    renderTab();
  }

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
    tr.forEach(s => box.append(h("i", { style: "background:" + (pred(s) ? color : "#263241") })));
    return h("div", { style: "margin:8px 0" }, h("div", { class: "dim", text: label }), box);
  }

  // Horizon view: azimuth on X (N at both ends, as in a skyline chart), elevation on Y.
  // The filled area is the synthetic horizon. Faint dots show the Sun and Earth over the
  // whole window; the solid markers show the current time, with a drop line to the horizon.
  VIEWS.horizonte = () => {
    const tr = timeline();
    if (!tr.length) return [noDataState("03 · Horizonte do lugar")];
    if (S.t >= tr.length) S.t = 0;
    const cur = tr[S.t] || tr[0];
    const site = M.SITES[S.site];
    const W = 640, H = 260, L = 46, R = 16, T = 14, B = 34;
    // vertical scale fits the values in the window (display only), so no curve is cut off
    const vals = [];
    tr.forEach((s, i) => { if (i % Math.max(1, Math.ceil(tr.length / 240)) === 0) vals.push(s.sunEl, s.earthEl, hAt(s.sunAz), hAt(s.earthAz)); });
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(4, hi - lo);
    const tickStep = span > 12 ? 4 : 2;
    const EMIN = Math.floor((lo - 0.5) / tickStep) * tickStep;
    const EMAX = Math.ceil((hi + 0.5) / tickStep) * tickStep;
    const x = a => L + (a / 360) * (W - L - R);
    // values outside the scale are pinned to the edge, so curves never leave the chart
    const y = e => T + ((EMAX - Math.max(EMIN, Math.min(EMAX, e))) / (EMAX - EMIN)) * (H - T - B);
    const box = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img",
      "aria-label": "Horizonte sintético do lugar " + site.name + " com Sol e Terra no instante escolhido" });

    // grid: elevation every 2°, azimuth every 45°
    for (let e = EMIN; e <= EMAX; e += tickStep) {
      box.append(svg("line", { x1: L, x2: W - R, y1: y(e), y2: y(e), stroke: e === 0 ? "#5fd8ff" : "#263241", "stroke-opacity": e === 0 ? ".6" : "1", "stroke-dasharray": e === 0 ? "4 4" : "" }));
      box.append(svg("text", { x: L - 8, y: y(e) + 4, "text-anchor": "end" }, (e > 0 ? "+" : "") + e + "°"));
    }
    const names = { 0: "N", 45: "NE", 90: "L", 135: "SE", 180: "S", 225: "SO", 270: "O", 315: "NO", 360: "N" };
    for (let a = 0; a <= 360; a += 45) {
      box.append(svg("line", { x1: x(a), x2: x(a), y1: T, y2: H - B, stroke: "#263241" }));
      box.append(svg("text", { x: x(a), y: H - B + 16, "text-anchor": "middle" }, names[a] + " " + a + "°"));
    }

    // axis titles
    box.append(svg("text", { x: L + 6, y: T - 4 }, "elevação (°) ↑"));
    box.append(svg("text", { x: L, y: H - 4 }, "azimute (°) →"));

    // horizon area
    let d = "";
    for (let a = 0; a <= 360; a += 2) d += (a === 0 ? "M" : "L") + x(a).toFixed(1) + "," + y(hAt(a)).toFixed(1) + " ";
    box.append(svg("path", { d: d + "L" + x(360) + "," + y(EMIN) + " L" + x(0) + "," + y(EMIN) + " Z", fill: "#263241", "fill-opacity": ".9", stroke: "#6f8b7c", "stroke-width": "1.5" }));

    // whole-window paths as dots (no lines: azimuth wraps at 0/360)
    const stride = Math.max(1, Math.ceil(tr.length / 240));
    tr.forEach((s, i) => {
      if (i % stride) return;
      box.append(svg("circle", { cx: x(s.sunAz), cy: y(s.sunEl), r: 1.6, fill: "#ffb020", "fill-opacity": ".35" }));
      box.append(svg("circle", { cx: x(s.earthAz), cy: y(s.earthEl), r: 1.6, fill: "#5fd8ff", "fill-opacity": ".35" }));
    });

    // current instant: drop lines and markers
    const hs = hAt(cur.sunAz), he = hAt(cur.earthAz);
    box.append(svg("line", { x1: x(cur.sunAz), x2: x(cur.sunAz), y1: y(cur.sunEl), y2: y(hs), stroke: "#ffb020", "stroke-dasharray": "2 2" }));
    box.append(svg("line", { x1: x(cur.earthAz), x2: x(cur.earthAz), y1: y(cur.earthEl), y2: y(he), stroke: "#5fd8ff", "stroke-dasharray": "2 2" }));
    box.append(svg("circle", { cx: x(cur.sunAz), cy: y(cur.sunEl), r: 6, fill: "#ffb020", stroke: "#0f1720", "stroke-width": 2 }));
    box.append(svg("circle", { cx: x(cur.earthAz), cy: y(cur.earthEl), r: 6, fill: "#5fd8ff", stroke: "#0f1720", "stroke-width": 2 }));
    // labels flip to the left of the marker near the right edge, so they stay inside the chart
    const lab = (a, e, text, color) => {
      const nearRight = x(a) > W - R - 60;
      box.append(svg("text", { x: x(a) + (nearRight ? -9 : 9), y: y(e) - 8, fill: color, "text-anchor": nearRight ? "end" : "start" }, text));
    };
    lab(cur.sunAz, cur.sunEl, "SOL", "#ffb020");
    lab(cur.earthAz, cur.earthEl, "TERRA", "#5fd8ff");

    const slider = h("input", { type: "range", min: "0", max: String(Math.max(0, tr.length - 1)), value: String(S.t), "aria-label": "Instante do horizonte", style: "--p:" + progressPct(S.t, tr.length) + "%", oninput: e => { S.t = Number(e.target.value); renderTab(); } });
    const sunMargin = cur.sunEl - hs, earthMargin = cur.earthEl - he;
    return [
      h("section", { class: "panel span2" },
        h("h2", { text: "03 · Horizonte do lugar", },
          h("em", { text: site.name + " · rugosidade " + site.rough })),
        instantLabel(cur),
        h("label", { style: "margin:10px 0" }, "Arraste para escolher o instante", slider),
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
        h("p", { class: "note", text: "Horizonte sintético: uma senoide com rugosidade do lugar. Não é relevo lunar. A escala vertical se ajusta aos valores da janela." }))
    ];
  };

  // Windows view: a summary, a timeline bar of light and Earth visibility over the whole
  // scenario, and one table listing each window with its duration. Geometric visibility only.
  function runsOf(tr, key, want) {
    const runs = [];
    let start = null;
    tr.forEach((s, i) => {
      const on = !!s[key] === want;
      if (on && start === null) start = i;
      if (!on && start !== null) { runs.push([start, i - 1]); start = null; }
    });
    if (start !== null) runs.push([start, tr.length - 1]);
    return runs;
  }

  VIEWS.janelas = () => {
    const { tr, sum } = scenario();
    if (!tr.length) return [noDataState("04 · Janelas de luz e de Terra")];
    const step = S.stepMin;
    const total = Math.max(1, tr.length);
    const sunRuns = runsOf(tr, "sun_visible", true);
    const earthRuns = runsOf(tr, "earth_visible", true);
    const blockRuns = runsOf(tr, "earth_visible", false);
    const at = i => fmt(startMs() + i * step * 60e3);
    const hours = (a, b) => f1((b - a + 1) * step / 60);
    const pct = i => (i / total * 100).toFixed(3) + "%";
    const width = (a, b) => ((b - a + 1) / total * 100).toFixed(3) + "%";

    const longestBlock = blockRuns.reduce((m, [a, b]) => Math.max(m, (b - a + 1) * step / 60), 0);
    const summary = h("section", { class: "panel span2" },
      h("div", { class: "grid four" },
        h("div", {}, h("div", { class: "label", text: "Janelas de Terra visível" }), h("strong", { class: "num", text: String(earthRuns.length) })),
        h("div", {}, h("div", { class: "label", text: "Janelas com luz" }), h("strong", { class: "num", text: String(sunRuns.length) })),
        h("div", {}, h("div", { class: "label", text: "Maior bloqueio da Terra" }), h("strong", { class: "num", text: f1(longestBlock) + " h" })),
        h("div", {}, h("div", { class: "label", text: "Horas com Terra visível" }), h("strong", { class: "num", text: f1(sum.earthH) + " h de " + f1(sum.durationH) + " h" }))));

    // Timeline: two rows over the whole scenario, placed by sample index.
    const bar = (runs, color, label) => h("div", { class: "tl-row" },
      h("span", { class: "tl-label", text: label }),
      h("div", { class: "tl-track", role: "img", "aria-label": label + ": " + runs.length + " janela(s)" },
        runs.map(([a, b]) => h("span", { class: "tl-seg", title: at(a) + " até " + at(b), style: "left:" + pct(a) + ";width:" + width(a, b) + ";background:" + color }))));
    const timeline = h("section", { class: "panel span2" },
      h("h2", { text: "Linha do tempo da janela" }),
      h("div", { class: "tl" },
        bar(sunRuns, "var(--amber)", "Luz"),
        bar(earthRuns, "var(--green)", "Terra visível")),
      h("div", { class: "tl-axis dim" }, h("span", { text: at(0) }), h("span", { text: at(tr.length - 1) })),
      h("p", { class: "note", text: "Cada faixa mostra uma janela. Passe o cursor sobre uma faixa para ver o início e o fim." }),
      S.audience === "educational" ? edu("Luz e Terra visível são medidas separadamente: a nave pode ter Sol e ainda não ver a Terra, ou o contrário.") : null);

    const rows = [...earthRuns.map(([a, b]) => ["Terra", a, b]), ...sunRuns.map(([a, b]) => ["Luz", a, b])].sort((x, y) => x[1] - y[1]);
    const table = rows.length === 0
      ? h("p", { class: "note", text: "Nenhuma janela no intervalo." })
      : h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "tipo" }), h("th", { text: "início (UTC)" }), h("th", { text: "fim (UTC)" }), h("th", { class: "n", text: "horas" }))),
          h("tbody", {}, rows.slice(0, 200).map(([k, a, b]) => h("tr", {}, h("td", { text: k }), h("td", { text: at(a) }), h("td", { text: at(b) }), h("td", { class: "n", text: hours(a, b) }))))));
    const list = h("section", { class: "panel span2" },
      h("h2", { text: "Janelas por tipo" }),
      table,
      h("p", { class: "note", text: "Visibilidade geométrica. Não garante enlace de rádio: orçamento de RF não modelado." }));

    return [summary, timeline, list];
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
        opt ? batteryReadout(opt) : h("div", { class: "empty" },
          h("strong", { text: "A bateria ainda não foi calculada." }),
          h("span", { text: "1. Ajuste capacidade, carga e solar na ENTRADA." }),
          h("span", { text: "2. Clique no botão + no canto inferior direito." }),
          h("span", { text: "3. A curva de carga e o estado (NOMINAL, SAFE_MODE, POWER_LOSS) aparecem aqui." })),
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
    box.append(svg("line", { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: "#263241" }));
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
        h("h2", { text: "06 · Combustível (protótipo · valor fixo de exemplo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "restante (kg)" }), h("dd", { text: life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg) : "ESGOTADO", class: life.fuelRemainingKg > 0 ? "" : "fuelout" }),
          h("dt", { text: "reserva mínima (kg)" }), h("dd", { text: "150.0" }),
          h("dt", { text: "margem (kg)" }), h("dd", { text: f1(life.fuelMarginKg), class: life.fuelMarginKg < 0 ? "fuelout" : "" })),
        h("div", { class: "bar " + (life.fuelMarginKg < 0 ? "bad" : ""), style: "margin-top:8px" }, h("span", { style: "width:" + fuelPct + "%" })),
        h("div", { style: "margin-top:8px" }, tag("SINT"), " ", tag("ESQ"), " ", h("span", { class: "dim", text: "consumo 1,2 kg/h · escopo não decidido (#7)" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Alimentação (protótipo · valor fixo de exemplo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "tripulação" }), h("dd", { text: life.people + " pessoas" }),
          h("dt", { text: "estoque restante (kg)" }), h("dd", { text: f1(life.foodLeftKg) }),
          h("dt", { text: "racionamento" }), h("dd", { text: life.foodLeftKg > 100 ? "NORMAL" : "REDUZIDO" })),
        h("div", { style: "margin-top:8px" }, tag("SINT"), " ", h("span", { class: "dim", text: "0,62 kg/pessoa/dia · sem fonte" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Pressurização e O2 (protótipo · valor fixo de exemplo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "pressão da cabine (kPa)" }), h("dd", { text: f1(life.cabinKpa) + " · faixa 95–105" }),
          h("dt", { text: "pressão parcial O2 (kPa)" }), h("dd", { text: f1(life.o2PartialKpa) + " · mín. 19" }),
          h("dt", { text: "estoque O2 (kg)" }), h("dd", { text: life.o2StockKg > 0 ? f1(life.o2StockKg) + " kg" : "ESGOTADO", class: life.o2StockKg > 0 ? "" : "fuelout" })),
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
            h("td", { title: r.v.map(x => x.text).join("; ") }, r.v.length ? (r.v[0].text + (r.v.length > 1 ? " (+" + (r.v.length - 1) + ")" : "")) : "nenhuma")))))),
        h("p", { class: "note", text: S.api ? "Bateria e riscos vêm da API para o lugar atual. Escuridão e bloqueio são do modelo." : "Bateria só aparece depois de CALCULAR. Escuridão e bloqueio são do modelo." })),
      h("section", { class: "panel" },
        h("h2", { text: "Busca de data no mesmo lugar (7.4)" }),
        h("p", { class: "note", text: "Grade de 24 h, até 7 dias, sem otimização. Não é busca completa." }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "início (UTC)" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "escuridão (h)" }))),
          h("tbody", {}, dateRows.map(r => h("tr", {}, h("td", { text: fmt(r.ms) }), h("td", {}, verdictTag(r.verdict)), h("td", { class: "n", text: f1(r.sum.darkH) })))))),
        h("div", { style: "margin-top:8px" }, tag("PARC"), " ", h("span", { class: "dim", text: "grade fixa; sem explicação quando nenhuma data serve (7.6)" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Comparação de lugares (7.5 · 8.7)" }),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "lugar" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "luz (h)" }), h("th", { class: "n", text: "escuridão (h)" }), h("th", { class: "n", text: "Terra (h)" }))),
          h("tbody", {}, siteRows.map(r => h("tr", {}, h("td", { text: (r.id === S.site ? "▶ " : "") + M.SITES[r.id].name }), h("td", {}, verdictTag(r.verdict)), h("td", { class: "n", text: f1(r.sum.sunlitH) }), h("td", { class: "n", text: f1(r.sum.darkH) }), h("td", { class: "n", text: f1(r.sum.earthH) })))))),
        h("p", { class: "note", text: "Sem fonte por lugar: os três são sintéticos. Bateria só para o lugar atual." }),
        h("div", { style: "margin-top:8px" }, tag("PARC"), " ", tag("BLOQ"), " ", h("span", { class: "dim", text: "fonte real por lugar (7.5) bloqueada (#5, #52)" }))),
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

  // Tooltip text for a site: name, coordinates and distance from the pole (colatitude).
  function siteTip(s) {
    return s.name + " · lat " + s.lat.toFixed(2) + "° · lon " + s.lon.toFixed(2) + "° · " + (s.lat + 90).toFixed(2) + "° do polo";
  }

  // Polar map of the south pole. Centre = pole; rings = distance from the pole (1° = 70 px);
  // radial lines = longitude every 45°. Shared by the overview card and the Visual tab.
  function polarMap(maxWidth) {
    const C = 180, K = 62, EDGE = 168;
    const box = svg("svg", { viewBox: "-30 -30 420 420", width: "100%", style: "max-width:" + maxWidth + "px;display:block;margin:0 auto", role: "img",
      "aria-label": "Mapa polar: lugares sintéticos ao redor do polo sul" });
    const defs = svg("defs", {});
    const grad = svg("radialGradient", { id: "polarBg" });
    grad.append(svg("stop", { offset: "0%", "stop-color": "#1b2d40" }), svg("stop", { offset: "100%", "stop-color": "#0c141d" }));
    defs.append(grad);
    box.append(defs);
    box.append(svg("circle", { cx: C, cy: C, r: EDGE, fill: "url(#polarBg)", stroke: "#2b3b4d" }));
    [0, 45, 90, 135, 180, 225, 270, 315].forEach(a => {
      const rad = a * Math.PI / 180;
      box.append(svg("line", { x1: C, y1: C, x2: C + EDGE * Math.cos(rad), y2: C + EDGE * Math.sin(rad), stroke: "#243447" }));
    });
    // ring labels sit on the upper-left diagonal, where no site is
    [[1, "1°"], [2, "2°"], [2.5, "2,5°"]].forEach(([deg, lab]) => {
      const r = deg * K, px = C - r * Math.SQRT1_2, py = C - r * Math.SQRT1_2;
      box.append(svg("circle", { cx: C, cy: C, r, fill: "none", stroke: "#3a526b", "stroke-width": 1.2, "stroke-dasharray": deg === 2.5 ? "" : "4 4" }));
      box.append(svg("rect", { x: px - 18, y: py - 8, width: 36, height: 16, rx: 4, fill: "#0c141d", stroke: "#3a526b", "stroke-width": .8 }));
      box.append(svg("text", { x: px, y: py + 4, "text-anchor": "middle", style: "fill:#c9d6e2" }, lab));
    });
    // longitude labels outside the edge (lon 0 is to the right, angles increase clockwise on screen)
    [[0, "0°"], [90, "90°"], [180, "180°"], [270, "270°"]].forEach(([a, lab]) => {
      const rad = a * Math.PI / 180, rr = EDGE + 11;
      const anchor = Math.abs(Math.cos(rad)) < 0.2 ? "middle" : (Math.cos(rad) > 0 ? "start" : "end");
      box.append(svg("text", { x: C + rr * Math.cos(rad), y: C + rr * Math.sin(rad) + 4, "text-anchor": anchor, style: "fill:#7f97ab" }, lab));
    });
    box.append(svg("circle", { cx: C, cy: C, r: 4, fill: "#e6edf5" }));
    box.append(svg("text", { x: C - 10, y: C - 10, "text-anchor": "end", style: "fill:#e6edf5;font-weight:600" }, "polo sul"));
    Object.entries(M.SITES).forEach(([id, s]) => {
      const r = (s.lat + 90) * K, rad = s.lon * Math.PI / 180;
      const x = C + r * Math.cos(rad), y = C + r * Math.sin(rad), on = id === S.site;
      if (on) box.append(svg("circle", { cx: x, cy: y, r: 14, fill: "none", stroke: "#5fd8ff", "stroke-opacity": ".5" }));
      const dot = svg("circle", { cx: x, cy: y, r: on ? 7 : 5, fill: on ? "#5fd8ff" : "#ffb020", stroke: "#0c141d", "stroke-width": 2, tabindex: "0", role: "img", "aria-label": siteTip(s) });
      dot.append(svg("title", {}, siteTip(s)));
      box.append(dot);
      const w = s.name.length * 6.4 + 12;
      box.append(svg("rect", { x: x + 10, y: y - 9, width: w, height: 18, rx: 4, fill: "#0c141d", "fill-opacity": ".85" }));
      box.append(svg("text", { x: x + 16, y: y + 4, style: on ? "fill:#5fd8ff;font-weight:600" : "fill:#e6edf5" }, s.name));
    });
    return box;
  }
  // Clickable list of the sites: selecting one updates every panel.
  function siteLegend() {
    return h("div", { class: "site-legend" }, Object.entries(M.SITES).map(([id, s]) => {
      const on = id === S.site;
      return h("button", { type: "button", class: "site-chip", "aria-pressed": on ? "true" : "false",
        onclick: () => { S.site = id; S.api = null; renderAlarm(); renderTab(); } },
        h("span", { class: "dot", style: "background:" + (on ? "#5fd8ff" : "#ffb020") }),
        h("strong", { text: s.name }),
        h("span", { class: "dim num", text: "lat " + s.lat.toFixed(2) + "° · lon " + s.lon.toFixed(2) + "° · " + (s.lat + 90).toFixed(2) + "° do polo" }));
    }));
  }

  VIEWS.visual = () => {
    const box = polarMap(440);
    return [
      h("section", { class: "panel" },
        h("h2", { text: "08 · Mapa polar do lugar", }, h("em", { text: "sintético" })),
        box,
        h("div", { class: "edu", style: "margin-top:12px" }, "Como ler: o centro é o polo sul. Cada anel é 1° de distância do polo. As linhas radiais são longitudes, de 45 em 45°. Quanto mais longe do centro, mais perto do equador lunar."),
        h("p", { class: "note", text: "Projeção ampliada, sem escala real. Coordenadas sintéticas, não são locais de pouso." }),
        h("div", { style: "margin-top:8px" }, tag("SIM"), " ", tag("BLOQ"), " ", h("span", { class: "dim", text: "mapa 2D com LOLA (8.5) e 3D (8.6) bloqueados" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Lugares" }, h("em", { text: "clique para selecionar" })),
        siteLegend()),
      h("section", { class: "panel" },
        h("h2", { text: "Pendências visuais" }),
        h("ul", { class: "note" },
          ...[["8.5", "BLOQ", "mapa 2D com dado LOLA"], ["8.6", "BLOQ", "3D do terreno"], ["8.8", "PARC", "animação sem destaque de transição"]]
            .map(([id, st, t]) => h("li", {}, id + " ", tag(st), " " + t)))),
        edu("O mapa mostra onde ficam os lugares em relação ao polo. Não mostra o relevo.")
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
        h("p", { class: "note", text: "Cenários salvos nesta sessão: " + S.saved.length + ". Use o JSON ao lado para levar os dados para outra ferramenta." }),
        h("button", { type: "button", class: "go", onclick: () => { S.saved.push(record); renderTab(); } }, "SALVAR CENÁRIO ATUAL"),
        h("p", { class: "note", text: "Só nesta sessão. Se a página fechar, o registro some." }),
        S.saved.length === 0 ? h("p", { class: "dim", text: "Nenhum cenário salvo." }) :
          h("div", { class: "scroll" }, h("table", { class: "table" },
            h("thead", {}, h("tr", {}, h("th", { text: "lugar" }), h("th", { text: "início" }), h("th", { class: "n", text: "dur. h" }), h("th", { class: "n", text: "carga mín." }), h("th", { text: "estado" }))),
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
        h("div", { class: "empty" },
          h("strong", { text: "Lançamentos não entram no cálculo de viabilidade." }),
          h("span", { text: "Esta área depende de decisão de escopo (#7) e de integração pelo backend (Launch Library 2, com cache, 15 requisições por hora sem chave)." })),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "id" }), h("th", { text: "item" }), h("th", { text: "estado" }), h("th", { text: "nota" }))),
          h("tbody", {}, items.map(x => h("tr", {}, h("td", { text: x.id }), h("td", { text: x.title }), h("td", {}, tag(x.status)), h("td", { text: x.note })))))),
        h("p", { class: "note", text: "Dados de referência verificados em VARREDURA_APIS_LANCAMENTOS.md: Launch Library 2 com 15 requisições por hora sem chave; relatório de falha do New Glenn NG-3 citado por imprensa." }))
    ];
  };

  // Status filter: clicking a state keeps only those features in the checklist table.
  S.statusFilter = null;
  function visibleFeatures() {
    return S.statusFilter ? F.FEATURES.filter(x => x.status === S.statusFilter) : F.FEATURES;
  }
  function statusFilterBar() {
    const keys = ["SIM", "PARC", "ESQ", "PEND", "BLOQ"];
    const all = h("button", { type: "button", "aria-pressed": S.statusFilter === null ? "true" : "false", onclick: () => { S.statusFilter = null; renderTab(); } }, "Todos (" + F.FEATURES.length + ")");
    return h("div", { class: "seg", role: "group", "aria-label": "Filtrar por estado" }, all,
      ...keys.map(k => h("button", { type: "button", "aria-pressed": S.statusFilter === k ? "true" : "false", onclick: () => { S.statusFilter = S.statusFilter === k ? null : k; renderTab(); } },
        F.LABEL[k] + " (" + F.FEATURES.filter(x => x.status === k).length + ")")));
  }

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
        statusFilterBar(),
        h("div", { class: "scroll" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "id" }), h("th", { text: "funcionalidade" }), h("th", { text: "estado" }), h("th", { text: "requisito" }), h("th", { text: "issue" }), h("th", { text: "nota" }))),
          h("tbody", {}, visibleFeatures().map(x => h("tr", {}, h("td", { text: x.id }), h("td", { text: x.title }), h("td", {}, tag(x.status)), h("td", { text: x.req }), h("td", { text: x.issue }), h("td", { text: x.note })))))),
        h("p", { class: "note", text: "Idioma inglês (12.6) e declaração de IA (12.8) ainda pendentes." }))
    ];
  };

  // ---------- Overview (dashboard home) ----------
  // Cards of big numbers, a donut, a daily bar chart, a polar map and a verdict table.
  // All values come from the synthetic model; the battery card uses the API only after CALCULAR.
  function donutCard(sum) {
    const C = 2 * Math.PI * 70;
    const f = sum.durationH ? sum.sunlitH / sum.durationH : 0;
    const box = svg("svg", { viewBox: "0 0 200 200", width: "100%", style: "max-width:220px;display:block;margin:0 auto", role: "img", "aria-label": "Proporção de horas com luz" });
    box.append(svg("circle", { cx: 100, cy: 100, r: 70, fill: "none", stroke: "#2b3644", "stroke-width": 26 }));
    box.append(svg("circle", { cx: 100, cy: 100, r: 70, fill: "none", stroke: "#e8a317", "stroke-width": 26, "stroke-dasharray": (f * C).toFixed(2) + " " + C.toFixed(2), transform: "rotate(-90 100 100)" }));
    box.append(svg("text", { x: 100, y: 96, "text-anchor": "middle", style: "font-size:28px;font-weight:600;fill:var(--ink)" }, Math.round(f * 100) + "%"));
    box.append(svg("text", { x: 100, y: 118, "text-anchor": "middle" }, "com luz"));
    return h("section", { class: "panel" },
      h("h2", {}, "Luz ao longo da missão", h("em", {}, "horas")),
      box,
      h("div", { class: "legend", style: "justify-content:center" },
        h("span", {}, h("i", { style: "background:#e8a317" }), "com luz · " + f1(sum.sunlitH, 0) + " h"),
        h("span", {}, h("i", { style: "background:#d9e0e8" }), "escuro · " + f1(sum.durationH - sum.sunlitH, 0) + " h")));
  }

  function dailyBarCard(tr, stepMin) {
    const perDay = Math.round(24 * 60 / stepMin);
    const days = [];
    for (let i = 0; i < tr.length; i += perDay) {
      const slice = tr.slice(i, i + perDay);
      const lit = slice.filter(s => s.sun_visible).length * stepMin / 60;
      const seen = slice.filter(s => s.earth_visible).length * stepMin / 60;
      days.push({ lit, dark: slice.length * stepMin / 60 - lit, seen });
    }
    const W = 640, H = 200, pad = 26, bw = (W - pad * 2) / Math.max(1, days.length);
    const box = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Horas de luz por dia" });
    for (let g = 0; g <= 24; g += 6) box.append(svg("line", { x1: pad, x2: W - pad, y1: H - pad - (g / 24) * (H - pad * 2), y2: H - pad - (g / 24) * (H - pad * 2), stroke: "#263241" }));
    days.forEach((d, i) => {
      const x = pad + i * bw + bw * 0.18, w = bw * 0.64;
      const hL = (d.lit / 24) * (H - pad * 2), hD = (d.dark / 24) * (H - pad * 2);
      box.append(svg("rect", { x, y: H - pad - hL, width: w, height: hL, fill: "#e8a317", rx: 2 }));
      box.append(svg("rect", { x, y: H - pad - hL - hD, width: w, height: hD, fill: "#2b3644", rx: 2 }));
      if (i % 2 === 0) box.append(svg("text", { x: x + w / 2, y: H - 6, "text-anchor": "middle" }, "d" + (i + 1)));
    });
    return h("section", { class: "panel span2" },
      h("h2", {}, "Horas de luz por dia", h("em", {}, "amarelo: luz · cinza: escuro")),
      box,
      h("p", { class: "note", text: "Cada coluna é um dia do cenário (24 h). Modelo sintético." }));
  }

  function polarCard() {
    return h("section", { class: "panel" },
      h("h2", {}, "Lugares no polo sul", h("em", {}, "sintéticos")),
      polarMap(320),
      h("p", { class: "note", text: "Centro = polo sul. Anéis = distância do polo. Sem escala real." }));
  }

  function verdictCard() {
    const life = M.lifeSupport(S.durationH);
    const rows = REPLAN_DELAYS.map(d => {
      const sum = M.summary(track(d), S.stepMin);
      const v = M.verdict(M.violations(sum, life), life.fuelMarginKg);
      return h("tr", {}, h("td", { text: d ? "+" + d + " h" : "sem atraso" }), h("td", {}, verdictTag(v)), h("td", { class: "n", text: f1(sum.darkH, 0) + " h" }), h("td", { class: "n", text: f1(sum.blockH, 0) + " h" }));
    });
    return h("section", { class: "panel" },
      h("h2", {}, "Viabilidade por atraso", h("em", {}, "modelo")),
      h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "atraso" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "escuro" }), h("th", { class: "n", text: "Terra bloqueada" }))),
        h("tbody", {}, rows))),
      h("p", { class: "note", text: "Limites ilustrativos. Detalhe e carga da bateria na aba Replanejar, após CALCULAR." }));
  }

  VIEWS.visao = () => {
    const { tr, sum, life } = scenario();
    const opt = apiOption(0);
    const kpi = (label, value, unit, delta, cls) => h("section", { class: "panel kpi" },
      h("div", { class: "label", text: label }),
      h("div", { class: "value" }, value, h("small", { text: unit })),
      h("div", { class: "delta " + (cls || "flat"), text: delta }));
    const fuelOk = life.fuelMarginKg >= 0;
    return [
      h("div", { class: "title span2" },
        h("div", {}, h("h1", { text: "Visão geral da missão" }),
          h("p", { text: M.SITES[S.site].name + " · início " + fmt(startMs()) + " · " + S.durationH + " h · dados sintéticos" }))),
      h("div", { class: "grid four span2" },
        kpi("Horas com luz", f1(sum.sunlitH, 0), " h", f1(sum.sunlitH / Math.max(1, sum.durationH) * 100, 0) + "% do período", "flat"),
        kpi("Maior escuridão", f1(sum.darkH, 0), " h", sum.darkH > M.LIMITS.darkH ? "acima do limite de " + M.LIMITS.darkH + " h" : "dentro do limite", sum.darkH > M.LIMITS.darkH ? "down" : "up"),
        kpi("Terra visível", f1(sum.earthH, 0), " h", "maior bloqueio " + f1(sum.blockH, 0) + " h", sum.blockH > M.LIMITS.blockH ? "down" : "flat"),
        kpi("Carga mínima", opt ? f1(opt.metrics.minimum_charge_wh, 0) : "—", opt ? " Wh" : "", opt ? opt.simulation_status : "clique em + para calcular", opt && opt.simulation_status === "CONSTRAINTS_MET" ? "up" : opt ? "down" : "flat")),
      h("div", { class: "grid two span2" },
        donutCard(sum),
        h("section", { class: "panel" },
          h("h2", {}, "Combustível (protótipo · valor fixo de exemplo)", h("em", {}, "sem fonte")),
          h("dl", { class: "readout" },
            h("dt", {}, "restante"), h("dd", { text: life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg, 0) + " kg" : "esgotado" }),
            h("dt", {}, "margem sobre a reserva"), h("dd", { class: fuelOk ? "" : "fuelout", text: f1(life.fuelMarginKg, 0) + " kg" }),
            h("dt", {}, "estoque de alimentos"), h("dd", { text: f1(life.foodLeftKg, 0) + " kg" }),
            h("dt", {}, "O2 em estoque"), h("dd", { text: f1(life.o2StockKg, 0) + " kg" })),
          h("div", { class: "bar " + (fuelOk ? "" : "bad") }, h("span", { style: "width:" + Math.max(0, Math.min(100, life.fuelRemainingKg / 450 * 100)) + "%" })),
          h("p", { class: "note", text: "Valores ilustrativos. Não usar para decisão de segurança." }))),
      dailyBarCard(tr, S.stepMin),
      h("div", { class: "grid two span2" }, polarCard(), verdictCard())
    ];
  };

  // ---------- Energy and life support: redesigned views ----------
  // These replace the earlier VIEWS.energia and VIEWS.vida. They must stay above the API
  // wrapper loop below, which wraps VIEWS.energia.

  // Battery chart: capacity ceiling, reserve line, charge curve coloured by state.
  function batteryChartBig(o, cap, reserve) {
    const W = 640, H = 230, L = 52, R = 14, T = 16, B = 30;
    const tl = o.timeline;
    const x = i => L + (tl.length <= 1 ? 0 : (i / (tl.length - 1)) * (W - L - R));
    const y = v => T + (1 - Math.max(0, Math.min(cap, v)) / cap) * (H - T - B);
    const box = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img",
      "aria-label": "Carga da bateria ao longo do cenário, com reserva e capacidade" });
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const v = cap * f;
      box.append(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "#263241" }));
      box.append(svg("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, Math.round(v) + " Wh"));
    });
    box.append(svg("line", { x1: L, x2: W - R, y1: y(reserve), y2: y(reserve), stroke: "#e8a317", "stroke-dasharray": "5 4" }));
    box.append(svg("text", { x: W - R, y: y(reserve) - 6, "text-anchor": "end", style: "fill:#e8a317" }, "reserva " + Math.round(reserve) + " Wh"));
    const color = { NOMINAL: "#3fbf80", SAFE_MODE: "#e8a317", POWER_LOSS: "#e0606e" };
    for (let i = 1; i < tl.length; i++) {
      box.append(svg("line", { x1: x(i - 1), y1: y(tl[i - 1].charge_wh), x2: x(i), y2: y(tl[i].charge_wh), stroke: color[tl[i].mode] || "#5fd8ff", "stroke-width": 2.5, "stroke-linecap": "round" }));
    }
    const first = tl[0], last = tl[tl.length - 1];
    box.append(svg("text", { x: L, y: H - 8 }, fmt(Date.parse(first.epoch_utc)).slice(0, 16)));
    box.append(svg("text", { x: W - R, y: H - 8, "text-anchor": "end" }, fmt(Date.parse(last.epoch_utc)).slice(0, 16)));
    return box;
  }

  function stateChip(status) {
    const map = { CONSTRAINTS_MET: ["ok", "DENTRO DOS LIMITES"], CONSTRAINTS_BREACHED: ["bad", "LIMITES VIOLADOS"] };
    const [k, label] = map[status] || ["info", status || "—"];
    return h("span", { class: "chip " + k, text: label });
  }

  VIEWS.energia = () => {
    const { sum } = scenario();
    const opt = apiOption(0);
    const sunlitWh = S.power.solar_generation_w * sum.sunlitH;
    const loadWh = S.power.load_w * sum.durationH;
    const balance = sunlitWh - loadWh;
    const cards = h("div", { class: "grid four span2" },
      h("section", { class: "panel kpi" }, h("div", { class: "label", text: "Horas com luz" }),
        h("div", { class: "value" }, f1(sum.sunlitH, 0), h("small", { text: " h" })),
        h("div", { class: "delta flat", text: "de " + f1(sum.durationH, 0) + " h do cenário" })),
      h("section", { class: "panel kpi" }, h("div", { class: "label", text: "Carga mínima da bateria" }),
        h("div", { class: "value" }, opt ? f1(opt.metrics.minimum_charge_wh, 0) : "—", h("small", { text: opt ? " Wh" : "" })),
        h("div", { class: "delta flat", text: opt ? "reserva: " + S.power.reserve_wh + " Wh" : "calcule com +" })),
      h("section", { class: "panel kpi" }, h("div", { class: "label", text: "Energia não atendida" }),
        h("div", { class: "value" }, opt ? f1(opt.metrics.total_unserved_energy_wh, 0) : "—", h("small", { text: opt ? " Wh" : "" })),
        h("div", { class: "delta " + (opt && opt.metrics.total_unserved_energy_wh > 0 ? "down" : "flat"), text: opt ? (opt.metrics.total_unserved_energy_wh > 0 ? "a carga ficou sem energia" : "a carga foi atendida") : "" })),
      h("section", { class: "panel kpi" }, h("div", { class: "label", text: "Estado do cenário" }),
        h("div", { class: "value", style: "font-size:18px;margin-top:14px" }, opt ? stateChip(opt.simulation_status) : h("span", { class: "chip info", text: "NÃO CALCULADO" })),
        h("div", { class: "delta flat", text: "resultado da API" })));

    const chart = opt
      ? h("section", { class: "panel span2" },
          h("h2", {}, "Carga da bateria", h("em", { text: "API · " + opt.id })),
          batteryChartBig(opt, S.power.battery_capacity_wh, S.power.reserve_wh),
          h("div", { class: "legend" },
            h("span", {}, h("i", { style: "background:#3fbf80" }), "NOMINAL"),
            h("span", {}, h("i", { style: "background:#e8a317" }), "SAFE_MODE"),
            h("span", {}, h("i", { style: "background:#e0606e" }), "POWER_LOSS"),
            h("span", {}, h("i", { style: "background:#e8a317;opacity:.5" }), "linha da reserva")),
          h("p", { class: "note", text: "Bateria com coeficientes da API, não de hardware real." }))
      : h("section", { class: "panel span2" },
          h("h2", {}, "Carga da bateria", h("em", { text: "ainda não calculada" })),
          h("div", { class: "empty" },
            h("strong", { text: "Calcule o cenário para ver a curva da bateria." }),
            h("span", { text: "1. Ajuste capacidade, carga e solar abaixo." }),
            h("span", { text: "2. Clique no botão + no canto inferior direito." }),
            h("span", { text: "3. A curva mostra a carga ao longo do tempo, com a reserva e os estados." })));

    const light = h("section", { class: "panel" },
      h("h2", {}, "Luz disponível × energia", h("em", { text: "premissas" })),
      h("div", { class: "stack" },
        energyRow("Energia do painel, se o Sol entregasse tudo", sunlitWh, Math.max(sunlitWh, loadWh) || 1, "#e8a317"),
        energyRow("Consumo da carga no período", loadWh, Math.max(sunlitWh, loadWh) || 1, "#5fb3d8")),
      h("div", { class: "row", style: "margin-top:12px" },
        h("span", { class: "dim", text: "saldo estimado" }),
        h("span", { class: "num", style: "font-weight:600;color:" + (balance >= 0 ? "var(--green)" : "var(--red)"), text: (balance >= 0 ? "+" : "") + f1(balance, 0) + " Wh" })),
      h("div", { class: "edu" }, "Luz do Sol não é energia elétrica. O painel precisa de área, eficiência e ângulo. Aqui a energia é só uma premissa de W com Sol."),
      h("div", { style: "margin-top:10px" }, tag("ESQ"), " ", h("span", { class: "dim", text: "modelo de painel (5.3) sem parâmetros de hardware" })));

    const premises = h("section", { class: "panel" },
      h("h2", {}, "Premissas do cenário", h("em", { text: "editar na entrada" })),
      h("dl", { class: "readout" },
        h("dt", {}, "capacidade da bateria"), h("dd", { text: S.power.battery_capacity_wh + " Wh" }),
        h("dt", {}, "carga inicial"), h("dd", { text: S.power.initial_charge_wh + " Wh" }),
        h("dt", {}, "reserva mínima"), h("dd", { text: S.power.reserve_wh + " Wh" }),
        h("dt", {}, "solar com Sol"), h("dd", { text: S.power.solar_generation_w + " W" }),
        h("dt", {}, "carga"), h("dd", { text: S.power.load_w + " W" })));

    return [cards, chart, light, premises];
  };

  // One labelled bar: value against a reference, used for energy comparisons.
  function energyRow(label, value, max, color) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return h("div", { style: "margin:8px 0" },
      h("div", { class: "row" }, h("span", { text: label }), h("span", { class: "num", text: f1(value, 0) + " Wh" })),
      h("div", { class: "bar", style: "margin-top:6px" }, h("span", { style: "width:" + pct + "%;background:" + color })));
  }

  // Gauge with a coloured zone, used for life-support values.
  function gaugeCard(title, valueText, unit, pct, status, detail, illustrative) {
    const map = { ok: ["ok", "OK"], warn: ["warn", "ATENÇÃO"], bad: ["bad", "ESGOTADO"] };
    const [k, label] = map[status] || ["info", "—"];
    return h("section", { class: "panel" },
      h("div", { class: "row" }, h("h2", { style: "margin:0", text: title }), h("span", { class: "chip " + k, text: label })),
      h("div", { class: "value num", style: "font-size:30px;font-weight:600;margin-top:12px" }, valueText, h("small", { style: "font-size:14px;color:var(--muted);margin-left:4px", text: unit })),
      h("div", { class: "bar " + (status === "bad" ? "bad" : status === "warn" ? "warn" : ""), style: "margin-top:12px" },
        h("span", { style: "width:" + Math.max(0, Math.min(100, pct)) + "%" })),
      h("p", { class: "note", text: detail }),
      illustrative ? h("div", { style: "margin-top:8px" }, tag("SINT"), " ", h("span", { class: "dim", text: "PROTÓTIPO · valor fixo de exemplo, sem fonte" })) : null);
  }

  VIEWS.vida = () => {
    const { life } = scenario();
    const fuelStatus = life.fuelRemainingKg <= 0 ? "bad" : life.fuelMarginKg < 0 ? "bad" : life.fuelMarginKg < 50 ? "warn" : "ok";
    const fuelDetail = life.fuelMarginKg < 0
      ? "Abaixo da reserva mínima de " + M.LIMITS.fuelReserveKg + " kg em " + f1(-life.fuelMarginKg, 0) + " kg."
      : "Margem de " + f1(life.fuelMarginKg, 0) + " kg sobre a reserva de " + M.LIMITS.fuelReserveKg + " kg.";
    const foodStatus = life.foodLeftKg <= 0 ? "bad" : life.foodLeftKg < 100 ? "warn" : "ok";
    const o2Status = life.o2StockKg <= 0 ? "bad" : life.o2StockKg < 20 ? "warn" : "ok";
    const pOk = life.cabinKpa >= 95 && life.cabinKpa <= 105;
    const pPct = ((life.cabinKpa - 90) / 20) * 100;
    const pressure = h("section", { class: "panel" },
      h("div", { class: "row" }, h("h2", { style: "margin:0", text: "Pressão da cabine" }), h("span", { class: "chip " + (pOk ? "ok" : "bad"), text: pOk ? "NOMINAL" : "FORA DA FAIXA" })),
      h("div", { class: "value num", style: "font-size:30px;font-weight:600;margin-top:12px" }, f1(life.cabinKpa), h("small", { style: "font-size:14px;color:var(--muted);margin-left:4px", text: "kPa" })),
      h("div", { style: "position:relative;margin-top:14px;height:10px;border-radius:999px;background:linear-gradient(90deg,#e0606e 0%,#e0606e 25%,#3fbf80 25%,#3fbf80 75%,#e0606e 75%)" },
        h("span", { style: "position:absolute;top:-4px;width:4px;height:18px;border-radius:2px;background:var(--ink);left:calc(" + Math.max(0, Math.min(100, pPct)) + "% - 2px)" })),
      h("div", { class: "axis" }, h("span", { text: "90 kPa" }), h("span", { text: "faixa 95–105" }), h("span", { text: "110 kPa" })),
      h("p", { class: "note", text: "Pressão fixa do modelo. Não usar para segurança." }),
      h("div", { style: "margin-top:8px" }, tag("SINT")));
    const o2Pressure = h("section", { class: "panel" },
      h("div", { class: "row" }, h("h2", { style: "margin:0", text: "Oxigênio" }), h("span", { class: "chip " + (life.o2PartialKpa >= 19 ? "ok" : "bad"), text: life.o2PartialKpa >= 19 ? "PRESSÃO OK" : "BAIXA" })),
      h("dl", { class: "readout", style: "margin-top:10px" },
        h("dt", {}, "pressão parcial"), h("dd", { text: f1(life.o2PartialKpa) + " kPa (mín. 19)" }),
        h("dt", {}, "estoque restante"), h("dd", { text: life.o2StockKg > 0 ? f1(life.o2StockKg) + " kg" : "ESGOTADO" })),
      h("p", { class: "note", text: "Estoque de O2 consumido por " + life.people + " pessoas ao longo do período." }),
      h("div", { style: "margin-top:8px" }, tag("SINT"), " ", h("span", { class: "chip " + o2Status, text: o2Status === "bad" ? "ESGOTADO" : o2Status === "warn" ? "ATENÇÃO" : "OK" })));

    return [
      h("div", { class: "span2 caution", role: "note" }, "Estes valores são ilustrativos, sem fonte nem validação. Não devem ser lidos como condição de vida. Suporte de vida ainda não está na lista de requisitos do desafio (#7)."),
      h("div", { class: "grid three span2" },
        gaugeCard("Combustível", life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg, 0) : "0", "kg", life.fuelRemainingKg / 450 * 100, fuelStatus, fuelDetail, true),
        gaugeCard("Alimentação", f1(life.foodLeftKg, 0), "kg", life.foodLeftKg / 500 * 100, foodStatus,
          life.people + " pessoas · 0,62 kg por pessoa e dia · racionamento " + (life.foodLeftKg > 100 ? "normal" : "reduzido") + ".", true),
        gaugeCard("Estoque de O2", f1(life.o2StockKg, 0), "kg", life.o2StockKg / 64 * 100, o2Status,
          "0,84 kg por pessoa e dia. Abaixo de 20 kg, o estoque entra em atenção.", true)),
      h("div", { class: "grid two span2" }, pressure, o2Pressure)
    ];
  };

  // ---------- Sensitivity: redesigned view ----------
  // Replaces the earlier VIEWS.sens. Each variation shows three centred bars: the change in
  // light, darkness and Earth visibility against the baseline. Colour says whether the change is good.
  VIEWS.sens = () => {
    const base = M.summary(track(0), S.stepMin);
    const rows = M.SENS_VARIANTS.filter(v => v.key !== "base").map(v => {
      const stepMin = v.opts.stepMul ? S.stepMin * v.opts.stepMul : S.stepMin;
      const cnt = Math.floor((S.durationH * 60) / stepMin);
      const tr = M.track({ siteId: S.site, startMs: startMs(), stepMin, count: cnt, delayH: 0, dh: v.opts.dh, roughMult: v.opts.roughMult });
      const sum = M.summary(tr, stepMin);
      return { v, sum, dLight: sum.sunlitH - base.sunlitH, dDark: sum.darkH - base.darkH, dEarth: sum.earthH - base.earthH };
    });
    const maxAbs = Math.max(1, ...rows.flatMap(r => [Math.abs(r.dLight), Math.abs(r.dDark), Math.abs(r.dEarth)]));
    const biggest = rows.reduce((a, b) => (Math.abs(b.dDark) > Math.abs(a.dDark) ? b : a), rows[0] || { v: { label: "—" }, dDark: 0 });
    const headline = maxAbs < 1e-9
      ? "Nenhuma das variações muda o resultado neste cenário."
      : "A variação que mais mexe na escuridão é: " + biggest.v.label.toLowerCase() + " (" + (biggest.dDark >= 0 ? "+" : "") + f1(biggest.dDark, 0) + " h).";

    // a signed bar centred on zero; sign and colour are explicit in the label
    const deltaBar = (value, good) => {
      const pct = Math.abs(value) / maxAbs * 48;
      const color = Math.abs(value) < 1e-9 ? "var(--faint)" : (good(value) ? "var(--green)" : "var(--red)");
      return h("div", { style: "position:relative;height:10px;background:var(--line2);border-radius:999px;margin:6px 0" },
        h("span", { style: "position:absolute;top:-3px;bottom:-3px;left:50%;width:2px;background:var(--faint)" }),
        h("span", { style: "position:absolute;top:0;bottom:0;border-radius:999px;background:" + color + ";" +
          (value >= 0 ? "left:50%;width:" + pct + "%" : "right:50%;width:" + pct + "%") }));
    };
    const fmtDelta = x => (Math.abs(x) < 1e-9 ? "sem mudança" : (x > 0 ? "+" : "") + f1(x, 1) + " h");
    const cards = h("div", { class: "grid three span2" }, rows.map(r => h("section", { class: "panel" },
      h("h2", { style: "margin:0", text: r.v.label }),
      h("div", { class: "dim", style: "margin-top:4px", text: "comparado com a base de " + f1(base.darkH, 0) + " h de escuridão" }),
      h("div", { style: "margin-top:14px" },
        h("div", { class: "row" }, h("span", { text: "Luz" }), h("span", { class: "num", text: fmtDelta(r.dLight) })),
        deltaBar(r.dLight, x => x > 0)),
      h("div", { style: "margin-top:10px" },
        h("div", { class: "row" }, h("span", { text: "Escuridão" }), h("span", { class: "num", text: fmtDelta(r.dDark) })),
        deltaBar(r.dDark, x => x < 0)),
      h("div", { style: "margin-top:10px" },
        h("div", { class: "row" }, h("span", { text: "Terra visível" }), h("span", { class: "num", text: fmtDelta(r.dEarth) })),
        deltaBar(r.dEarth, x => x > 0)))));

    const legend = h("div", { class: "legend" },
      h("span", {}, h("i", { style: "background:var(--green)" }), "mudança favorável"),
      h("span", {}, h("i", { style: "background:var(--red)" }), "mudança desfavorável"),
      h("span", {}, "a linha do centro é a base"));

    const trade = h("section", { class: "panel span2" },
      h("h2", {}, "Compromissos ciência × engenharia", h("em", { text: "9.5" })),
      h("div", { class: "grid three" },
        h("div", { class: "panel", style: "background:var(--card2)" },
          h("div", { class: "row" }, h("strong", { text: "Mais luz" }), h("span", { class: "chip " + (base.sunlitH >= 40 ? "ok" : "warn"), text: base.sunlitH >= 40 ? "favorece energia" : "limita energia" })),
          h("p", { class: "dim", style: "margin:8px 0 0", text: "O Sol mais alto aumenta o tempo com luz." })),
        h("div", { class: "panel", style: "background:var(--card2)" },
          h("div", { class: "row" }, h("strong", { text: "Mais Terra visível" }), h("span", { class: "chip " + (base.earthH >= 36 ? "ok" : "warn"), text: base.earthH >= 36 ? "favorece comunicação" : "limita comunicação" })),
          h("p", { class: "dim", style: "margin:8px 0 0", text: "Visibilidade geométrica, não é enlace de rádio." })),
        h("div", { class: "panel", style: "background:var(--card2)" },
          h("div", { class: "row" }, h("strong", { text: "Menos escuridão" }), h("span", { class: "chip " + (base.darkH <= M.LIMITS.darkH ? "ok" : "bad"), text: base.darkH <= M.LIMITS.darkH ? "dentro do limite" : "acima do limite" })),
          h("p", { class: "dim", style: "margin:8px 0 0", text: "Escuridão longa exige bateria maior." }))),
      h("p", { class: "note", text: "Não há ranking único entre luz, comunicação e energia. A escolha é do time." }));

    return [
      h("section", { class: "panel span2" },
        h("div", { class: "row" },
          h("div", {}, h("h2", { style: "margin:0", text: "Sensibilidade do modelo" }), h("p", { class: "dim", style: "margin:6px 0 0", text: headline })),
          h("span", { class: "chip info", text: "modelo sintético" })),
        h("div", { style: "margin-top:12px" }, legend)),
      cards,
      trade,
      h("section", { class: "panel span2" },
        h("div", { class: "edu" }, "Cada cartão muda uma premissa do modelo e mostra o efeito. Não é incerteza calibrada nem probabilidade. Com DEM real e efemérides validadas, estes testes passam a ser evidência científica."))
    ];
  };

  // ---------- Replanning: redesigned view ----------
  // Replaces the earlier VIEWS.replan. Kept above the API wrapper loop, which adds the API panel.
  const VERDICT_CHIP = { VIAVEL: ["ok", "VIÁVEL"], MARGEM_REDUZIDA: ["warn", "MARGEM REDUZIDA"], NAO_VIAVEL: ["bad", "NÃO VIÁVEL"] };
  function verdictChip(v) {
    const [k, label] = VERDICT_CHIP[v] || ["info", v];
    return h("span", { class: "chip " + k, text: label });
  }
  function delayName(d) { return d ? "+" + d + " h" : "sem atraso"; }

  VIEWS.replan = () => {
    const life = M.lifeSupport(S.durationH);
    const options = REPLAN_DELAYS.map(d => {
      const tr = track(d);
      const sum = M.summary(tr, S.stepMin);
      const v = M.violations(sum, life);
      const o = apiOption(d);
      if (o) {
        if (o.metrics.minimum_charge_wh < S.power.reserve_wh) v.push({ code: "BATT", text: "bateria abaixo da reserva" });
        if (o.risks.some(r => r.category === "ENERGY_LOSS")) v.push({ code: "ENERGY_LOSS", text: "perda de energia" });
      }
      return { d, sum, v, o, verdict: M.verdict(v, life.fuelMarginKg) };
    });
    const viable = options.filter(x => x.verdict !== "NAO_VIAVEL");
    const best = options.find(x => x.verdict === "VIAVEL") || options.find(x => x.verdict === "MARGEM_REDUZIDA");

    // Summary: one sentence the reader can act on.
    const headline = best
      ? (best.d ? "Atrasar para " + delayName(best.d) + " ainda é viável neste cenário." : "O plano atual é viável neste cenário.")
      : "Nenhum atraso testado é viável. Veja o motivo em cada cartão.";
    const summary = h("section", { class: "panel span2" },
      h("div", { class: "row" },
        h("div", {}, h("h2", { style: "margin:0", text: "Replanejamento por atraso" }), h("p", { class: "dim", style: "margin:6px 0 0", text: headline })),
        h("span", { class: "chip " + (best ? (best.verdict === "VIAVEL" ? "ok" : "warn") : "bad"), text: viable.length + " de " + options.length + " opções viáveis" })));

    // One card per delay: verdict, the two main numbers and the reasons.
    const cards = h("div", { class: "grid four span2" }, options.map(x => h("section", { class: "panel kpi" },
      h("div", { class: "row" }, h("span", { class: "label", text: delayName(x.d) }), verdictChip(x.verdict)),
      h("div", { class: "value", style: "margin-top:10px" }, f1(x.sum.darkH, 0), h("small", { text: " h escuro" })),
      h("div", { class: "delta " + (x.sum.darkH > M.LIMITS.darkH ? "down" : "flat"), text: "limite " + M.LIMITS.darkH + " h · Terra bloqueada " + f1(x.sum.blockH, 0) + " h" }),
      h("div", { class: "dim", style: "margin-top:8px" }, x.o ? "carga mínima " + f1(x.o.metrics.minimum_charge_wh, 0) + " Wh" : "carga: calcule com +"),
      x.v.length
        ? h("ul", { class: "plain", style: "margin-top:10px;font-size:12px" }, x.v.map(r => h("li", { text: r.text })))
        : h("p", { class: "dim", style: "margin-top:10px", text: "Nenhuma restrição violada." }))));

    // Date search: each day of the window as a coloured cell.
    const days = DATE_OFFSETS_DAYS.map(off => {
      const ms = startMs() + off * 86400e3;
      const tr = M.track({ siteId: S.site, startMs: ms, stepMin: S.stepMin, count: count(), delayH: 0 });
      const sum = M.summary(tr, S.stepMin);
      return { off, ms, sum, verdict: M.verdict(M.violations(sum, life), undefined) };
    });
    const cellColor = { VIAVEL: "#3fbf80", MARGEM_REDUZIDA: "#e8a317", NAO_VIAVEL: "#e0606e" };
    const dateStrip = h("section", { class: "panel span2" },
      h("h2", {}, "Outras datas no mesmo lugar", h("em", { text: "grade de 24 h · 7 dias" })),
      h("div", { class: "datestrip" }, days.map(d => h("div", { class: "daycell", title: fmt(d.ms) + " · " + (VERDICT_CHIP[d.verdict] || [])[1],
        style: "border-top:4px solid " + cellColor[d.verdict] },
        h("strong", { text: "dia " + (d.off + 1) }),
        h("span", { class: "dim", text: new Date(d.ms).toISOString().slice(5, 10) }),
        h("span", { class: "num", text: f1(d.sum.darkH, 0) + " h escuro" })))),
      h("div", { class: "legend" },
        h("span", {}, h("i", { style: "background:#3fbf80" }), "viável"),
        h("span", {}, h("i", { style: "background:#e8a317" }), "margem reduzida"),
        h("span", {}, h("i", { style: "background:#e0606e" }), "não viável")),
      h("p", { class: "note", text: "Grade fixa, sem otimização. Não é uma busca completa de datas." }));

    // Places: same metrics, one card each.
    const places = h("section", { class: "panel span2" },
      h("h2", {}, "Outros lugares", h("em", { text: "mesma data e duração" })),
      h("div", { class: "grid three" }, Object.keys(M.SITES).map(id => {
        const tr = M.track({ siteId: id, startMs: startMs(), stepMin: S.stepMin, count: count(), delayH: 0 });
        const sum = M.summary(tr, S.stepMin);
        const v = M.verdict(M.violations(sum, undefined), undefined);
        const on = id === S.site;
        return h("div", { class: "panel", style: on ? "border-color:var(--sky)" : "" },
          h("div", { class: "row" }, h("strong", { text: M.SITES[id].name + (on ? " · atual" : "") }), verdictChip(v)),
          h("dl", { class: "readout", style: "margin-top:8px" },
            h("dt", {}, "horas com luz"), h("dd", { text: f1(sum.sunlitH, 0) + " h" }),
            h("dt", {}, "maior escuridão"), h("dd", { text: f1(sum.darkH, 0) + " h" }),
            h("dt", {}, "Terra visível"), h("dd", { text: f1(sum.earthH, 0) + " h" })));
      })),
      h("p", { class: "note", text: "Sem fonte real por lugar: os três são sintéticos. Bateria só para o lugar atual." }));

    const explain = h("section", { class: "panel span2" },
      h("h2", {}, "Como o veredito é calculado"),
      h("div", { class: "edu" }, "Um atraso é inviável se a escuridão passa do limite, se a Terra fica bloqueada por tempo demais, se a bateria cai abaixo da reserva ou se o combustível fica abaixo da reserva. Os limites são premissas ilustrativas."),
      h("p", { class: "note", text: "Cálculo do modelo sintético. Os números da API aparecem no painel de API acima, quando consultados." }));

    return [summary, cards, dateStrip, places, explain];
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
    let body = h("p", { class: "dim", text: "Ainda não consultado. Usa a API /api/scenarios/delay com lugares que têm série de dados." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) {
      const d = r.data;
      body = h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "opção" }), h("th", { text: "lugar" }), h("th", { class: "n", text: "atraso h" }), h("th", { text: "restrições" }))),
        h("tbody", {}, (d.options || []).map(o => h("tr", {},
          h("td", { text: o.kind || "—" }),
          h("td", { text: o.site_id || "—" }),
          h("td", { class: "n", text: o.delay_hours !== undefined && o.delay_hours !== null ? String(o.delay_hours) : "—" }),
          h("td", { text: (o.checks || []).map(c => c.criterion + ": " + (c.passed ? "ok" : "violada")).join(" · ") || (o.data_status || "—") }))))),
        h("p", { class: "note", text: "Estado: " + (d.outcome ? d.outcome.status : "—") + (d.outcome && d.outcome.message ? " · " + d.outcome.message : "") + " · request " + (d.scenario_sha256 || "—").slice(0, 12) + "…" }));
    }
    return apiPanelFrame("API · Replanejamento por atraso (/api/scenarios/delay)", "Dados de série do lugar atual, sem dado de série o resultado é NO_SERIES_DATA.", button, body);
  }

  function comparePanel() {
    const r = S.apiResults.compare;
    const button = callButton("COMPARAR LUGARES (API)", async () => {
      const ids = (S.sitesApi || []).map(s => s.id);
      const pick = ids.length ? ids : ["synthetic-demo-a", "synthetic-demo-b", "malapert-massif"];
      S.apiResults.compare = await OnboardApi.compare({ site_ids: pick, start_utc: iso(startMs()), duration_hours: S.durationH, include_series: false });
    });
    let body = h("p", { class: "dim", text: "Ainda não consultado. Compara lugares do catálogo, com dados de série quando existirem." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) {
      body = h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "lugar" }), h("th", { text: "dados" }), h("th", { class: "n", text: "luz" }), h("th", { class: "n", text: "escuridão h" }), h("th", { text: "ciência" }))),
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
    return apiPanelFrame("API · Comparação de lugares (/api/compare)", "Lugares sem série aparecem como NO_SERIES_DATA, sem números.", button, body);
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
    let body = h("p", { class: "dim", text: "Ainda não consultado. Só lugares com série ingerida (synthetic-demo-a e -b) são aceitos." });
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

  // ---------- More API panels: nearby places, media, layers, site report ----------
  S.nearby = {}; S.media = {}; S.layers = null; S.layersLoading = false;
  function loadNearby(id) {
    if (S.nearby[id]) return;
    S.nearby[id] = { loading: true };
    OnboardApi.site(id).then(r => {
      S.nearby[id] = r.ok ? { ok: true, nearby: (r.data.nearby || []) } : { ok: false, error: r.error || ("HTTP " + r.status) };
      renderTab();
    });
  }
  function nearbyPanel() {
    const c = S.nearby[S.site];
    if (!c) loadNearby(S.site);
    let body = h("p", { class: "dim", text: "Carregando lugares próximos…" });
    if (c && c.ok) {
      body = c.nearby.length
        ? h("div", { class: "scroll" }, h("table", { class: "table" },
            h("thead", {}, h("tr", {}, h("th", { text: "lugar" }), h("th", { class: "n", text: "distância (km)" }), h("th", { text: "série" }))),
            h("tbody", {}, c.nearby.map(n => h("tr", {}, h("td", { text: n.name || n.id }), h("td", { class: "n", text: f1(n.distance_km, 0) }),
              h("td", {}, tag(n.has_series ? "SIM" : "PEND"), " ", h("span", { class: "dim", text: n.has_series ? "com série" : "sem série" })))))))
        : h("p", { class: "dim", text: "Nenhum lugar próximo no catálogo." });
    }
    if (c && !c.ok) body = apiError(c);
    return apiPanelFrame("API · Lugares próximos (/api/sites/{id})", "Vizinhos do catálogo por distância. Só lugares com série podem ser avaliados.", h("span"), body);
  }

  function loadMedia(id) {
    if (S.media[id]) return;
    S.media[id] = { loading: true };
    OnboardApi.media(id).then(r => {
      S.media[id] = r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error || ("HTTP " + r.status) };
      renderTab();
    });
  }
  function mediaPanel() {
    const c = S.media[S.site];
    if (!c) loadMedia(S.site);
    let body = h("p", { class: "dim", text: "Carregando galeria do lugar…" });
    if (c && c.ok) {
      const items = c.data.media || [];
      body = items.length
        ? h("div", { class: "grid three" }, items.map(m => h("div", { class: "panel" },
            h("strong", { text: m.title }),
            h("div", { class: "dim", style: "margin-top:4px", text: m.region || "" }),
            h("p", { class: "note", text: "Crédito: " + (m.credit || "—") }),
            m.coordinate_note ? h("p", { class: "note", text: m.coordinate_note }) : null,
            m.illustrative_only ? h("div", { style: "margin-top:8px" }, tag("SINT"), " ", h("span", { class: "dim", text: "ilustrativo, não é dado" })) : null,
            m.page_url ? h("a", { href: m.page_url, target: "_blank", rel: "noopener", text: "abrir fonte" }) : null)))
        : h("p", { class: "dim", text: "Sem mídia relacionada a este lugar." });
      if (c.data.terms_url) body = h("div", {}, body, h("p", { class: "note" }, "Termos: ", h("a", { href: c.data.terms_url, target: "_blank", rel: "noopener", text: c.data.terms_url })));
    }
    if (c && !c.ok) body = apiError(c);
    return apiPanelFrame("API · Galeria do lugar (/api/sites/{id}/media)", "Links e créditos. Imagens não são copiadas para o protótipo.", h("span"), body);
  }

  function loadLayers() {
    if (S.layers || S.layersLoading) return;
    S.layersLoading = true;
    OnboardApi.layers().then(r => {
      S.layers = r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error || ("HTTP " + r.status) };
      S.layersLoading = false;
      renderTab();
    });
  }
  function layersPanel() {
    if (!S.layers) loadLayers();
    let body = h("p", { class: "dim", text: "Carregando camadas…" });
    if (S.layers && S.layers.ok) {
      body = h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "camada" }), h("th", { text: "papel científico" }), h("th", { text: "resolução" }), h("th", { text: "direitos" }), h("th", { text: "entrega" }))),
        h("tbody", {}, (S.layers.data.layers || []).map(l => h("tr", {},
          h("td", {}, h("strong", { text: l.title }), h("div", { class: "dim", text: l.attribution || "" })),
          h("td", { text: l.scientific_role || "—" }),
          h("td", { text: l.resolution_m_per_px ? l.resolution_m_per_px + " m/px" : (l.resolution_km_per_px_equator ? l.resolution_km_per_px_equator + " km/px" : "—") }),
          h("td", {}, tag(l.redistribution_status === "ALLOWED" ? "SIM" : "PEND"), " ", h("span", { class: "dim", text: l.redistribution_status || "—" })),
          h("td", { text: l.delivery || "—" }))))));
    }
    if (S.layers && !S.layers.ok) body = apiError(S.layers);
    return apiPanelFrame("API · Camadas do mapa (/api/layers)", "Fonte, direitos e atribuição de cada camada. Só as liberadas podem ser usadas em produção.", h("span"), body);
  }

  // Site-level printable report: same input as the site evaluation, one place, one candidate.
  function siteReportPanel() {
    const r = S.apiResults.siteReport;
    const button = callButton("RELATÓRIO DO LUGAR (API)", async () => {
      const body = {
        mission_id: "cockpit-report-" + S.site, start_utc: iso(startMs()), duration_hours: S.durationH,
        candidates: [{ id: "planejado", site_id: S.site, delay_hours: 0 }],
        power: { battery_capacity_wh: S.power.battery_capacity_wh, initial_charge_wh: S.power.initial_charge_wh, reserve_wh: S.power.reserve_wh, solar_generation_w: S.power.solar_generation_w, load_w: S.power.load_w },
        max_comm_blackout_hours: S.power.max_comm_blackout_hours
      };
      const res = await OnboardApi.siteReport(body);
      S.apiResults.siteReport = res;
      if (res.ok) window.open(URL.createObjectURL(new Blob([res.data], { type: "text/html" })), "_blank", "noopener");
    });
    let body = h("p", { class: "dim", text: "Relatório imprimível do lugar, com o cálculo combinado e os consumíveis (/api/onboard/site-report). Protótipo, não é documento de submissão." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) body = h("p", { class: "note", text: "Relatório do lugar gerado e aberto em nova aba." });
    return apiPanelFrame("API · Relatório do lugar (/api/onboard/site-report)", "Um lugar, um candidato. Só para lugares com série.", button, body);
  }

  const API_EXTRA = {
    replan: () => [delayPanel(), nearbyPanel()],
    visual: () => [comparePanel(), mediaPanel(), layersPanel()],
    energia: () => [siteEvalPanel()],
    historico: () => [reportPanel(), siteReportPanel()]
  };
  for (const k of Object.keys(API_EXTRA)) {
    const base = VIEWS[k];
    VIEWS[k] = () => [].concat(API_EXTRA[k](), base());
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
    rebuildTop();
    if (S.tab === "entrada") renderTab();
  }
  // Places: a place can be selected when the API has its series AND the browser has its local model.
  function siteOptions() {
    const api = S.sitesApi || [];
    const byId = Object.fromEntries(api.map(s => [s.id, s]));
    const ids = [...new Set([...Object.keys(M.SITES), ...api.map(s => s.id)])];
    return ids.map(id => {
      const a = byId[id], local = M.SITES[id];
      const name = (local && local.name) || (a && a.name) || id;
      const ok = !!(a && a.series) && !!local;
      return { id, ok, label: id + " · " + name + (ok ? "" : " (sem série)") };
    });
  }
  function rebuildTop() {
    const top = document.getElementById("top-site");
    if (!top) return;
    top.replaceChildren(...siteOptions().map(o => h("option", { value: o.id, text: o.label, disabled: !o.ok, selected: o.id === S.site })));
  }

  // ---------- rendering ----------
  function renderTab() {
    const box = $("views");
    const top = $("top-site");
    if (top && top.value !== S.site) top.value = S.site;
    let nodes;
    try {
      nodes = VIEWS[S.tab]();
    } catch (err) {
      // Show the failure in the panel instead of a blank page, so it can be reported.
      nodes = [h("div", { class: "caution", role: "alert" }, "Erro ao montar esta aba: " + (err && err.message ? err.message : err))];
      if (window.console) console.error(err);
    }
    box.replaceChildren(...nodes.filter(Boolean));
    document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === S.tab ? "true" : "false"));
  }
  function selectTab(name) {
    S.tab = name;
    if (name !== "geometria" && S.playing) { clearInterval(S.playing); S.playing = null; }
    renderTab();
  }

  const TAB_NAMES = ["visao", "entrada","geometria", "horizonte", "janelas", "energia", "vida", "replan", "visual", "sens", "historico", "lanc", "status"];
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
    const fab = document.getElementById("fab");
    if (fab) fab.addEventListener("click", calculate);
    const top = document.getElementById("top-site");
    if (top) {
      rebuildTop();
      top.addEventListener("change", e => { if (!e.target.selectedOptions[0].disabled) { S.site = e.target.value; S.api = null; renderAlarm(); renderTab(); } });
    }
    renderAlarm();
    renderTab();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
