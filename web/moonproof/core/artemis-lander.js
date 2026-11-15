/** Original illustrative lander, shared by the regional cockpit and educational landing simulation.
 * Not a NASA vehicle/CAD model. Geometry is in illustrative metres; flight dynamics are independent. */
export function createArtemisLander(THREE) {
    const group = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe2e7eb, roughness: .4, metalness: .45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x323c47, roughness: .65, metalness: .4 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: .5, metalness: .65 });
    const add = (geometry, material, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        group.add(mesh);
        return mesh;
    };
    add(new THREE.CylinderGeometry(1.15, 1.25, 1.5, 12), gold, 0, .15);
    add(new THREE.CylinderGeometry(.75, 1.02, 1.1, 12), white, 0, 1.45);
    add(new THREE.CylinderGeometry(.28, .75, .55, 12), white, 0, 2.275);
    for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(.46, .36, .08), dark, side * .39, 1.53, .845);
        add(new THREE.BoxGeometry(.13, 1.1, .16), dark, side * 1.16, .08, 0);
    }
    add(new THREE.CylinderGeometry(.03, .03, .6, 8), white, .4, 2.7, .2);
    const dish = add(new THREE.CircleGeometry(.3, 20), white, .4, 3, .2);
    dish.rotation.x = -1.1;
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const top = new THREE.Vector3(x * .5, -.35, z * .5), foot = new THREE.Vector3(x, -1.6, z);
        const leg = add(new THREE.CylinderGeometry(.06, .06, top.distanceTo(foot), 12), dark);
        leg.position.copy(top.clone().add(foot).multiplyScalar(.5));
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(top).normalize());
        add(new THREE.CylinderGeometry(.28, .28, .06, 16), white, x, -1.6, z);
    }
    add(new THREE.ConeGeometry(.38, .6, 20, 1, true), dark, 0, -.85);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.34, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.rotation.x = Math.PI;
    flame.visible = false;
    group.add(flame);
    return { group, flame };
}
