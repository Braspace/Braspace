// MoonProof 3D viewer: globe -> south polar region -> site / Landing Lab.
//
// Scene frames (all right-handed, +Y up on screen):
//   globe : scene = (bx, bz, -by) / 1000            body-fixed MOON_ME, km
//   region: scene = (bx, -bz - R, by) / 1000         km, origin on the reference sphere at the south pole,
//                                                     +Y = local "up" at the pole, +X toward 0°E (Earth side)
//   site  : scene = (east, up, -north)               metres, site-local ENU tangent frame
// Geometry is computed from NASA LOLA heights; colours/lighting are visual encodings
// of data documented in the legend. Stars are decorative.
// @ts-ignore TS2307: remote ES module (CDN), no local types
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js";
import { latLonToBodyFixed, southStereoInverse, enuToBody, R_REF } from "./coords.js";
import { createArtemisLander } from "../moonproof/core/artemis-lander.js";
const KM = 1000;
const D2R = Math.PI / 180;
// ---------- colour maps (polynomial fits of matplotlib viridis / inferno) ----------
function poly(c, t) {
    t = Math.min(1, Math.max(0, t));
    return c[0].map((_, k) => c[0][k] + t * (c[1][k] + t * (c[2][k] + t * (c[3][k] + t * (c[4][k] + t * (c[5][k] + t * c[6][k]))))));
}
const VIRIDIS = [[0.2777273, 0.0054073, 0.3340998], [0.1050930, 1.4046135, 1.3845902], [-0.3308618, 0.2148476, 0.0950952],
    [-4.6342305, -5.7991010, -19.3324410], [6.2282699, 14.1799334, 56.6905526], [4.7763850, -13.7451454, -65.3530326], [-5.4354559, 4.6458526, 26.3124352]];
const INFERNO = [[0.0002189, 0.0016510, -0.0194809], [0.1065134, 0.5639564, 3.9327124], [11.6024931, -3.9728540, -15.9423941],
    [-41.7039961, 17.4363989, 44.3541452], [77.1629357, -33.4023589, -81.8073093], [-71.3194282, 32.6260643, 73.2095199], [25.1311262, -12.2426690, -23.0703250]];
