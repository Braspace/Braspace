// Joel's Moon HD south cap drawn as a flat south-polar stereographic map, for 2D maps that place
// markers in stereographic metres (MoonProof core/terrain). Same LOLA grids (80 m near the pole,
// 320 m to 80°S) and fragment shading as the 3D viewer; lighting is a fixed illustrative key light
// (no SPICE Sun on a map, so no false shadows). Hardware WebGL only, drawn on demand (no animation
// loop); any failure removes the canvas and the caller keeps its own relief.
import { probeWebGL } from "./backdrop.js";
// Upper-left key light like the 2D hillshade, in the cap's polar frame
// (x toward 0°E = screen up, z toward 90°E = screen right, y = up out of the map).
const KEY = [0.52, 0.58, -0.62];
/** opts.wideOnly: draw the cap from the 320 m grid alone (createCap's existing lighter level of detail, used on phones). */
export async function mountStereoRelief(parent, before, onLost, opts = {}) {
    const probe = probeWebGL(() => document.createElement("canvas"));
    if (!probe)
        return null;
    const { canvas, gl } = probe;
    canvas.className = "mp-terrain-hd";
    canvas.setAttribute("aria-hidden", "true");
    // Toned to the MoonProof dark map (the 2D hillshade peaks near 235/255 on a near-black base).
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", filter: "brightness(.56) contrast(2.4) saturate(.45)" });
    let dead = false, renderer = null, mesh = null, scene = null, camera = null;
    const textures = new Set();
    function dispose() {
        if (dead)
            return;
        dead = true;
        if (mesh) {
            mesh.geometry.dispose();
            for (const u of Object.values(mesh.material.uniforms || {}))
                if (u.value?.isTexture)
                    textures.add(u.value);
            mesh.material.dispose();
        }
        textures.forEach(t => t.dispose());
        renderer?.dispose();
        canvas.remove();
    }
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); dispose(); onLost(); });
    try {
        const S = await import("./scene.js");
        const base = new URL("../data/moonhd/", import.meta.url).href;
        renderer = new S.THREE.WebGLRenderer({ canvas, context: gl });
        renderer.setClearColor(0x07090c, 1);
        const manifest = await S.fetchJSON(base + "manifest.json");
        const colorTex = await S.textureLoader(renderer, base)("color_4k.jpg", true);
        textures.add(colorTex);
        // The cap reads the colour map and the light uniforms of a Moon; the globe mesh itself is never drawn.
        const moon = S.createMoon({ manifest, colorTex, normalTex: colorTex, heightTex: colorTex, lon: 8, lat: 4, steps: 1 });
        moon.mesh.geometry.dispose();
        moon.mesh.material.dispose();
        // No cast shadows: a fixed illustrative light must not paint dark areas that read as permanent shadow.
        moon.shared.realLight.value = 0;
        // Same ×2.2 slope exaggeration as the 2D hillshade (core/terrain shadeValue): on a flat map it only
        // steepens the shading normals; positions stay in true stereographic metres.
        moon.shared.relief.value = 2.2;
        const cap = await S.createCap({ renderer, base, manifest, moon, segments: 384, steps: 1, wideOnly: !!opts.wideOnly });
        if (dead) {
            cap.mesh.geometry.dispose();
            cap.mesh.material.dispose();
            throw new Error("stereo relief ended");
        }
        cap.mesh.material.dispose();
        const material = S.stereoCapMaterial(cap);
        cap.lightPolar.set(...KEY).normalize();
        cap.camPolar.set(0, 1e5, 0); // nadir: the map is seen from straight above
        mesh = new S.THREE.Mesh(cap.mesh.geometry, material);
        mesh.frustumCulled = false;
        scene = new S.THREE.Scene();
        scene.add(mesh);
        camera = new S.THREE.Camera();
        parent.insertBefore(canvas, before);
    }
    catch {
        dispose();
        return null;
    }
    return {
        canvas, dispose,
        draw(sx, sy, W, H, mpp) {
            if (dead || !W || !H)
                return;
            renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
            renderer.setSize(W, H, false);
            mesh.material.uniforms.stereoView.value.set(sx, sy, W * mpp / 2, H * mpp / 2);
            renderer.render(scene, camera);
        },
    };
}
