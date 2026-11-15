const DASH = "—";
export const I18N = {
    en: { skip: "Skip to mission overview", subtitle: "Mission Computer", menu: "Menu", g_mission: "Mission", g_resources: "Resources", g_analysis: "Analysis", g_data: "Data",
        n_overview: "Overview", n_input: "Input", n_geometry: "Geometry", n_horizon: "Horizon", n_windows: "Windows", n_energy: "Energy", n_life: "Life support", n_replan: "Replan", n_visual: "Visual", n_sens: "Sensitivity", n_log: "Log", n_launch: "Launches", n_status: "Status",
        nav_note: "Greyed items are not part of this shell yet.", side_foot: "Educational prototype. Not flight software.", site: "Site", loading: "Loading…", no_flight: "No flight recommendation", theme: "Theme",
        alarms: "Alarms", alarms_idle: "Run the mission calculation to evaluate alarms.", alarms_none: "No alarm returned by the model for these inputs.", alarms_n: "alarms", overview: "Mission overview",
        c_light: "Hours in sunlight", c_dark: "Longest darkness", c_earth: "Earth visible", c_charge: "Minimum battery charge", no_data: "No data", charge_hint: "Fill the inputs and calculate",
        donut: "Light across the mission", hours: "hours", lit: "in sunlight", lit_lbl: "sunlit", dark_lbl: "dark", resources: "Energy, battery, oxygen, food",
        r_min: "Minimum charge", r_final: "Final charge", r_unserved: "Unserved energy", r_mode: "End mode", r_o2: "Oxygen left at end", r_o2m: "Oxygen margin", r_food: "Food left at end", r_foodm: "Food margin",
        res_warn: "Values come from caller-declared assumptions. Do not use for safety decisions.", inputs: "Mission inputs", inputs_note: "Assumptions you declare. Empty means not provided.",
        f_window: "Window", f_start: "Start (UTC, ISO 8601)", f_dur: "Duration (hours)", f_blackout: "Max Earth blackout (hours)", f_power: "Power", f_cap: "Battery capacity (Wh)", f_init: "Initial charge (Wh)", f_res: "Reserve (Wh)", f_solar: "Solar generation (W)", f_load: "Load (W)",
        f_crew: "Crew (optional)", f_size: "Crew size", f_o2: "Oxygen stock (kg)", f_food: "Food stock (kg)", f_o2r: "Oxygen per person-day (kg)", f_foodr: "Food per person-day (kg)", f_reserve: "Reserve (hours)", f_source: "Rate source (citation, required with crew)", f_aboard: "Crew aboard during delay",
        calc: "Calculate", example: "Fill illustrative inputs", status: "API status and provenance", foot: "Synthetic or unverified inputs are labelled wherever they appear. No flight recommendation is made.",
        api_down: "API unreachable or returned an error. No values are shown.", no_series: "This site has no visibility series: no numbers are computed.", need_inputs: "Power inputs incomplete: battery and resource values are not calculated.",
        calculating: "Calculating…", done: "Done.", series: "Series", ready: "API", engine: "Engine", limit_over: "above limit of", model: "model", from: "source",
        step_status: "Status", sun_label: "sunlit fraction", comm_gap: "longest Earth gap", ctx_site: "site", kind: "kind", dataset: "terrain dataset", ephem: "ephemeris", generator: "generator", science: "science status", engine_sci: "engine status", decision: "combined decision",
        ill_hint: "Illustrative values, not mission data." },
    "pt-BR": { skip: "Pular para a visão geral", subtitle: "Computador de bordo", menu: "Menu", g_mission: "Missão", g_resources: "Recursos", g_analysis: "Análise", g_data: "Dados",
        n_overview: "Visão geral", n_input: "Entrada", n_geometry: "Geometria", n_horizon: "Horizonte", n_windows: "Janelas", n_energy: "Energia", n_life: "Vida", n_replan: "Replanejar", n_visual: "Visual", n_sens: "Sensibilidade", n_log: "Registro", n_launch: "Lançamentos", n_status: "Status",
        nav_note: "Itens em cinza ainda não fazem parte desta casca.", side_foot: "Protótipo educacional. Não é software de voo.", site: "Sítio", loading: "Carregando…", no_flight: "Sem recomendação de voo", theme: "Tema",
        alarms: "Alarmes", alarms_idle: "Rode o cálculo da missão para avaliar os alarmes.", alarms_none: "O modelo não devolveu alarme para estas entradas.", alarms_n: "alarmes", overview: "Visão geral da missão",
        c_light: "Horas com luz", c_dark: "Maior escuridão", c_earth: "Terra visível", c_charge: "Carga mínima da bateria", no_data: "Sem dados", charge_hint: "Preencha as entradas e calcule",
        donut: "Luz ao longo da missão", hours: "horas", lit: "com luz", lit_lbl: "com luz", dark_lbl: "escuro", resources: "Energia, bateria, oxigênio, comida",
        r_min: "Carga mínima", r_final: "Carga final", r_unserved: "Energia não atendida", r_mode: "Modo final", r_o2: "Oxigênio no fim", r_o2m: "Margem de oxigênio", r_food: "Comida no fim", r_foodm: "Margem de comida",
        res_warn: "Valores vêm de premissas declaradas por quem chama. Não usar para decisão de segurança.", inputs: "Entradas da missão", inputs_note: "Premissas que você declara. Vazio significa não informado.",
        f_window: "Janela", f_start: "Início (UTC, ISO 8601)", f_dur: "Duração (horas)", f_blackout: "Bloqueio máximo da Terra (horas)", f_power: "Energia", f_cap: "Capacidade da bateria (Wh)", f_init: "Carga inicial (Wh)", f_res: "Reserva (Wh)", f_solar: "Geração solar (W)", f_load: "Carga (W)",
        f_crew: "Tripulação (opcional)", f_size: "Tamanho da tripulação", f_o2: "Estoque de oxigênio (kg)", f_food: "Estoque de comida (kg)", f_o2r: "Oxigênio por pessoa-dia (kg)", f_foodr: "Comida por pessoa-dia (kg)", f_reserve: "Reserva (horas)", f_source: "Fonte das taxas (citação, obrigatória com tripulação)", f_aboard: "Tripulação a bordo durante o atraso",
        calc: "Calcular", example: "Preencher valores ilustrativos", status: "Status da API e procedência", foot: "Entradas sintéticas ou não verificadas são rotuladas onde aparecem. Nenhuma recomendação de voo é feita.",
        api_down: "API inacessível ou com erro. Nenhum valor é mostrado.", no_series: "Este sítio não tem série de visibilidade: nenhum número é calculado.", need_inputs: "Entradas de energia incompletas: bateria e recursos não são calculados.",
        calculating: "Calculando…", done: "Pronto.", series: "Série", ready: "API", engine: "Motor", limit_over: "acima do limite de", model: "modelo", from: "fonte",
        step_status: "Estado", sun_label: "fração com luz", comm_gap: "maior intervalo sem Terra", ctx_site: "sítio", kind: "tipo", dataset: "base de terreno", ephem: "efemérides", generator: "gerador", science: "estado científico", engine_sci: "estado do motor", decision: "decisão combinada",
        ill_hint: "Valores ilustrativos, não são dados de missão." }
};
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export function fmtNum(v, digits = 1) {
    if (!isNum(v))
        return DASH;
    const r = Math.round(v * 10 ** digits) / 10 ** digits;
    return String(r);
}
export function fmtWith(v, unit, digits = 1) { return isNum(v) ? fmtNum(v, digits) + "\u00a0" + unit : DASH; }
export function seriesBadge(site, compareResult) {
    if (compareResult && compareResult.data_status && compareResult.data_status !== "AVAILABLE")
        return { text: compareResult.data_status, tone: "warn" };
    const st = compareResult && compareResult.science_status || site && site.series && site.series.science_status;
    if (site && !site.series && !compareResult)
        return { text: "NO_SERIES_DATA", tone: "warn" };
    if (!st)
        return { text: DASH, tone: "neutral" };
    return { text: st, tone: st === "VALIDATED" ? "good" : "warn" };
}
export function readyBadge(ready) {
    if (!ready)
        return { text: "API " + DASH, tone: "bad" };
    const s = ready.status;
    if (typeof s !== "string")
        return { text: "API " + DASH, tone: "bad" };
    const sci = typeof ready.science_status === "string" ? " · " + ready.science_status : "";
    return { text: "readyz: " + s + sci, tone: s === "ready" ? "good" : "bad" };
}
export function capsBadge(caps) {
    if (!caps || typeof caps !== "object")
        return { text: "capabilities " + DASH, tone: "neutral" };
    const yn = (v) => typeof v === "boolean" ? (v ? "yes" : "no") : DASH;
    const text = "NAIF " + yn(caps.naif_spice_loaded) + " · LOLA " + yn(caps.nasa_lola_loaded) + " · validated " + yn(caps.scientifically_validated);
    return { text, tone: caps.scientifically_validated === true ? "good" : "warn", title: typeof caps.version === "string" ? caps.version : "" };
}
// ---- view model from API responses ------------------------------------------
export function viewFromCompare(cmp) {
    const out = { light: null, dark: null, earth: null, total: null, fraction: null, status: null, sci: null, sciEngine: null, provenance: null, limitations: [], gap: null, sunFraction: null, earthFraction: null };
    if (!cmp || !Array.isArray(cmp.results) || !cmp.results.length)
        return out;
    const r = cmp.results[0];
    out.status = r.data_status || null;
    out.sci = r.science_status || null;
    out.sciEngine = r.engine_science_status || null;
    out.provenance = r.provenance || null;
    out.limitations = Array.isArray(cmp.limitations) ? cmp.limitations : [];
    const m = r.evaluation && r.evaluation.metrics;
    if (r.data_status === "AVAILABLE" && m) {
        const total = isNum(m.sample_count) && isNum(m.step_hours) ? m.sample_count * m.step_hours : null;
        out.total = total;
        if (isNum(m.sun_visible_fraction) && total !== null) {
            out.light = m.sun_visible_fraction * total;
            out.fraction = m.sun_visible_fraction;
            out.dark = total - out.light;
        }
        if (isNum(m.earth_visible_fraction) && total !== null)
            out.earth = m.earth_visible_fraction * total;
        out.longestDark = isNum(m.longest_continuous_dark_hours) ? m.longest_continuous_dark_hours : null;
        out.gap = isNum(m.longest_continuous_comm_gap_hours) ? m.longest_continuous_comm_gap_hours : null;
    }
    return out;
}
export function viewFromOnboard(ob) {
    const out = { minCharge: null, finalCharge: null, unserved: null, endMode: null, o2: null, o2m: null, food: null, foodm: null, rateSource: null, sci: null, alarms: [], decision: null, consStatus: null };
    if (!ob || typeof ob !== "object")
        return out;
    const cand = Array.isArray(ob.candidates) && ob.candidates[0] || null;
    const opt = ob.onboard && Array.isArray(ob.onboard.options) && ob.onboard.options[0] || null;
    out.decision = ob.combined_decision && ob.combined_decision.status || null;
    if (opt) {
        const m = opt.metrics || {};
        out.minCharge = isNum(m.minimum_charge_wh) ? m.minimum_charge_wh : null;
        out.finalCharge = isNum(m.final_charge_wh) ? m.final_charge_wh : null;
        out.unserved = isNum(m.total_unserved_energy_wh) ? m.total_unserved_energy_wh : null;
        out.endMode = opt.end_mode || null;
        out.sci = ob.onboard.science_status || null;
        for (const k of Array.isArray(opt.risks) ? opt.risks : [])
            out.alarms.push({ severity: k.severity, category: k.category, measured: k.measured, allowed: k.allowed, unit: k.unit, text: k.explanation });
    }
    if (cand) {
        out.sciCand = cand.science_status || null;
        const c = cand.consumables;
        if (c) {
            out.rateSource = typeof c.rate_source === "string" && c.rate_source ? c.rate_source : null;
            out.consStatus = c.status || null;
            for (const it of Array.isArray(c.items) ? c.items : []) {
                if (it.resource === "oxygen") {
                    out.o2 = isNum(it.remaining_at_end_kg) ? it.remaining_at_end_kg : null;
                    out.o2m = isNum(it.margin_hours) ? it.margin_hours : null;
                }
                if (it.resource === "food") {
                    out.food = isNum(it.remaining_at_end_kg) ? it.remaining_at_end_kg : null;
                    out.foodm = isNum(it.margin_hours) ? it.margin_hours : null;
                }
            }
            for (const k of Array.isArray(c.risks) ? c.risks : [])
                out.alarms.push({ severity: k.severity, category: k.category, measured: k.measured, allowed: k.allowed, unit: k.unit, text: k.explanation });
        }
    }
    return out;
}
export function alarmLine(a) {
    const num = (v, u) => isNum(v) ? fmtNum(v, 1) + "\u00a0" + (u || "") : DASH;
    return "[" + (a.severity || DASH) + "] " + (a.category || DASH) + ": " + num(a.measured, a.unit) + " / " + num(a.allowed, a.unit);
}
export function buildBody(f) {
    // returns {error} or {compare, onboard|null}; empty inputs are never defaulted.
    const n = (s) => { const t = String(s == null ? "" : s).trim(); if (t === "")
        return null; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
    const start = String(f.start || "").trim(), dur = n(f.dur);
    if (!start || dur === null || !(dur > 0))
        return { error: "window" };
    const compare = { site_ids: [f.site], start_utc: start, duration_hours: dur, include_series: false };
    const p = { battery_capacity_wh: n(f.cap), initial_charge_wh: n(f.init), reserve_wh: n(f.res), solar_generation_w: n(f.solar), load_w: n(f.load) };
    const bl = n(f.blackout);
    const complete = Object.values(p).every(v => v !== null && !Number.isNaN(v)) && bl !== null && !Number.isNaN(bl);
    if (!complete)
        return { compare, onboard: null };
    const body = { mission_id: "mission-computer-shell", start_utc: start, duration_hours: dur, candidates: [{ id: "c1", site_id: f.site, delay_hours: 0 }], power: p, max_comm_blackout_hours: bl };
    const crew = { size: n(f.size), o2_stock_kg: n(f.o2), food_stock_kg: n(f.food), o2_kg_per_person_day: n(f.o2r), food_kg_per_person_day: n(f.foodr), reserve_hours: n(f.reserve) };
    if (Object.values(crew).every(v => v !== null && !Number.isNaN(v)) && String(f.source || "").trim()) {
        body.crew = { ...crew, aboard_during_delay: !!f.aboard, rate_source: String(f.source).trim() };
    }
    return { compare, onboard: body };
}
// ---- contrast (WCAG) helper, exported so the test measures the tokens -------
export function luminance(hex) {
    const c = hex.replace("#", "");
    const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
}
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); }
// ---- DOM wiring (browser only) ----------------------------------------------
async function getJSON(path, opts) {
    const r = await fetch(path, opts);
    let body = null;
    try {
        body = await r.json();
    }
    catch { }
    if (!r.ok) {
        const e = new Error(body && body.error || "HTTP " + r.status);
        e.code = body && body.code || String(r.status);
        throw e;
    }
    return body;
}
const post = (p, b) => getJSON(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
function init() {
    const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
    const state = { lang: "en", sites: [], site: null, compare: null, onboard: null, ready: null, caps: null, apiDown: false, calcError: null, cView: null, oView: null };
    const T = (k) => I18N[state.lang][k] || I18N.en[k] || k;
    const set = (el, txt) => { el.textContent = txt; };
    const badge = (id, b) => { const el = $(id); set(el, b.text); el.className = "badge tone-" + b.tone; if (b.title)
        el.title = b.title; };
    function applyLang() {
        document.documentElement.lang = state.lang;
        $$("[data-i18n]").forEach(el => {
            const k = el.dataset.i18n;
            if (el.tagName === "OPTION" && state.sites.length)
                return;
            if (el.id === "b-series" || el.id === "b-ready" || el.id === "b-caps")
                return;
            set(el, T(k));
        });
        $("#lang-btn").textContent = state.lang === "en" ? "PT-BR" : "EN";
        $("#lang-btn").setAttribute("aria-label", state.lang === "en" ? "Mudar para português (Brasil)" : "Switch to English");
        document.title = "BRASPACE " + T("subtitle");
        render();
    }
    function applyTheme(t) {
        if (t)
            document.documentElement.dataset.theme = t;
        else
            delete document.documentElement.dataset.theme;
        const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        $("#theme-btn").setAttribute("aria-pressed", String(dark));
        $("#theme-btn").textContent = T("theme") + ": " + (dark ? "dark" : "light");
    }
    function setMetric(key, text, note, src, unit) {
        const m = $(`[data-metric="${key}"]`);
        if (m)
            set(m, text);
        const n = $(`[data-note="${key}"]`);
        if (n && note !== undefined) {
            set(n, note);
            n.classList.toggle("bad", false);
        }
        const s = $(`[data-src="${key}"]`);
        if (s)
            set(s, src || "");
        const u = $(`[data-unit="${key}"]`);
        if (u)
            set(u, unit && text !== DASH ? " " + unit : "");
    }
    function render() {
        const c = state.cView, o = state.oView, site = state.site;
        const err = $("#api-error");
        err.hidden = !(state.apiDown || state.calcError);
        set(err, state.apiDown ? T("api_down") : (state.calcError || ""));
        // badges
        badge("#b-series", seriesBadge(site, state.compare && state.compare.results && state.compare.results[0]));
        badge("#b-ready", readyBadge(state.ready));
        badge("#b-caps", capsBadge(state.caps));
        const sv = $("#subtitle-line");
        const sr = state.compare && state.compare.request;
        set(sv, site ? [site.id, sr ? sr.start_utc : null, sr && isNum(sr.duration_hours) ? sr.duration_hours + " h" : null, c && c.sci ? c.sci : null].filter(Boolean).join(" · ") : DASH);
        // cards
        const srcOf = (sci, what) => sci ? "science_status: " + sci + " · " + what : what;
        if (c && c.light !== null) {
            setMetric("light", fmtNum(c.light, 0), Math.round(c.fraction * 100) + "%", srcOf(c.sci, "compare"), "h");
            setMetric("dark", fmtNum(c.longestDark, 0), c.longestDark === null ? T("no_data") : T("sun_label") + ": " + fmtNum(c.fraction * 100, 0) + "%", srcOf(c.sci, "compare"), "h");
            setMetric("earth", fmtNum(c.earth, 0), T("comm_gap") + ": " + fmtWith(c.gap, "h", 0), srcOf(c.sci, "compare"), "h");
        }
        else {
            const msg = state.compare && state.compare.results && state.compare.results[0] && state.compare.results[0].data_status !== "AVAILABLE" ? T("no_series") : T("no_data");
            for (const k of ["light", "dark", "earth"])
                setMetric(k, DASH, msg, "", "");
        }
        // alarm-limited notes for darkness / earth come from risks only
        if (o) {
            setMetric("charge", fmtNum(o.minCharge, 0), o.minCharge === null ? T("no_data") : T("model"), srcOf(o.sci, "onboard simulator"), "Wh");
        }
        else {
            setMetric("charge", DASH, state.compare ? T("need_inputs") : T("charge_hint"), "", "");
        }
        // donut
        const arc = $("#donut-arc");
        if (c && c.light !== null) {
            const pct = c.fraction * 100;
            arc.setAttribute("stroke-dasharray", pct.toFixed(2) + " " + (100 - pct).toFixed(2));
            set($("#donut-pct"), Math.round(pct) + "%");
            set($("#lg-light"), fmtWith(c.light, "h", 0));
            set($("#lg-dark"), fmtWith(c.dark, "h", 0));
            $("#donut").setAttribute("aria-label", T("donut") + ": " + Math.round(pct) + "%");
            set($("#donut-src"), srcOf(c.sci, "compare"));
        }
        else {
            arc.setAttribute("stroke-dasharray", "0 100");
            set($("#donut-pct"), DASH);
            set($("#lg-light"), DASH);
            set($("#lg-dark"), DASH);
            $("#donut").setAttribute("aria-label", T("donut") + ": " + DASH);
            set($("#donut-src"), "");
        }
        // resources
        const R = (k, v, unit) => set($(`[data-metric="${k}"]`), isNum(v) ? fmtWith(v, unit, 1) : v === null || v === undefined ? DASH : String(v));
        R("r_min", o && o.minCharge, "Wh");
        R("r_final", o && o.finalCharge, "Wh");
        R("r_unserved", o && o.unserved, "Wh");
        R("r_mode", o && o.endMode);
        R("r_o2", o && o.o2, "kg");
        R("r_o2m", o && o.o2m, "h");
        R("r_food", o && o.food, "kg");
        R("r_foodm", o && o.foodm, "h");
        set($("#res-src"), o ? [o.sci ? "science_status: " + o.sci : null, o.rateSource ? "rate_source: " + o.rateSource : null].filter(Boolean).join(" · ") || DASH : DASH);
        set($("#res-note"), o && !o.rateSource ? "rate_source: " + DASH : "");
        // alarms
        const list = $("#alarm-list");
        list.replaceChildren();
        const title = $("#alarms-h"), st = $("#alarm-state");
        $("#alarms").classList.toggle("has", !!(o && o.alarms.length));
        if (!o) {
            set(title, T("alarms"));
            set(st, state.apiDown ? T("api_down") : T("alarms_idle"));
            st.hidden = false;
        }
        else if (!o.alarms.length) {
            set(title, "0 " + T("alarms_n"));
            set(st, T("alarms_none"));
            st.hidden = false;
        }
        else {
            set(title, o.alarms.length + " " + T("alarms_n").toUpperCase());
            st.hidden = true;
            for (const a of o.alarms) {
                const li = document.createElement("li");
                li.className = "sev-" + String(a.severity).toLowerCase();
                const b = document.createElement("b");
                b.textContent = alarmLine(a);
                li.append(b);
                const t = document.createElement("span");
                t.textContent = " · " + (a.text || "") + " · " + T("model");
                li.append(t);
                list.append(li);
            }
        }
        // status
        const rows = [];
        if (state.ready) {
            rows.push(["readyz", JSON.stringify(state.ready)]);
        }
        if (state.caps) {
            rows.push(["capabilities", JSON.stringify(state.caps)]);
        }
        if (c) {
            rows.push([T("science"), c.sci || DASH], [T("engine_sci"), c.sciEngine || DASH]);
        }
        if (c && c.provenance) {
            const p = c.provenance;
            rows.push([T("dataset"), p.terrain_dataset_id || DASH], [T("ephem"), p.ephemeris_id || DASH], [T("generator"), p.generator || DASH]);
        }
        if (o)
            rows.push([T("decision"), o.decision || DASH]);
        const dl = $("#status-rows");
        dl.replaceChildren();
        if (!rows.length)
            rows.push([T("no_data"), DASH]);
        for (const [k, v] of rows) {
            const d = document.createElement("div"), a = document.createElement("dt"), b = document.createElement("dd");
            a.textContent = k;
            b.textContent = v;
            d.append(a, b);
            dl.append(d);
        }
        const lim = $("#limits");
        lim.replaceChildren();
        const L = (state.onboard && state.onboard.limitations) || (state.compare && state.compare.limitations) || [];
        for (const t of L) {
            const li = document.createElement("li");
            li.textContent = t;
            lim.append(li);
        }
    }
    function tick() {
        const now = new Date(), iso = now.toISOString();
        const c = $("#clock");
        set(c, iso.slice(11, 19));
        c.setAttribute("datetime", iso);
        const sr = state.compare && state.compare.request, cd = $("#countdown");
        if (sr && sr.start_utc) {
            const ms = Date.parse(sr.start_utc) - now.getTime();
            if (Number.isFinite(ms)) {
                const a = Math.abs(ms) / 1000, d = Math.floor(a / 86400), h = Math.floor(a % 86400 / 3600), m = Math.floor(a % 3600 / 60);
                set(cd, (ms >= 0 ? "T- " : "T+ ") + d + "d " + String(h).padStart(2, "0") + "h " + String(m).padStart(2, "0") + "m");
                return;
            }
        }
        set(cd, DASH);
    }
    const val = (id) => $(id).type === "checkbox" ? $(id).checked : $(id).value;
    function formState() { return { site: state.site && state.site.id, start: val("#f-start"), dur: val("#f-dur"), blackout: val("#f-blackout"), cap: val("#f-cap"), init: val("#f-init"), res: val("#f-res"), solar: val("#f-solar"), load: val("#f-load"), size: val("#f-size"), o2: val("#f-o2"), food: val("#f-food"), o2r: val("#f-o2r"), foodr: val("#f-foodr"), reserve: val("#f-reserve"), source: val("#f-source"), aboard: val("#f-aboard") }; }
    function prefillWindow() {
        const s = state.site && state.site.series;
        $("#f-start").value = s ? s.start_utc : "";
        if (s) {
            const h = (Date.parse(s.end_utc) - Date.parse(s.start_utc)) / 3600000;
            $("#f-dur").value = Number.isFinite(h) ? String(Math.min(h, 720)) : "";
        }
        else
            $("#f-dur").value = "";
    }
    async function calculate() {
        const msg = $("#form-msg");
        state.calcError = null;
        state.compare = null;
        state.onboard = null;
        state.cView = null;
        state.oView = null;
        if (!state.site) {
            render();
            return;
        }
        const b = buildBody(formState());
        if (b.error) {
            state.calcError = T("f_start") + " / " + T("f_dur");
            set(msg, "");
            render();
            return;
        }
        set(msg, T("calculating"));
        $("#calc-btn").disabled = true;
        try {
            const cmp = await post("/api/compare", b.compare);
            state.compare = cmp;
            state.cView = viewFromCompare(cmp);
            if (b.onboard) {
                try {
                    const ob = await post("/api/onboard/site-evaluate", b.onboard);
                    state.onboard = ob;
                    state.oView = viewFromOnboard(ob);
                }
                catch (e) {
                    state.calcError = (e.code ? e.code + ": " : "") + e.message;
                }
            }
            set(msg, T("done"));
        }
        catch (e) {
            state.apiDown = e.code === undefined || e.code === "502" || e.code === "503";
            state.calcError = state.apiDown ? null : (e.code ? e.code + ": " : "") + e.message;
            set(msg, "");
        }
        finally {
            $("#calc-btn").disabled = false;
            render();
            tick();
        }
    }
    function chooseSite(id) {
        state.site = state.sites.find((s) => s.id === id) || null;
        state.compare = null;
        state.onboard = null;
        state.cView = null;
        state.oView = null;
        state.calcError = null;
        prefillWindow();
        render();
        if (state.site && state.site.series)
            calculate();
    }
    async function boot() {
        const [sites, ready, caps] = await Promise.allSettled([getJSON("/api/sites"), getJSON("/readyz"), getJSON("/v1/capabilities")]);
        state.ready = ready.status === "fulfilled" ? ready.value : null;
        state.caps = caps.status === "fulfilled" ? caps.value : null;
        const sel = $("#site-select");
        sel.replaceChildren();
        if (sites.status === "fulfilled" && Array.isArray(sites.value.sites) && sites.value.sites.length) {
            state.sites = sites.value.sites;
            for (const s of state.sites) {
                const o = document.createElement("option");
                o.value = s.id;
                o.textContent = s.name + " · " + s.id + (s.series ? "" : " (" + "NO_SERIES_DATA" + ")");
                sel.append(o);
            }
            sel.disabled = false;
            const first = state.sites.find((s) => s.series) || state.sites[0];
            sel.value = first.id;
            chooseSite(first.id);
        }
        else {
            state.apiDown = true;
            const o = document.createElement("option");
            o.textContent = DASH;
            sel.append(o);
            render();
        }
        render();
    }
    $("#site-select").addEventListener("change", e => chooseSite(e.target.value));
    $("#form").addEventListener("submit", e => { e.preventDefault(); calculate(); });
    $("#example-btn").addEventListener("click", () => {
        const v = { "#f-blackout": "24", "#f-cap": "5000", "#f-init": "4000", "#f-res": "500", "#f-solar": "300", "#f-load": "150", "#f-size": "2", "#f-o2": "100", "#f-food": "200", "#f-o2r": "0.84", "#f-foodr": "1.76", "#f-reserve": "24", "#f-source": "Illustrative placeholder, not mission data" };
        for (const [k, x] of Object.entries(v))
            $(k).value = x;
        const dur = Number($("#f-dur").value);
        if (dur > 480)
            $("#f-dur").value = "480";
        set($("#form-msg"), T("ill_hint"));
    });
    $("#lang-btn").addEventListener("click", () => { state.lang = state.lang === "en" ? "pt-BR" : "en"; try {
        localStorage.setItem("mc-lang", state.lang);
    }
    catch { } applyLang(); applyTheme(document.documentElement.dataset.theme); });
    $("#theme-btn").addEventListener("click", () => {
        const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        const next = cur === "dark" ? "light" : "dark";
        try {
            localStorage.setItem("mc-theme", next);
        }
        catch { }
        applyTheme(next);
    });
    $("#menu-btn").addEventListener("click", e => { const nav = $("#sidebar"); const open = nav.classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", String(open)); });
    $$("#nav a[data-target]").forEach(a => a.addEventListener("click", e => {
        e.preventDefault();
        const t = document.getElementById(a.dataset.target);
        if (t) {
            t.focus({ preventScroll: true });
            t.scrollIntoView({ block: "start" });
        }
        $$("#nav a").forEach(x => x.removeAttribute("aria-current"));
        a.setAttribute("aria-current", "page");
    }));
    $$("#nav button[aria-disabled]").forEach(b => b.addEventListener("click", e => e.preventDefault()));
    try {
        const l = localStorage.getItem("mc-lang");
        if (l && I18N[l])
            state.lang = l;
        else if (/^pt/i.test(navigator.language || "") && false)
            state.lang = "pt-BR";
    }
    catch { }
    let th = null;
    try {
        th = localStorage.getItem("mc-theme");
    }
    catch { }
    applyTheme(th);
    applyLang();
    tick();
    setInterval(tick, 1000);
    boot();
}
if (typeof document !== "undefined" && document.getElementById && document.getElementById("site-select"))
    init();