export const colormaps = {
    viridis: (t) => poly(VIRIDIS, t).map(v => Math.min(1, Math.max(0, v))),
    inferno: (t) => poly(INFERNO, t).map(v => Math.min(1, Math.max(0, v))),
    earth: (t) => [0.04 + 0.25 * t, 0.06 + 0.55 * t, 0.16 + 0.82 * t],
    slope: (deg) => deg <= 12 ? [0.18 + 0.6 * deg / 12, 0.62, 0.3 - 0.15 * deg / 12] : deg <= 25 ? [0.78 + 0.2 * (deg - 12) / 13, 0.62 - 0.45 * (deg - 12) / 13, 0.15] : [0.85, 0.12, 0.2],
};
// ---------- small orbit camera controller (no external add-ons; CSP-safe) ----------
class Orbit {
    constructor(camera, dom, viewer) {
        this.camera = camera;
        this.dom = dom;
        this.viewer = viewer;
        this.target = new THREE.Vector3();
        this.radius = 10;
        this.theta = 0;
        this.phi = 1;
        this.minR = 1;
        this.maxR = 1e6;
        this.minPhi = 0.02;
        this.maxPhi = Math.PI - 0.02;
        this.enabled = true;
        this.anim = null;
        this.pointers = new Map();
        dom.addEventListener("pointerdown", (e) => { if (!this.enabled)
            return; dom.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, [e.clientX, e.clientY]); this.anim = null; });
        dom.addEventListener("pointermove", (e) => {
            if (!this.pointers.has(e.pointerId))
                return;
            const [px, py] = this.pointers.get(e.pointerId);
            const dx = e.clientX - px, dy = e.clientY - py;
            this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
            if (this.pointers.size === 2) {
                const pts = [...this.pointers.values()];
                const d = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
                if (this._pinch)
                    this.zoom(this._pinch / d);
                this._pinch = d;
                return;
            }
            this.theta -= dx * 0.005;
            this.phi = Math.min(this.maxPhi, Math.max(this.minPhi, this.phi - dy * 0.005));
        });
        const up = (e) => { this.pointers.delete(e.pointerId); this._pinch = null; };
        dom.addEventListener("pointerup", up);
        dom.addEventListener("pointercancel", up);
        dom.addEventListener("wheel", (e) => { if (!this.enabled)
            return; e.preventDefault(); this.anim = null; this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    }
    zoom(f) { this.radius = Math.min(this.maxR, Math.max(this.minR, this.radius * f)); }
    key(code) {
        if (code === "ArrowLeft")
            this.theta += 0.08;
        else if (code === "ArrowRight")
            this.theta -= 0.08;
        else if (code === "ArrowUp")
            this.phi = Math.max(this.minPhi, this.phi - 0.06);
        else if (code === "ArrowDown")
            this.phi = Math.min(this.maxPhi, this.phi + 0.06);
        else if (code === "Equal" || code === "NumpadAdd")
            this.zoom(0.85);
        else if (code === "Minus" || code === "NumpadSubtract")
            this.zoom(1.18);
        else
            return false;
        return true;
    }
    flyTo({ target, radius, theta, phi }, seconds = 1.8) {
        const to = { target: target.clone(), radius, theta: theta ?? this.theta, phi: phi ?? this.phi };
        if (this.viewer.reducedMotion || seconds <= 0) {
            Object.assign(this, { radius: to.radius, theta: to.theta, phi: to.phi });
            this.target.copy(to.target);
            this.anim = null;
            return;
        }
        this.anim = { from: { target: this.target.clone(), radius: this.radius, theta: this.theta, phi: this.phi }, to, t: 0, T: seconds };
    }
    update(dt) {
        if (this.anim) {
            const a = this.anim;
            a.t += dt;
            const s = Math.min(1, a.t / a.T), e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
            this.target.lerpVectors(a.from.target, a.to.target, e);
            this.radius = Math.exp(Math.log(a.from.radius) + (Math.log(a.to.radius) - Math.log(a.from.radius)) * e);
            this.theta = a.from.theta + (a.to.theta - a.from.theta) * e;
            this.phi = a.from.phi + (a.to.phi - a.from.phi) * e;
            if (s >= 1)
                this.anim = null;
        }
        const sp = Math.sin(this.phi);
        this.camera.position.set(this.target.x + this.radius * sp * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * sp * Math.cos(this.theta));
        this.camera.lookAt(this.target);
    }
}
function stars(radius, count = 1800) {
    let seed = 2026;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        pos.set([radius * s * Math.cos(a), radius * u, radius * s * Math.sin(a)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb3c8, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
}
function disposeTree(obj) {
    obj.traverse((o) => {
        if (o.geometry)
            o.geometry.dispose();
        if (o.material)
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map)
                m.map.dispose(); m.dispose(); });
    });
}
// ---------- frame helpers ----------
export const toGlobe = (b) => new THREE.Vector3(b[0] / KM, b[2] / KM, -b[1] / KM);
export const toRegion = (b) => new THREE.Vector3(b[0] / KM, (-b[2] - R_REF) / KM, b[1] / KM);
export const dirToRegion = (b) => new THREE.Vector3(b[0], -b[2], b[1]).normalize();
export const enuToSite = ([e, n, u]) => new THREE.Vector3(e, u, -n);
export class Viewer {
    constructor(container, { onFrame = () => { }, reducedMotion = false } = {}) {
        this.container = container;
        this.onFrame = onFrame;
        this.reducedMotion = reducedMotion;
        const probe = document.createElement("canvas");
        if (!(probe.getContext("webgl2") || probe.getContext("webgl")))
            throw new Error("WebGL is not available in this browser.");
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        this.renderer.domElement.setAttribute("aria-hidden", "true");
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5e6);
        this.orbit = new Orbit(this.camera, this.renderer.domElement, this);
        this.labelLayer = document.createElement("div");
        this.labelLayer.className = "labels";
        container.appendChild(this.labelLayer);
        this.labels = [];
        this.scene = null;
        this.mode = null;
        this.followLander = null;
        this.clock = new THREE.Clock();
        new ResizeObserver(() => this.resize()).observe(container);
        this.resize();
        this.renderer.setAnimationLoop(() => this.frame());
        this.texLoader = new THREE.TextureLoader();
    }
    resize() {
        const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }
    setReducedMotion(v) { this.reducedMotion = v; }
    clear() {
        if (this.scene)
            disposeTree(this.scene);
        this.scene = null;
        this.labels.forEach((l) => l.el.remove());
        this.labels = [];
        this.followLander = null;
        this.region = null;
        this.site = null;
        this.landerGroup = null;
        this.sunLight = null;
        this.sunDirSite = null;
        this.orbit.enabled = true;
        this.orbit.anim = null; // a fly-to from another scale must not leak into this scene
    }
    addLabel(text, position, { cls = "", normal = null, onClick = null, num = null, id = null } = {}) {
        const el = document.createElement(onClick ? "button" : "div");
        el.className = "label " + cls;
        if (num != null) {
            // numbered site marker (design kit): black disc with number + white name pill
            const mk = document.createElement("span");
            mk.className = "mk";
            mk.textContent = String(num);
            const nm = document.createElement("span");
            nm.className = "nm";
            nm.textContent = text;
            el.append(mk, nm);
            el.setAttribute("aria-label", `Site ${num}: ${text}`);
        }
        else
            el.textContent = text;
        if (id)
            el.dataset.id = id;
        if (el.dataset.id && el.dataset.id === this.selectedSite)
            el.classList.add("sel");
        if (onClick) {
            el.type = "button";
            el.addEventListener("click", onClick);
        }
        this.labelLayer.appendChild(el);
        const l = { el, position, normal };
        this.labels.push(l);
        return l;
    }
    setSelectedSite(id) {
        this.selectedSite = id;
        for (const l of this.labels)
            if (l.el.dataset.id)
                l.el.classList.toggle("sel", l.el.dataset.id === id);
    }
    frame() {
        const raw = this.clock.getDelta();
        // physics gets real elapsed time (fixed-step accumulator inside; capped so a stall cannot jump far),
        // camera animation gets a smoothed step
        this.onFrame(Math.min(0.5, raw));
        const dt = Math.min(0.1, raw);
        if (!this.scene)
            return;
        if (this.followLander)
            this.followLander(dt);
        else
            this.orbit.update(dt);
        this.renderer.render(this.scene, this.camera);
        const w = this.container.clientWidth, h = this.container.clientHeight;
        for (const l of this.labels) {
            const p = l.position.clone().project(this.camera);
            let visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
            if (visible && l.normal)
                visible = l.normal.dot(this.camera.position.clone().sub(l.position)) > 0;
            l.el.style.display = visible ? "" : "none";
            if (visible) { // keep the whole name on the stage (phone: names were cut at the right edge)
                const lw = l.w || (l.w = l.el.offsetWidth) || 0, x = Math.max(4, Math.min((p.x * 0.5 + 0.5) * w, w - lw - 12));
                l.el.style.transform = `translate(${x}px, ${(-p.y * 0.5 + 0.5) * h}px)`;
            }
        }
    }
    // ---------------- Level 1: globe ----------------
    showGlobe({ sites, features, onSelectSite, sunDirBody }) {
        this.clear();
        this.mode = "globe";
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x02040a);
        const R = R_REF / KM;
        scene.add(stars(R * 30));
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
        const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 96), mat);
        scene.add(globe);
        this.texLoader.load("./data/moon/lroc_color_2k.jpg", (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mat.map = t; mat.needsUpdate = true; }, undefined, () => { mat.color.set(0x8c8f96); this.onTextureError?.(); });
        scene.add(new THREE.AmbientLight(0x8899aa, 0.35));
        const sun = new THREE.DirectionalLight(0xffffff, 2.2);
        const sd = sunDirBody ? toGlobe(sunDirBody).normalize() : new THREE.Vector3(1, -0.2, 0.6).normalize();
        sun.position.copy(sd.multiplyScalar(R * 10));
        scene.add(sun);
        for (const s of sites) {
            const p = toGlobe(latLonToBodyFixed(s.lat, s.lon, R_REF + (s.site_height_m || 0)));
            const dot = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3ee3c2 }));
            dot.position.copy(p);
            scene.add(dot);
            this.addLabel(s.name, p, { cls: "site", normal: p.clone().normalize(), onClick: () => onSelectSite?.(s.id), num: sites.indexOf(s) + 1, id: s.id });
        }
        for (const f of features) {
            const p = toGlobe(latLonToBodyFixed(f.lat, f.lon, R_REF));
            this.addLabel(f.name, p, { cls: "feature", normal: p.clone().normalize() });
        }
        this.scene = scene;
        Object.assign(this.orbit, { minR: R * 1.05, maxR: R * 12, minPhi: 0.02, maxPhi: Math.PI - 0.02 });
        this.orbit.target.set(0, 0, 0);
        this.orbit.radius = R * 3.4;
        this.orbit.theta = Math.PI / 2;
        this.orbit.phi = 1.95;
        this.camera.near = 5;
        this.camera.far = R * 100;
        this.camera.updateProjectionMatrix();
    }
    flyToSouthPole(seconds = 2.2) {
        const R = R_REF / KM;
        this.orbit.flyTo({ target: new THREE.Vector3(0, -R * 0.9, 0), radius: R * 0.55, theta: Math.PI / 2, phi: 2.75 }, seconds);
    }
    // ---------------- Level 2: polar region ----------------
    showRegion({ grid, pgda, slope, layer = "natural", exaggeration = 1, sites, features, onSelectSite, sunEnu, earthEnu, refSite }) {
        this.clear();
        this.mode = "region";
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x010207);
        scene.add(stars(3000));
        const step = 2, nx = Math.floor((grid.nx - 1) / step) + 1, ny = Math.floor((grid.ny - 1) / step) + 1;
        const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3);
        const srcIndex = new Int32Array(nx * ny);
        for (let j = 0; j < ny; j++)
            for (let i = 0; i < nx; i++) {
                const gi = i * step, gj = j * step, k = j * nx + i;
                const x = grid.x0 + gi * grid.dx, y = grid.y0 + gj * grid.dx;
                const h = grid.at(gi, gj);
                const { lat, lon } = southStereoInverse(x, y);
                const p = toRegion(latLonToBodyFixed(lat, lon, R_REF + (Number.isFinite(h) ? h : 0) * exaggeration));
                pos.set([p.x, p.y, p.z], k * 3);
                srcIndex[k] = gj * grid.nx + gi;
            }
        const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
        let t = 0;
        for (let j = 0; j < ny - 1; j++)
            for (let i = 0; i < nx - 1; i++) {
                // grid i (stereo x) -> scene +Z, grid j (stereo y) -> scene +X: this winding faces +Y (up)
                const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                idx.set([a, b, c, b, d, c], t);
                t += 6;
            }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        this.region = { grid, pgda, slope, srcIndex, geo, mesh, mat, exaggeration };
        this.ambient = new THREE.HemisphereLight(0xbfd3ff, 0x111111, 0.05);
        scene.add(this.ambient);
        this.sunLight = new THREE.DirectionalLight(0xfff6e8, 3.2);
        this.sunLight.castShadow = true;
        // Grazing polar Sun: the light-space vertical extent is only relief + curvature (~±25 km),
        // so a tight top/bottom gives ~12 m shadow texels vertically. Units are km.
        Object.assign(this.sunLight.shadow.camera, { left: -200, right: 200, top: 25, bottom: -30, near: 1, far: 2000 });
        this.sunLight.shadow.mapSize.set(4096, 4096);
        this.sunLight.shadow.bias = -0.00005;
        this.sunLight.shadow.normalBias = 0.03;
        scene.add(this.sunLight);
        scene.add(this.sunLight.target);
        this.scene = scene;
        this.orbit.target.set(0, 0, 0);
        this.setRegionSun(sunEnu, refSite);
        // Sites: pin + candidate-region extent circle (~7.5 km radius; catalogue regions are ~15 km)
        for (const s of sites) {
            const h = (grid.height(s.stereo_x_m, s.stereo_y_m) || 0) * exaggeration;
            const base = toRegion(latLonToBodyFixed(s.lat, s.lon, R_REF + h));
            const top = toRegion(latLonToBodyFixed(s.lat, s.lon, R_REF + h + 4000));
            scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, top]), new THREE.LineBasicMaterial({ color: 0x3ee3c2 })));
            const ring = [];
            for (let a = 0; a <= 64; a++) {
                const th = a / 64 * Math.PI * 2, x = s.stereo_x_m + 7500 * Math.sin(th), y = s.stereo_y_m + 7500 * Math.cos(th);
                const hg = grid.height(x, y);
                const hh = (Number.isFinite(hg) ? hg : h / exaggeration) * exaggeration + 150;
                const { lat, lon } = southStereoInverse(x, y);
                ring.push(toRegion(latLonToBodyFixed(lat, lon, R_REF + hh)));
            }
            scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: 0x3ee3c2, transparent: true, opacity: 0.85 })));
            this.addLabel(s.name, top, { cls: "site", onClick: () => onSelectSite?.(s.id), num: sites.indexOf(s) + 1, id: s.id });
        }
        for (const f of features) {
            const h = (grid.height(f.stereo_x_m, f.stereo_y_m) || 0) * exaggeration;
            const p = toRegion(latLonToBodyFixed(f.lat, f.lon, R_REF + h + 1500));
            this.addLabel(f.name, p, { cls: "feature" });
        }
        if (earthEnu && refSite) {
            const d = dirToRegion(enuToBody(earthEnu, refSite.lat, refSite.lon));
            const e = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0x6fb7ff }));
            e.position.copy(d.multiplyScalar(420));
            scene.add(e);
            this.addLabel("Earth direction", e.position.clone(), { cls: "earth" });
        }
        this.setRegionLayer(layer);
        Object.assign(this.orbit, { minR: 8, maxR: 1500, minPhi: 0.05, maxPhi: 1.45 });
        this.camera.near = 0.2;
        this.camera.far = 20000;
        this.camera.updateProjectionMatrix();
        this.orbit.radius = 420;
        this.orbit.theta = Math.PI * 0.25;
        this.orbit.phi = 0.75;
    }
    setRegionSun(sunEnu, refSite) {
        if (!this.sunLight || !refSite || !sunEnu)
            return;
        const d = dirToRegion(enuToBody(sunEnu, refSite.lat, refSite.lon));
        this.sunLight.target.position.set(0, 0, 0);
        this.sunLight.position.copy(d.multiplyScalar(800));
    }
    setRegionLayer(layer) {
        const r = this.region;
        if (!r)
            return;
        const col = r.geo.getAttribute("color").array;
        const { grid, pgda, slope, srcIndex } = r;
        const lo = grid.min, span = grid.max - grid.min;
        for (let k = 0; k < srcIndex.length; k++) {
            const s = srcIndex[k];
            let c;
            if (layer === "elevation")
                c = colormaps.viridis((grid.data[s] - lo) / span);
            else if (layer === "slope")
                c = Number.isFinite(slope[s]) ? colormaps.slope(slope[s]) : [0.2, 0.2, 0.2];
            else if (layer === "illumination")
                c = pgda.sun[s] > 100 ? [0.2, 0.2, 0.2] : colormaps.inferno(pgda.sun[s] / 100);
            else if (layer === "earth")
                c = pgda.earth[s] > 100 ? [0.2, 0.2, 0.2] : colormaps.earth(pgda.earth[s] / 100);
            else
                c = [0.6, 0.6, 0.6];
            col[k * 3] = c[0];
            col[k * 3 + 1] = c[1];
            col[k * 3 + 2] = c[2];
        }
        r.geo.getAttribute("color").needsUpdate = true;
        const natural = layer === "natural" || layer === "candidates";
        this.ambient.intensity = natural ? 0.04 : 1.6;
        this.sunLight.intensity = natural ? 3.2 : 0.9;
        r.layer = layer;
    }
    focusRegionSite(site, grid, seconds = 1.6) {
        const h = (grid.height(site.stereo_x_m, site.stereo_y_m) || 0) * (this.region?.exaggeration || 1);
        const p = toRegion(latLonToBodyFixed(site.lat, site.lon, R_REF + h));
        this.orbit.flyTo({ target: p, radius: 45, phi: 0.95 }, seconds);
    }
    // ---------------- Level 3: site + Landing Lab ----------------
    showSite({ tile, horizon, layer = "natural", sunEnu, earthEnu }) {
        this.clear();
        this.mode = "site";
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.add(stars(80000, 2500));
        const nx = tile.nx, ny = tile.ny;
        const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3);
        for (let j = 0; j < ny; j++)
            for (let i = 0; i < nx; i++) {
                const k = j * nx + i, e = tile.x0 + i * tile.dx, n = tile.y0 + j * tile.dx, z = tile.at(i, j);
                pos.set([e, Number.isFinite(z) ? z : 0, -n], k * 3);
            }
        const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
        let t = 0;
        for (let j = 0; j < ny - 1; j++)
            for (let i = 0; i < nx - 1; i++) {
                const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                idx.set([a, b, c, b, d, c], t);
                t += 6;
            }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        scene.add(mesh);
        this.site = { tile, geo, slope: tile.slopeField() };
        // Distant skyline from the LOLA horizon (rays to 100 km), drawn as a wall at 7.9 km.
        const Rw = 7900, n = horizon.length, wall = [], line = [];
        for (let a = 0; a <= n; a++) {
            const hz = horizon[a % n], az = hz.az * D2R, y = Math.tan(hz.el * D2R) * Rw + 2;
            const x = Rw * Math.sin(az), z = -Rw * Math.cos(az);
            wall.push(x, -900, z, x, y, z);
            line.push(new THREE.Vector3(x, y, z));
        }
        const wIdx = [];
        for (let a = 0; a < n; a++) {
            const b = a * 2;
            wIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
        const wGeo = new THREE.BufferGeometry();
        wGeo.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
        wGeo.setIndex(wIdx);
        scene.add(new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ color: 0x0c1118, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })));
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: 0xffb547 })));
        this.addLabel("LOLA skyline (100 km rays)", line[Math.floor(n * 0.125)].clone(), { cls: "feature" });
        this.ambient = new THREE.HemisphereLight(0x9fb7d0, 0x080808, 0.05);
        scene.add(this.ambient);
        this.sunLight = new THREE.DirectionalLight(0xfff6e8, 3.4);
        this.sunLight.castShadow = true;
        Object.assign(this.sunLight.shadow.camera, { left: -9000, right: 9000, top: 4000, bottom: -4000, near: 10, far: 60000 });
        this.sunLight.shadow.mapSize.set(4096, 4096);
        this.sunLight.shadow.bias = -0.00005;
        this.sunLight.shadow.normalBias = 1.5;
        scene.add(this.sunLight);
        scene.add(this.sunLight.target);
        this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(Math.tan(0.2666 * D2R) * 60000, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }));
        this.earthDisc = new THREE.Mesh(new THREE.SphereGeometry(Math.tan(0.95 * D2R) * 60000, 32, 24), new THREE.MeshBasicMaterial({ color: 0x6fb7ff }));
        scene.add(this.sunDisc);
        scene.add(this.earthDisc);
        this.sunLabel = this.addLabel("Sun", new THREE.Vector3(), { cls: "sun" });
        this.earthLabel = this.addLabel("Earth", new THREE.Vector3(), { cls: "earth" });
        this.target = new THREE.Mesh(new THREE.RingGeometry(14, 18, 48), new THREE.MeshBasicMaterial({ color: 0x3ee3c2, side: THREE.DoubleSide }));
        this.target.rotation.x = -Math.PI / 2;
        this.target.position.set(0, (tile.height(0, 0) || 0) + 0.6, 0);
        scene.add(this.target);
        this.scene = scene;
        this.setSiteLayer(layer);
        this.setSiteSky(sunEnu, earthEnu);
        Object.assign(this.orbit, { minR: 8, maxR: 30000, minPhi: 0.05, maxPhi: 1.5 });
        this.camera.near = 0.3;
        this.camera.far = 300000;
        this.camera.updateProjectionMatrix();
        this.orbit.target.set(0, tile.height(0, 0) || 0, 0);
        this.orbit.radius = 6000;
        this.orbit.theta = 0.6;
        this.orbit.phi = 1.05;
    }
    setSiteLayer(layer) {
        const s = this.site;
        if (!s)
            return;
        const col = s.geo.getAttribute("color").array, d = s.tile.data, lo = s.tile.min, span = s.tile.max - s.tile.min || 1;
        for (let k = 0; k < d.length; k++) {
            let c;
            if (layer === "elevation")
                c = colormaps.viridis((d[k] - lo) / span);
            else if (layer === "slope")
                c = Number.isFinite(s.slope[k]) ? colormaps.slope(s.slope[k]) : [0.2, 0.2, 0.2];
            else
                c = [0.62, 0.62, 0.62];
            col[k * 3] = c[0];
            col[k * 3 + 1] = c[1];
            col[k * 3 + 2] = c[2];
        }
        s.geo.getAttribute("color").needsUpdate = true;
        const natural = !(layer === "elevation" || layer === "slope");
        // weak fill light (illustrative, stated in the legend) keeps grazing-Sun scenes readable
        if (this.ambient)
            this.ambient.intensity = natural ? 0.35 : 1.4;
        if (this.sunLight)
            this.sunLight.intensity = natural ? 3.4 : 1.0;
    }
    setSiteSky(sunEnu, earthEnu) {
        if (!this.sunLight || !this.sunDisc)
            return;
        if (sunEnu) {
            const d = enuToSite(sunEnu).normalize();
            this.sunDirSite = d.clone();
            const c = this.landerGroup ? this.landerGroup.position.clone() : new THREE.Vector3();
            this.sunLight.target.position.copy(c);
            this.sunLight.position.copy(c.clone().add(d.clone().multiplyScalar(30000)));
            this.sunDisc.position.copy(d.clone().multiplyScalar(60000));
            this.sunLabel.position.copy(this.sunDisc.position);
        }
        if (earthEnu) {
            const d = enuToSite(earthEnu).normalize();
            this.earthDisc.position.copy(d.multiplyScalar(60000));
            this.earthLabel.position.copy(this.earthDisc.position);
        }
    }
    // Same original illustrative Artemis-inspired geometry as the Cockpit, not NASA vehicle data.
    addLander() {
        const { group: g, flame } = createArtemisLander(THREE);
        this.flame = flame;
        this.landerGroup = g;
        this.scene.add(g);
        this.camMode = "chase";
        return g;
    }
    updateLander(sim, tiltDir) {
        const g = this.landerGroup;
        if (!g)
            return;
        const [x, y, z] = sim.s;
        g.position.set(x, z, -y);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), enuToSite(tiltDir).normalize());
        const th = sim.outcome ? 0 : sim.throttle;
        this.flame.visible = th > 0.01;
        this.flame.scale.set(1, 0.6 + 5 * th, 1);
        this.flame.position.y = -1.15 - (0.6 + 5 * th) / 2;
    }
    startFollow() {
        const camPos = new THREE.Vector3();
        this.followLander = (dt) => {
            const g = this.landerGroup;
            if (!g)
                return;
            const p = g.position;
            if (this.camMode === "orbit") {
                this.orbit.enabled = true;
                this.orbit.target.copy(p);
                this.orbit.update(dt);
                return;
            }
            this.orbit.enabled = false;
            if (this.camMode === "top")
                camPos.set(p.x, p.y + 160, p.z + 0.01);
            else if (this.camMode === "pilot")
                camPos.set(p.x, p.y + 2.4, p.z + 0.5);
            else {
                // chase camera on the Sun side (rotated 35°) so the lit face of the lander is visible
                const s = this.sunDirSite || new THREE.Vector3(0, 0, 1);
                const h = new THREE.Vector3(s.x, 0, s.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
                camPos.set(p.x + h.x * 46, p.y + 16, p.z + h.z * 46);
            }
            if (this.reducedMotion || this.camMode !== "chase")
                this.camera.position.copy(camPos);
            else
                this.camera.position.lerp(camPos, Math.min(1, dt * 4));
            if (this.camMode === "pilot")
                this.camera.lookAt(this.target.position);
            else
                this.camera.lookAt(p);
        };
        this.orbit.radius = 60;
        this.orbit.phi = 1.0;
    }
}
