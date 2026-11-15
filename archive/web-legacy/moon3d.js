const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.181.0/+esm";
const GLTF_LOADER_URL = "https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/loaders/GLTFLoader.js/+esm";
// Optional API origin. Same-origin deployments leave it empty; the static
// GitHub Pages build sets window.BRASPACE_API_BASE in config.js instead of
// rewriting this file at publish time.
export function apiURL(path, scope = globalThis) {
    const base = String(scope?.BRASPACE_API_BASE || "").replace(/\/+$/, "");
    return base + path;
}
// NASA SVS LROC color texture and the NASA SVS 14959 Moon GLB, both served
// by the Go API (GET /api/layers/<id>/asset), fetched from svs.gsfc.nasa.gov
// and checked against the team asset registry's SHA-256. Loading them
// cross-origin from SVS is blocked by CORS in browsers.
export const TEXTURE_PATH = "/api/layers/lroc-color-2k/asset";
export const MODEL_PATH = "/api/layers/svs-14959-moon-small-glb/asset";
const radians = (d) => d * Math.PI / 180;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// ---- Coordinate convention -------------------------------------------------
// Sphere (three SphereGeometry + equirectangular texture): lon 0 at +X, north
// +Y, east -Z. The SVS 14959 GLB (moon_small.glb, measured in BR41) has lon 0
// at -Z, north +Y, east -X. Rotating the model by -90 degrees about Y maps
// the sphere frame onto the model frame, so one lonLat() serves both.
export const SURFACE_RADIUS = 1.65, MARKER_RADIUS = 1.68;
export const MODEL_YAW = -Math.PI / 2;
export function lonLatToVector(lat, lon, r = MARKER_RADIUS) {
    // Approximate visual pin placement on a rendered sphere (NOT precision
    // geodesy): coordinate frames and pole orientation await science review.
    const theta = radians(90 - lat), phi = radians(lon + 180);
    return { x: -r * Math.sin(theta) * Math.cos(phi), y: r * Math.cos(theta), z: r * Math.sin(theta) * Math.sin(phi) };
}
// Where a model-local point lands once the model is placed in the globe.
export function modelLocalToGlobe(p, yaw = MODEL_YAW, scale = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: scale * (p.x * c + p.z * s), y: scale * p.y, z: scale * (-p.x * s + p.z * c) };
}
// The GLB frame: unit direction of (lat, lon) in model-local axes.
export function modelDirection(lat, lon) {
    const la = radians(lat), lo = radians(lon), c = Math.cos(la);
    return { x: -c * Math.sin(lo), y: Math.sin(la), z: -c * Math.cos(lo) };
}
// Euler (XYZ, Ry applied first) that turns the marker for (lat, lon) toward the
// camera. The old focus() used a fixed -lat*0.42 tilt that sent south-pole
// markers to the far side of the globe (BR88). Navigation aid only.
export const CAMERA_POSITION = { x: 0, y: -1.35, z: 5.4 };
export function focusRotation(lat, lon, cam = CAMERA_POSITION) {
    const v = lonLatToVector(lat, lon, 1);
    const y = Math.atan2(-v.x, v.z), h = Math.hypot(v.x, v.z);
    const x = Math.atan2(cam.z, cam.y) - Math.atan2(h, v.y);
    return { x: Math.atan2(Math.sin(x), Math.cos(x)), y };
}
// The GLB is a visual asset with a baked base-color map. Its PBR clearcoat and
// the scene's bright lights can wash the texture out. This rendering material
// displays the NASA color map directly, without pretending to model lunar light.
export function bakedNASAColorMaterial(THREE, original) {
    if (!original?.map)
        return null;
    return new THREE.MeshBasicMaterial({
        map: original.map, color: original.color || 0xffffff,
        side: original.side, transparent: original.transparent,
        opacity: original.opacity, alphaTest: original.alphaTest,
        depthWrite: original.depthWrite
    });
}
// A slightly raised visual beacon keeps pins clear of the GLB relief.
// Both radii are decorative, not NASA landing-coordinate accuracy guarantees.
export const GLB_MARKER_RADIUS = SURFACE_RADIUS + 0.14;
export function visualMarkerRadius(glbLoaded) {
    return glbLoaded ? GLB_MARKER_RADIUS : MARKER_RADIUS;
}
export const STATUS_TEXT = {
    sphere: "Sphere + NASA SVS LROC texture · visual model · not terrain science",
    glb: "NASA SVS 14959 Moon GLB · visual model · not terrain science",
    fallback: "Illustrative texture fallback · NASA image unavailable · visual model · not terrain science",
    glbFailed: "Sphere + NASA SVS LROC texture · NASA 3D model unavailable · visual model · not terrain science",
};
function proceduralFallback(THREE) {
    // Deterministic training-only gray texture. Never present as lunar terrain data.
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const fill = ctx.createLinearGradient(0, 0, 0, canvas.height);
    fill.addColorStop(0, "#77808d");
    fill.addColorStop(.5, "#9da7af");
    fill.addColorStop(1, "#687384");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let seed = 2026;
    function rand() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    for (let i = 0; i < 600; i++) {
        const x = rand() * 1024, y = rand() * 512, r = 2 + rand() * 22;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * .67, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(35,45,60," + (0.03 + rand() * .10) + ")";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 1, y - 1, r * .87, r * .6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(235,239,245," + (0.03 + rand() * .12) + ")";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
export async function createMoon(stage, status, options = {}) {
    const THREE = await import(THREE_URL);
    if (!THREE.WebGLRenderer)
        throw new Error("WebGL unavailable");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
    camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    camera.lookAt(0, 0, 0);
    const globe = new THREE.Group();
    scene.add(globe);
    const surface = new THREE.Mesh(new THREE.SphereGeometry(1.65, 96, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, map: proceduralFallback(THREE) }));
    globe.add(surface);
    stage.dataset.globeModel = "sphere";
    let modelRoot = null, modelState = "idle", textureState = "pending";
    const setStatus = () => { status.textContent = modelRoot ? STATUS_TEXT.glb : textureState === "failed" ? STATUS_TEXT.fallback : modelState === "failed" ? STATUS_TEXT.glbFailed : STATUS_TEXT.sphere; };
    const ambient = new THREE.HemisphereLight(0xcee7ff, 0x101c2b, 1.75);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 2.1);
    light.position.set(-3.5, 2.5, 5);
    scene.add(light);
    const rim = new THREE.PointLight(0x2b9ab6, 40, 22);
    rim.position.set(3, -2, -3);
    scene.add(rim);
    const markers = new THREE.Group();
    globe.add(markers);
    globe.rotation.set(.32, .5, 0);
    function showTexture() {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(apiURL(TEXTURE_PATH), (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
            const prev = surface.material.map;
            surface.material.map = texture;
            surface.material.needsUpdate = true;
            if (prev && prev !== texture)
                prev.dispose();
            textureState = "ok";
            setStatus();
            render();
        }, undefined, () => {
            textureState = "failed";
            setStatus();
        });
    }
    const lonLat = (lat, lon) => { const v = lonLatToVector(lat, lon, MARKER_RADIUS); return new THREE.Vector3(v.x, v.y, v.z); };
    // NASA SVS 14959 GLB: loaded on demand; the sphere stays until it is ready
    // and remains if loading fails.
    const modelButton = document.createElement("button");
    modelButton.type = "button";
    modelButton.className = "ghost";
    modelButton.id = "load-nasa-model";
    modelButton.textContent = "Load NASA 3D model (13.8 MB)";
    async function loadModel() {
        if (modelRoot || modelState === "loading")
            return;
        modelState = "loading";
        stage.dataset.globeModel = "loading";
        modelButton.disabled = true;
        modelButton.textContent = "Loading NASA 3D model…";
        const t0 = performance.now();
        try {
            const { GLTFLoader } = await import(GLTF_LOADER_URL);
            const gltf = await new GLTFLoader().loadAsync(apiURL(MODEL_PATH));
            // NASA SVS GLB embeds its color texture. Show it without bright PBR
            // lighting/clearcoat; reject a blank or untextured model and retain LROC.
            let texturedMeshes = 0;
            gltf.scene.traverse((object) => {
                if (!object.isMesh || !object.material)
                    return;
                const convert = (material) => {
                    const display = bakedNASAColorMaterial(THREE, material);
                    if (display) {
                        texturedMeshes++;
                        return display;
                    }
                    return material;
                };
                object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
            });
            if (texturedMeshes === 0)
                throw new Error("NASA GLB has no usable base-color texture");
            // The GLB is a sphere: its radius is half the box edge (NOT the box's
            // bounding-sphere radius, which is sqrt(3) times larger).
            const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
            const scale = SURFACE_RADIUS / ((size.x + size.y + size.z) / 6);
            const center = box.getCenter(new THREE.Vector3());
            const pivot = new THREE.Group();
            pivot.rotation.y = MODEL_YAW;
            pivot.scale.setScalar(scale);
            gltf.scene.position.sub(center);
            pivot.add(gltf.scene);
            globe.add(pivot);
            globe.remove(surface);
            surface.geometry.dispose();
            surface.material.map?.dispose();
            surface.material.dispose();
            modelRoot = pivot;
            modelState = "ready";
            stage.dataset.globeModel = "glb";
            stage.dataset.modelTexturedMeshes = String(texturedMeshes);
            // Pins share the globe transform, so their geographical direction stays
            // unchanged. Lift their visual beacons above local relief after the swap.
            for (const pin of markers.children)
                pin.position.setLength(visualMarkerRadius(true));
            stage.dataset.modelMs = String(Math.round(performance.now() - t0));
            modelButton.textContent = "NASA 3D model loaded";
            modelButton.hidden = true;
            setStatus();
            render();
        }
        catch (err) {
            modelState = "failed";
            stage.dataset.globeModel = "sphere";
            modelButton.disabled = false;
            modelButton.textContent = "Retry NASA 3D model";
            setStatus();
        }
    }
    modelButton.addEventListener("click", loadModel);
    (stage.querySelector(".stage-bottom") || stage).appendChild(modelButton);
    if (options.autoloadModel || new URLSearchParams(globalThis.location?.search || "").get("model") === "1")
        loadModel();
    function setSites(sites) {
        while (markers.children.length) {
            const o = markers.children[0];
            markers.remove(o);
            o.geometry?.dispose();
            o.material?.dispose();
        }
        for (const site of (sites || []).slice(0, 25)) {
            const lat = Number(site.coordinate?.latitude_deg), lon = Number(site.coordinate?.longitude_deg);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90)
                continue;
            const pin = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0x72edff }));
            pin.position.copy(lonLat(lat, lon)).setLength(visualMarkerRadius(Boolean(modelRoot)));
            pin.userData = { id: site.id, name: site.name };
            markers.add(pin);
        }
        render();
    }
    function render() { renderer.render(scene, camera); }
    function resize() {
        const box = stage.getBoundingClientRect();
        const w = Math.max(200, box.width), h = Math.max(220, box.height);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
    }
    let dragging = false, lastX = 0, lastY = 0;
    function pointerDown(e) { if (e.target.closest("button"))
        return; dragging = true; lastX = e.clientX; lastY = e.clientY; stage.setPointerCapture?.(e.pointerId); }
    function pointerMove(e) {
        if (!dragging)
            return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        globe.rotation.y += dx * .005;
        globe.rotation.x = clamp(globe.rotation.x + dy * .004, -Math.PI, Math.PI);
        render();
    }
    function pointerUp() { dragging = false; }
    function wheel(e) { e.preventDefault(); camera.position.multiplyScalar(e.deltaY > 0 ? 1.07 : .93); const distance = camera.position.length(); camera.position.multiplyScalar(clamp(distance, 2.75, 9) / distance); render(); }
    function keyDown(e) {
        const step = .09;
        if (e.key === "ArrowLeft")
            globe.rotation.y -= step;
        else if (e.key === "ArrowRight")
            globe.rotation.y += step;
        else if (e.key === "ArrowUp")
            globe.rotation.x -= step;
        else if (e.key === "ArrowDown")
            globe.rotation.x += step;
        else
            return;
        e.preventDefault();
        render();
    }
    const reset = () => {
        camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
        camera.lookAt(0, 0, 0);
        globe.rotation.set(.32, .5, 0);
        render();
    };
    function focus(latitude, longitude) {
        // Navigation aid only; position remains unverified against UV orientation.
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
            return;
        const r = focusRotation(latitude, longitude);
        globe.rotation.y = r.y;
        globe.rotation.x = r.x;
        render();
    }
    stage.addEventListener("pointerdown", pointerDown);
    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerup", pointerUp);
    stage.addEventListener("pointercancel", pointerUp);
    stage.addEventListener("wheel", wheel, { passive: false });
    stage.addEventListener("keydown", keyDown);
    stage.insertBefore(renderer.domElement, stage.firstChild);
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    showTexture();
    return { reset, focus, setSites, dispose() {
            observer.disconnect();
            stage.removeEventListener("pointerdown", pointerDown);
            stage.removeEventListener("pointermove", pointerMove);
            stage.removeEventListener("pointerup", pointerUp);
            stage.removeEventListener("pointercancel", pointerUp);
            stage.removeEventListener("wheel", wheel);
            stage.removeEventListener("keydown", keyDown);
            modelButton.remove();
            if (modelRoot)
                modelRoot.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) {
                    m.map?.dispose();
                    m.dispose();
                } });
            else {
                surface.geometry.dispose();
                surface.material.map?.dispose();
                surface.material.dispose();
            }
            renderer.dispose();
            renderer.domElement.remove();
        } };
}
