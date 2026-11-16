import { buildArtemisLander, hoverPose, scaleForSpan, globeUp, FOOT_Y } from "./artemis.js";
/** South pole fallback when the page has no site (lat -89.5, lon 0). */
export const SOUTH_POLE = { lat: -89.5, lon: 0 };
/** Leg span on the unit Moon: about 0.04 scene units, a clear share of the frame from the explore camera. */
export const COCKPIT_SPAN = 0.04;
/** Camera distance from the site (Moon radii) when explore opens. The backdrop orbits around the site itself,
 * tilted above its horizon from the sunlit side, so the lander is seen in perspective over the relief. */
export const FOCUS_DISTANCE = 0.4;
/** Radius of the reference sphere at the middle of the hover (hoverPose low 1.03 / high 1.06): the cockpit camera's target. */
export const HOVER_MID_R = 1.045;
const DEFAULT_TEXTS = () => {
    const pt = (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("pt");
    return pt ? { note: "Ilustrativo — lander hipotético, não é telemetria", tag: "Lander (ilustrativo)" }
        : { note: "Illustrative — hypothetical lander, not telemetry", tag: "Lander (illustrative)" };
};
function stylesheet() {
    const href = new URL("./artemis.css", import.meta.url).href;
    if ([...document.querySelectorAll("link[rel=stylesheet]")].some(l => l.href === href))
        return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
}
/**
 * Waits for the shared Moon and puts the lander over (lat, lon). Returns setSite / dispose; never throws.
 * Camera: focused on the site only when the user opens explore mode (it never forces explore on).
 */
export function mountArtemisCockpit(options = {}) {
    let site = { lat: Number.isFinite(options.lat) ? Number(options.lat) : SOUTH_POLE.lat, lon: Number.isFinite(options.lon) ? Number(options.lon) : SOUTH_POLE.lon };
    const texts = options.texts || DEFAULT_TEXTS;
    let api = null, lander = null, dead = false;
    const undo = [];
    let note = null, tag = null;
    const root = document.documentElement;
    const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    let relabelNow = () => { };
    let up = null, tether = null, ring = null, sun = null, t = 0;
    const scale = scaleForSpan(COCKPIT_SPAN);
    const pose = (r, throttle) => {
        if (!api || !lander)
            return;
        const g = lander.group;
        g.position.copy(api.toScene(site.lat, site.lon, r));
        // tether + ground ring reach from the footpads down to the reference sphere (r = 1)
        const ground = -(r - 1) / scale; // model units: the reference sphere below the origin
        tether.position.y = FOOT_Y;
        tether.scale.y = Math.max(0.001, FOOT_Y - ground);
        ring.position.y = ground;
        lander.setThrottle(throttle);
        if (sun) {
            sun.position.copy(api.moon.lightDir).multiplyScalar(10);
        }
    };
    const orient = () => {
        if (!api || !lander)
            return;
        up = new api.THREE.Vector3(...globeUp(site.lat, site.lon));
        lander.group.quaternion.setFromUnitVectors(new api.THREE.Vector3(0, 1, 0), up);
    };
    const still = () => { const p = hoverPose(0, { reducedMotion: true }); pose(p.r, p.throttle); api?.requestDraw(); };
    const v = () => api ? new api.THREE.Vector3() : null;
    const placeTag = () => {
        if (!api || !lander || !tag)
            return;
        const p = v().copy(lander.group.position), cam = api.camera.position;
        const facing = p.clone().normalize().dot(cam) - p.length() > 0.01;
        p.project(api.camera);
        const off = !facing || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
        tag.classList.toggle("is-off", off);
        if (!off)
            tag.style.transform = `translate(${((p.x * .5 + .5) * innerWidth).toFixed(1)}px,${((-p.y * .5 + .5) * innerHeight).toFixed(1)}px)`;
    };
    const focus = () => { api?.focusLatLon(site.lat, site.lon, FOCUS_DISTANCE); };
    const attach = (a) => {
        if (dead || api || !a?.scene || !a.THREE)
            return;
        api = a;
        try {
            const THREE = a.THREE;
            stylesheet();
            lander = buildArtemisLander(THREE, { scale, shadows: false });
            const g = lander.group;
            // guide to the ground (illustrative): thin line and a ring on the reference sphere
            const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0)]);
            tether = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x2ec4a0, transparent: true, opacity: 0.55, depthWrite: false }));
            tether.name = "artemis-tether";
            g.add(tether);
            ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.6, 48), new THREE.MeshBasicMaterial({ color: 0x2ec4a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
            ring.rotation.x = -Math.PI / 2;
            ring.name = "artemis-ring";
            g.add(ring);
            // the Moon is a ShaderMaterial with its own Sun direction: these lights only reach the lander
            const lights = new THREE.Group();
            lights.name = "artemis-lights";
            sun = new THREE.DirectionalLight(0xfff3e2, 3.2);
            lights.add(sun, sun.target);
            lights.add(new THREE.HemisphereLight(0xb8c4d6, 0x2a2622, 0.9));
            a.scene.add(g, lights);
            undo.push(() => { lander?.dispose(); a.scene.remove(lights); lineGeo.dispose(); tether.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); });
            orient();
            still();
            // Cockpit framing (owner, 16/11): the Moon below, the lander at the centre of the free area of the screen.
            a.cockpitView?.(site.lat, site.lon, HOVER_MID_R);
            note = document.createElement("p");
            note.className = "artemis-note";
            note.setAttribute("role", "note");
            tag = document.createElement("span");
            tag.className = "artemis-tag is-off";
            tag.setAttribute("aria-hidden", "true");
            const tagText = document.createElement("span");
            tag.append(tagText);
            const relabel = () => { const x = texts(); note.textContent = x.note; tagText.textContent = x.tag; };
            relabel();
            document.body.append(note, tag);
            relabelNow = relabel;
            root.classList.add("artemis-on");
            undo.push(() => { note?.remove(); tag?.remove(); relabelNow = () => { }; root.classList.remove("artemis-on"); });
            // The backdrop also flies when explore opens (to the selected pin, or again once the pin catalogue arrives).
            // The cockpit's site wins: re-focus once when the catalogue shows up shortly after explore opened.
            let pinCount = a.pins.length, openedAt = root.classList.contains("moon-explore-on") ? performance.now() : -Infinity;
            undo.push(a.onFrame(dt => {
                if (!lander)
                    return;
                const n = a.pins.length;
                if (n && !pinCount && performance.now() - openedAt < 10000)
                    setTimeout(focus, 0);
                pinCount = n;
                if (reduced?.matches) {
                    still();
                    placeTag();
                    return;
                }
                t += dt;
                const p = hoverPose(t);
                pose(p.r, p.throttle);
                placeTag();
            }));
            // explore opened by the user -> fly to the site (never forced on)
            let was = root.classList.contains("moon-explore-on");
            if (was)
                focus();
            const mo = new MutationObserver(() => { const now = root.classList.contains("moon-explore-on"); if (now && !was) {
                openedAt = performance.now();
                focus();
            } was = now; });
            mo.observe(root, { attributes: true, attributeFilter: ["class"] });
            undo.push(() => mo.disconnect());
        }
        catch {
            dispose();
        }
    };
    const onReady = (e) => attach(e.detail);
    addEventListener("moon-backdrop:ready", onReady);
    undo.push(() => removeEventListener("moon-backdrop:ready", onReady));
    const onPin = (e) => { const d = e.detail; if (Number.isFinite(d?.lat) && Number.isFinite(d?.lon))
        setSite(d.lat, d.lon, false); };
    addEventListener("moon:site-selected", onPin);
    undo.push(() => removeEventListener("moon:site-selected", onPin));
    const existing = window.moonBackdrop;
    if (existing)
        attach(existing);
    function setSite(lat, lon, refocus = true) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon))
            return;
        site = { lat, lon };
        orient();
        still();
        if (refocus && root.classList.contains("moon-explore-on"))
            focus();
        else
            api?.cockpitView?.(lat, lon, HOVER_MID_R);
    }
    function dispose() { if (dead)
        return; dead = true; for (const f of undo.splice(0).reverse()) {
        try {
            f();
        }
        catch { /* already gone */ }
    } lander = null; api = null; }
    return { setSite, dispose, relabel: () => relabelNow(), get lander() { return lander; } };
}
