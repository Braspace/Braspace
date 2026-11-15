"use strict";
// Front end for the educational onboard simulator.
// Data flow: form -> synthetic samples (sim.js) -> request (request.js) -> POST /api/onboard/evaluate.
// All API text is inserted with textContent; nothing from the response is parsed as HTML.
(function () {
    "use strict";
    const API_PATH = "/api/onboard/evaluate";
    const DEFAULTS = [
        { id: "baseline", start_utc: "2026-12-01T00:00:00Z", solar_generation_w: 0, load_w: 80,
            battery_capacity_wh: 200, initial_charge_wh: 150, reserve_wh: 50, max_comm_blackout_hours: 1 },
        { id: "date-delay-alternative", start_utc: "2026-12-03T00:00:00Z", solar_generation_w: 110, load_w: 80,
            battery_capacity_wh: 200, initial_charge_wh: 150, reserve_wh: 50, max_comm_blackout_hours: 1 }
    ];
    const FIELDS = [
        ["start_utc", "Início (UTC)", "text"],
        ["solar_generation_w", "Solar com Sol (W)", "number"],
        ["load_w", "Carga (W)", "number"],
        ["battery_capacity_wh", "Capacidade (Wh)", "number"],
        ["initial_charge_wh", "Carga inicial (Wh)", "number"],
        ["reserve_wh", "Reserva (Wh)", "number"],
        ["max_comm_blackout_hours", "Bloqueio máximo da Terra (h)", "number"]
    ];
    const state = { candidates: DEFAULTS.map(c => ({ ...c })), nextId: 1 };
    const $ = (id) => document.getElementById(id);
    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v === null || v === undefined || v === false)
                continue;
            if (k === "class")
                el.className = v;
            else if (k === "text")
                el.textContent = v;
            else if (k.startsWith("on"))
                el.addEventListener(k.slice(2), v);
            else if (v === true)
                el.setAttribute(k, "");
            else
                el.setAttribute(k, String(v));
        }
        for (const c of children.flat()) {
            if (c === null || c === undefined || c === false)
                continue;
            el.append(c instanceof Node ? c : document.createTextNode(String(c)));
        }
        return el;
    }
    // ---------- Candidate editor ----------
    function renderCandidates() {
        const box = $("candidates");
        box.replaceChildren();
        state.candidates.forEach((c, idx) => {
            const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h3", { text: "Cenário " + (idx + 1) }), h("button", { type: "button", class: "danger", disabled: state.candidates.length <= 1,
                onclick: () => { state.candidates.splice(idx, 1); renderCandidates(); } }, "Remover")), h("label", { style: "margin-top:8px" }, "id", h("input", { value: c.id, maxlength: "96", "data-key": "id", "data-idx": idx,
                oninput: onField })), h("div", { class: "fields", style: "margin-top:8px" }, FIELDS.map(([key, label, type]) => h("label", {}, label, h("input", { type, value: c[key], "data-key": key, "data-idx": idx,
                step: type === "number" ? "any" : null, oninput: onField })))));
            box.append(card);
        });
    }
    function onField(ev) {
        const el = ev.target;
        const idx = Number(el.dataset.idx);
        const key = el.dataset.key;
        const raw = el.value;
        state.candidates[idx][key] = el.type === "number" ? (raw === "" ? NaN : Number(raw)) : raw;
        el.setAttribute("aria-invalid", "false");
    }
    function addCandidate() {
        const n = state.nextId++;
        const base = state.candidates[state.candidates.length - 1] || DEFAULTS[0];
        state.candidates.push({ ...base, id: "cenario-extra-" + n });
        renderCandidates();
    }
    // ---------- Simulation ----------
    function buildCandidates() {
        const step = Number($("step").value);
        const durationH = Number($("duration").value);
        const site = $("site").value;
        const count = Math.floor((durationH * 60) / step);
        return state.candidates.map(c => {
            const samples = (Number.isInteger(count) && count > 0 && Number.isInteger(step) && step > 0)
                ? OnboardSim.generateSamples({ startUtc: c.start_utc, stepMinutes: step, count, siteId: site })
                : [];
            return {
                id: c.id,
                site_id: site,
                start_utc: c.start_utc,
                source_claim: "SYNTHETIC-NOT-NASA",
                step_minutes: step,
                max_comm_blackout_hours: c.max_comm_blackout_hours,
                power: {
                    battery_capacity_wh: c.battery_capacity_wh,
                    initial_charge_wh: c.initial_charge_wh,
                    reserve_wh: c.reserve_wh,
                    solar_generation_w: c.solar_generation_w,
                    load_w: c.load_w
                },
                samples
            };
        });
    }
    function showFormErrors(list) {
        const ul = $("form-errors");
        ul.replaceChildren(...list.map(e => h("li", { text: e })));
    }
    async function run() {
        $("results-card").hidden = true;
        $("limits-card").hidden = true;
        const candidates = buildCandidates();
        const req = OnboardRequest.buildRequest($("mission-id").value.trim(), candidates);
        if (!req.ok) {
            showFormErrors(req.errors);
            return;
        }
        showFormErrors([]);
        const btn = $("run");
        btn.disabled = true;
        btn.textContent = "Simulando…";
        try {
            const apiBase = String((typeof window !== "undefined" && window.BRASPACE_API_BASE) || "").replace(/\/+$/, "");
            const res = await fetch(apiBase + API_PATH, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req.body)
            });
            const text = await res.text();
            if (!res.ok) {
                showFormErrors(["API respondeu " + res.status + ": " + text.slice(0, 300)]);
                return;
            }
            render(JSON.parse(text));
        }
        catch (err) {
            showFormErrors(["Não foi possível falar com a API (" + err.message + "). Suba o servidor com dev-server.py ou o docker compose."]);
        }
        finally {
            btn.disabled = false;
            btn.textContent = "Simular";
        }
    }
    // ---------- Results ----------
    const MODE_CLASS = { NOMINAL: "s-ok", SAFE_MODE: "s-warn", POWER_LOSS: "s-bad" };
    const SEV_CLASS = { HIGH: "s-bad", MEDIUM: "s-warn", LOW: "s-info" };
    const STATUS_CLASS = { CONSTRAINTS_MET: "s-ok", CONSTRAINTS_BREACHED: "s-bad" };
    function num(v, d) { return typeof v === "number" ? v.toFixed(d === undefined ? 1 : d) : "—"; }
    function render(resp) {
        $("results-card").hidden = false;
        $("limits-card").hidden = false;
        const dec = $("decision");
        dec.textContent = resp.decision;
        dec.className = "pill " + (resp.laboratory_candidate_id ? "s-ok" : "s-warn");
        $("lab-candidate").textContent = resp.laboratory_candidate_id
            ? "Cenário de laboratório que cumpre as restrições informadas: " + resp.laboratory_candidate_id + " (educacional, não é recomendação de voo)."
            : "Nenhum cenário cumpre todas as restrições informadas. Não há recomendação.";
        const rows = [
            h("tr", {}, h("th", { text: "Cenário" }), h("th", { class: "n", text: "Estado" }), h("th", { class: "n", text: "Carga mínima (Wh)" }), h("th", { class: "n", text: "Energia não atendida (Wh)" }), h("th", { class: "n", text: "Maior escuridão (h)" }), h("th", { class: "n", text: "Maior bloqueio (h)" }))
        ];
        resp.options.forEach(o => {
            rows.push(h("tr", {}, h("td", { text: o.id }), h("td", { class: "n " + (STATUS_CLASS[o.simulation_status] || "s-info"), text: o.simulation_status }), h("td", { class: "n", text: num(o.metrics.minimum_charge_wh) }), h("td", { class: "n", text: num(o.metrics.total_unserved_energy_wh) }), h("td", { class: "n", text: num(o.metrics.longest_darkness_hours) }), h("td", { class: "n", text: num(o.metrics.longest_earth_obstruction_hours) })));
        });
        $("summary").replaceChildren(...rows);
        $("options").replaceChildren(...resp.options.map(renderOption));
        const lim = $("limitations");
        lim.replaceChildren(...resp.limitations.map(t => h("li", { text: t })));
        $("hash").textContent = "inputs_sha256: " + resp.inputs_sha256 + " · " + resp.version + " · " + resp.science_status;
    }
    function renderOption(o) {
        const risks = o.risks.length
            ? o.risks.map(r => h("div", { class: "risk " + (SEV_CLASS[r.severity] || "s-info") }, h("strong", { text: r.category + " (" + r.severity + "): " }), h("span", { text: r.explanation + " Medido " + num(r.measured) + " " + r.unit + ", limite " + num(r.allowed) + " " + r.unit + "." })))
            : [h("p", { class: "muted", text: "Nenhum risco acima dos limites informados." })];
        return h("div", { class: "card" }, h("div", { class: "row" }, h("h3", { text: o.id }), h("span", { class: "pill " + (STATUS_CLASS[o.simulation_status] || ""), text: o.simulation_status })), h("p", { class: "muted", text: "Início " + o.start_utc + " · fim: " + o.end_mode + " · " + (o.source_claim_unverified || "") }), h("div", { style: "margin:10px 0" }, risks), chart(o), h("p", { class: "muted", style: "margin-top:6px",
            text: "Estados: NOMINAL (verde), SAFE_MODE (âmbar), POWER_LOSS (vermelho)." }));
    }
    function chart(o) {
        const W = 600, H = 150, pad = 26;
        const tl = o.timeline;
        const max = Math.max(1, ...tl.map(s => s.charge_wh));
        const x = (i) => pad + (tl.length <= 1 ? 0 : (i / (tl.length - 1)) * (W - pad * 2));
        const y = (v) => H - pad - (v / max) * (H - pad * 2);
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        svg.setAttribute("width", "100%");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Carga da bateria ao longo do cenário " + o.id);
        const add = (tag, attrs, text) => {
            const el = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attrs))
                el.setAttribute(k, String(v));
            if (text !== undefined)
                el.textContent = text;
            svg.append(el);
            return el;
        };
        add("line", { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: "currentColor", "stroke-opacity": ".25" });
        add("text", { x: 4, y: pad, }, max.toFixed(0) + " Wh");
        add("text", { x: 4, y: H - pad + 12 }, "0");
        const colorOf = { NOMINAL: "var(--ok)", SAFE_MODE: "var(--warn)", POWER_LOSS: "var(--bad)" };
        for (let i = 1; i < tl.length; i++) {
            add("line", { x1: x(i - 1), y1: y(tl[i - 1].charge_wh), x2: x(i), y2: y(tl[i].charge_wh),
                stroke: colorOf[tl[i].mode] || "var(--info)", "stroke-width": "2" });
        }
        if (tl.length)
            add("text", { x: W - pad - 80, y: H - 6 }, tl[tl.length - 1].epoch_utc.slice(5, 16));
        return svg;
    }
    // ---------- Boot ----------
    function init() {
        renderCandidates();
        $("add").addEventListener("click", addCandidate);
        $("run").addEventListener("click", run);
    }
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", init);
    else
        init();
})();
