// BRASPACE Moon HD: one 3D Moon, from the whole globe down to the south pole, lit by the Sun where NAIF SPICE puts it.
//
// Globe     : NASA SVS CGI Moon Kit colour (LROC WAC) + LOLA 16 px/deg relief (normal map and displacement).
// South cap : everything south of 80.35 S is a separate mesh on the same sphere, built from LDEM_80S_80M
//             (320 m block means out to 80 S, native 80 m inside 164 km of the pole), with terrain shadows
//             ray-marched in the fragment shader toward the Sun.
// Shadows   : on the globe, rays are marched over the LOLA 16 px/deg height map (features of a few km and up);
//             in the cap, over the 80 m / 320 m grids.
// Sky       : Earth is NASA Blue Marble, oriented with NAIF SPICE (IAU_EARTH) and lit by the same Sun.
// Options   : natural colour or colour by altitude; real sunlight or an even light with no night side.
// Display only. Relief exaggeration, the photometric function, the even light, earthshine and the star
// background are visual choices; no landing metric is computed here. See data/moonhd/manifest.json.
// @ts-ignore TS2307: remote ES module (CDN), no local types
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/controls/OrbitControls.js/+esm";
import { decodeEphemeris, indexAt, timeAt, pointsAt, bodyDirection, toGlobeScene, signedLon, elevationAtSouthPole, decodeOrientation, orientationAt, decodeSiteSeries, siteSkyAt } from "./ephemeris.js";
import { R_REF, latLonToStereo, CAP_LAT } from "./polar-math.js";
// @ts-ignore TS7016: JS module without types
import { detectWebGL, problemModel } from "./fallback.js";
import { THREE, R_KM, CAP_MATRIX, fetchJSON, fetchBinary, textureLoader, globeGeometry, createMoon, createCap, setPolarFrame, createStars } from "./scene.js";
const DATA = "./data/moonhd/";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// ---------------------------------------------------------------- text
const TEXT = {
    en: {
        subtitle: "NASA LRO imagery and LOLA terrain, Sun and Earth from NAIF SPICE", status: "VISUAL PRODUCT · NOT VALIDATED",
        viewGlobe: "Globe", viewPole: "South pole", subSolar: "Sub-solar point", subEarth: "Sub-Earth point",
        sunPole: "Sun elevation at the pole", earthPole: "Earth elevation at the pole", play: "Play", pause: "Pause", now: "Now",
        relief: "Relief ×", markers: "Names", exposure: "Exposure", loading: "Loading NASA data…",
        color: "Colour", colorNatural: "Natural", colorAltitude: "Altitude", light: "Light", lightSun: "Real Sun", lightEven: "Even",
        loadingPole: "Loading LOLA polar terrain…", failed: "Could not load the Moon HD data.", sun: "Sun", earth: "Earth", southPole: "South pole",
        noteGlobe: "Sun and Earth are drawn at their true angular size, not at their true distance.",
        notePole: "South of 80° S the terrain is LOLA (80 m near the pole, 320 m farther out). Shadows are cast only by terrain inside that cap; the Sun is a 0.53° disc with an approximate penumbra.",
        noteRelief: "Relief is exaggerated: shapes and shadows are not at true scale.",
        noteEven: "Even light: no night side and no shadows. This is not how the Moon is lit at this time.",
        noteAltitude: "Colour shows height above the 1,737.4 km sphere, from −7 km (blue) to +8 km (white).",
        statusTitle: "Rendered from NASA data for display. Not independently validated, not a NASA product.",
        siteSun: "Sun centre now", siteEarth: "Earth centre now", above: "above the terrain by", below: "below the terrain by",
        siteLoading: "Loading the site series…", siteFailed: "The site series could not be loaded.", siteGo: "Fly to this site", close: "Close",
        siteCap: "Sun figures here are an upper bound: the NASA PGDA map gives {pgda} % and the horizon behind this series stops at 100 km.",
        mSun: "Sun above terrain", mEarth: "Earth above terrain", mBoth: "Both at once", mDark: "Longest darkness", mBlackout: "Longest Earth blackout",
        siteStatus: "PRELIMINARY · team series",
        siteNote: "Team series, hourly, 2025 to 2028: LOLA horizon traced to 100 km, centres of the Sun and Earth from SPICE. Not independently validated. It is a separate computation from the shadows drawn here.",
        credits: "Imagery and elevation: NASA's Scientific Visualization Studio (CGI Moon Kit) · Terrain: NASA LRO/LOLA (LDEM_80S_80M) · Geometry: NASA/JPL NAIF SPICE (DE440) · Names: IAU/USGS Gazetteer · Earth: NASA Blue Marble. Not a NASA product; not endorsed by NASA.",
    },
    pt: {
        subtitle: "Imagens do LRO e relevo LOLA da NASA, Sol e Terra pelo NAIF SPICE", status: "PRODUTO VISUAL · NÃO VALIDADO",
        viewGlobe: "Globo", viewPole: "Polo sul", subSolar: "Ponto subsolar", subEarth: "Ponto subterrestre",
        sunPole: "Elevação do Sol no polo", earthPole: "Elevação da Terra no polo", play: "Reproduzir", pause: "Pausar", now: "Agora",
        relief: "Relevo ×", markers: "Nomes", exposure: "Exposição", loading: "Carregando dados da NASA…",
        color: "Cor", colorNatural: "Natural", colorAltitude: "Altitude", light: "Luz", lightSun: "Sol real", lightEven: "Uniforme",
        loadingPole: "Carregando o relevo polar do LOLA…", failed: "Não foi possível carregar os dados do Moon HD.", sun: "Sol", earth: "Terra", southPole: "Polo sul",
        noteGlobe: "Sol e Terra aparecem no tamanho angular real, não na distância real.",
        notePole: "Ao sul de 80° S o relevo é o LOLA (80 m perto do polo, 320 m mais longe). As sombras vêm só do relevo dentro dessa calota; o Sol é um disco de 0,53° com penumbra aproximada.",
        noteRelief: "O relevo está exagerado: formas e sombras não estão em escala real.",
        noteEven: "Luz uniforme: sem lado noturno e sem sombras. A Lua não está iluminada assim neste horário.",
        noteAltitude: "A cor mostra a altura acima da esfera de 1.737,4 km, de −7 km (azul) a +8 km (branco).",
        statusTitle: "Renderizado a partir de dados da NASA para exibição. Sem validação independente; não é um produto da NASA.",
        siteSun: "Centro do Sol agora", siteEarth: "Centro da Terra agora", above: "acima do relevo por", below: "abaixo do relevo por",
        siteLoading: "Carregando a série do local…", siteFailed: "Não foi possível carregar a série do local.", siteGo: "Voar até este local", close: "Fechar",
        siteCap: "Os números de Sol aqui são um teto: o mapa PGDA da NASA dá {pgda} % e o horizonte desta série para em 100 km.",
        mSun: "Sol acima do relevo", mEarth: "Terra acima do relevo", mBoth: "Os dois juntos", mDark: "Maior escuridão", mBlackout: "Maior bloqueio da Terra",
        siteStatus: "PRELIMINAR · série do time",
        siteNote: "Série do time, hora a hora, de 2025 a 2028: horizonte do LOLA traçado até 100 km, centros do Sol e da Terra pelo SPICE. Sem validação independente. É um cálculo separado das sombras desenhadas aqui.",
        credits: "Imagens e elevação: NASA's Scientific Visualization Studio (CGI Moon Kit) · Relevo: NASA LRO/LOLA (LDEM_80S_80M) · Geometria: NASA/JPL NAIF SPICE (DE440) · Nomes: IAU/USGS Gazetteer · Terra: NASA Blue Marble. Não é um produto da NASA nem tem o endosso dela.",
    },
};
let lang = params.get("lang") === "pt" ? "pt" : "en";
const t = (key) => TEXT[lang][key] ?? TEXT.en[key] ?? key;
// ---------------------------------------------------------------- renderer
const canvas = $("view");
// Created inside main(), after WebGL is detected: with no GPU the page shows a clear problem state instead of loading forever.
let renderer = null, loadTexture = null, loopFn = null;
const small = window.matchMedia("(max-width: 720px)").matches;
function startRenderer() {
    const noGl = (cause) => Object.assign(new Error("WebGL unavailable: " + (cause?.message || cause)), { kind: "nowebgl" });
    const probe = detectWebGL(() => document.createElement("canvas"));
    if (!probe.ok)
        throw noGl(probe.reason);
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    }
    catch (e) {
        throw noGl(e);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    loadTexture = textureLoader(renderer, DATA);
    // A lost context is not fatal: tell the user, stop drawing, resume when the browser gives it back (THREE restores its own state).
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); renderer.setAnimationLoop(null); showProblem("lost"); });
    canvas.addEventListener("webglcontextrestored", () => { clearProblem(); if (loopFn)
        renderer.setAnimationLoop(loopFn); });
}
// ---------------------------------------------------------------- labels
const labelLayer = $("labels");
function makeLabel(text, kind) {
    const el = document.createElement("div");
    el.className = "label " + kind;
    el.textContent = text;
    el.hidden = true;
    labelLayer.appendChild(el);
    return el;
}
const projected = new THREE.Vector3();
function placeLabel(label, camera, visible) {
    if (visible)
        projected.copy(label.position).project(camera);
    const show = visible && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
    let x = 0, y = 0, free = show;
    if (show) {
        x = (projected.x + 1) / 2 * innerWidth + 8;
        y = (1 - projected.y) / 2 * innerHeight - 10;
        // No label over another label or over a panel (phone: names were piling up and running under the readout).
        const w = label.el.textContent.length * (label.kind === "mare" ? 8.5 : 7) + 22;
        if (x + w > innerWidth - 4) {
            x = innerWidth - 4 - w;
            label.el.style.maxWidth = (innerWidth - 8) + "px";
        }
        if (x < 4)
            x = 4; // never off the screen edge
        const box = { l: x, t: y, r: x + w, b: y + 20 };
        free = !taken.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t);
        if (free)
            taken.push(box);
    }
    label.el.hidden = !free;
    if (free)
        label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}
