// MoonProof Polar Lab + Landing Lab — UI wiring.
// Scientific geometry: precomputed from NASA LOLA + JPL/NAIF SPICE (see Evidence view).
// Educational flight simulation: hypothetical vehicle, deterministic physics (physics.js).
import { apiBase } from "../api-base.js";
import { Viewer } from "./scene.js";
import { TerrainGrid } from "./terrain.js";
import { SiteSeries, rankSites, HOUR_MS, parseEntryHash, validHours } from "./data.js";
import { azElToEnu, enuToBody } from "./coords.js";
import { createLive, compareRow, OFFLINE_SEAL } from "./live.js";
import { createSim, advance, telemetry, thrustDirection, DEFAULT_VEHICLE, MOON_R_REF } from "./physics.js";
// Every id queried through $ is in lab.html or in the panel markup rendered below; `null` is still handled where the original checked it.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : "—";
const iso = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const IM2_EPOCH = Date.parse("2025-03-06T17:00:00Z"); // IM-2 Athena landing day (hour approximate)
// ------------------------------------------------------------------ i18n
const I18N = {
    en: {
        explore: "Explore", compare: "Compare", recover: "Recover", landing: "Landing Lab", evidence: "Evidence & Learn",
        reduceMotion: "Reduce motion", classic: "Mission computer",
        exploreTitle: "Where is there light and a line of sight to Earth?",
        exploreLede: "Real NASA LOLA terrain and JPL/NAIF ephemerides. Pick a site and a date to see the Sun and Earth against the actual local horizon.",
        globe: "Globe", pole: "South pole", site3d: "Site 3D", site: "Candidate site", when: "Date and time (UTC)",
        now: "Now", im2: "IM-2 landing day", plus24: "+24 h", layers: "Map layer", exag: "Vertical exaggeration",
        natural: "Natural (Sun-lit relief)", elevation: "Elevation", slope: "Slope", illumination: "Average illumination (PGDA)",
        earthvis: "Average Earth visibility (PGDA)", candidates: "Candidate regions", uncertainty: "Topographic uncertainty",
        compareTitle: "Compare sites for the same window", recoverTitle: "The launch slipped. What now?",
        landingTitle: "Fly the descent", evidenceTitle: "What we know, and how",
        start: "Start descent", notComputed: "NOT COMPUTED",
    },
    pt: {
        explore: "Explorar", compare: "Comparar", recover: "Replanejar", landing: "Landing Lab", evidence: "Evidências",
        reduceMotion: "Reduzir movimento", classic: "Computador de bordo",
        exploreTitle: "Onde há luz e linha de visada para a Terra?",
        exploreLede: "Terreno real NASA LOLA e efemérides JPL/NAIF. Escolha um local e uma data para ver o Sol e a Terra contra o horizonte real.",
        globe: "Globo", pole: "Polo sul", site3d: "Local 3D", site: "Local candidato", when: "Data e hora (UTC)",
        now: "Agora", im2: "Dia do pouso IM-2", plus24: "+24 h", layers: "Camada", exag: "Exagero vertical",
        natural: "Natural (relevo iluminado)", elevation: "Altitude", slope: "Declividade", illumination: "Iluminação média (PGDA)",
        earthvis: "Visibilidade média da Terra (PGDA)", candidates: "Regiões candidatas", uncertainty: "Incerteza topográfica",
        compareTitle: "Compare locais na mesma janela", recoverTitle: "O lançamento atrasou. E agora?",
        landingTitle: "Pilote a descida", evidenceTitle: "O que sabemos, e como",
        start: "Iniciar descida", notComputed: "NÃO CALCULADO",
    },
};
const tr = (k) => (I18N[state.lang] && I18N[state.lang][k]) || I18N.en[k] || k;
const state = {
    view: "explore", level: "globe", siteId: "peak-near-shackleton", t: 0, layer: "natural", exag: 1,
    lang: "en", reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    index: null, region: null, pgda: null, slope: null, series: new Map(), tiles: new Map(),
    compareH: 336, recover: { delayH: 48, windowH: 336, minSun: 30, maxBlackout: 120 },
    lab: { mode: "guided", scenario: null, running: false, paused: false, sim: null, keys: {}, assist: true, timeScale: 1, throttleCmd: 0 },
};
let viewer = null;
// Optional live API (window.BRASPACE_API_BASE). Offline => static precomputed products, unchanged.
const live = createLive({ base: apiBase() });
const isoZ = (t) => new Date(t).toISOString().slice(0, 19) + "Z";
function showSeal(seal = live.seal) { const el = $("#seal"); if (!el)
    return; el.textContent = seal.text; el.className = "seal " + seal.cls; el.title = seal.live ? "State comes from the API response (science_status); nothing here is NASA-validated unless it says so." : "Static NASA-derived products shipped with the page; no API reachable."; }
// ------------------------------------------------------------------ data loading
async function loadIndex() {
    const r = await fetch("./data/sites.json");
    if (!r.ok)
        throw new Error("sites.json unavailable");
    state.index = await r.json();
    const w = state.index.series_window;
    state.windowStart = Date.parse(w.start_utc);
    state.windowEnd = state.windowStart + (w.hours - 1) * HOUR_MS;
    const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    state.t = now >= state.windowStart && now <= state.windowEnd ? now : state.windowStart;
    applyEntryHash(location.hash);
}
function applyEntryHash(hash) {
    const e = parseEntryHash(hash, state.index.sites, state.windowStart, state.windowEnd);
    if (e.siteId)
        state.siteId = e.siteId;
    if (e.t !== undefined)
        state.t = e.t;
    if (e.compareH)
        state.compareH = e.compareH;
    state.durationNotice = e.durationNotice || null;
}
const siteById = (id) => state.index.sites.find((s) => s.id === id);
function series(id) {
    if (!state.series.has(id))
        state.series.set(id, SiteSeries.load("./data/" + siteById(id).series));
    return state.series.get(id);
}
function tile(id) {
    if (!state.tiles.has(id))
        state.tiles.set(id, TerrainGrid.load("./data/" + siteById(id).local_tile));
    return state.tiles.get(id);
}
async function region() {
    if (state.region)
        return state.region;
    status("Loading LOLA south-polar terrain (400 m, 1.4 MB)…");
    const grid = await TerrainGrid.load("./data/region/south_pole_400m");
    const get = async (f) => { const r = await fetch("./data/region/" + f); if (!r.ok)
        throw new Error(f); return new Uint8Array(await r.arrayBuffer()); };
    const [sun, earth] = await Promise.all([get(grid.h.layers.pgda_sun.file), get(grid.h.layers.pgda_earth.file)]);
    state.pgda = { sun, earth };
    state.slope = grid.slopeField();
    state.region = grid;
    status(state.handoffNote || ""); // keep a rejected-link notice visible after loading
    return grid;
}
function status(msg) { const el = $("#status"); if (el)
    el.textContent = msg; }
