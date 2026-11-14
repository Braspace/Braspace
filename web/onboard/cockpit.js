// Cockpit front end for the educational onboard simulator.
// Flow: form (ENTRADA) -> synthetic track (model.js) -> validated request (request.js)
//       -> POST /api/onboard/evaluate (energy and risks) -> panels.
// All text from the API is inserted with textContent. Nothing is parsed as HTML.
(function () {
  "use strict";

  const M = OnboardModel, R = OnboardRequest, F = OnboardFeatures, L = OnboardLive;
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
  // Where the numbers come from: the API series (POST /api/compare, include_series) when it answered,
  // otherwise the browser model, which is then sealed "SYNTHETIC · browser model" on each value.
  function scenario() {
    ensureLive();
    const life = M.lifeSupport(S.durationH);
    const live = liveNow();
    if (live) {
      const stepMin = Math.round((live.stepH || 1) * 60);
      const t0 = Date.parse(live.points[0].epoch_utc);
      const tr = live.points.map((p, i) => ({ i, ms: Date.parse(p.epoch_utc), tH: Date.parse(p.epoch_utc) / 3600e3, src: "api",
        sun_visible: p.sun_visible, earth_visible: p.earth_visible, sun_margin: p.sun_margin_deg, earth_margin: p.earth_margin_deg }));
      tr.stepMin = stepMin; tr.t0 = t0;
      return { tr, sum: L.summaryFromMetrics(live.metrics), life, viol: M.violations(L.summaryFromMetrics(live.metrics), null), src: "api", live };
    }
    const tr = L.stamp(track(0), startMs(), S.stepMin);
    const sum = M.summary(tr, S.stepMin);
    return { tr, sum, life, viol: M.violations(sum, null), src: "local", live: null };
  }
  function liveNow() {
    const k = seriesKey();
    return S.series && S.series.key === k && S.series.points ? { points: S.series.points, metrics: S.series.metrics, science_status: S.series.science_status, engine_science_status: S.series.engine_science_status, stepH: S.series.stepH } : null;
  }
  // A small seal glued to the value it describes.
  function seal(src, info) { return h("span", { class: "tag " + (src === "api" ? "SIM" : src === "nosource" ? "PARC" : "SINT"), text: L.seal(src, info) }); }
  function sealOf(sc) { return sc.src === "api" ? seal("api", sc.live) : seal("local"); }

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
      const res = await OnboardApi.evaluate(req.body);
      if (res.status === 0) throw new Error(res.error);
      if (!res.ok) { S.apiError = ["API respondeu " + res.status + ": " + res.error]; S.api = null; setLamp("bad", "API ERRO"); }
      else { S.api = res.data; S.apiError = null; setLamp("ok", "API OK"); }
    } catch (err) {
      S.api = null; S.apiError = ["Sem conexão com a API (" + err.message + "). Confira BRASPACE_API_BASE (config.js) ou suba dev-server.py e a API Go."];
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
      ...viol.map(v => ({ sev: "HIGH", text: v.text, src: scenario().src === "api" ? "API · " + (scenario().live.science_status || "?") : L.SEAL_LOCAL })),
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
          h("label", {}, "Lugar sintético", h("select", { id: "site", onchange: e => { S.site = e.target.value; S.api = null; renderAlarm(); renderTab(); } }, sites)),
          h("label", {}, "Data e hora de pouso (UTC)", h("input", { type: "datetime-local", value: S.startLocal, onchange: e => { S.startLocal = e.target.value; S.api = null; renderAlarm(); renderTab(); } })),
          h("label", {}, "Duração (h, até 720)", h("input", { type: "number", min: "1", max: "720", value: S.durationH, onchange: e => { S.durationH = Number(e.target.value); S.api = null; renderAlarm(); renderTab(); } })),
          h("label", {}, "Passo (min, 1 a 360)", h("input", { type: "number", min: "1", max: "360", value: S.stepMin, onchange: e => { S.stepMin = Number(e.target.value); S.api = null; renderAlarm(); renderTab(); } }))),
        h("div", { class: "row", style: "margin-top:12px" },
          h("div", { class: "row" },
            h("button", { type: "button", "aria-pressed": S.audience === "technical", onclick: () => { S.audience = "technical"; renderTab(); } }, "TÉCNICO"),
            h("button", { type: "button", "aria-pressed": S.audience === "educational", onclick: () => { S.audience = "educational"; renderTab(); } }, "EDUCATIVO")),
          h("button", { type: "button", id: "calc", class: "go", onclick: calculate }, "CALCULAR")),
        h("p", { class: "note", text: "TÉCNICO mostra valores e premissas. EDUCATIVO acrescenta explicações em cada painel." }),
        h("p", { class: "note", text: "CALCULAR envia o cenário à API para energia e riscos. Os demais painéis usam o modelo sintético do navegador." }),
        edu("Modo educativo: o lugar define o horizonte; a data define onde Sol e Terra estão; a energia depende do que o sol entrega e do que a carga consome.")),
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
    const tr = timeline();
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
            h("dt", { text: "SOL azimute" }), h("dd", { text: f1(cur.sunAz) + "°" }, " ", angSeal(cur)),
            h("dt", { text: "SOL elevação" }), h("dd", { text: f1(cur.sunEl, 2) + "°" }, " ", angSeal(cur)),
            h("dt", { text: "SOL acima do horizonte" }), h("dd", { text: cur.sun_visible ? "SIM" : "NÃO" }, " ", visSeal(cur))),
          h("dl", { class: "readout" },
            h("dt", { text: "TERRA azimute" }), h("dd", { text: f1(cur.earthAz) + "°" }, " ", angSeal(cur)),
            h("dt", { text: "TERRA elevação" }), h("dd", { text: f1(cur.earthEl, 2) + "°" }, " ", angSeal(cur)),
            h("dt", { text: "TERRA visível" }), h("dd", { text: cur.earth_visible ? "SIM" : "NÃO" }, " ", visSeal(cur)))),
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
  function horSeal() { const k = skyNow(); return k && k.horizon ? seal("api", { science_status: k.science_status }) : seal("local"); }
  function angSeal(cur) { return cur.angles === "api" ? seal("api", { science_status: S.sky && S.sky.data && S.sky.data.science_status }) : seal("local"); }
  function visSeal(cur) { return cur.src === "api" ? seal("api", liveNow()) : seal("local"); }
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
      seal(fromApi ? "api" : "local", liveNow()),
      fromApi && cur.angles === "local" ? h("span", { class: "tag SINT", text: "az/el: " + L.SEAL_LOCAL }) : null);
  }

  // ---------- timeline: API series when available, local model otherwise ----------
  // The API series (GET via POST /api/compare with include_series) gives the visibility flags and
  // margins that the server computed. Azimuth and elevation still come from the local model at the
  // same epoch, and the panel says so.
  S.series = null;      // { key, points, metrics, science_status } from /api/compare
  S.loadingKey = null; S.delay = null; S.sky = null; S.skyAvail = null;
  function seriesKey() { return S.site + "|" + S.startLocal + "|" + S.durationH; }
  function timeline() {
    ensureLive();
    const live = liveNow(), sky = skyNow();
    if (live) {
      const skyBy = sky ? new Map(sky.samples.map(x => [x.epoch_utc, x])) : null;
      const site = M.SITES[S.site] || { rough: 0 };
      return live.points.map((p, i) => {
        const ms = Date.parse(p.epoch_utc), b = M.bodiesAt(ms / 3600e3), sk = skyBy && skyBy.get(p.epoch_utc);
        if (sk) return { i, ms, src: "api", angles: "api", sunAz: sk.sun.azimuth_deg, sunEl: sk.sun.elevation_deg, earthAz: sk.earth.azimuth_deg, earthEl: sk.earth.elevation_deg,
          sun_visible: p.sun_visible, earth_visible: p.earth_visible, sun_margin: p.sun_margin_deg, earth_margin: p.earth_margin_deg };
        // flags and margins from the API; azimuth/elevation have no API source yet => browser model, sealed as such
        return { i, ms, src: "api", angles: "local", sunAz: b.sunAz, sunEl: M.horizonAt(b.sunAz, site) + p.sun_margin_deg, earthAz: b.earthAz, earthEl: M.horizonAt(b.earthAz, site) + p.earth_margin_deg,
          sun_visible: p.sun_visible, earth_visible: p.earth_visible, sun_margin: p.sun_margin_deg, earth_margin: p.earth_margin_deg };
      });
    }
    return track(0).map((s, i) => ({ ...s, i, ms: startMs() + i * S.stepMin * 60e3, src: "local", angles: "local" }));
  }
  function stepOf(tr) {
    return L.stepOf(tr, S.stepMin);
  }
  async function loadSeries(key) {
    const r = await OnboardApi.compare({ site_ids: [S.site], start_utc: iso(startMs()), duration_hours: S.durationH, include_series: true });
    if (key !== seriesKey()) { S.loadingKey = null; return; }   // the user changed the scenario meanwhile
    const res = r.ok && r.data && r.data.results ? r.data.results[0] : null;
    const pts = res && res.data_status === "AVAILABLE" && res.evaluation && res.evaluation.series ? res.evaluation.series : null;
    const lv = L.liveFromCompare(r.ok ? r.data : null);
    S.series = { key, points: pts, status: res ? res.data_status : "ERRO", metrics: lv ? lv.metrics : null,
      science_status: res ? res.science_status : null, engine_science_status: res ? res.engine_science_status : null, stepH: lv ? lv.stepH : null,
      reachable: r.status !== 0, httpStatus: r.status };
    if (!lv) S.series.points = null;
    S.loadingKey = null;
    renderBadges(); renderAlarm(); renderTab();
  }
  function ensureLive() {
    const key = seriesKey();
    if (!(S.series && S.series.key === key) && S.loadingKey !== key) { S.loadingKey = key; loadSeries(key); }
    if (!(S.delay && S.delay.key === key) && S.loadingDelay !== key) { S.loadingDelay = key; loadDelay(key); }
    if (S.skyAvail !== false && !(S.sky && S.sky.key === key) && S.loadingSky !== key) { S.loadingSky = key; loadSky(key); }
  }
  async function loadDelay(key) {
    const r = await OnboardApi.scenarioDelay({ site_id: S.site, start_utc: iso(startMs()), duration_hours: S.durationH, delays_hours: REPLAN_DELAYS.filter(d => d > 0),
      constraints: { max_continuous_dark_hours: M.LIMITS.darkH, min_earth_fraction: 0.5 }, include_nearby: false });
    if (key !== seriesKey()) { S.loadingDelay = null; return; }
    S.delay = { key, ok: r.ok, rows: r.ok && r.data && r.data.options ? r.data.options.filter(o => o.data_status === "AVAILABLE").map(L.delayRow) : null, status: r.status, outcome: r.ok ? r.data.outcome : null };
    S.loadingDelay = null; renderTab();
  }
  // GET /api/sites/{id}/sky (PR 97). 404 on the route => not deployed: stop asking and use the local model.
  async function loadSky(key) {
    const hrs = Math.min(S.durationH, 1000);
    const r = await OnboardApi.sky(S.site, "start=" + encodeURIComponent(iso(startMs())) + "&hours=" + hrs);
    if (r.status === 404 && /404 page not found/.test(r.error || "")) S.skyAvail = false;   // route absent (not a per-site 404)
    if (key !== seriesKey()) { S.loadingSky = null; return; }
    S.sky = { key, data: L.skyFromResponse(r), status: r.status };
    S.loadingSky = null; renderTab();
  }
  function skyNow() { return S.sky && S.sky.key === seriesKey() && S.sky.data ? S.sky.data : null; }
  function hz(az) { const k = skyNow(); return k && k.horizon ? k.horizon(az) : M.horizonAt(az, M.SITES[S.site]); }

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
    if (S.t >= tr.length) S.t = 0;
    const cur = tr[S.t] || tr[0];
    const site = M.SITES[S.site];
    const W = 640, H = 260, L = 46, R = 16, T = 14, B = 34;
    // vertical scale fits the values in the window (display only), so no curve is cut off
    const vals = [];
    tr.forEach((s, i) => { if (i % Math.max(1, Math.ceil(tr.length / 240)) === 0) vals.push(s.sunEl, s.earthEl, hz(s.sunAz), hz(s.earthAz)); });
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
    for (let a = 0; a <= 360; a += 2) d += (a === 0 ? "M" : "L") + x(a).toFixed(1) + "," + y(hz(a)).toFixed(1) + " ";
    box.append(svg("path", { d: d + "L" + x(360) + "," + y(EMIN) + " L" + x(0) + "," + y(EMIN) + " Z", fill: "#263241", "fill-opacity": ".9", stroke: "#6f8b7c", "stroke-width": "1.5" }));

    // whole-window paths as dots (no lines: azimuth wraps at 0/360)
    const stride = Math.max(1, Math.ceil(tr.length / 240));
    tr.forEach((s, i) => {
      if (i % stride) return;
      box.append(svg("circle", { cx: x(s.sunAz), cy: y(s.sunEl), r: 1.6, fill: "#ffb020", "fill-opacity": ".35" }));
      box.append(svg("circle", { cx: x(s.earthAz), cy: y(s.earthEl), r: 1.6, fill: "#5fd8ff", "fill-opacity": ".35" }));
    });

    // current instant: drop lines and markers
    const hs = hz(cur.sunAz), he = hz(cur.earthAz);
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
          h("span", {}, h("i", { style: "background:#1c3240" }), skyNow() ? "horizonte da API (/api/sites/{id}/sky)" : "horizonte sintético (modelo do navegador)"),
          h("span", {}, "pontos claros: trajetória no intervalo")),
        edu("Acima da área cinza, o Sol ou a Terra estão visíveis. Abaixo, o relevo esconde o astro. A linha tracejada mostra a altura do horizonte naquele azimute.")),
      h("section", { class: "panel" },
        h("h2", { text: "Neste instante" }),
        h("dl", { class: "readout" },
          h("dt", { text: "Sol · elevação" }), h("dd", { text: f1(cur.sunEl, 2) + "°" }, " ", angSeal(cur)),
          h("dt", { text: "Sol · horizonte neste azimute" }), h("dd", { text: f1(hs, 2) + "°" }, " ", horSeal()),
          h("dt", { text: "Sol · margem" }), h("dd", { class: sunMargin > 0 ? "" : "fuelout", text: (sunMargin >= 0 ? "+" : "") + f1(sunMargin, 2) + "°" }),
          h("dt", { text: "Terra · elevação" }), h("dd", { text: f1(cur.earthEl, 2) + "°" }, " ", angSeal(cur)),
          h("dt", { text: "Terra · horizonte neste azimute" }), h("dd", { text: f1(he, 2) + "°" }, " ", horSeal()),
          h("dt", { text: "Terra · margem" }), h("dd", { class: earthMargin > 0 ? "" : "fuelout", text: (earthMargin >= 0 ? "+" : "") + f1(earthMargin, 2) + "°" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Pendências do horizonte" }),
        h("ul", { class: "note" },
          ...[["3.2", "BLOQ", "leitura do DEM LOLA"], ["3.3", "PEND", "horizonte por raio"], ["3.4", "PEND", "distância máxima documentada"], ["3.5", "PEND", "pixels interpolados"], ["3.6", "PEND", "declive e crateras"]]
            .map(([id, st, t]) => h("li", {}, id + " ", tag(st), " " + t))),
        h("p", { class: "note", text: skyNow() ? "Horizonte guardado no servidor para este lugar; confira science_status no selo." : "Sem /api/sites/{id}/sky para este lugar: horizonte sintético (senoide com rugosidade). Não é relevo lunar. A escala vertical se ajusta aos valores da janela." }))
    ];
  };

  VIEWS.janelas = () => {
    const sc = scenario();
    const { tr, sum } = sc;
    
    const windows = [];
    let start = null;
    tr.forEach((s, i) => {
      if (s.earth_visible && start === null) start = i;
      if (!s.earth_visible && start !== null) { windows.push([start, i - 1]); start = null; }
    });
    if (start !== null) windows.push([start, tr.length - 1]);
    const at = i => fmt(tr[i].ms);
    const stp = stepOf(tr);
    return [
      h("section", { class: "panel" },
        h("h2", { text: "04 · Janelas de luz e de Terra" }),
        h("dl", { class: "readout" },
          h("dt", { text: "horas com luz" }), h("dd", { text: f1(sum.sunlitH) + " h" }, " ", sealOf(sc)),
          h("dt", { text: "maior escuridão" }), h("dd", { text: f1(sum.darkH) + " h" }, " ", sealOf(sc)),
          h("dt", { text: "horas com Terra visível" }), h("dd", { text: f1(sum.earthH) + " h" }, " ", sealOf(sc)),
          h("dt", { text: "maior bloqueio da Terra" }), h("dd", { text: f1(sum.blockH) + " h" }, " ", sealOf(sc)))),
      h("section", { class: "panel" },
        h("h2", { text: "Janelas de Terra visível (4.7)" }),
        windows.length === 0
          ? h("p", { class: "note", text: "Nenhuma janela de Terra visível no intervalo." })
          : h("div", { class: "scroll" }, h("table", { class: "table" },
              h("thead", {}, h("tr", {}, h("th", { text: "início" }), h("th", { text: "fim" }), h("th", { class: "n", text: "horas" }))),
              h("tbody", {}, windows.map(([a, b]) => h("tr", {}, h("td", { text: at(a) }), h("td", { text: at(b) }), h("td", { class: "n", text: f1((b - a + 1) * stp / 60) })))))),
        h("p", { class: "note", text: "Visibilidade geométrica. Não garante enlace de rádio. Orçamento de RF não modelado." })),
      nextTransitionsPanel(),
      h("section", { class: "panel span2" },
        h("h2", { text: "Transições (4.5) · instante por amostra" }),
        h("p", { class: "note", text: "O instante é o da primeira amostra que mudou. Bisseção (4.6) ainda pendente." }),
        transitionsTable(tr))
    ];
  };
  // next_transitions from GET /api/sites/{id}/sky: time to the next Sun and Earth change, with its resolution.
  function nextTransitionsPanel() {
    const sky = skyNow();
    const rows = sky ? L.transitionRows(sky.next_transitions) : null;
    return h("section", { class: "panel span2", id: "next-transitions" },
      h("h2", { text: "Próxima transição (API)" }),
      rows
        ? h("dl", { class: "readout" }, rows.flatMap(r => [h("dt", { text: r.label }), h("dd", { text: r.text }, " ", seal("api", { science_status: sky.science_status }))]))
        : h("p", { class: "note", text: "Sem next_transitions: a API não respondeu /api/sites/{id}/sky para este lugar e período (ou a rota não existe nesta API). Não há valor do navegador no lugar dele." }));
  }
  function transitionsTable(tr) {
    const rows = [];
    M.transitions(tr, "sun_visible", stepOf(tr)).forEach(x => rows.push(["Luz", x.to ? "escuro → luz" : "luz → escuro", x.index]));
    M.transitions(tr, "earth_visible", stepOf(tr)).forEach(x => rows.push(["Terra", x.to ? "bloqueada → visível" : "visível → bloqueada", x.index]));
    rows.sort((a, b) => a[2] - b[2]);
    if (!rows.length) return h("p", { class: "dim", text: "Sem transições no intervalo." });
    return h("div", { class: "scroll" }, h("table", { class: "table" },
      h("thead", {}, h("tr", {}, h("th", { text: "tipo" }), h("th", { text: "mudança" }), h("th", { text: "instante (UTC)" }))),
      h("tbody", {}, rows.slice(0, 200).map(r => h("tr", {}, h("td", { text: r[0] }), h("td", { text: r[1] }), h("td", { text: fmt(tr[r[2]].ms) })))),
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
        h("h2", { text: "06 · Propelente (exemplo, sem fonte)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "restante (kg)" }), h("dd", { text: life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg) : "—" }),
          h("dt", { text: "reserva mínima (kg)" }), h("dd", { text: "150.0" }),
          h("dt", { text: "margem (kg)" }), h("dd", { text: "—" })),
        h("div", { class: "bar", style: "margin-top:8px" }, h("span", { style: "width:" + fuelPct + "%" })),
        h("div", { style: "margin-top:8px" }, seal("nosource"), " ", tag("ESQ"), " ", h("span", { class: "dim", text: "a API não tem combustível · escopo não decidido (#7)" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Alimentação (protótipo · valor fixo de exemplo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "tripulação" }), h("dd", { text: life.people + " pessoas" }),
          h("dt", { text: "estoque restante (kg)" }), h("dd", { text: life.foodLeftKg > 0 ? f1(life.foodLeftKg) : "—" }),
          h("dt", { text: "racionamento" }), h("dd", { text: life.foodLeftKg > 100 ? "NORMAL" : "REDUZIDO" })),
        h("div", { style: "margin-top:8px" }, seal("nosource"), " ", h("span", { class: "dim", text: "0,62 kg/pessoa/dia · sem fonte (a API só calcula com taxas e rate_source informados)" }))),
      h("section", { class: "panel" },
        h("h2", { text: "Pressurização e O2 (protótipo · valor fixo de exemplo)" }),
        h("dl", { class: "readout" },
          h("dt", { text: "pressão da cabine (kPa)" }), h("dd", { text: f1(life.cabinKpa) + " · faixa 95–105" }),
          h("dt", { text: "pressão parcial O2 (kPa)" }), h("dd", { text: f1(life.o2PartialKpa) + " · mín. 19" }),
          h("dt", { text: "estoque O2 (kg)" }), h("dd", { text: life.o2StockKg > 0 ? f1(life.o2StockKg) + " kg" : "—" })),
        h("div", { style: "margin-top:8px" }, seal("nosource"), " ", h("span", { class: "dim", text: "valores fixos · não usar para segurança" }))),
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
      const v = M.violations(sum, null);
      const o = opt(d);
      if (o) {
        if (o.metrics.minimum_charge_wh < S.power.reserve_wh) v.push({ code: "BATT", text: "bateria abaixo da reserva" });
        if (o.risks.some(r => r.category === "ENERGY_LOSS")) v.push({ code: "ENERGY_LOSS", text: "perda de energia" });
      }
      return { d, sum, v, o, verdict: M.verdict(v, undefined) };
    });

    const dateRows = DATE_OFFSETS_DAYS.map(off => {
      const saved = S.startLocal;
      const ms = startMs() + off * 86400e3;
      const tr = M.track({ siteId: S.site, startMs: ms, stepMin: S.stepMin, count: count(), delayH: 0 });
      const sum = M.summary(tr, S.stepMin);
      return { off, ms, sum, verdict: M.verdict(M.violations(sum, null), undefined) };
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
        h("div", {}, seal("local")),
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
    const sc1 = scenario();
    const { sum } = sc1;
    const opt = apiOption(0);
    const record = {
      site: M.SITES[S.site].name, start_utc: iso(startMs()), duration_h: S.durationH, step_min: S.stepMin,
      sunlit_h: sum.sunlitH, dark_h: sum.darkH, earth_visible_h: sum.earthH, earth_blocked_h: sum.blockH,
      battery_min_wh: opt ? opt.metrics.minimum_charge_wh : null, api_status: opt ? opt.simulation_status : "NAO_CALCULADO",
      synthetic: sc1.src !== "api", source: sc1.src === "api" ? "api:" + (sc1.live.science_status || "?") : "browser-model SYNTHETIC"
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
  function donutCard(sum, sealNode) {
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
        h("span", {}, h("i", { style: "background:#d9e0e8" }), "escuro · " + f1(sum.durationH - sum.sunlitH, 0) + " h")),
      sealNode ? h("div", { style: "text-align:center;margin-top:6px" }, sealNode) : null);
  }

  function dailyBarCard(tr, stepMin, sealNode) {
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
      h("p", { class: "note", text: "Cada coluna é um dia do cenário (24 h)." }), sealNode ? h("div", {}, sealNode) : null);
  }

  function polarCard() {
    return h("section", { class: "panel" },
      h("h2", {}, "Lugares no polo sul", h("em", {}, "sintéticos")),
      polarMap(320),
      h("div", {}, seal("local")),
      h("p", { class: "note", text: "Centro = polo sul. Anéis = distância do polo. Sem escala real." }));
  }

  // Delay table: rows from POST /api/scenarios/delay when it answered; browser model (sealed) otherwise.
  function delayRows() {
    const key = seriesKey();
    if (S.delay && S.delay.key === key && S.delay.rows && S.delay.rows.length) {
      return { src: "api", status: S.delay.rows[0].science_status, rows: S.delay.rows.map(r => ({ d: r.delay_hours, v: r.admissible ? "VIAVEL" : "NAO_VIAVEL", darkH: r.darkH, blockH: r.blockH, why: r.breached, cons: r.consumables })) };
    }
    return { src: "local", rows: REPLAN_DELAYS.map(d => {
      const sum = M.summary(track(d), S.stepMin);
      return { d, v: M.verdict(M.violations(sum, null), undefined), darkH: sum.darkH, blockH: sum.blockH, why: M.violations(sum, null).map(x => x.text) };
    }) };
  }
  function verdictCard() {
    const dr = delayRows();
    const rows = dr.rows.map(r => h("tr", {}, h("td", { text: r.d ? "+" + r.d + " h" : "sem atraso" }), h("td", {}, verdictTag(r.v)), h("td", { class: "n", text: f1(r.darkH, 0) + " h" }), h("td", { class: "n", text: f1(r.blockH, 0) + " h" })));
    return h("section", { class: "panel" },
      h("h2", {}, "Viabilidade por atraso", h("em", {}, dr.src === "api" ? "/api/scenarios/delay" : "modelo")),
      h("div", { class: "scroll" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", { text: "atraso" }), h("th", { text: "resultado" }), h("th", { class: "n", text: "escuro" }), h("th", { class: "n", text: "Terra bloqueada" }))),
        h("tbody", {}, rows))),
      h("div", {}, dr.src === "api" ? seal("api", { science_status: dr.status }) : seal("local")),
      h("p", { class: "note", text: "Limites declarados no pedido (escuridão ≤ " + M.LIMITS.darkH + " h, Terra ≥ 50%), não requisitos de missão." }));
  }

  VIEWS.visao = () => {
    const sc = scenario();
    const { tr, sum, life } = sc;
    const SL = () => sealOf(sc);
    const opt = apiOption(0);
    const kpi = (label, value, unit, delta, cls, sealNode) => h("section", { class: "panel kpi" },
      h("div", { class: "label", text: label }),
      h("div", { class: "value" }, value, h("small", { text: unit })),
      h("div", { class: "delta " + (cls || "flat"), text: delta }),
      sealNode ? h("div", { class: "seal-row" }, sealNode) : null);
    const apiOpt = opt ? seal("api", { science_status: S.api.science_status }) : null;
    return [
      h("div", { class: "title span2" },
        h("div", {}, h("h1", { text: "Visão geral da missão" }),
          h("p", { text: M.SITES[S.site].name + " · início " + fmt(startMs()) + " · " + S.durationH + " h" }), h("p", { class: "dim" }, sealOf(sc), " ", sc.src === "api" ? h("span", { class: "dim", text: "engine: " + (sc.live.engine_science_status || "—") }) : null))),
      h("div", { class: "grid four span2" },
        kpi("Horas com luz", f1(sum.sunlitH, 0), " h", f1(sum.sunlitH / Math.max(1, sum.durationH) * 100, 0) + "% do período", "flat", SL()),
        kpi("Maior escuridão", f1(sum.darkH, 0), " h", sum.darkH > M.LIMITS.darkH ? "acima do limite de " + M.LIMITS.darkH + " h" : "dentro do limite", sum.darkH > M.LIMITS.darkH ? "down" : "up", SL()),
        kpi("Terra visível", f1(sum.earthH, 0), " h", "maior bloqueio " + f1(sum.blockH, 0) + " h", sum.blockH > M.LIMITS.blockH ? "down" : "flat", SL()),
        kpi("Carga mínima", opt ? f1(opt.metrics.minimum_charge_wh, 0) : "—", opt ? " Wh" : "", opt ? opt.simulation_status : "clique em + para calcular", opt && opt.simulation_status === "CONSTRAINTS_MET" ? "up" : opt ? "down" : "flat", apiOpt)),
      h("div", { class: "grid two span2" },
        donutCard(sum, sealOf(sc)),
        h("section", { class: "panel" },
          h("h2", {}, "Energia de propelente (exemplo)", h("em", {}, "sem fonte")),
          h("dl", { class: "readout" },
            h("dt", {}, "propelente restante"), h("dd", { text: life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg, 0) + " kg" : "—" }),
            h("dt", {}, "alimentos"), h("dd", { text: life.foodLeftKg > 0 ? f1(life.foodLeftKg, 0) + " kg" : "—" }),
            h("dt", {}, "O2 em estoque"), h("dd", { text: life.o2StockKg > 0 ? f1(life.o2StockKg, 0) + " kg" : "—" })),
          h("div", { style: "margin-top:8px" }, seal("nosource")),
          h("p", { class: "note", text: "A API não tem combustível. Constantes do protótipo; não geram alarme nem veredito. Não usar para decisão de segurança." }))),
      dailyBarCard(tr, stepOf(tr), sealOf(sc)),
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
    const sc0 = scenario();
    const { sum } = sc0;
    const opt = apiOption(0);
    const sunlitWh = S.power.solar_generation_w * sum.sunlitH;
    const loadWh = S.power.load_w * sum.durationH;
    const balance = sunlitWh - loadWh;
    const cards = h("div", { class: "grid four span2" },
      h("section", { class: "panel kpi" }, h("div", { class: "label", text: "Horas com luz" }),
        h("div", { class: "value" }, f1(sum.sunlitH, 0), h("small", { text: " h" })),
        h("div", { class: "delta flat", text: "de " + f1(sum.durationH, 0) + " h do cenário" }), h("div", {}, sealOf(sc0))),
      h("section", { class: "panel kpi" }, h("div", { class: "label", text: "Carga mínima da bateria" }),
        h("div", { class: "value" }, opt ? f1(opt.metrics.minimum_charge_wh, 0) : "—", h("small", { text: opt ? " Wh" : "" })),
        h("div", { class: "delta flat", text: opt ? "reserva: " + S.power.reserve_wh + " Wh" : "calcule com +" }), opt ? h("div", {}, seal("api", { science_status: S.api.science_status })) : null),
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
    const map = { ok: ["ok", "OK"], warn: ["warn", "ATENÇÃO"], bad: ["bad", "ESGOTADO"], none: ["info", "—"] };
    const [k, label] = map[status] || ["info", "—"];
    return h("section", { class: "panel" },
      h("div", { class: "row" }, h("h2", { style: "margin:0", text: title }), h("span", { class: "chip " + k, text: label })),
      h("div", { class: "value num", style: "font-size:30px;font-weight:600;margin-top:12px" }, valueText, h("small", { style: "font-size:14px;color:var(--muted);margin-left:4px", text: unit })),
      h("div", { class: "bar " + (status === "bad" ? "bad" : status === "warn" ? "warn" : ""), style: "margin-top:12px" },
        h("span", { style: "width:" + Math.max(0, Math.min(100, pct)) + "%" })),
      h("p", { class: "note", text: detail }),
      illustrative ? h("div", { style: "margin-top:8px" }, seal("nosource")) : null);
  }

  VIEWS.vida = () => {
    const { life } = scenario();
    // No source for fuel: no status colour and no alarm, just the sealed example value.
    const fuelStatus = "none";
    const fuelDetail = "A API não tem combustível. Constante de exemplo do protótipo.";
    const foodStatus = life.foodLeftKg <= 0 ? "none" : life.foodLeftKg < 100 ? "warn" : "ok";
    const o2Status = life.o2StockKg <= 0 ? "none" : life.o2StockKg < 20 ? "warn" : "ok";
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
        h("dt", {}, "estoque restante"), h("dd", { text: life.o2StockKg > 0 ? f1(life.o2StockKg) + " kg" : "—" })),
      h("p", { class: "note", text: "Estoque de O2 consumido por " + life.people + " pessoas ao longo do período." }),
      h("div", { style: "margin-top:8px" }, seal("local"), " ", h("span", { class: "chip " + (o2Status === "none" ? "info" : o2Status), text: o2Status === "none" ? "—" : o2Status === "warn" ? "ATENÇÃO" : "OK" })));

    return [
      h("div", { class: "span2 caution", role: "note" }, "Estes valores são ilustrativos, sem fonte nem validação. Não devem ser lidos como condição de vida. Suporte de vida ainda não está na lista de requisitos do desafio (#7)."),
      h("div", { class: "grid three span2" },
        gaugeCard("Propelente (exemplo)", life.fuelRemainingKg > 0 ? f1(life.fuelRemainingKg, 0) : "—", "kg", life.fuelRemainingKg / 450 * 100, fuelStatus, fuelDetail, true),
        gaugeCard("Alimentação", life.foodLeftKg > 0 ? f1(life.foodLeftKg, 0) : "—", "kg", life.foodLeftKg / 500 * 100, foodStatus,
          life.people + " pessoas · 0,62 kg por pessoa e dia · racionamento " + (life.foodLeftKg > 100 ? "normal" : "reduzido") + ".", true),
        gaugeCard("Estoque de O2", life.o2StockKg > 0 ? f1(life.o2StockKg, 0) : "—", "kg", life.o2StockKg / 64 * 100, o2Status,
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
      h("span", {}, "a linha do centro é a base"), seal("local"));

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
    scenario();   // triggers the live loads
    const dr = delayRows();
    const options = REPLAN_DELAYS.map(d => {
      const apiRow = dr.src === "api" ? dr.rows.find(r => r.d === d) : null;
      const tr = apiRow ? [] : track(d);
      const sum = apiRow ? { darkH: apiRow.darkH, blockH: apiRow.blockH } : M.summary(tr, S.stepMin);
      const v = apiRow ? apiRow.why.map(t => ({ text: t })) : M.violations(sum, null);
      const o = apiOption(d);
      if (o) {
        if (o.metrics.minimum_charge_wh < S.power.reserve_wh) v.push({ code: "BATT", text: "bateria abaixo da reserva" });
        if (o.risks.some(r => r.category === "ENERGY_LOSS")) v.push({ code: "ENERGY_LOSS", text: "perda de energia" });
      }
      return { d, sum, v, o, apiRow, verdict: apiRow ? (apiRow.v) : M.verdict(v, undefined) };
    });
    const viable = options.filter(x => x.verdict !== "NAO_VIAVEL");
    const best = options.find(x => x.verdict === "VIAVEL") || options.find(x => x.verdict === "MARGEM_REDUZIDA");

    // Summary: one sentence the reader can act on.
    const headline = best
      ? (best.d ? "Atrasar para " + delayName(best.d) + " passa nos limites declarados." : "O plano atual é viável neste cenário.")
      : "Nenhum atraso testado é viável. Veja o motivo em cada cartão.";
    const summary = h("section", { class: "panel span2" },
      h("div", { class: "row" },
        h("div", {}, h("h2", { style: "margin:0", text: "Replanejamento por atraso" }), h("p", { class: "dim", style: "margin:6px 0 0", text: headline })),
        h("span", { class: "chip " + (best ? (best.verdict === "VIAVEL" ? "ok" : "warn") : "bad"), text: viable.length + " de " + options.length + " opções viáveis" })));

    // One card per delay: verdict, the two main numbers and the reasons.
    const cards = h("div", { class: "grid four span2" }, options.map(x => h("section", { class: "panel kpi" },
      h("div", { class: "row" }, h("span", { class: "label", text: delayName(x.d) }), verdictChip(x.verdict)),
      h("div", { class: "value", style: "margin-top:10px" }, f1(x.sum.darkH, 0), h("small", { text: " h escuro" })),
      h("div", {}, x.apiRow ? seal("api", { science_status: dr.status }) : seal("local")),
      h("div", { class: "delta " + (x.sum.darkH > M.LIMITS.darkH ? "down" : "flat"), text: "limite " + M.LIMITS.darkH + " h · Terra bloqueada " + f1(x.sum.blockH, 0) + " h" }),
      h("div", { class: "dim", style: "margin-top:8px" }, x.o ? "carga mínima " + f1(x.o.metrics.minimum_charge_wh, 0) + " Wh" : "carga mínima: — (calcule com +)"),
      x.o ? h("div", {}, seal("api", { science_status: S.api.science_status })) : null,
      x.v.length
        ? h("ul", { class: "plain", style: "margin-top:10px;font-size:12px" }, x.v.map(r => h("li", { text: r.text })))
        : h("p", { class: "dim", style: "margin-top:10px", text: "Nenhuma restrição violada." }))));

    // Date search: each day of the window as a coloured cell.
    const days = DATE_OFFSETS_DAYS.map(off => {
      const ms = startMs() + off * 86400e3;
      const tr = M.track({ siteId: S.site, startMs: ms, stepMin: S.stepMin, count: count(), delayH: 0 });
      const sum = M.summary(tr, S.stepMin);
      return { off, ms, sum, verdict: M.verdict(M.violations(sum, null), undefined) };
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
      h("div", {}, seal("local")),
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
      h("div", {}, seal("local")),
      h("p", { class: "note", text: "Sem fonte real por lugar: os três são sintéticos. Bateria só para o lugar atual." }));

    const explain = h("section", { class: "panel span2" },
      h("h2", {}, "Como o veredito é calculado"),
      h("div", { class: "edu" }, "Um atraso é inviável se a escuridão passa do limite, se a Terra fica bloqueada por tempo demais, se a bateria cai abaixo da reserva ou se o combustível fica abaixo da reserva. Os limites são premissas ilustrativas."),
      h("p", { class: "note", text: (dr.src === "api" ? "Escuridão e bloqueio vêm de /api/scenarios/delay (selo em cada cartão). Datas e lugares abaixo ainda são do modelo do navegador, com selo." : "API de atraso não respondeu: números do modelo do navegador, com selo.") }));

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
    // status 0 = no connection. Any other status means the API answered and refused: show its code and message.
    return h("div", { class: "caution", role: "alert" }, res.status === 0
      ? "API indisponível: " + (res.error || "sem conexão") + ". Suba a API Go (e o Rust engine, se o endpoint pedir) e o dev-server.py."
      : L.refusalText(res));
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
    const cap = S.compareMax || 3; // /api/compare: "site_ids must contain 1 to 3 sites" (api/mission.go); refined from the refusal text
    const sel = L.pickSites(S.compareSel, S.site, cap);
    const button = callButton("COMPARAR LUGARES (API)", async () => {
      const pick = L.pickSites(S.compareSel, S.site, cap);
      S.apiResults.compare = await OnboardApi.compare({ site_ids: pick, start_utc: iso(startMs()), duration_hours: S.durationH, include_series: false });
      const e = L.parseApiError(S.apiResults.compare);
      if (!S.apiResults.compare.ok && e.code === "INVALID_SITES") S.compareMax = L.limitFromMessage(e.message, "sites") || S.compareMax;
    });
    const catalog = (S.sitesApi || []).map(s => s.id);
    const picker = h("fieldset", { class: "compare-pick" }, h("legend", { text: "Lugares a comparar (a API aceita de 1 a " + cap + ")" }),
      catalog.map(id => {
        const cb = h("input", { type: "checkbox", value: id });
        cb.checked = sel.includes(id);
        cb.disabled = !cb.checked && sel.length >= cap;
        cb.addEventListener("change", () => {
          const cur = L.pickSites(S.compareSel, S.site, cap).filter(x => x !== id);
          S.compareSel = cb.checked ? cur.concat(id).slice(0, cap) : cur;
          renderTab();
        });
        return h("label", { style: "margin-right:12px;white-space:nowrap" }, cb, " " + id);
      }),
      h("p", { class: "note", id: "compare-note", text: "Enviando " + sel.length + " de " + catalog.length + " lugares: " + sel.join(", ") + ". Máximo " + cap + " por consulta; os demais ficam de fora." }));
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
    return apiPanelFrame("API · Comparação de lugares (/api/compare)", "Lugares sem série aparecem como NO_SERIES_DATA, sem números.", button, h("div", {}, picker, body));
  }

  function siteEvalPanel() {
    const r = S.apiResults.siteEval;
    const button = callButton("AVALIAR COM SÉRIE (API)", async () => {
      const body = {
        mission_id: "cockpit-" + S.site, start_utc: iso(startMs()), duration_hours: Math.min(S.durationH, S.onboardMax || S.durationH), // limit learned from the API refusal text
        candidates: [{ id: "planejado", site_id: S.site, delay_hours: 0 }, { id: "atraso-48h", site_id: S.site, delay_hours: 48 }],
        power: {
          battery_capacity_wh: S.power.battery_capacity_wh, initial_charge_wh: S.power.initial_charge_wh,
          reserve_wh: S.power.reserve_wh, solar_generation_w: S.power.solar_generation_w, load_w: S.power.load_w
        },
        max_comm_blackout_hours: S.power.max_comm_blackout_hours
      };
      let res = await OnboardApi.siteEvaluate(body);
      const e = L.parseApiError(res);
      const lim = !res.ok && e.code === "WINDOW_TOO_LONG" ? L.limitFromMessage(e.message, "samples") : null;
      if (lim && lim < body.duration_hours) {  // the API states its limit: retry once inside it and say so
        S.onboardMax = lim;
        body.duration_hours = lim;
        res = await OnboardApi.siteEvaluate(body);
        res.windowNote = "O pedido de " + S.durationH + " h passou do limite da API (" + lim + " amostras, WINDOW_TOO_LONG); a avaliação cobre só as primeiras " + lim + " h.";
      } else if (S.onboardMax && S.onboardMax < S.durationH && res.ok) {
        res.windowNote = "Limite da API: " + S.onboardMax + " h; a avaliação cobre só as primeiras " + S.onboardMax + " h de " + S.durationH + " h.";
      }
      S.apiResults.siteEval = res;
    });
    let body = h("p", { class: "dim", text: "Ainda não consultado. Só lugares com série ingerida (synthetic-demo-a e -b) são aceitos." });
    if (r && !r.ok) body = apiError(r);
    if (r && r.ok) {
      const c0 = (r.data.candidates || [])[0] || {};
      body = h("div", {}, r.windowNote ? h("p", { class: "caution", role: "status", id: "window-note", text: r.windowNote }) : null, h("dl", { class: "readout" },
        h("dt", { text: "decisão combinada" }), h("dd", { text: r.data.combined_decision || "—" }),
        h("dt", { text: "simulador de energia (estado)" }), h("dd", { text: r.data.onboard ? r.data.onboard.simulation_status : "—" }),
        h("dt", { text: "ciência do primeiro candidato" }), h("dd", { text: c0.science_status || "—" }),
        h("dt", { text: "riscos quebrados (primeiro candidato)" }), h("dd", { text: (c0.breached_risks || []).length ? String(c0.breached_risks.length) : "nenhum" })));
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

  // Header badges come from the API (/readyz, /v1/capabilities, /api/health, series science_status), not fixed text.
  S.badge = { apiUp: false, readyz: null, capabilities: null, seriesStatus: null };
  function renderBadges() {
    const box = $("badges");
    if (!box) return;
    S.badge.seriesStatus = S.series && S.series.science_status ? S.series.science_status : null;
    box.replaceChildren(...L.badges(S.badge).map(b => h("span", { class: "chip " + b.kind, text: b.text })));
  }
  async function loadHealth() {
    const [r, rz, cap] = await Promise.all([OnboardApi.health(), OnboardApi.readyz(), OnboardApi.capabilities()]);
    S.badge.apiUp = !!(r.ok || rz.ok || cap.ok || r.status === 503);
    S.badge.readyz = rz.ok ? rz.data : (rz.status === 503 ? { status: "not ready", science_status: rz.data && rz.data.science_status } : null);
    S.badge.capabilities = cap.ok ? cap.data : null;
    renderBadges();
    if (r.status === 503) { setLamp("warn", "API OK · ENGINE INDISPONÍVEL"); return; }
    if (!r.ok) { setLamp("bad", "API OFF"); return; }
    const eng = r.data && r.data.engine ? String(r.data.engine) : "desconhecido";
    setLamp(eng === "available" || eng === "ready" ? "ok" : "warn", "API OK · ENGINE " + eng.toUpperCase());
  }
  async function loadSites() {
    const r = await OnboardApi.sites();
    if (r.ok) S.sitesApi = (r.data.sites || []).map(s => ({ id: s.id, name: s.name, series: !!s.series }));
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
    renderBadges();
    loadHealth();
    loadSites();
    const fab = document.getElementById("fab");
    if (fab) fab.addEventListener("click", calculate);
    const top = document.getElementById("top-site");
    if (top) {
      top.replaceChildren(...Object.entries(M.SITES).map(([id, s]) => h("option", { value: id, text: id + " · " + s.name })));
      top.addEventListener("change", e => { S.site = e.target.value; S.api = null; renderAlarm(); renderTab(); });
    }
    renderAlarm();
    renderTab();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