let taken = [];
const obstacles = () => [".top", ".views", ".readout", ".site-card", ".panel", ".credits"].map(q => document.querySelector(q))
    .filter(e => e && !e.hidden).map(e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
// ---------------------------------------------------------------- app
async function main() {
    startRenderer();
    const manifest = await fetchJSON(DATA + "manifest.json");
    const [ephBuffer, orientationBuffer, catalog, gazetteer, colorTex, normalTex, heightTex, starTex, earthTex] = await Promise.all([
        fetchBinary(DATA + manifest.ephemeris.file, manifest.ephemeris.count * 8),
        fetchBinary(DATA + manifest.earth_orientation.file, manifest.earth_orientation.count * 8),
        fetchJSON("./data/sites.json").catch(() => ({ sites: [] })),
        fetchJSON(DATA + manifest.features.file).catch(() => ({ features: [] })),
        loadTexture("color_4k.jpg", true), loadTexture("normal_4k.jpg", false), loadTexture("height_4k.jpg", false), loadTexture("stars_4k.jpg", true),
        loadTexture(manifest.earth.file, true),
    ]);
    const eph = decodeEphemeris(ephBuffer, manifest.ephemeris);
    const earthOrientation = decodeOrientation(orientationBuffer, manifest.earth_orientation);
    const scene = new THREE.Scene();
    const sunDir = new THREE.Vector3(1, 0, 0);
    const moon = createMoon({ manifest, colorTex, normalTex, heightTex, lon: small ? 384 : 768, lat: small ? 192 : 384, steps: small ? 24 : 48 });
    const { shared, uniforms: globeUniforms, lightDir, earthDir } = moon;
    scene.add(moon.mesh);
    // ---- sky: stars (decorative), Sun and Earth at their true angular size
    const SKY = 60;
    const stars = createStars(starTex, SKY * 1.5);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.00465), 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false }));
    const earthMaterial = new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: sunDir }, map: { value: earthTex } },
        vertexShader: "varying vec3 vN; varying vec3 vP; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * position); vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }",
        fragmentShader: `uniform vec3 sunDir; uniform sampler2D map; varying vec3 vN; varying vec3 vP; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN);
        float day = smoothstep(-0.08, 0.22, dot(N, sunDir));
        float rim = pow(1.0 - max(dot(N, normalize(cameraPosition - vP)), 0.0), 3.0); // thin blue limb, display only
        vec3 col = texture2D(map, vUv).rgb * (0.004 + 1.25 * day) + vec3(0.25, 0.45, 1.0) * rim * day * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    // Same sphere layout as the Moon: local axes are the body-fixed frame mapped as (x, z, -y), texture centred on 0 E.
    const earthBall = new THREE.Mesh(globeGeometry(96, 48), earthMaterial);
    earthBall.scale.setScalar(SKY * Math.tan(0.0166));
    const BODY_TO_SCENE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
    const SCENE_TO_BODY = BODY_TO_SCENE.clone().transpose(), earthRotation = new THREE.Matrix4(), earthQuaternion = new THREE.Quaternion();
    scene.add(stars, sunBall, earthBall);
    // ---- two cameras on the same scene: around the globe, and around a point on the ground near the south pole
    const globe = { camera: new THREE.PerspectiveCamera(32, 1, 0.02, 400) };
    globe.controls = new OrbitControls(globe.camera, canvas);
    Object.assign(globe.controls, { enablePan: false, enableDamping: true, minDistance: 1.25, maxDistance: 14, rotateSpeed: 0.5 });
    const pole = { camera: new THREE.PerspectiveCamera(38, 1, 0.0006, 400) };
    pole.camera.up.set(0, -1, 0); // "up" at the south pole
    const polarKm = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(CAP_MATRIX);
    pole.camera.position.copy(polarKm(430, 160, 105));
    pole.controls = new OrbitControls(pole.camera, canvas);
    Object.assign(pole.controls, { enableDamping: true, minDistance: 0.004, maxDistance: 0.75, maxPolarAngle: Math.PI * 0.495, rotateSpeed: 0.5, panSpeed: 0.6, enabled: false });
    pole.controls.target.copy(polarKm(45, -2, 12));
    // ---- names: landing sites (catalog), IAU/USGS features, Sun and Earth
    const labels = [];
    const sitePoints = [];
    const addName = (name, lat, lon, kind) => {
        const normal = new THREE.Vector3(...toGlobeScene(bodyDirection(lat, lon)));
        const label = { el: makeLabel(name, kind), position: normal.clone(), normal, kind, lat, lon, height: 0 };
        labels.push(label);
        return label;
    };
    for (const s of (catalog.sites || [])) {
        if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon))
            continue;
        const label = addName(s.name || s.id, s.lat, s.lon, "site");
        label.site = s;
        sitePoints.push(label);
        Object.assign(label.el, { tabIndex: 0 });
        label.el.setAttribute("role", "button");
        label.el.addEventListener("click", () => showSite(label));
        label.el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            showSite(label);
        } });
    }
    for (const f of (gazetteer.features || []))
        addName(f.name, f.lat, f.lon, f.type === "Mare" || f.type === "Oceanus" ? "mare" : "feature");
    const poleLabel = addName("", -90, 0, "feature");
    poleLabel.key = "southPole";
    labels.push({ el: makeLabel("", "body"), position: sunBall.position, key: "sun", kind: "body" }, { el: makeLabel("", "body"), position: earthBall.position, key: "earth", kind: "body" });
    const siteGeometry = new THREE.BufferGeometry();
    const sites = new THREE.Points(siteGeometry, new THREE.PointsMaterial({ color: 0xff7a59, size: 7, sizeAttenuation: false, toneMapped: false, depthTest: false }));
    sites.frustumCulled = false;
    scene.add(sites);
    function liftLabels() {
        const k = shared.relief.value;
        for (const l of labels)
            if (l.normal)
                l.position.copy(l.normal).multiplyScalar(1 + (k * l.height + 1500) / R_REF);
        siteGeometry.setFromPoints(sitePoints.map((l) => l.position));
    }
    liftLabels();
    // ---- south cap (arrives after the first frame)
    let cap = null;
    async function loadCap() {
        const made = await createCap({ renderer, base: DATA, manifest, moon, segments: small ? 448 : 1024, steps: small ? 72 : 144 });
        const { innerGrid, wideGrid } = made;
        scene.add(made.mesh);
        globeUniforms.capReady.value = 1;
        cap = made;
        for (const l of labels) {
            if (!l.normal || l.lat > CAP_LAT)
                continue;
            const [x, y] = latLonToStereo(l.lat, l.lon);
            if (wideGrid.contains(x, y))
                l.height = (innerGrid.contains(x, y) ? innerGrid : wideGrid).heightAt(x, y);
        }
        liftLabels();
    }
    const capLoading = loadCap();
    // ---- landing-site card: the team's precomputed series for the clicked site, read at the clock time
    let openSite = null;
    const seriesCache = new Map();
    const loadSeries = (id) => {
        if (!seriesCache.has(id))
            seriesCache.set(id, (async () => {
                const meta = await fetchJSON(`./data/sites/${id}.json`);
                return decodeSiteSeries(await fetchBinary(`./data/sites/${id}.bin`, meta.series.count * 8), meta);
            })());
        return seriesCache.get(id);
    };
    const fillRows = (dl, rows) => {
        dl.replaceChildren(...rows.flatMap(([k, v]) => {
            const dt = document.createElement("dt"), dd = document.createElement("dd");
            dt.textContent = k;
            dd.textContent = v;
            return [dt, dd];
        }));
    };
    function updateSiteCard() {
        if (!openSite)
            return;
        const { site, series, failed } = openSite, m = site.metrics || {};
        $("site-name").textContent = site.name || site.id;
        $("site-status").textContent = t("siteStatus");
        $("site-note").textContent = t("siteNote");
        $("site-go").textContent = t("siteGo");
        $("site-close").setAttribute("aria-label", t("close"));
        const pct = (v) => (Number.isFinite(v) ? v.toFixed(1) + " %" : "–"), hours = (v) => (Number.isFinite(v) ? v.toFixed(0) + " h" : "–");
        // Same rule as moonproof/core/data.js sunCaveat: more sunlight than NASA PGDA by over 5 points means "at most".
        const capped = Number.isFinite(site.pgda_sun_pct) && m.mean_solar_disc_visible_pct - site.pgda_sun_pct > 5;
        $("site-caveat").hidden = !capped;
        if (capped)
            $("site-caveat").textContent = t("siteCap").replace("{pgda}", site.pgda_sun_pct.toFixed(1));
        const sunPct = (v) => (capped && Number.isFinite(v) ? "≤ " : "") + pct(v);
        fillRows($("site-metrics"), [[t("mSun"), sunPct(m.sun_center_visible_pct)], [t("mEarth"), pct(m.earth_center_visible_pct)],
            [t("mBoth"), sunPct(m.sun_and_earth_visible_pct)], [t("mDark"), hours(m.longest_darkness_h)], [t("mBlackout"), hours(m.longest_earth_blackout_h)]]);
        if (!series) {
            fillRows($("site-now"), [[failed ? t("siteFailed") : t("siteLoading"), ""]]);
            return;
        }
        const sample = (timeAt(eph, index) - series.startMs) / series.stepMs;
        if (!(sample >= 0 && sample <= series.count - 1)) {
            fillRows($("site-now"), []);
            return;
        }
        const sky = siteSkyAt(series, sample), line = (b) => `${b.el.toFixed(2)}° · ${t(b.margin >= 0 ? "above" : "below")} ${Math.abs(b.margin).toFixed(2)}°`;
        fillRows($("site-now"), [[t("siteSun"), line(sky.sun)], [t("siteEarth"), line(sky.earth)]]);
    }
    function showSite(label) {
        const entry = openSite = { label, site: label.site, series: null, failed: false };
        $("site-card").hidden = false;
        updateSiteCard();
        loadSeries(label.site.id).then(series => { entry.series = series; }, () => { entry.failed = true; }).then(() => { if (openSite === entry)
            updateSiteCard(); });
    }
    $("site-close").addEventListener("click", () => { openSite = null; $("site-card").hidden = true; });
    $("site-go").addEventListener("click", () => {
        if (!openSite)
            return;
        const { normal, position } = openSite.label;
        flyTo("pole", () => {
            // Look at the site from 45 km up and 95 km out, on the side away from the pole.
            const away = new THREE.Vector3(normal.x, 0, normal.z);
            if (away.lengthSq() < 1e-8)
                away.set(1, 0, 0);
            pole.controls.target.copy(position);
            pole.camera.position.copy(position).addScaledVector(normal, 45 / R_KM).addScaledVector(away.normalize(), 95 / R_KM);
        }).catch(fail);
    });
    // ---- state
    let mode = "globe", index = indexAt(eph, Date.parse(params.get("t") || "") || Date.now()), playing = false;
    const active = () => (mode === "globe" ? globe : pole);
    const slider = $("time");
    slider.max = String(eph.count - 1);
    const fmt = (v, pos, neg) => Math.abs(v).toFixed(2) + "° " + (v >= 0 ? pos : neg);
    function applyTime() {
        const { sun, earth } = pointsAt(eph, index);
        sunDir.set(...toGlobeScene(bodyDirection(sun.lat, sun.lon)));
        earthDir.set(...toGlobeScene(bodyDirection(earth.lat, earth.lon)));
        sunBall.position.copy(sunDir).multiplyScalar(SKY);
        earthBall.position.copy(earthDir).multiplyScalar(SKY);
        earthQuaternion.fromArray(orientationAt(earthOrientation, index));
        earthBall.quaternion.setFromRotationMatrix(earthRotation.makeRotationFromQuaternion(earthQuaternion).premultiply(BODY_TO_SCENE).multiply(SCENE_TO_BODY));
        updateSiteCard();
        $("clock").textContent = new Date(timeAt(eph, index)).toISOString().slice(0, 16).replace("T", " ") + " UTC";
        $("r-sun").textContent = fmt(sun.lat, "N", "S") + ", " + fmt(signedLon(sun.lon), "E", "W");
        $("r-earth").textContent = fmt(earth.lat, "N", "S") + ", " + fmt(signedLon(earth.lon), "E", "W");
        const el = elevationAtSouthPole(sun.lat), eel = elevationAtSouthPole(earth.lat);
        $("r-el").textContent = (el >= 0 ? "+" : "−") + Math.abs(el).toFixed(2) + "°";
        $("r-eel").textContent = (eel >= 0 ? "+" : "−") + Math.abs(eel).toFixed(2) + "°";
        if (document.activeElement !== slider)
            slider.value = String(Math.round(index));
    }
    function applyText() {
        document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
        for (const el of document.querySelectorAll("[data-i18n]"))
            el.textContent = t(el.dataset.i18n);
        $("status").title = t("statusTitle");
        $("play").textContent = t(playing ? "pause" : "play");
        $("lang").textContent = lang === "pt" ? "EN" : "PT";
        const notes = [t(mode === "globe" ? "noteGlobe" : "notePole")];
        if (shared.relief.value > 1)
            notes.push(t("noteRelief"));
        if (shared.realLight.value < 0.5)
            notes.push(t("noteEven"));
        if (shared.colorMode.value > 0.5)
            notes.push(t("noteAltitude"));
        $("view-note").textContent = notes.join(" ");
        for (const l of labels)
            if (l.key)
                l.el.textContent = t(l.key);
        updateSiteCard();
    }
    // ---- camera flights. The direction follows a great arc and the distance changes smoothly, so the path never
    // crosses the Moon; orientation, field of view and near plane are interpolated alongside.
    const flyCam = new THREE.PerspectiveCamera(32, 1, 0.02, 400);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let fly = null;
    const snapshot = (camera) => ({ position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, near: camera.near });
    const settled = (view) => { view.controls.update(); view.camera.updateMatrixWorld(); return snapshot(view.camera); };
    async function flyTo(next, prepare, animate = true) {
        if (next === "pole" && !cap) {
            const box = $("loading");
            box.firstElementChild.textContent = t("loadingPole");
            box.classList.remove("done");
            try {
                await capLoading;
            }
            finally {
                box.classList.add("done");
            }
        }
        const from = fly ? snapshot(flyCam) : settled(active());
        if (prepare)
            prepare();
        mode = next;
        globe.controls.enabled = pole.controls.enabled = false;
        const to = settled(active());
        if (animate && !reduceMotion)
            fly = { from, to, start: performance.now(), duration: 2400 };
        else {
            fly = null;
            active().controls.enabled = true;
        }
        $("view-globe").setAttribute("aria-pressed", String(mode === "globe"));
        $("view-pole").setAttribute("aria-pressed", String(mode === "pole"));
        applyText();
    }
    const setMode = (next, animate = true) => (next === mode && !fly ? Promise.resolve() : flyTo(next, null, animate));
    const fromDir = new THREE.Vector3(), toDir = new THREE.Vector3();
    function flightCamera(now) {
        const u = Math.min(1, (now - fly.start) / fly.duration), k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const { from, to } = fly, ra = from.position.length(), rb = to.position.length();
        fromDir.copy(from.position).divideScalar(ra);
        toDir.copy(to.position).divideScalar(rb);
        const angle = fromDir.angleTo(toDir), sin = Math.sin(angle);
        if (sin > 1e-4)
            fromDir.multiplyScalar(Math.sin((1 - k) * angle) / sin).addScaledVector(toDir, Math.sin(k * angle) / sin);
        else
            fromDir.lerp(toDir, k);
        // A little extra height in the middle of a long arc keeps the ground from rushing past the lens.
        flyCam.position.copy(fromDir.normalize()).multiplyScalar(ra + (rb - ra) * k + 0.5 * Math.sin(Math.PI * k) * Math.min(1, angle));
        flyCam.quaternion.slerpQuaternions(from.quaternion, to.quaternion, k);
        flyCam.fov = from.fov + (to.fov - from.fov) * k;
        flyCam.near = Math.exp(Math.log(from.near) + (Math.log(to.near) - Math.log(from.near)) * k);
        flyCam.aspect = innerWidth / innerHeight;
        flyCam.updateProjectionMatrix();
        flyCam.updateMatrixWorld();
        if (u >= 1) {
            fly = null;
            active().controls.enabled = true;
        }
        return flyCam;
    }
    // ---- controls
    $("view-globe").addEventListener("click", () => setMode("globe"));
    $("view-pole").addEventListener("click", () => setMode("pole").catch(fail));
    $("play").addEventListener("click", () => { playing = !playing; applyText(); });
    $("now").addEventListener("click", () => { index = indexAt(eph, Date.now()); applyTime(); });
    $("lang").addEventListener("click", () => { lang = lang === "pt" ? "en" : "pt"; applyText(); });
    slider.addEventListener("input", () => { index = Number(slider.value); applyTime(); });
    const setRelief = (v) => {
        shared.relief.value = v;
        globeUniforms.normalScale.value = v / manifest.relief.normal_exaggeration;
        $("relief-out").textContent = String(v);
        liftLabels();
        applyText();
    };
    $("relief").addEventListener("input", e => setRelief(Number(e.target.value)));
    $("color").addEventListener("change", e => { shared.colorMode.value = e.target.value === "altitude" ? 1 : 0; applyText(); });
    $("light").addEventListener("change", e => { shared.realLight.value = e.target.value === "even" ? 0 : 1; applyText(); });
    $("exposure").addEventListener("input", e => { renderer.toneMappingExposure = Number(e.target.value); });
    renderer.toneMappingExposure = Number($("exposure").value);
    if (params.get("color") === "altitude") {
        $("color").value = "altitude";
        shared.colorMode.value = 1;
    }
    if (params.get("light") === "even") {
        $("light").value = "even";
        shared.realLight.value = 0;
    }
    setRelief(Number($("relief").value));
    function resize() {
        renderer.setSize(innerWidth, innerHeight, false);
        for (const view of [globe, pole]) {
            view.camera.aspect = innerWidth / innerHeight;
            view.camera.clearViewOffset();
            view.camera.updateProjectionMatrix();
        }
        frameGlobe();
    }
    // Phone: the globe sits whole in the gap between the readout (top) and the controls (bottom), not under their glass.
    function frameGlobe() {
        const W = innerWidth, H = innerHeight, cam = globe.camera;
        cam.clearViewOffset();
        if (W > 720)
            return cam.updateProjectionMatrix();
        const top = Math.max(...[".top", ".views", ".readout"].map(q => document.querySelector(q)?.getBoundingClientRect().bottom || 0)) + 8;
        const bottom = (document.querySelector(".panel")?.getBoundingClientRect().top || H) - 8;
        const d = cam.position.length() || 6.4, diam = Math.tan(Math.asin(1 / d)) / Math.tan(cam.fov * Math.PI / 360) * H;
        const fit = Math.min(bottom - top, W - 16);
        if (fit < 80)
            return cam.updateProjectionMatrix();
        const k = Math.max(1, diam / fit), fw = W / k, fh = H / k; // full frame smaller than the window = zoom out
        cam.setViewOffset(fw, fh, fw / 2 - W / 2, fh / 2 - (top + bottom) / 2, W, H);
    }
    addEventListener("resize", resize);
    resize();
    new ResizeObserver(frameGlobe).observe(document.querySelector(".panel"));
    // ---- loop
    const toCamera = new THREE.Vector3(), right = new THREE.Vector3(), upCam = new THREE.Vector3(), back = new THREE.Vector3();
    let last = performance.now();
    loopFn = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (playing) {
            index += dt * Number($("speed").value);
            if (index >= eph.count - 1) {
                index = eph.count - 1;
                playing = false;
                applyText();
            }
            applyTime();
        }
        let camera;
        const flying = fly !== null;
        if (flying)
            camera = flightCamera(now);
        else {
            const view = active();
            view.controls.update();
            camera = view.camera;
            camera.updateMatrixWorld();
        }
        stars.position.copy(camera.position);
        // Light: the Sun, or an even light fixed to the camera (from the upper left) that leaves no night side.
        if (shared.realLight.value > 0.5)
            lightDir.copy(sunDir);
        else {
            camera.matrixWorld.extractBasis(right, upCam, back); // back = camera +Z, pointing from the scene toward the viewer
            lightDir.copy(back).multiplyScalar(0.45).addScaledVector(right, -0.62).addScaledVector(upCam, 0.64).normalize();
        }
        if (cap)
            setPolarFrame(cap, lightDir, camera);
        renderer.render(scene, camera);
        const names = $("markers").checked, distance = camera.position.length();
        sites.visible = names;
        taken = obstacles();
        for (const l of [...labels].sort((a, b) => (a.kind === "body" ? 0 : a.kind === "site" ? 1 : a.kind === "feature" ? 2 : 3) - (b.kind === "body" ? 0 : b.kind === "site" ? 1 : b.kind === "feature" ? 2 : 3))) {
            let visible = !flying && (l.kind === "body" || names);
            if (visible && l.kind === "feature")
                visible = mode === "pole" || distance < 2.4;
            if (visible && l.kind === "mare")
                visible = mode === "globe" && distance > 2.4;
            if (visible && l.normal)
                visible = toCamera.copy(camera.position).sub(l.position).normalize().dot(l.normal) > (mode === "pole" ? 0.01 : 0.15);
            if (visible && l.kind === "body")
                visible = !(mode === "globe" && camera.position.dot(l.position) / distance / l.position.length() > 0.999);
            placeLabel(l, camera, visible);
        }
    };
    renderer.setAnimationLoop(loopFn);
    applyTime();
    // First view: from the sunlit side, looking up from the south so the polar region is in frame.
    globe.camera.position.copy(sunDir).multiplyScalar(0.75).add(earthDir.clone().multiplyScalar(0.45)).setY(-0.62).normalize().multiplyScalar(small ? 6.4 : 4.6);
    frameGlobe();
    await setMode(params.get("view") === "pole" ? "pole" : "globe", false);
    globe.controls.enabled = mode === "globe";
    pole.controls.enabled = mode === "pole";
    $("loading").classList.add("done");
    // Sharper colour on capable screens, after the first frame is already up.
    if (!small && renderer.capabilities.maxTextureSize >= 8192 && manifest.files["color_8k.jpg"])
        loadTexture("color_8k.jpg", true).then((tex) => { globeUniforms.colorMap.value.dispose(); globeUniforms.colorMap.value = tex; }).catch(() => { });
}
// The overlay is the one status element: a problem turns it into role="alert" with a way out, never a spinner.
function showProblem(kind) {
    const m = problemModel(kind, lang), box = $("loading");
    clearProblem(false);
    box.classList.remove("done");
    box.classList.add("error");
    box.setAttribute("role", m.role);
    box.firstElementChild.textContent = m.message;
    const extras = document.createElement("div");
    extras.className = "problem-actions";
    if (m.link) {
        const a = document.createElement("a");
        a.href = m.link.href;
        a.textContent = m.link.text;
        extras.append(a);
    }
    if (m.retry) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = m.retry;
        b.addEventListener("click", () => location.reload());
        extras.append(b);
    }
    if (extras.childElementCount)
        box.append(extras);
}
function clearProblem(hide = true) {
    const box = $("loading");
    box.querySelector(".problem-actions")?.remove();
    box.classList.remove("error");
    box.setAttribute("role", "status");
    if (hide)
        box.classList.add("done");
}
function fail(error) {
    console.error(error);
    showProblem(error?.kind === "nowebgl" ? "nowebgl" : "failed");
}
main().catch(fail);
