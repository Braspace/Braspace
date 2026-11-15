// Preact + three.js view of the shared Artemis-class lander (core/artemis.ts), hovering over the
// selected site on the south pole relief (core/terrain.ts). Transparent canvas: the relief and the
// Joel Moon HD backdrop stay visible behind it; there is no second Moon here.
// Lifecycle is explicit: three.js loads only when the view is opened; closing it or leaving the page
// stops the loop and frees every GPU resource. No WebGL -> a short text, never a black box.
// Reduced motion -> static pose. Hidden tab -> no frames.
import { h, render, Component } from "../../vendor/preact/preact.module.js";
import { buildArtemisLander, plumeFor, LANDER_FOOT_Y, LANDER_TOP_Y, LANDER_LABEL } from "./artemis.js";
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.181.0/+esm"; // same instance as moon-hd/scene.js
/** Below the nav (55) + context bar (34): Fibonacci 89. */
export const TOP_CLEAR_PX = 89;
/** Lowest edge of the shell's top bars (nav + context), so the ship never slides under them. */
export function topClear() {
    let y = TOP_CLEAR_PX;
    for (const el of document.querySelectorAll(".mp-nav, .mp-context")) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top < innerHeight / 3)
            y = Math.max(y, r.bottom + 8);
    }
    return y;
}
export const hoverHeight = (tSec, reduced) => (reduced ? 0.9 : 0.9 + Math.sin(tSec * 1.3) * 0.18);
export class ArtemisView extends Component {
    state = { status: "loading" };
    host = null;
    alive = false;
    raf = 0;
    renderer = null;
    lander = null;
    onVis = () => { if (!document.hidden)
        this.loop(); };
    componentDidUpdate(_p, prev) { if (prev.status !== this.state.status)
        this.props.onStatus?.(this.state.status); }
    async componentDidMount() {
        this.alive = true;
        const probe = document.createElement("canvas");
        if (!probe.getContext("webgl2")) {
            this.setState({ status: "unsupported" });
            return;
        }
        let THREE;
        try {
            THREE = await import(/* @vite-ignore */ THREE_URL);
        }
        catch {
            if (this.alive)
                this.setState({ status: "error" });
            return;
        }
        if (!this.alive || !this.host)
            return;
        const size = this.props.sizePx ?? 240;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
        renderer.setSize(size, size * 1.25, false);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
        this.host.querySelector(".mp-artemis-canvas")?.replaceChildren(renderer.domElement);
        this.renderer = renderer;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 0.8, 0.1, 100);
        camera.position.set(6.2, 3.6, 8.4);
        camera.lookAt(0, 1.2, 0);
        // Low polar Sun: grazing key light, cool fill from the regolith.
        const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
        sun.position.set(-8, 1.6, 4);
        scene.add(sun);
        scene.add(new THREE.HemisphereLight(0x8fa6c4, 0x2a2622, 0.55));
        const lander = buildArtemisLander(THREE);
        this.lander = lander;
        scene.add(lander.group);
        // Soft contact shadow under the pads.
        const shadowTex = (() => {
            const c = document.createElement("canvas");
            c.width = c.height = 64;
            const x = c.getContext("2d");
            const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
            gr.addColorStop(0, "rgba(0,0,0,.55)");
            gr.addColorStop(1, "rgba(0,0,0,0)");
            x.fillStyle = gr;
            x.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(c);
        })();
        const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = LANDER_FOOT_Y - 0.9;
        scene.add(shadow);
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t0 = performance.now();
        this.frame = () => {
            const t = (performance.now() - t0) / 1000;
            const y = hoverHeight(t, reduced);
            lander.group.position.y = y;
            lander.group.rotation.y = reduced ? 0.6 : 0.6 + t * 0.25;
            const p = plumeFor(reduced ? 0.25 : 0.22 + 0.06 * Math.sin(t * 7));
            lander.flame.visible = p.visible;
            lander.flame.scale.set(1, p.scaleY * 0.5, 1);
            lander.flame.position.y = LANDER_FOOT_Y + 0.45 - p.scaleY * 0.25;
            lander.beacon.visible = reduced || Math.floor(t * 1.5) % 2 === 0;
            shadow.material.opacity = 1 - (y - 0.7) * 0.6;
            renderer.render(scene, camera);
            this.place();
        };
        this.cleanupScene = () => { lander.dispose(); shadowTex.dispose(); shadowMat.dispose(); shadow.geometry.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); };
        renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.setState({ status: "error" }); });
        document.addEventListener("visibilitychange", this.onVis);
        this.setState({ status: "ready" });
        this.loop();
    }
    frame = null;
    cleanupScene = null;
    /** Moves the floating canvas so the pads sit on the selected site of the relief. */
    place() {
        const el = this.host;
        if (!el)
            return;
        const at = this.props.anchor();
        if (!at) {
            el.style.visibility = "hidden";
            return;
        }
        const w = el.offsetWidth, hgt = el.offsetHeight;
        const footFrac = 1 - (0 - LANDER_FOOT_Y + 0.9) / (LANDER_TOP_Y - LANDER_FOOT_Y + 2.6); // pads ~ lower fifth of the canvas
        // Keep the whole ship on screen and clear of the top bars: near an edge it hovers lower rather than clipping.
        const x = Math.min(innerWidth - w - 8, Math.max(8, at[0] - w / 2));
        const y = Math.min(innerHeight - hgt - 8, Math.max(topClear(), at[1] - hgt * footFrac));
        el.style.visibility = "visible";
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    loop = () => {
        cancelAnimationFrame(this.raf);
        if (!this.alive || !this.frame || document.hidden)
            return;
        this.frame();
        this.raf = requestAnimationFrame(this.loop);
    };
    componentWillUnmount() {
        this.alive = false;
        cancelAnimationFrame(this.raf);
        document.removeEventListener("visibilitychange", this.onVis);
        this.cleanupScene?.();
        this.cleanupScene = null;
        this.frame = null;
        this.lander = null;
        this.renderer = null;
    }
    render({ lang }, { status }) {
        const label = LANDER_LABEL[lang] || LANDER_LABEL.en;
        // Not ready -> nothing floats over the panels; the reason is shown on the toggle (onStatus).
        if (status !== "ready" && status !== "loading")
            return null;
        return h("figure", { class: "mp-artemis glass", "data-status": status, style: status === "loading" ? "visibility:hidden" : undefined, ref: (e) => { this.host = e; }, role: "img", "aria-label": label }, h("div", { class: "mp-artemis-canvas" }));
    }
}
/** Mounts/unmounts the lander into `host`. Returns a disposer. */
export function mountArtemis(host, props) {
    render(h(ArtemisView, props), host);
    return () => render(null, host);
}