// ------------------------------------------------------------------ geometry at the selected time
async function skyAt(id, t) {
    const s = await series(id);
    const g = s.at(t);
    if (!g)
        return null;
    return { ...g, sunEnu: azElToEnu(g.sunAz, g.sunEl), earthEnu: azElToEnu(g.earthAz, g.earthEl), series: s };
}
// ------------------------------------------------------------------ scene levels
// Every scene switch takes a sequence number; a slower, older request never overwrites a newer scene.
let sceneSeq = 0;
async function goGlobe() {
    const seq = ++sceneSeq;
    const site = siteById(state.siteId), sky = await skyAt(state.siteId, state.t);
    if (seq !== sceneSeq)
        return;
    state.level = "globe";
    updateCrumbs();
    viewer?.showGlobe({
        sites: state.index.sites, features: state.index.features,
        onSelectSite: (id) => { selectSite(id); goRegion(true); },
        sunDirBody: sky ? enuToBody(sky.sunEnu, site.lat, site.lon) : null,
    });
    setLegend();
}
async function goRegion(focus = false) {
    if (!viewer)
        return;
    const seq = ++sceneSeq;
    const grid = await region();
    const site = siteById(state.siteId), sky = await skyAt(state.siteId, state.t);
    if (seq !== sceneSeq)
        return;
    state.level = "region";
    updateCrumbs();
    viewer.showRegion({
        grid, pgda: state.pgda, slope: state.slope, layer: state.layer, exaggeration: state.exag,
        sites: state.index.sites, features: state.index.features,
        onSelectSite: (id) => { selectSite(id); viewer.focusRegionSite(siteById(id), grid); },
        sunEnu: sky?.sunEnu, earthEnu: sky?.earthEnu, refSite: site,
    });
    if (focus)
        viewer.focusRegionSite(site, grid, state.reduced ? 0 : 2.0);
    setLegend();
}
async function goSite() {
    if (!viewer)
        return false;
    const seq = ++sceneSeq;
    status("Loading local LOLA tile…");
    const [tl, s] = await Promise.all([tile(state.siteId), series(state.siteId)]);
    const sky = await skyAt(state.siteId, state.t);
    status("");
    if (seq !== sceneSeq)
        return false;
    state.level = "site";
    updateCrumbs();
    viewer.showSite({ tile: tl, horizon: s.horizon, layer: ["elevation", "slope"].includes(state.layer) ? state.layer : "natural", sunEnu: sky?.sunEnu, earthEnu: sky?.earthEnu });
    setLegend();
    return true;
}
function refreshScene() {
    if (state.level === "globe")
        return goGlobe();
    if (state.level === "region")
        return goRegion(false);
    return goSite();
}
async function applyTime() {
    const sky = await skyAt(state.siteId, state.t);
    if (viewer && sky) {
        if (state.level === "region")
            viewer.setRegionSun(sky.sunEnu, siteById(state.siteId));
        else if (state.level === "site")
            viewer.setSiteSky(sky.sunEnu, sky.earthEnu);
        else
            goGlobe();
    }
    renderSunEarth();
}
function selectSite(id) {
    state.siteId = id;
    const sel = $("#site");
    if (sel)
        sel.value = id;
    renderSiteMeta();
    renderSunEarth();
    updateCrumbs();
}
function updateCrumbs() {
    const c = $("#crumbs");
    if (!c || !state.index)
        return;
    const s = siteById(state.siteId);
    const parts = [["globe", tr("globe")], ["region", tr("pole")], ["site", s ? s.name : tr("site3d")]];
    c.innerHTML = parts.map(([k, l]) => `<span class="${k === state.level ? "on" : ""}">${esc(l)}</span>`).join(" › ");
}
// ------------------------------------------------------------------ legend
function setLegend() {
    const L = $("#legend");
    if (!L)
        return;
    const g = state.region;
    // gradients live in lab.css (CSP forbids inline style attributes)
    const bar = (cls, a, b, unit, note) => `<div class="ramp ${cls}"></div><div class="ramp-labels"><span>${a}</span><span>${b}</span></div><small>${unit}</small>${note ? `<small class="muted">${note}</small>` : ""}`;
    const vir = "vir", inf = "inf";
    let html;
    if (state.level === "globe")
        html = `<strong>NASA SVS CGI Moon Kit colour map</strong><small>Visual reference only (not terrain science). Markers: catalogue site centres.</small>`;
    else if (state.layer === "elevation")
        html = `<strong>Elevation</strong>` + (state.level === "region" && g
            ? bar(vir, `${fmt(g.min / 1000, 1)} km`, `${fmt(g.max / 1000, 1)} km`, "Height above the 1,737.4 km reference sphere (LOLA datum)", "Source: LRO/LOLA LDEM_80S_80M, 400 m block mean")
            : bar(vir, "low", "high", "Local relief of the 16 × 16 km tile (m, site tangent plane)", "Source: LOLA 80 m, bilinear at 40 m"));
    else if (state.layer === "slope")
        html = `<strong>Slope</strong>${bar("slp", "0°", "≥25°", "Green ≤ 12° (trainer limit), amber 12–25°, red > 25°", `Computed from LOLA at ${state.level === "region" ? "400" : "40"} m spacing — slope is scale-dependent; boulders are not resolved`)}`;
    else if (state.layer === "illumination" && state.level === "region")
        html = `<strong>Average solar illumination</strong>${bar(inf, "0%", "100%", "Fraction of the solar disc visible, long-term average (black = permanent shadow)", "NASA GSFC PGDA AVGVISIB_75S_120M (Mazarico et al. 2011)")}`;
    else if (state.layer === "earth" && state.level === "region")
        html = `<strong>Average Earth visibility</strong>${bar("ear", "0%", "100%", "Fraction of time any part of Earth is above the horizon (geometric)", "NASA GSFC PGDA AVGVISIB_75S_120M_EARTH")}`;
    else
        html = `<strong>Sun-lit relief</strong><small>Light direction = Sun at ${iso(state.t)} from JPL/NAIF SPICE (site ${esc(siteById(state.siteId)?.name || "")}). GPU shadows and the weak fill light are illustrative; quantitative visibility uses the horizon model.</small>`;
    if (state.level === "region" && state.exag !== 1)
        html += `<small class="warn">Vertical exaggeration ×${state.exag}</small>`;
    L.innerHTML = html;
}
// ------------------------------------------------------------------ panels
const panel = () => $("#panel-body");
function renderExplore() {
    const opt = state.index.sites.map((s) => `<option value="${s.id}" ${s.id === state.siteId ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const layers = [["natural", tr("natural")], ["elevation", tr("elevation")], ["slope", tr("slope")], ["illumination", tr("illumination")], ["earth", tr("earthvis")], ["candidates", tr("candidates")]];
    panel().innerHTML = `
    <p class="eyebrow">01 / ${esc(tr("explore"))}</p><h2>${esc(tr("exploreTitle"))}</h2><p class="lede">${esc(tr("exploreLede"))}</p>
    <div class="seg" role="group" aria-label="Scale">
      <button data-level="globe">${esc(tr("globe"))}</button><button data-level="region">${esc(tr("pole"))}</button><button data-level="site">${esc(tr("site3d"))}</button>
    </div>
    <label for="site">${esc(tr("site"))}</label><select id="site">${opt}</select>
    <div id="site-meta" class="meta"></div>
    <label for="when">${esc(tr("when"))}</label>
    <input id="when" type="datetime-local" step="3600">
    <div class="chips"><button data-preset="now">${esc(tr("now"))}</button><button data-preset="im2">${esc(tr("im2"))}</button><button data-preset="m24">−24 h</button><button data-preset="p24">${esc(tr("plus24"))}</button></div>
    <div id="sunearth" class="card"></div>
    <fieldset class="layers"><legend>${esc(tr("layers"))}</legend>
      ${layers.map(([v, l]) => `<label><input type="radio" name="layer" value="${v}" ${state.layer === v ? "checked" : ""}> ${esc(l)}</label>`).join("")}
      <label class="disabled" title="LDEM_80S_80M has no per-pixel uncertainty; PGDA 5 m error maps are not ingested yet."><input type="radio" name="layer" disabled> ${esc(tr("uncertainty"))} — <em>${esc(tr("notComputed"))}</em></label>
    </fieldset>
    <p class="muted small">PGDA illumination/Earth layers exist for the polar region view; the site view shows elevation, slope or Sun-lit relief.</p>
    <label for="exag">${esc(tr("exag"))}</label>
    <select id="exag"><option value="1">×1 (true scale)</option><option value="2">×2</option><option value="4">×4</option></select>`;
    $("#exag").value = String(state.exag);
    const when = $("#when");
    when.min = new Date(state.windowStart).toISOString().slice(0, 16);
    when.max = new Date(state.windowEnd).toISOString().slice(0, 16);
    when.value = new Date(state.t).toISOString().slice(0, 16);
    when.addEventListener("change", () => { const v = Date.parse(when.value + ":00Z"); if (Number.isFinite(v)) {
        state.t = Math.min(state.windowEnd, Math.max(state.windowStart, v));
        applyTime();
        setLegend();
    } });
    panel().querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
        const p = b.dataset.preset;
        state.t = p === "now" ? Math.floor(Date.now() / HOUR_MS) * HOUR_MS : p === "im2" ? IM2_EPOCH : state.t + (p === "p24" ? 24 : -24) * HOUR_MS;
        state.t = Math.min(state.windowEnd, Math.max(state.windowStart, state.t));
        when.value = new Date(state.t).toISOString().slice(0, 16);
        if (p === "im2") {
            selectSite("mons-mouton-im2");
            refreshScene();
        }
        else
            applyTime();
        setLegend();
    }));
    $("#site").addEventListener("change", e => {
        selectSite(e.target.value);
        if (state.level === "site")
            goSite();
        else if (state.level === "region") {
            viewer?.focusRegionSite(siteById(state.siteId), state.region);
            applyTime();
        }
    });
    panel().querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => {
        const l = b.dataset.level;
        if (l === "globe")
            goGlobe();
        else if (l === "region") {
            if (state.level === "globe" && viewer && !state.reduced) {
                viewer.flyToSouthPole(1.6);
                setTimeout(() => goRegion(true), 1500);
            }
            else
                goRegion(true);
        }
        else
            goSite();
    }));
    panel().querySelectorAll("input[name=layer]").forEach(r => r.addEventListener("change", () => {
        state.layer = r.value;
        if (state.level === "region")
            viewer?.setRegionLayer(state.layer);
        else if (state.level === "site")
            viewer?.setSiteLayer(state.layer);
        setLegend();
    }));
    $("#exag").addEventListener("change", e => { state.exag = Number(e.target.value); if (state.level === "region")
        goRegion(false); });
    renderSiteMeta();
    renderSunEarth();
}
function renderSiteMeta() {
    const el = $("#site-meta");
    const s = siteById(state.siteId);
    if (!el || !s)
        return;
    el.innerHTML = `<span>${fmt(Math.abs(s.lat), 4)}°S, ${fmt(s.lon, 4)}°E · ${fmt(s.site_height_m / 1000, 2)} km above datum</span>
    <span class="muted">${esc(s.source)}. Catalogue feature centre — <strong>not</strong> a certified touchdown point.</span>`;
}
async function renderSunEarth() {
    const el = $("#sunearth");
    if (!el)
        return;
    const sky = await skyAt(state.siteId, state.t);
    if (!sky) {
        el.innerHTML = `<strong>${esc(tr("notComputed"))}</strong><p>The selected time is outside the computed ephemeris window (${iso(state.windowStart)} – ${iso(state.windowEnd)}).</p>`;
        return;
    }
    const s = sky.series;
    const ns = s.nextChange(state.t, "sun"), ne = s.nextChange(state.t, "earth");
    const w = s.window(state.t, 14 * 24);
    const line = (name, elev, m, nc) => {
        const vis = m >= 0;
        const when = nc.status === "COMPUTED" ? (Number.isFinite(nc.hours) ? `${vis ? "sets" : "rises"} in <strong>${fmt(nc.hours, 0)} h</strong> (${iso(nc.at)})` : `no change before ${iso(state.windowEnd)}`) : tr("notComputed");
        return `<div class="sky ${vis ? "up" : "down"}"><span class="dot" aria-hidden="true"></span><div><strong>${name}: ${vis ? "above" : "below"} the local horizon</strong>
      <small>elevation ${fmt(elev, 2)}°, margin ${m >= 0 ? "+" : ""}${fmt(m, 2)}° vs terrain · ${when}</small></div></div>`;
    };
    const wtxt = w.status === "COMPUTED" ? `Next 14 days: Sun ${fmt(w.sunPct, 0)}% · Earth ${fmt(w.earthPct, 0)}% · both ${fmt(w.bothPct, 0)}% · longest darkness ${w.longestDarkH} h · longest Earth blackout ${w.longestBlackoutH} h` : `Next 14 days: ${tr("notComputed")} (end of computed window)`;
    el.innerHTML = `<p class="eyebrow">SUN &amp; EARTH · ${iso(state.t)}</p>
    ${line("Sun", sky.sunEl, sky.sunMargin, ns)}
    ${line("Earth", sky.earthEl, sky.earthMargin, ne)}
    <canvas id="horizon" width="720" height="190" role="img" aria-label="Horizon panorama: terrain skyline with Sun and Earth tracks for plus or minus 7 days"></canvas>
    <p class="small">${wtxt}</p>
    <p class="muted small">Disc centre vs LOLA 80 m horizon (rays to 100 km), observer 2 m above ground. Geometric visibility only — not a power or radio link budget. PRELIMINARY.</p>`;
    drawHorizon($("#horizon"), s, state.t);
    if (live.online && live.apiId(state.siteId) && live.covers(state.siteId, state.t, 1)) {
        const r = await live.sky(state.siteId, isoZ(state.t), 1), smp = r.ok && r.data.samples?.[0], box = $("#sunearth");
        if (smp && box)
            box.insertAdjacentHTML("beforeend", `<p class="small api"><span class="tag sci">API /sky</span> Sun az ${fmt(smp.sun.azimuth_deg, 1)}° el ${fmt(smp.sun.elevation_deg, 2)}° (${smp.sun_visible ? "visible" : "below horizon"}) · Earth az ${fmt(smp.earth.azimuth_deg, 1)}° el ${fmt(smp.earth.elevation_deg, 2)}° (${smp.earth_visible ? "visible" : "below horizon"}) · <span class="seal ${r.seal.cls}">${esc(r.seal.text)}</span></p>`);
        showSeal(r.seal);
    }
    else
        showSeal();
}
function drawHorizon(cv, s, t) {
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, elMin = -6, elMax = 12;
    const X = (az) => az / 360 * W, Y = (el) => H - (el - elMin) / (elMax - elMin) * H;
    ctx.fillStyle = "#05080d";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#1c2733";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#6b7a8c";
    ctx.font = "11px system-ui";
    for (let e = -5; e <= 10; e += 5) {
        ctx.beginPath();
        ctx.moveTo(0, Y(e));
        ctx.lineTo(W, Y(e));
        ctx.stroke();
        ctx.fillText(`${e}°`, 4, Y(e) - 2);
    }
    [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([l, a]) => ctx.fillText(l, X(a) + 3, H - 4));
    ctx.beginPath();
    ctx.moveTo(0, H);
    s.horizon.forEach(h => ctx.lineTo(X(h.az), Y(h.el)));
    ctx.lineTo(W, Y(s.horizon[0].el));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = "#2a3038";
    ctx.fill();
    ctx.strokeStyle = "#ffb547";
    ctx.stroke();
    for (const [key, color] of [["sun", "#ffe08a"], ["earth", "#6fb7ff"]]) {
        for (let k = -168; k <= 168; k += 3) {
            const g = s.at(t + k * HOUR_MS);
            if (!g)
                continue;
            const az = key === "sun" ? g.sunAz : g.earthAz, el = key === "sun" ? g.sunEl : g.earthEl;
            ctx.globalAlpha = k > 0 ? 0.35 : 0.7;
            ctx.fillStyle = color;
            ctx.fillRect(X(az) - 1, Y(el) - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
        const g = s.at(t);
        if (!g)
            continue;
        ctx.beginPath();
        ctx.arc(X(key === "sun" ? g.sunAz : g.earthAz), Y(key === "sun" ? g.sunEl : g.earthEl), key === "sun" ? 6 : 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.stroke();
    }
    ctx.fillStyle = "#9fb0c2";
    ctx.fillText("bright = past 7 d · faint = next 7 d · azimuth clockwise from north", W - 380, 14);
}
async function renderCompare() {
    panel().innerHTML = `<p class="eyebrow">02 / ${esc(tr("compare"))}</p><h2>${esc(tr("compareTitle"))}</h2>
    <p class="lede">Same start time (${iso(state.t)}), same window, all sites. Values come from the hourly SPICE geometry against each site's LOLA horizon.</p>
    ${state.durationNotice ? `<p class="hud-warn" role="alert">${esc(state.durationNotice.message)}</p>` : ""}
    <label for="cw">Window</label><select id="cw"><option value="48">2 days</option><option value="168">7 days</option><option value="336">14 days</option><option value="672">28 days</option><option value="1344">56 days</option><option value="8760">1 year</option></select>
    <div id="ctable" class="tablewrap">Loading all site series…</div>
    <p class="muted small">"Long-term" columns are the NASA PGDA average maps at the site (independent reference over a longer period; Earth counted if any part is visible).</p>`;
    $("#cw").value = String(state.compareH);
    $("#cw").addEventListener("change", e => { state.compareH = Number(e.target.value); fillCompare(); });
    fillCompare();
}
async function fillCompare() {
    if (!validHours(state.compareH)) {
        const e0 = $("#ctable");
        if (e0)
            e0.innerHTML = `<p class="hud-warn" role="alert">${esc(tr("notComputed"))}: invalid window (${esc(String(state.compareH))} h).</p>`;
        return;
    }
    const entries = await Promise.all(state.index.sites.map(async (site) => ({ site, series: await series(site.id) })));
    const rows = entries.map(({ site, series: s }) => ({ site, w: s.window(state.t, state.compareH) }));
    const ok = rows.filter(r => r.w.status === "COMPUTED");
    const best = (k) => Math.max(...ok.map(r => r.w[k])), worst = (k) => Math.min(...ok.map(r => r.w[k]));
    const cell = (r, k, d, hiGood) => { if (r.w.status !== "COMPUTED")
        return `<td>${esc(tr("notComputed"))}</td>`; const v = r.w[k]; const star = v === (hiGood ? best(k) : worst(k)) ? " best" : ""; return `<td class="num${star}">${fmt(v, d)}</td>`; };
    const el = $("#ctable");
    if (!el)
        return;
    if (!ok.length) {
        el.innerHTML = `<p class="hud-warn" role="alert">${esc(tr("notComputed"))}: ${esc(rows[0]?.w?.reason || "no site series covers this window")}</p>`;
        return;
    }
    // Live API: rows for sites the API holds a series for, in batches of 3 (API limit). Others keep static values.
    const apiRows = new Map(), ids = state.compareH > 720 ? [] : state.index.sites.map(x => x.id).filter((id) => live.online && live.apiId(id) && live.covers(id, state.t, state.compareH)); // API maxWindowHours = 720 (api/mission.go): longer windows stay on the precomputed series
    for (let i = 0; i < ids.length; i += 3) {
        const r = await live.compare(ids.slice(i, i + 3), isoZ(state.t), state.compareH);
        if (r.ok)
            r.data.results.forEach((x) => { const lab = ids.find(id => live.apiId(id) === x.site.id), row = compareRow(x, r.data.scientifically_validated === true); if (lab && row)
                apiRows.set(lab, row); });
    }
    const win = (r) => apiRows.has(r.site.id) ? { status: "COMPUTED", ...apiRows.get(r.site.id) } : r.w;
    rows.forEach(r => { r.src = apiRows.has(r.site.id) ? "API" : "static"; r.w = win(r); });
    showSeal(apiRows.size ? apiRows.values().next().value.seal : OFFLINE_SEAL);
    el.innerHTML = `<table><caption class="sr">Sun and Earth visibility per site for the selected window</caption>
    <thead><tr><th scope="col">Site</th><th scope="col">Sun %</th><th scope="col">Earth %</th><th scope="col">Both %</th><th scope="col">Longest dark (h)</th><th scope="col">Longest Earth blackout (h)</th><th scope="col">Source</th><th scope="col">Long-term Sun % (PGDA)</th><th scope="col">Long-term Earth % (PGDA)</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.site.id === state.siteId ? "sel" : ""}"><th scope="row"><button class="link" data-site="${r.site.id}">${esc(r.site.name)}</button></th>
      ${cell(r, "sunPct", 0, true)}${cell(r, "earthPct", 0, true)}${cell(r, "bothPct", 0, true)}${cell(r, "longestDarkH", 0, false)}${cell(r, "longestBlackoutH", 0, false)}
      <td class="small">${r.src === "API" ? esc(r.w.seal.text) : "offline · precomputed"}</td><td class="num muted">${fmt(r.site.pgda_sun_pct, 0)}</td><td class="num muted">${fmt(r.site.pgda_earth_pct, 0)}</td></tr>`).join("")}</tbody></table>`;
    el.querySelectorAll("[data-site]").forEach(b => b.addEventListener("click", () => { selectSite(b.dataset.site); fillCompare(); if (state.level !== "globe")
        refreshScene(); }));
}
async function renderRecover() {
    const R = state.recover;
    panel().innerHTML = `<p class="eyebrow">03 / ${esc(tr("recover"))}</p><h2>${esc(tr("recoverTitle"))}</h2>
    <p class="lede">Baseline: <strong>${esc(siteById(state.siteId).name)}</strong> at ${iso(state.t)}. Apply a delay, set mission constraints and see which site/date still works — geometry only.</p>
    <div class="grid2">
      <div><label for="rd">Delay</label><select id="rd"><option value="24">+24 h</option><option value="48">+48 h</option><option value="72">+72 h</option><option value="168">+7 days</option><option value="336">+14 days</option></select></div>
      <div><label for="rw">Surface mission length</label><select id="rw"><option value="24">1 day</option><option value="168">7 days</option><option value="336">14 days</option><option value="672">28 days</option></select></div>
      <div><label for="rms">Min. sunlight (%)</label><input id="rms" type="number" min="0" max="100" step="5"></div>
      <div><label for="rmb">Max. Earth blackout (h)</label><input id="rmb" type="number" min="0" max="2000" step="12"></div>
    </div>
    <div id="rout"></div>`;
    $("#rd").value = String(R.delayH);
    $("#rw").value = String(R.windowH);
    $("#rms").value = String(R.minSun);
    $("#rmb").value = String(R.maxBlackout);
    const upd = () => { R.delayH = +$("#rd").value; R.windowH = +$("#rw").value; R.minSun = +$("#rms").value; R.maxBlackout = +$("#rmb").value; fillRecover(); };
    ["#rd", "#rw", "#rms", "#rmb"].forEach(s => $(s).addEventListener("change", upd));
    fillRecover();
}
async function fillRecover() {
    const R = state.recover, out = $("#rout");
    const entries = await Promise.all(state.index.sites.map(async (site) => ({ site, series: await series(site.id) })));
    const cons = { minSunPct: R.minSun, maxBlackoutH: R.maxBlackout };
    const mine = entries.filter(e => e.site.id === state.siteId);
    const base = rankSites(mine, state.t, R.windowH, cons)[0];
    const t2 = state.t + R.delayH * HOUR_MS;
    const same = rankSites(mine, t2, R.windowH, cons)[0];
    const alts = rankSites(entries, t2, R.windowH, cons);
    const card = (title, r) => r.w.status !== "COMPUTED" ? `<div class="card"><strong>${title}</strong><p>${esc(tr("notComputed"))}: ${esc(r.w.reason)}</p></div>` :
        `<div class="card ${r.violations.length ? "bad" : "good"}"><strong>${title}</strong>
     <p class="small">Sun ${fmt(r.w.sunPct, 0)}% · Earth ${fmt(r.w.earthPct, 0)}% · both ${fmt(r.w.bothPct, 0)}% · darkness ≤ ${r.w.longestDarkH} h · blackout ≤ ${r.w.longestBlackoutH} h</p>
     <p class="small">${r.violations.length ? "⚠ " + r.violations.map(esc).join("; ") : "✓ Meets the stated constraints"}</p></div>`;
    if (!out)
        return;
    out.innerHTML = card(`Baseline · ${iso(state.t)}`, base) + card(`Same site after +${R.delayH} h · ${iso(t2)}`, same) +
        `<h3>Alternatives after the delay</h3><ol class="alts">${alts.map(a => `<li class="${a.violations.length ? "bad" : "good"}"><span><strong>${esc(a.site.name)}</strong>
      <small>${a.w.status === "COMPUTED" ? `both ${fmt(a.w.bothPct, 0)}% · Sun ${fmt(a.w.sunPct, 0)}% · blackout ≤ ${a.w.longestBlackoutH} h` : esc(tr("notComputed"))}${a.violations.length ? " · ⚠ " + a.violations.map(esc).join("; ") : ""}</small></span>
      <button data-fly="${a.site.id}" ${a.w.status !== "COMPUTED" ? "disabled" : ""}>Fly in Landing Lab</button></li>`).join("")}</ol>
    <p class="muted small">Ranking = % of hours with both Sun and Earth above the terrain horizon, after removing options that violate your constraints. It ignores slopes, hazards, thermal limits and payload goals — a teaching aid, not a site certification.</p>`;
    out.insertAdjacentHTML("beforeend", `<div id="apibox"></div>`);
    fillRecoverApi(R);
    out.querySelectorAll("[data-fly]").forEach(b => b.addEventListener("click", () => {
        state.lab.scenario = { siteId: b.dataset.fly, t: t2, origin: `Recovered from ${siteById(state.siteId).name} after a +${R.delayH} h delay` };
        state.lab.mode = "recovery";
        state.t = t2;
        selectSite(b.dataset.fly);
        setView("landing");
    }));
}
// Live API extras for Recover: delay replanning (/api/scenarios/delay) and energy (/api/onboard/site-evaluate).
// Power inputs are the user's own assumptions: blank => no energy request, no invented defaults.
async function fillRecoverApi(R) {
    const box = $("#apibox");
    if (!box)
        return;
    const id = state.siteId;
    if (!(live.online && live.apiId(id) && live.covers(id, state.t, R.windowH + R.delayH))) {
        box.innerHTML = `<p class="muted small"><span class="seal offline">offline · precomputed</span> Live replanning needs the API and a series covering this site and window.</p>`;
        return;
    }
    const P = R.power || (R.power = {});
    const field = (k, l) => `<label>${l}<input data-pw="${k}" type="number" min="0" step="any" value="${P[k] ?? ""}"></label>`;
    const d = await live.delay(id, isoZ(state.t), R.windowH, [R.delayH], { min_sun_fraction: R.minSun / 100, max_continuous_comm_gap_hours: R.maxBlackout });
    let html = `<h3>Live API</h3>`;
    if (d.ok) {
        const o = d.data.outcome;
        html += `<div class="card"><strong>/api/scenarios/delay · ${esc(o.status.replace(/_/g, " "))}</strong><p class="small">${esc(o.message)}</p><p class="small"><span class="seal ${d.seal.cls}">${esc(d.seal.text)}</span></p></div>`;
        showSeal(d.seal);
    }
    else
        html += `<p class="muted small">API request failed (${esc(d.error)}); showing static results only. <span class="seal offline">offline · precomputed</span></p>`;
    html += `<details><summary>Energy (your assumptions)</summary><div class="grid2">${field("battery_capacity_wh", "Battery Wh")}${field("initial_charge_wh", "Initial Wh")}${field("reserve_wh", "Reserve Wh")}${field("solar_generation_w", "Solar W")}${field("load_w", "Load W")}</div><div id="energy" class="small muted">Fill all five values to run /api/onboard/site-evaluate. No defaults are assumed.</div></details>`;
    box.innerHTML = html;
    box.querySelectorAll("[data-pw]").forEach(i => i.addEventListener("change", async () => {
        P[i.dataset.pw] = i.value === "" ? undefined : Number(i.value);
        const keys = ["battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"], en = $("#energy");
        if (!en || keys.some(k => !Number.isFinite(P[k])))
            return;
        const r = await live.onboard(id, isoZ(state.t), R.windowH, Object.fromEntries(keys.map(k => [k, P[k]])), Math.min(R.maxBlackout, R.windowH), R.delayH);
        if (!r.ok) {
            en.textContent = `API request failed (${r.error}).`;
            return;
        }
        const c = r.data.candidates[0];
        en.innerHTML = `${esc(r.data.combined_decision.status.replace(/_/g, " "))}${c.breached_risks.length ? " · breached: " + c.breached_risks.map(esc).join(", ") : ""} · <span class="seal ${r.seal.cls}">${esc(r.seal.text)}</span>`;
    }));
}
function renderLanding() {
    const L = state.lab, v = L.vehicle || (L.vehicle = { fuel: 160, maxThrust: DEFAULT_VEHICLE.maxThrust, isp: DEFAULT_VEHICLE.isp });
    const sc = L.scenario, lim = DEFAULT_VEHICLE.limits;
    panel().innerHTML = `<p class="eyebrow">04 / ${esc(tr("landing"))}</p><h2>${esc(tr("landingTitle"))}</h2>
    <p class="lede">Deterministic 3-DOF physics (RK4, 50 Hz) over the real LOLA tile of <strong>${esc(siteById(state.siteId).name)}</strong>, lit by the Sun at ${iso(state.t)}. The vehicle is hypothetical.</p>
    <label for="lm">Mode</label><select id="lm"><option value="guided">Guided landing (with tips)</option><option value="free">Free landing</option><option value="recovery">Mission recovery</option></select>
    ${L.mode === "recovery" ? `<p class="callout">${sc ? esc(sc.origin) + ` → ${esc(siteById(sc.siteId).name)} at ${iso(sc.t)}` : "Run Recover first to pick a delayed scenario; using the current site and time."}</p>` : ""}
    <div class="grid2">
      <div><label for="vf">Propellant (kg)</label><input id="vf" type="number" min="20" max="600" step="10" value="${v.fuel}"></div>
      <div><label for="vt">Max thrust (N)</label><input id="vt" type="number" min="2500" max="12000" step="250" value="${v.maxThrust}"></div>
      <div><label for="vi">Isp (s)</label><input id="vi" type="number" min="200" max="460" step="1" value="${v.isp}"></div>
      <div class="check"><label><input id="va" type="checkbox" ${L.assist ? "checked" : ""}> Drift-damping assist</label></div>
    </div>
    <button class="primary" id="go">${esc(tr("start"))}</button>
    <details open><summary>Controls</summary><ul class="keys small">
      <li><kbd>↑</kbd>/<kbd>↓</kbd> or <kbd>Shift</kbd>/<kbd>Ctrl</kbd> throttle · <kbd>Z</kbd> hover throttle · <kbd>X</kbd> cut</li>
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> tilt thrust north/west/south/east (release = assist levels)</li>
      <li><kbd>H</kbd> assist · <kbd>C</kbd> camera · <kbd>P</kbd> pause · <kbd>T</kbd> time ×1/×2 · <kbd>R</kbd> restart</li></ul></details>
    <details><summary>Touchdown limits (hypothetical trainer)</summary><p class="small">Vertical ≤ ${lim.maxVerticalSpeed} m/s · horizontal ≤ ${lim.maxHorizontalSpeed} m/s · ground slope ≤ ${lim.maxGroundSlopeDeg}° · tilt ≤ ${lim.maxTiltDeg}°. Above ${lim.hardVerticalSpeed} m/s the touchdown is destructive. Dry mass ${DEFAULT_VEHICLE.dryMass} kg. Teaching parameters, not NASA requirements.</p></details>
    <p class="muted small">The 80 m DEM cannot resolve boulders or craters smaller than ~160 m: a successful game landing does not mean the place is safe.</p>`;
    $("#lm").value = L.mode;
    $("#lm").addEventListener("change", e => { L.mode = e.target.value; renderLanding(); });
    $("#va").addEventListener("change", e => { L.assist = e.target.checked; });
    ["#vf", "#vt", "#vi"].forEach((s, i) => $(s).addEventListener("change", e => { v[["fuel", "maxThrust", "isp"][i]] = Number(e.target.value); }));
    $("#go").addEventListener("click", startLanding);
}
async function renderEvidence() {
    panel().innerHTML = `<p class="eyebrow">05 / ${esc(tr("evidence"))}</p><h2>${esc(tr("evidenceTitle"))}</h2><div id="ev">Loading provenance…</div>`;
    const getJson = (u) => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    const [rh, vh, vp] = await Promise.all([getJson("./data/region/south_pole_400m.json"), getJson("./data/validation/validation_horizons.json"), getJson("./data/validation/validation_pgda.json")]);
    const meta = (await series(state.siteId)).meta;
    const hz = vh ? vh.results.map((r) => `<tr><th scope="row">${esc(r.site)}</th>${r.comparisons.map((c) => `<td class="num">${c.max_abs_az_diff_deg_cos_el.toFixed(5)}°</td><td class="num">${c.max_abs_el_diff_deg.toFixed(5)}°</td>`).join("")}</tr>`).join("") : "";
    const pg = vp ? vp.results.map((r) => `<tr><th scope="row">${esc(r.site)}</th><td class="num">${fmt(r.pipeline_mean_solar_disc_pct, 1)}</td><td class="num">${fmt(r.pgda_avg_solar_disc_pct, 1)}</td><td class="num">${fmt(r.diff_sun_pp, 1)}</td><td class="num">${fmt(r.pipeline_earth_centre_pct, 1)}</td><td class="num">${fmt(r.pgda_avg_earth_any_part_pct, 1)}</td></tr>`).join("") : "";
    const ev = $("#ev");
    if (!ev)
        return;
    ev.innerHTML = `
    <h3>Two levels of trust</h3>
    <p><span class="tag sci">Scientific geometry</span> NASA LOLA terrain + JPL/NAIF SPICE Sun/Earth directions, processed by our open pipeline, checked against JPL Horizons and NASA PGDA maps. <strong>Status: preliminary</strong> — not reviewed by NASA.</p>
    <p><span class="tag sim">Educational flight simulation</span> Real terrain + textbook equations, but a hypothetical vehicle and teaching limits. A successful landing is not a mission approval.</p>
    <h3>Data actually from NASA</h3><ul class="small">
      ${rh ? `<li>Terrain: ${esc(rh.source)} · SHA-256 <code>${esc(rh.source_sha256.slice(0, 16))}…</code> · ${esc(rh.frame)} · native 80 m (400 m regional block mean; 40 m bilinear locally)</li>
      <li>Illumination &amp; Earth maps: ${esc(rh.layers.pgda_sun.product)} / ${esc(rh.layers.pgda_earth.product)} (${rh.layers.pgda_sun.resolution_m} m) — NASA GSFC PGDA, Mazarico et al. (2011) <em>Icarus</em> 211:1066–1081</li>` : `<li>${esc(tr("notComputed"))}</li>`}
      <li>Ephemerides: ${esc(meta.provenance.ephemeris)} · frame ${esc(meta.provenance.spice_frame)} · ${esc(meta.provenance.aberration_correction)}</li>
      <li>Globe colour map: NASA SVS CGI Moon Kit (Ernie Wright), visual only</li></ul>
    <h3>Derived by our algorithms</h3><ul class="small">
      <li>Terrain horizon per site: great-circle ray casting every 1° out to 100 km, lunar curvature, observer 2 m (science/lola_horizon.py, PR #75 + pixel fix #86)</li>
      <li>Sun/Earth visibility = elevation − horizon(azimuth) ≥ 0 for the disc centre, hourly from ${esc(state.index.series_window.start_utc.slice(0, 10))} for ${Math.round(state.index.series_window.hours / 24)} days</li>
      <li>Slope from finite differences of the DEM (scale-dependent)</li></ul>
    <h3>Synthetic / hypothetical</h3><ul class="small"><li>Lander, its limits and propellant; star field; GPU shadow rendering</li></ul>
    <h3>Validation 1 — ephemeris vs JPL Horizons</h3>
    ${vh ? `<div class="tablewrap"><table><thead><tr><th>Site</th><th>Sun Δaz·cos(el)</th><th>Sun Δel</th><th>Earth Δaz·cos(el)</th><th>Earth Δel</th></tr></thead><tbody>${hz}</tbody></table></div><p class="small muted">Maximum over 12 epochs per site; Horizons topocentric, airless apparent AZ-EL, MEAN_ME frame. 0.00000° means below 0.000005°.</p>` : `<p>${esc(tr("notComputed"))}</p>`}
    <h3>Validation 2 — terrain horizon vs NASA PGDA maps</h3>
    ${vp ? `<div class="tablewrap"><table><thead><tr><th>Site</th><th>Ours: Sun disc %</th><th>PGDA Sun %</th><th>Δ (pp)</th><th>Ours: Earth centre %</th><th>PGDA Earth (any part) %</th></tr></thead><tbody>${pg}</tbody></table></div><p class="small muted">${vp.caveats.map(esc).join(" ")}</p>` : `<p>${esc(tr("notComputed"))}</p>`}
    <h3>Equations</h3><pre class="eq">margin = elevation(body) − horizon(azimuth)        (disc centre; no refraction on the Moon)
dr/dt = v      dv/dt = −μ (r − c)/|r − c|³ + (T/m) û      dm/dt = −T/(Isp·g₀)
μ = 4902.800066 km³/s² (DE440) · g₀ = 9.80665 m/s² · RK4, fixed Δt = 0.02 s</pre>
    <h3>Known limitations</h3><ul class="small">
      <li>Coordinates are catalogue feature centres, not certified touchdown points.</li>
      <li>80 m DEM: features smaller than ~160 m (boulders, small craters) are not represented; horizons near steep rims are resolution-sensitive.</li>
      <li>No power, thermal or RF link model; Earth visibility is geometric.</li>
      <li>3-DOF translational dynamics with rate-limited attitude (not 6-DOF).</li>
      <li>AI assistance was used to write code and documentation; humans must review scientific claims.</li></ul>
    <p class="small">NASA does not endorse this educational prototype. Data credits: NASA LRO/LOLA, NASA GSFC PGDA, JPL/NAIF, NASA SVS.</p>`;
}
const RENDER = { explore: renderExplore, compare: renderCompare, recover: renderRecover, landing: renderLanding, evidence: renderEvidence };
function setView(v) {
    if (v !== "landing")
        stopLanding();
    state.view = v;
    document.querySelectorAll("#tabs button").forEach(b => { const on = b.dataset.view === v; b.classList.toggle("on", on); if (on)
        b.setAttribute("aria-current", "page");
    else
        b.removeAttribute("aria-current"); });
    RENDER[v]();
    if (v === "landing" && state.level !== "site")
        goSite();
    try {
        localStorage.setItem("moonproof-view", v);
    }
    catch { /* storage unavailable */ }
}
// ------------------------------------------------------------------ Landing Lab
const KEYS = new Set(["ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyH", "KeyC", "KeyP", "KeyR", "KeyT"]);
async function startLanding() {
    const L = state.lab;
    if (L.mode === "recovery" && L.scenario) {
        state.siteId = L.scenario.siteId;
        state.t = L.scenario.t;
    }
    if (!(await goSite()))
        return; // superseded by another navigation
    const tl = await tile(state.siteId), sky = await skyAt(state.siteId, state.t);
    const site = siteById(state.siteId);
    const veh = { ...DEFAULT_VEHICLE, fuelMass: L.vehicle.fuel, maxThrust: L.vehicle.maxThrust, isp: L.vehicle.isp };
    const x0 = -420, y0 = -300, ground0 = tl.height(x0, y0), margin = 200;
    L.sim = createSim({
        vehicle: veh, pos: [x0, y0, ground0 + 1000], vel: [7, 5, -18],
        centreDistance: MOON_R_REF + site.site_height_m,
        terrain: (x, y) => { const h = tl.height(x, y); return Number.isFinite(h) ? h : -Infinity; },
        target: [0, 0], bounds: [tl.x0 + margin, -tl.x0 - margin, tl.y0 + margin, -tl.y0 - margin],
    });
    L.sky = sky;
    L.tile = tl;
    L.throttleCmd = 0;
    L.paused = false;
    L.running = true;
    L.timeScale = 1;
    L.keys = {};
    viewer?.addLander();
    viewer?.startFollow();
    viewer?.setSiteSky(sky?.sunEnu, sky?.earthEnu);
    $("#hud").hidden = false;
    $("#touch").hidden = !matchMedia("(pointer: coarse)").matches;
    $("#stage").focus();
    status("Descent started: throttle ↑/↓, tilt W/A/S/D.");
}
function stopLanding() { state.lab.running = false; $("#hud").hidden = true; $("#touch").hidden = true; }
function control() {
    const L = state.lab, k = L.keys, sim = L.sim;
    const maxCmd = 20 * Math.PI / 180;
    let tiltE = ((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)) * maxCmd, tiltN = ((k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)) * maxCmd;
    if (L.assist && !tiltE && !tiltN) {
        // Pilot aid: tilt so that thrust removes horizontal velocity with a ~6 s time constant.
        const acc = Math.max(0.5, (L.throttleCmd * sim.vehicle.maxThrust) / sim.s[6]);
        const lim = Math.sin(maxCmd);
        tiltE = Math.asin(Math.max(-lim, Math.min(lim, -sim.s[3] / (6 * acc))));
        tiltN = Math.asin(Math.max(-lim, Math.min(lim, -sim.s[4] / (6 * acc))));
    }
    return { throttle: L.throttleCmd, tiltE, tiltN };
}
function onFrame(dt) {
    const L = state.lab;
    if (!L.running || !L.sim)
        return;
    const k = L.keys;
    const rate = 0.6 * dt;
    if (k.ArrowUp || k.ShiftLeft || k.ShiftRight || k.thrUp)
        L.throttleCmd = Math.min(1, L.throttleCmd + rate);
    if (k.ArrowDown || k.ControlLeft || k.ControlRight || k.thrDown)
        L.throttleCmd = Math.max(0, L.throttleCmd - rate);
    if (!L.paused)
        advance(L.sim, control(), dt * L.timeScale);
    viewer?.updateLander(L.sim, thrustDirection(L.sim.tilt[0], L.sim.tilt[1]));
    updateHud();
    if (L.sim.outcome && L.running) {
        L.running = false;
        setTimeout(showDebrief, 900);
    }
}
function updateHud() {
    const L = state.lab, sim = L.sim, tm = telemetry(sim);
    const n = L.tile.normal(sim.s[0], sim.s[1]);
    const set = (id, v) => { const e = document.getElementById(id); if (e)
        e.textContent = v; };
    set("h-alt", fmt(tm.altitudeAGL, 1));
    set("h-vz", fmt(tm.vz, 2));
    set("h-vh", fmt(tm.hSpeed, 2));
    set("h-thr", fmt(tm.throttle * 100, 0));
    set("h-fuel", fmt(tm.fuel, 1));
    set("h-mass", fmt(tm.mass, 0));
    set("h-tilt", fmt(tm.tiltDeg, 1));
    set("h-t", fmt(tm.t, 1));
    set("h-dist", fmt(tm.targetDistance, 0));
    set("h-slope", fmt(n.slopeDeg, 1));
    const sky = L.sky;
    set("h-sun", sky ? (sky.sunMargin >= 0 ? `Sun above horizon (+${fmt(sky.sunMargin, 2)}°)` : `Sun below horizon (${fmt(sky.sunMargin, 2)}°): batteries only`) : tr("notComputed"));
    set("h-earth", sky ? (sky.earthMargin >= 0 ? `Earth visible (+${fmt(sky.earthMargin, 2)}°): direct-link geometry OK` : `Earth blocked (${fmt(sky.earthMargin, 2)}°): no direct-to-Earth link`) : tr("notComputed"));
    const lim = sim.vehicle.limits, warn = [];
    if (tm.fuel <= 0)
        warn.push("PROPELLANT DEPLETED");
    else if (tm.fuel < 0.2 * sim.vehicle.fuelMass)
        warn.push("LOW PROPELLANT");
    if (tm.altitudeAGL < 60 && -tm.vz > lim.maxVerticalSpeed)
        warn.push("SINK RATE HIGH");
    if (tm.altitudeAGL < 60 && tm.hSpeed > lim.maxHorizontalSpeed)
        warn.push("HORIZONTAL DRIFT");
    if (n.slopeDeg > lim.maxGroundSlopeDeg)
        warn.push(`SLOPE ${fmt(n.slopeDeg, 0)}° BELOW`);
    if (L.paused)
        warn.push("PAUSED");
    if (L.timeScale !== 1)
        warn.push(`TIME ×${L.timeScale}`);
    set("h-warn", warn.join(" · "));
    set("h-cam", `camera: ${viewer?.camMode || "—"} · assist ${L.assist ? "on" : "off"}`);
    if (L.mode === "guided") {
        const a = tm.altitudeAGL;
        set("h-tip", a > 600 ? "Arrest the fall: raise throttle until vertical speed is about −10 m/s (Z = hover throttle)." :
            a > 150 ? "Steer toward the green ring with W/A/S/D; release to let the assist damp drift." :
                a > 30 ? "Slow down: aim for −3 to −5 m/s and under 1 m/s sideways." : "Final metres: −1 to −2 m/s and keep level.");
    }
    else
        set("h-tip", "");
    drawTactical(sim);
}
function drawTactical(sim) {
    const cv = $("#tactical");
    if (!cv)
        return;
    const c = cv.getContext("2d"), W = cv.width, span = 1500;
    c.fillStyle = "rgba(4,8,14,.92)";
    c.fillRect(0, 0, W, W);
    const P = (x, y) => [W / 2 + x / span * W / 2, W / 2 - y / span * W / 2];
    c.strokeStyle = "#1e2a36";
    for (let g = -1000; g <= 1000; g += 500) {
        const [a] = P(g, 0);
        c.beginPath();
        c.moveTo(a, 0);
        c.lineTo(a, W);
        c.stroke();
        const [, b] = P(0, g);
        c.beginPath();
        c.moveTo(0, b);
        c.lineTo(W, b);
        c.stroke();
    }
    c.strokeStyle = "#3ee3c2";
    c.beginPath();
    c.arc(...P(0, 0), 4, 0, Math.PI * 2);
    c.stroke();
    const [x, y] = P(sim.s[0], sim.s[1]);
    c.fillStyle = "#ffcf5a";
    c.beginPath();
    c.arc(x, y, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffcf5a";
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + sim.s[3] * 3, y - sim.s[4] * 3);
    c.stroke();
    c.fillStyle = "#6b7a8c";
    c.font = "10px system-ui";
    c.fillText("N ↑ · grid 500 m · line = velocity×3 s", 4, 12);
}
async function showDebrief() {
    const L = state.lab, sim = L.sim, o = sim.outcome, c = sim.contact, s = siteById(state.siteId);
    const sr = await series(state.siteId);
    const w = sr.window(state.t, 14 * 24), ns = sr.nextChange(state.t, "sun"), ne = sr.nextChange(state.t, "earth");
    const dist = c ? Math.hypot(c.x, c.y) : NaN;
    let score = { LANDED: 1000, HARD_LANDING: 300 }[o.result] || 0;
    if (c && score)
        score += -Math.min(400, 80 * c.vVert) - Math.min(300, dist / 3) + Math.round(2 * (sim.s[6] - sim.vehicle.dryMass));
    const decision = (L.sky?.sunMargin >= 0 ? 150 : 0) + (L.sky?.earthMargin >= 0 ? 150 : 0) + (w.status === "COMPUTED" && w.bothPct >= 30 ? 100 : 0);
    const lim = sim.vehicle.limits, tips = [];
    if (c && c.vVert > lim.maxVerticalSpeed)
        tips.push("Start the final braking higher: hold about −3 m/s below 50 m, then ease to −1.5 m/s.");
    if (c && c.vHor > lim.maxHorizontalSpeed)
        tips.push("Null sideways speed before the last 50 m (release W/A/S/D and let the assist work).");
    if (c && c.slope > lim.maxGroundSlopeDeg)
        tips.push("Use the Slope layer to pick a flatter patch; the 80 m DEM hides smaller hazards, so keep margin.");
    if (sim.s[6] <= sim.vehicle.dryMass)
        tips.push("You ran out of propellant: avoid long hovers; descend continuously.");
    if (o.result === "OUT_OF_MODELED_AREA")
        tips.push("Stay within the 16 × 16 km terrain tile; steer toward the green ring.");
    if (L.sky && L.sky.sunMargin < 0)
        tips.push("You landed in darkness: in Compare/Recover choose a date when the Sun clears the terrain horizon.");
    if (L.sky && L.sky.earthMargin < 0)
        tips.push("Earth is below the terrain horizon at touchdown: no direct-to-Earth link geometry (a relay would be needed).");
    const chg = (n) => n.status === "COMPUTED" && Number.isFinite(n.hours) ? `, changes in ${fmt(n.hours, 0)} h` : "";
    $("#debrief-body").innerHTML = `
    <p class="result ${o.result}">${esc(o.result.replace(/_/g, " "))}</p>
    ${o.reasons.length ? `<ul>${o.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    <div class="grid3 small">
      <div><strong>Touchdown</strong><br>vertical ${fmt(c?.vVert, 2)} m/s · horizontal ${fmt(c?.vHor, 2)} m/s<br>ground slope ${fmt(c?.slope, 1)}° · tilt ${fmt(c?.tilt, 1)}°<br>${fmt(dist, 0)} m from the target</div>
      <div><strong>Vehicle</strong><br>flight ${fmt(sim.t, 1)} s · propellant used ${fmt(sim.fuelUsed, 1)} kg<br>remaining ${fmt(sim.s[6] - sim.vehicle.dryMass, 1)} kg</div>
      <div><strong>${esc(s.name)} · ${iso(state.t)}</strong><br>Sun ${L.sky?.sunMargin >= 0 ? "visible" : "below horizon"}${chg(ns)}<br>
        Earth ${L.sky?.earthMargin >= 0 ? "visible" : "blocked"}${chg(ne)}<br>next 14 d: ${w.status === "COMPUTED" ? `both ${fmt(w.bothPct, 0)}%, darkness ≤ ${w.longestDarkH} h` : esc(tr("notComputed"))}</div>
    </div>
    <canvas id="dchart" width="640" height="180" role="img" aria-label="Altitude and descent rate versus time"></canvas>
    ${tips.length ? `<h3>How to improve</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <p class="score">Flight score ${Math.max(0, Math.round(score))} · Decision score ${decision}</p>
    <p class="muted small">Educational simulation with a hypothetical vehicle and real LOLA terrain (80 m). Not a landing certification; it says nothing about hazards smaller than the DEM resolution.</p>`;
    drawChart($("#dchart"), sim.trace);
    $("#debrief").showModal();
}
function drawChart(cv, trace) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    c.fillStyle = "#05080d";
    c.fillRect(0, 0, W, H);
    if (trace.length < 2)
        return;
    const T = trace[trace.length - 1].t || 1;
    const A = Math.max(1, ...trace.map(p => p.altitudeAGL).filter(Number.isFinite)), V = Math.max(1, ...trace.map(p => -p.vz));
    const plot = (f, max, color, label, y0) => {
        c.strokeStyle = color;
        c.beginPath();
        trace.forEach((p, i) => { const x = p.t / T * (W - 40) + 30, y = H - 20 - Math.max(0, f(p) || 0) / max * (H - 40); if (i)
            c.lineTo(x, y);
        else
            c.moveTo(x, y); });
        c.stroke();
        c.fillStyle = color;
        c.fillText(label, 34, y0);
    };
    c.font = "11px system-ui";
    plot(p => p.altitudeAGL, A, "#3ee3c2", `altitude above terrain (max ${A.toFixed(0)} m)`, 14);
    plot(p => -p.vz, V, "#ffb547", `descent rate (max ${V.toFixed(1)} m/s)`, 28);
    c.fillStyle = "#6b7a8c";
    c.fillText(`time → ${T.toFixed(0)} s`, W - 90, H - 6);
}
// ------------------------------------------------------------------ input
function onKey(e, down) {
    const L = state.lab;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
    if (!L.running || !KEYS.has(e.code) || typing) {
        if (down && viewer && !typing && document.activeElement?.id === "stage" && viewer.orbit.key(e.code))
            e.preventDefault();
        return;
    }
    e.preventDefault();
    L.keys[e.code] = down;
    if (!down)
        return;
    if (e.code === "KeyZ")
        L.throttleCmd = Math.min(1, (L.sim.s[6] * 1.624) / L.sim.vehicle.maxThrust);
    if (e.code === "KeyX")
        L.throttleCmd = 0;
    if (e.code === "KeyH")
        L.assist = !L.assist;
    if (e.code === "KeyP")
        L.paused = !L.paused;
    if (e.code === "KeyT")
        L.timeScale = L.timeScale === 1 ? 2 : 1;
    if (e.code === "KeyR")
        startLanding();
    if (e.code === "KeyC" && viewer) {
        const m = ["chase", "orbit", "top", "pilot"];
        viewer.camMode = m[(m.indexOf(viewer.camMode) + 1) % m.length];
    }
}
function bindTouch() {
    document.querySelectorAll("#touch [data-k]").forEach(b => {
        const k = b.dataset.k;
        const on = (e) => { e.preventDefault(); state.lab.keys[k] = true; if (k === "KeyZ" && state.lab.sim)
            state.lab.throttleCmd = Math.min(1, state.lab.sim.s[6] * 1.624 / state.lab.sim.vehicle.maxThrust); };
        const off = () => { state.lab.keys[k] = false; };
        b.addEventListener("pointerdown", on);
        b.addEventListener("pointerup", off);
        b.addEventListener("pointerleave", off);
        b.addEventListener("pointercancel", off);
    });
}
function applyLang() {
    document.documentElement.lang = state.lang === "pt" ? "pt-BR" : "en";
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = tr(el.dataset.i18n); });
    $("#lang").textContent = state.lang === "en" ? "PT" : "EN";
    RENDER[state.view]();
    updateCrumbs();
}
// ------------------------------------------------------------------ boot
async function boot() {
    await live.probe();
    showSeal();
    try {
        await loadIndex();
    }
    catch (e) {
        $("#panel-body").innerHTML = `<h2>${esc(tr("notComputed"))}</h2><p>Precomputed NASA products could not be loaded (${esc(e.message)}). Nothing is shown rather than inventing values.</p>`;
        return;
    }
    try {
        viewer = new Viewer($("#stage"), { onFrame, reducedMotion: state.reduced });
        viewer.onTextureError = () => status("NASA SVS globe texture failed to load; showing a plain grey sphere.");
    }
    catch (e) {
        $("#fallback").hidden = false;
        $("#fallback").textContent = `3D view unavailable: ${e.message} The analysis panels (Compare, Recover, Evidence) still work.`;
    }
    if (new URLSearchParams(location.search).has("debug"))
        window.__moonproof = { viewer, state }; // inspection only
    $("#motion").checked = state.reduced;
    document.body.classList.toggle("reduced", state.reduced);
    $("#motion").addEventListener("change", e => { state.reduced = e.target.checked; viewer?.setReducedMotion(state.reduced); document.body.classList.toggle("reduced", state.reduced); });
    $("#lang").addEventListener("click", () => { state.lang = state.lang === "en" ? "pt" : "en"; applyLang(); });
    document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    addEventListener("keydown", e => onKey(e, true));
    addEventListener("keyup", e => onKey(e, false));
    $("#debrief-retry").addEventListener("click", () => { $("#debrief").close(); startLanding(); });
    $("#debrief-recover").addEventListener("click", () => { $("#debrief").close(); setView("recover"); });
    bindTouch();
    let saved = null;
    try {
        saved = localStorage.getItem("moonproof-view");
    }
    catch { /* ignore */ }
    setView(saved && RENDER[saved] && saved !== "landing" ? saved : "explore");
    await goGlobe();
    // Cinematic intro (skipped with reduced motion, and abandoned if the user navigates first)
    const introSeq = sceneSeq;
    const stillIntro = () => sceneSeq === introSeq && state.level === "globe" && !state.lab.running;
    if (viewer && !state.reduced)
        setTimeout(() => { if (!stillIntro())
            return; viewer.flyToSouthPole(2.4); setTimeout(() => { if (stillIntro())
            goRegion(true); }, 2500); }, 900);
    else if (stillIntro())
        goRegion(true);
}
boot();
