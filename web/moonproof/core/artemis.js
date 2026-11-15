// Artemis-class crewed lander, one model for the whole product: the Cockpit shows it over the
// south pole relief (core/artemis-view.tsx) and the Landing Lab flies it (lab/scene.ts addLander).
// ILLUSTRATIVE: an original design inspired by the Artemis crewed-lander architecture (tall single
// stage, crew cabin on top, body-mounted solar band, splayed legs). Not a NASA or contractor model,
// no insignia, not to scale with any real vehicle; it carries no physics. Built from primitives so
// it costs no download and works offline.
// Envelope (kept identical to the Lab's previous lander, so physics, touchdown and cameras are
// unchanged): origin at the vehicle's centre of mass, foot pads at y = -1.6, engine exit at y = -1.15.
// three.js is passed in (THREE) so every page reuses the instance it already loaded.
export const LANDER_FOOT_Y = -1.6;
export const LANDER_ENGINE_EXIT_Y = -1.15;
export const LANDER_TOP_Y = 3.55;
export const LANDER_LABEL = {
    "pt-BR": "Módulo de pouso tripulado (inspirado na arquitetura Artemis · ilustrativo, fora de escala)",
    en: "Crewed lander (inspired by the Artemis architecture · illustrative, not to scale)",
};
/** Builds the lander. Every geometry/material is tracked so dispose() frees the GPU memory. */
export function buildArtemisLander(THREE) {
    const owned = [];
    const keep = (x) => { owned.push(x); return x; };
    const g = new THREE.Group();
    g.name = "artemis-lander";
    const mat = {
        hull: keep(new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.42, metalness: 0.35 })),
        mli: keep(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.38, metalness: 0.75 })),
        dark: keep(new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.6, metalness: 0.5 })),
        solar: keep(new THREE.MeshStandardMaterial({ color: 0x1b2c4a, roughness: 0.25, metalness: 0.8, emissive: 0x0a1426, emissiveIntensity: 0.4 })),
        window: keep(new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.05, metalness: 0.9, emissive: 0x2ec4a0, emissiveIntensity: 0.18 })),
        grey: keep(new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.55, metalness: 0.5 })),
    };
    const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(keep(geo), m); o.position.set(x, y, z); g.add(o); return o; };
    // Main stage: tall body, gold MLI skirt at the base, body-mounted solar band near the top.
    add(new THREE.CylinderGeometry(0.82, 0.9, 0.55, 24), mat.mli, 0, -0.62);
    add(new THREE.CylinderGeometry(0.8, 0.82, 2.4, 24), mat.hull, 0, 0.85);
    add(new THREE.CylinderGeometry(0.805, 0.805, 0.5, 24, 1, true), mat.solar, 0, 1.75);
    // Crew cabin, window ring, nose dome.
    add(new THREE.CylinderGeometry(0.72, 0.8, 0.55, 24), mat.hull, 0, 2.3);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const w = add(new THREE.BoxGeometry(0.2, 0.14, 0.04), mat.window, Math.sin(a) * 0.76, 2.36, Math.cos(a) * 0.76);
        w.rotation.y = a;
    }
    add(new THREE.SphereGeometry(0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.hull, 0, 2.575);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.55), mat.grey, 0, 3.27);
    const beacon = add(new THREE.SphereGeometry(0.06, 12, 8), keep(new THREE.MeshBasicMaterial({ color: 0x2ec4a0 })), 0, 3.55);
    // Airlock with the crew elevator rail down the side.
    add(new THREE.BoxGeometry(0.42, 0.5, 0.22), mat.dark, 0, 2.05, 0.86);
    add(new THREE.BoxGeometry(0.05, 2.9, 0.05), mat.grey, 0.18, 0.55, 0.92);
    add(new THREE.BoxGeometry(0.05, 2.9, 0.05), mat.grey, -0.18, 0.55, 0.92);
    // Mid-body landing thrusters (four pods).
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        add(new THREE.CylinderGeometry(0.11, 0.14, 0.32, 12), mat.dark, x * 0.86, 1.3, z * 0.86);
    }
    // Comms: high-gain dish on a short mast.
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.5), mat.grey, -0.55, 2.85, -0.35);
    const dish = add(new THREE.CircleGeometry(0.24, 20), mat.grey, -0.55, 3.12, -0.35);
    dish.rotation.x = -1.05;
    // Legs: four splayed struts with pads at LANDER_FOOT_Y.
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const top = new THREE.Vector3(x * 0.4, -0.25, z * 0.4), foot = new THREE.Vector3(x, LANDER_FOOT_Y, z);
        const leg = add(new THREE.CylinderGeometry(0.055, 0.055, top.distanceTo(foot)), mat.grey);
        leg.position.copy(top.clone().add(foot).multiplyScalar(0.5));
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(top).normalize());
        const brace = add(new THREE.CylinderGeometry(0.03, 0.03, 0.9), mat.grey);
        const mid = top.clone().lerp(foot, 0.55), hub = new THREE.Vector3(x * 0.42, -0.85, z * 0.42);
        brace.position.copy(mid.clone().add(hub).multiplyScalar(0.5));
        brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), mid.clone().sub(hub).normalize());
        add(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 16), mat.grey, foot.x, foot.y, foot.z);
    }
    // Main engine: open bell whose exit sits at LANDER_ENGINE_EXIT_Y.
    add(new THREE.ConeGeometry(0.36, 0.5, 20, 1, true), mat.dark, 0, LANDER_ENGINE_EXIT_Y + 0.25);
    // Plume (scaled by the caller from throttle). Additive, no depth write, so it never hides terrain.
    const flame = new THREE.Mesh(keep(new THREE.ConeGeometry(0.32, 1, 20, 1, true)), keep(new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
    flame.rotation.x = Math.PI;
    flame.visible = false;
    g.add(flame);
    g.traverse((o) => { if (o.isMesh && o !== flame && o !== beacon) {
        o.castShadow = true;
        o.receiveShadow = true;
    } });
    return {
        group: g, flame, beacon,
        dispose() { for (const x of owned.splice(0))
            x.dispose?.(); g.removeFromParent?.(); },
    };
}
/** Plume length/position for a throttle in [0, 1] (shared by the Lab and the Cockpit hover). */
export function plumeFor(throttle) {
    const th = Math.min(1, Math.max(0, Number.isFinite(throttle) ? throttle : 0));
    const scaleY = 0.6 + 5 * th;
    return { visible: th > 0.01, scaleY, y: LANDER_ENGINE_EXIT_Y - scaleY / 2 };
}
