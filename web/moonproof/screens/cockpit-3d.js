// MoonProof Cockpit: one on-demand Joel Moon HD scene. Display only, not flight telemetry.
import { h, Fragment, render } from "../../vendor/preact/preact.module.js";
import { probeWebGL } from "../../moon-hd/backdrop.js";
import { bilinearHeight, localToScene, stereoToLocal, latLonToStereo } from "../../moon-hd/polar-math.js";
import { createArtemisLander } from "../core/artemis-lander.js";
/** CPU site registration uses the same grid blending as Joel's CAP_COMMON shader. */
export function polarSiteCoordinates(site) {
    if (typeof site.stereo_x_m === "number" && typeof site.stereo_y_m === "number" && Number.isFinite(site.stereo_x_m) && Number.isFinite(site.stereo_y_m))
        return [site.stereo_x_m, site.stereo_y_m];
    if (typeof site.lat === "number" && typeof site.lon === "number" && Number.isFinite(site.lat) && Number.isFinite(site.lon) && site.lat >= -90 && site.lat <= -80.35)
        return latLonToStereo(site.lat, site.lon);
    return null;
}
export function siteReliefHeight(inner, wide, x, y) {
    if (!wide.contains(x, y))
        return null;
    const wideH = bilinearHeight(wide, x, y);
    if (!inner || !inner.contains(x, y))
        return wideH;
    const u = Math.min(1, Math.max(0, (Math.max(Math.abs(x), Math.abs(y)) - inner.half + 3000) / 2400));
    const w = u * u * (3 - 2 * u);
    return bilinearHeight(inner, x, y) * (1 - w) + wideH * w;
}
export const clampDistance = (distance) => Math.min(220, Math.max(32, distance));
/** The site selector remains usable when markers are outside the camera or WebGL is unavailable. */
export function siteChoices(sites) {
    const seen = new Set();
    return sites.flatMap(site => {
        if (!site.id || seen.has(site.id))
            return [];
        seen.add(site.id);
        const name = site.name?.trim() || site.id;
        return [{ id: site.id, label: typeof site.n === "number" || typeof site.n === "string" ? `${site.n} · ${name}` : name }];
    });
}
/** A marker is interactive only when its entire hit area is visible and not behind an overlay. */
export function visibleMarker(marker, viewport, occlusions) {
    return marker.left >= viewport.left && marker.right <= viewport.right && marker.top >= viewport.top && marker.bottom <= viewport.bottom &&
        !occlusions.some(box => marker.left < box.right && marker.right > box.left && marker.top < box.bottom && marker.bottom > box.top);
}
const BASE = new URL("../../data/moonhd/", import.meta.url).href;
function release(r) {
    const seen = new Set();
    const dispose = (value) => { if (value && !seen.has(value)) {
        seen.add(value);
        value.dispose?.();
    } };
    r.scene?.traverse((o) => {
        dispose(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m)
                continue;
            for (const u of Object.values(m.uniforms || {}))
                if (u.value?.isTexture)
                    dispose(u.value);
            dispose(m);
        }
    });
    if (r.cap && !r.cap.mesh.parent) {
        dispose(r.cap.mesh.geometry);
        dispose(r.cap.mesh.material);
        for (const u of Object.values(r.cap.uniforms))
            if (u.value?.isTexture)
                dispose(u.value);
    }
    r.textures?.forEach(dispose);
    r.renderer?.dispose();
    r.renderer?.forceContextLoss();
    r.canvas?.remove();
}
export function mountCockpit3D(host, options) {
    let mode = "map", selected = options.selected, generation = 0, disposed = false, resources = null, loading = null;
    let azimuth = .6, elevation = .9, distance = 105, pending = 0, timeout = 0;
    const labels = new Map();
    const choices = siteChoices(options.sites);
    const choiceIds = new Set(choices.map(s => s.id));
    const catalogue = choices.flatMap(choice => { const site = options.sites.find(s => s.id === choice.id); return site ? [site] : []; });
    const pt = () => document.documentElement.lang.toLowerCase().startsWith("pt");
    const tr = (br, en) => pt() ? br : en;
    host.classList.add("mp-cockpit-3d");
    const canvasHost = document.createElement("div"), ui = document.createElement("div");
    canvasHost.className = "mp-cockpit-3d-canvas";
    ui.className = "mp-cockpit-3d-ui";
    host.append(canvasHost, ui);
    const style = document.createElement("style");
    style.textContent = `
.mp-cockpit-3d{position:fixed;inset:0;z-index:4;pointer-events:none}
.mp-cockpit-3d-canvas{position:absolute;inset:0;display:none;pointer-events:auto;touch-action:none;background:#07090c}
.mp-cockpit-3d[data-mode=ready] .mp-cockpit-3d-canvas{display:block}
.mp-cockpit-3d-canvas canvas{display:block;width:100%;height:100%;touch-action:none}
.mp-cockpit-3d-ui{position:absolute;inset:0;pointer-events:none}
.mp-cockpit-3d-controls{position:absolute;top:var(--cockpit-3d-top,var(--ck-panels-top,142px));left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:5px;padding:5px 8px;width:max-content;max-width:min(94vw,440px);border:1px solid var(--line,#64748b);border-radius:13px;background:rgba(7,9,12,.9);color:#f2f4f5;pointer-events:auto;backdrop-filter:blur(14px)}
.mp-cockpit-3d-controls button,.mp-cockpit-3d-controls select,.mp-cockpit-3d-camera summary,.mp-cockpit-3d-marker{box-sizing:border-box;min-height:44px;min-width:44px;border-radius:8px;border:1px solid var(--line,#64748b);font:inherit;background:#18212a;color:#f2f4f5;cursor:pointer}
.mp-cockpit-3d-controls button:focus-visible,.mp-cockpit-3d-controls select:focus-visible,.mp-cockpit-3d-camera summary:focus-visible,.mp-cockpit-3d-marker:focus-visible{outline:3px solid #9ee8db;outline-offset:2px}
.mp-cockpit-3d-site{flex:1 1 145px;min-width:0!important;max-width:100%;padding:0 8px;font-size:13px!important;text-overflow:ellipsis}
.mp-cockpit-3d-camera{position:relative;max-width:100%}
.mp-cockpit-3d-camera summary{display:flex;align-items:center;justify-content:center;padding:0 8px;list-style:none}
.mp-cockpit-3d-camera summary::-webkit-details-marker{display:none}
.mp-cockpit-3d-camera-menu{position:absolute;z-index:1;right:0;top:calc(100% + 5px);padding:5px;display:grid;grid-template-columns:repeat(3,44px);gap:5px;border:1px solid var(--line,#64748b);border-radius:9px;background:#07090c;box-shadow:0 4px 16px #0008}
.mp-cockpit-3d-camera:not([open]) .mp-cockpit-3d-camera-menu{display:none}
.mp-cockpit-3d-status{flex:1 0 100%;font-size:11px;text-align:center;line-height:1.4;max-width:100%;overflow-wrap:anywhere}
.mp-cockpit-3d-marker{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;border-radius:999px;padding:0 8px;background:#141b25e8;white-space:nowrap;font-size:12px;min-height:44px}
.mp-cockpit-3d-marker[aria-pressed=true]{color:#081b17;background:#9ee8db;border-color:#9ee8db;font-weight:bold}
.mp-cockpit-3d-marker[hidden]{display:none!important}
body[data-cockpit-view=3d] .mp-ck-lines,body[data-cockpit-view=3d] .mp-bodyic,body[data-cockpit-view=3d] .mp-ck-tag{visibility:hidden}
@media(max-width:700px){.mp-cockpit-3d-controls{top:var(--cockpit-3d-top-mobile,var(--ck-panels-top,127px));max-width:calc(100vw - 16px);gap:3px}.mp-cockpit-3d-controls button{min-width:44px;padding:0 8px}}
`;
    document.head.append(style);
    function change(modeNext) {
        mode = modeNext;
        host.dataset.mode = mode;
        document.body.dataset.cockpitView = mode === "ready" ? "3d" : "map";
        const fallback = document.getElementById("terrain");
        if (fallback)
            fallback.inert = mode === "ready";
        paint();
    }
    function selectSite(id) {
        if (!choiceIds.has(id))
            return;
        handle.select(id);
        options.onSelect(id);
    }
    function paint() {
        const ready = mode === "ready";
        const site = options.sites.find(s => s.id === selected), outside = ready && site && !point(site);
        render(h(Fragment, null,
            ready && catalogue.filter(s => polarSiteCoordinates(s)).map(s => h("button", { key: s.id, ref: (b) => { if (b)
                    labels.set(s.id, b);
                else
                    labels.delete(s.id); }, class: "mp-cockpit-3d-marker", type: "button", hidden: true, "aria-label": s.name || s.id, "aria-pressed": s.id === selected, onClick: () => selectSite(s.id) },
                String(s.n ?? "•"),
                " ",
                s.id === selected ? s.name : "")),
            h("div", { class: "mp-cockpit-3d-controls", role: "group", "aria-label": tr("Visualização lunar", "Lunar view") },
                h("select", { class: "mp-cockpit-3d-site", "aria-label": tr("Local lunar", "Lunar site"), value: selected && choiceIds.has(selected) ? selected : "", disabled: !choices.length, onChange: e => selectSite(e.currentTarget.value) },
                    h("option", { value: "", disabled: true }, tr("Escolher local", "Choose site")),
                    choices.map(s => h("option", { value: s.id, key: s.id }, s.label))),
                h("button", { type: "button", "aria-pressed": ready, onClick: () => handle.setActive(mode !== "ready" && mode !== "loading") }, mode === "loading" ? tr("Cancelar", "Cancel") : ready ? tr("Mapa 2D", "2D map") : tr("Lua 3D", "3D Moon")),
                ready && h("details", { class: "mp-cockpit-3d-camera", onKeyDown: e => { if (e.key === "Escape") {
                        e.currentTarget.open = false;
                        e.currentTarget.querySelector("summary")?.focus();
                    } } },
                    h("summary", null, tr("Câmera", "Camera")),
                    h("div", { class: "mp-cockpit-3d-camera-menu", role: "group", "aria-label": tr("Controles da câmera", "Camera controls") },
                        h("button", { type: "button", "aria-label": tr("Girar à esquerda", "Rotate left"), onClick: () => rotate(-.2, 0) }, "\u2190"),
                        h("button", { type: "button", "aria-label": tr("Inclinar para cima", "Tilt up"), onClick: () => rotate(0, .15) }, "\u2191"),
                        h("button", { type: "button", "aria-label": tr("Girar à direita", "Rotate right"), onClick: () => rotate(.2, 0) }, "\u2192"),
                        h("button", { type: "button", "aria-label": tr("Aproximar", "Zoom in"), onClick: () => zoom(.8) }, "+"),
                        h("button", { type: "button", "aria-label": tr("Inclinar para baixo", "Tilt down"), onClick: () => rotate(0, -.15) }, "\u2193"),
                        h("button", { type: "button", "aria-label": tr("Afastar", "Zoom out"), onClick: () => zoom(1.25) }, "\u2212"),
                        h("button", { type: "button", "aria-label": tr("Restaurar câmera", "Reset camera"), onClick: () => { azimuth = .6; elevation = .9; distance = 105; draw(); } }, "\u21BB"))),
                h("span", { class: "mp-cockpit-3d-status", role: "status" }, mode === "loading" ? tr("Carregando Moon HD de Joel…", "Loading Joel’s Moon HD…") : outside ? tr("Local fora do relevo 3D · use o mapa LOLA 2D", "Site outside 3D relief · use the LOLA 2D map") : ready ? tr("NASA LRO/LOLA · nave Artemis ilustrativa, escala e luz visuais", "NASA LRO/LOLA · illustrative Artemis lander; visual scale and light") : mode === "unavailable" ? tr("3D indisponível; mapa LOLA 2D preservado", "3D unavailable; LOLA 2D map retained") : tr("Mapa georreferenciado LOLA 2D", "LOLA georeferenced 2D map")))), ui);
        positionControls();
    }
    const layoutSelectors = "#left,#right,#sheet,.mp-top,.mp-context,#player,.mp-links,#ck-panel-controls";
    function point(s) {
        const r = resources, xy = polarSiteCoordinates(s);
        if (!r || !xy)
            return null;
        const height = siteReliefHeight(r.cap.innerGrid, r.cap.wideGrid, ...xy);
        if (height === null || !Number.isFinite(height))
            return null;
        return new r.T.Vector3(...localToScene(stereoToLocal(...xy, height)));
    }
    // Frame the selected site in the area unobscured by collapsible cockpit panels rather than under them.
    function frameBounds(W, H) {
        let left = 0, right = W, top = 0, bottom = H;
        for (const e of document.querySelectorAll(layoutSelectors)) {
            const box = e.getBoundingClientRect();
            if (!box.width || !box.height || getComputedStyle(e).visibility === "hidden")
                continue;
            if (box.right < W * .44 && box.height > H * .2)
                left = Math.max(left, box.right);
            else if (box.left > W * .56 && box.height > H * .2)
                right = Math.min(right, box.left);
            else if (box.top > H * .32 && box.width > W * .45)
                bottom = Math.min(bottom, box.top);
            else if (box.bottom < H * .4)
                top = Math.max(top, box.bottom);
        }
        return { left, right, top, bottom };
    }
    function overlays() {
        return [...document.querySelectorAll(`${layoutSelectors},.ck-panel-options,.mp-cockpit-3d-controls,.mp-cockpit-3d-camera-menu`)]
            .filter(e => getComputedStyle(e).visibility !== "hidden" && e.getClientRects().length > 0)
            .map(e => e.getBoundingClientRect()).filter(e => e.width > 0 && e.height > 0);
    }
    function hideMarker(el) {
        const focused = document.activeElement === el;
        el.hidden = true;
        if (focused)
            ui.querySelector(".mp-cockpit-3d-site")?.focus();
    }
    function positionControls() {
        const W = host.clientWidth, H = host.clientHeight, control = ui.querySelector(".mp-cockpit-3d-controls");
        if (!W || !H || !control)
            return;
        const { left, right } = frameBounds(W, H);
        control.style.left = `${(left + right) / 2}px`;
        control.style.maxWidth = `${Math.max(100, Math.min(440, right - left - 16))}px`;
    }
    function focusArea(W, H) {
        let { left, right, top, bottom } = frameBounds(W, H);
        const controls = ui.querySelector(".mp-cockpit-3d-controls")?.getBoundingClientRect();
        if (controls)
            top = Math.max(top, controls.bottom);
        if (bottom < top)
            top = Math.min(top, H * .55);
        return [W / 2 - (left + right) / 2, H / 2 - (top + bottom) / 2];
    }
    function draw() {
        if (pending || !resources || document.hidden)
            return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            const r = resources;
            if (!r || document.hidden)
                return;
            const W = host.clientWidth, H = host.clientHeight;
            if (!W || !H)
                return;
            const s = options.sites.find(s => s.id === selected), focus = (s && point(s)) || new r.T.Vector3(0, 0, 0);
            r.camera.position.copy(focus).add(new r.T.Vector3(Math.cos(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, Math.sin(azimuth) * Math.cos(elevation) * distance));
            r.camera.aspect = W / H;
            const [ox, oy] = focusArea(W, H);
            r.camera.setViewOffset(W, H, ox, oy, W, H);
            r.camera.lookAt(focus);
            r.camera.updateProjectionMatrix();
            r.cap.camPolar.copy(r.camera.position);
            r.ship.position.copy(focus).add(new r.T.Vector3(0, 7.5, 0));
            r.ship.visible = !!s && !!point(s);
            try {
                r.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
                r.renderer.setSize(W, H, false);
                r.renderer.render(r.scene, r.camera);
            }
            catch {
                stop("unavailable");
                return;
            }
            const viewport = { left: 0, right: W, top: 0, bottom: H }, occlusions = overlays();
            // Selected label takes precedence if the projected sites overlap; all remain reachable by selector.
            const ordered = [...catalogue].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
            for (const site of ordered) {
                const el = labels.get(site.id), p = point(site);
                if (!el || !p) {
                    if (el)
                        hideMarker(el);
                    continue;
                }
                p.y += .12;
                p.project(r.camera);
                if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) {
                    hideMarker(el);
                    continue;
                }
                el.hidden = false;
                el.style.left = `${(p.x * .5 + .5) * W}px`;
                el.style.top = `${(-p.y * .5 + .5) * H}px`;
                const rect = el.getBoundingClientRect();
                if (!visibleMarker(rect, viewport, occlusions))
                    hideMarker(el);
                else
                    occlusions.push(rect);
            }
        });
    }
    function rotate(da, de) { azimuth += da; elevation = Math.min(1.45, Math.max(.32, elevation + de)); draw(); }
    function zoom(factor) { distance = clampDistance(distance * factor); draw(); }
    function stop(next) {
        generation++;
        clearTimeout(timeout);
        if (pending)
            cancelAnimationFrame(pending);
        pending = 0;
        if (resources)
            release(resources);
        resources = null;
        if (loading) {
            release(loading);
            loading.renderer = undefined;
            loading = null;
        }
        change(next);
    }
    async function start() {
        if (disposed || mode === "ready" || mode === "loading")
            return;
        const g = ++generation;
        change("loading");
        const probe = probeWebGL(() => document.createElement("canvas"));
        if (!probe) {
            change("unavailable");
            return;
        }
        const r = loading = { canvas: probe.canvas, textures: new Set() };
        const stale = () => disposed || g !== generation;
        timeout = window.setTimeout(() => { if (!stale())
            stop("unavailable"); }, 25000);
        probe.canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); if (!stale())
            stop("unavailable"); }, { once: true });
        try {
            const S = await import("../../moon-hd/scene.js"), T = r.T = S.THREE;
            if (stale())
                throw new Error("cancelled");
            r.renderer = new T.WebGLRenderer({ canvas: probe.canvas, context: probe.gl });
            r.renderer.setClearColor(0x07090c);
            const manifest = await S.fetchJSON(BASE + "manifest.json");
            const color = await S.textureLoader(r.renderer, BASE)("color_4k.jpg", true);
            r.textures.add(color);
            if (stale())
                throw new Error("cancelled");
            const moon = S.createMoon({ manifest, colorTex: color, normalTex: color, heightTex: color, lon: 8, lat: 4, steps: 1 });
            moon.mesh.geometry.dispose();
            moon.mesh.material.dispose();
            moon.shared.realLight.value = 0;
            const mobile = host.clientWidth < 720;
            r.cap = await S.createCap({ renderer: r.renderer, base: BASE, manifest, moon, segments: mobile ? 256 : 384, steps: 1, wideOnly: mobile });
            if (stale())
                throw new Error("cancelled");
            r.cap.mesh.matrix.identity();
            r.cap.mesh.matrixAutoUpdate = false;
            r.cap.lightPolar.set(-.62, .7, .35).normalize();
            r.scene = new T.Scene();
            r.scene.add(r.cap.mesh);
            r.camera = new T.PerspectiveCamera(48, 1, .3, 1000);
            const light = new T.DirectionalLight(0xffffff, 3);
            light.position.set(-.62, .7, .35);
            r.scene.add(light, new T.HemisphereLight(0xc9d5e6, 0x303030, 1.6));
            r.ship = createArtemisLander(T).group;
            r.ship.scale.setScalar(1.35);
            r.scene.add(r.ship); // exaggeration for regional visibility, not dimensions or actual altitude
            probe.canvas.setAttribute("aria-label", tr("Mapa lunar tridimensional e nave ilustrativa", "3D lunar map and illustrative lander"));
            probe.canvas.setAttribute("role", "img");
            canvasHost.append(probe.canvas);
            resources = r;
            loading = null;
            clearTimeout(timeout);
            change("ready");
            draw();
        }
        catch {
            release(r);
            if (!stale()) {
                loading = null;
                clearTimeout(timeout);
                change("unavailable");
            }
        }
    }
    let drag = null;
    canvasHost.addEventListener("pointerdown", e => { if (e.button !== 0)
        return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvasHost.setPointerCapture(e.pointerId); });
    canvasHost.addEventListener("pointermove", e => { if (drag?.id !== e.pointerId)
        return; rotate((drag.x - e.clientX) * .008, (e.clientY - drag.y) * .006); drag.x = e.clientX; drag.y = e.clientY; });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        canvasHost.addEventListener(type, () => { drag = null; });
    canvasHost.addEventListener("wheel", e => { e.preventDefault(); zoom(Math.exp(Math.max(-1, Math.min(1, e.deltaY * .002)))); }, { passive: false });
    const layoutChanged = () => { positionControls(); draw(); };
    const observer = new ResizeObserver(layoutChanged);
    observer.observe(host);
    for (const e of document.querySelectorAll(layoutSelectors))
        observer.observe(e);
    const layout = new MutationObserver(layoutChanged);
    layout.observe(document.body, { attributes: true, attributeFilter: ["data-ck-hidden"] });
    document.addEventListener("toggle", layoutChanged, true);
    const language = new MutationObserver(() => { paint(); draw(); });
    language.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    document.addEventListener("visibilitychange", draw);
    const pagehide = (e) => { if (!e.persisted)
        handle.dispose(); };
    addEventListener("pagehide", pagehide);
    addEventListener("pageshow", draw);
    const handle = {
        select(id) { selected = id; paint(); draw(); },
        setActive(active) { if (disposed)
            return; if (active)
            void start();
        else
            stop("map"); },
        dispose() { if (disposed)
            return; disposed = true; stop("map"); observer.disconnect(); layout.disconnect(); language.disconnect(); document.removeEventListener("toggle", layoutChanged, true); document.removeEventListener("visibilitychange", draw); removeEventListener("pagehide", pagehide); removeEventListener("pageshow", draw); render(null, ui); style.remove(); host.replaceChildren(); delete document.body.dataset.cockpitView; },
    };
    change("map");
    handle.setActive(true);
    return handle;
}
