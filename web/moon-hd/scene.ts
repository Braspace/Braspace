// BRASPACE Moon HD: the shared 3D scene (shaders, geometry, Moon globe and south cap).
// Used by the viewer (app.js) and by the page backdrop (backdrop.js) so both draw the same Moon.
// Display only; see app.js and data/moonhd/manifest.json for what is real and what is a visual choice.
// @ts-ignore TS2307: remote ES module (CDN), no local types
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.0/+esm";
import type { Three } from "../api-types.js";
import { bodyDirection, toGlobeScene } from "./ephemeris.js";
import { R_REF, makeGrid, CAP_LAT, ALTITUDE_RANGE } from "./polar-math.js";
import type { Grid, GridMeta } from "./polar-math.js";

/** The parts of data/moonhd/manifest.json the scene reads. */
export interface MoonManifest {
  relief: { height_min_m: number; height_max_m: number; normal_exaggeration: number };
  south_pole: GridMeta & { file: string };
  south_pole_wide: GridMeta & { file: string };
  [extra: string]: unknown;
}
export interface MoonScene {
  mesh: Three; shared: { colorMode: { value: number }; realLight: { value: number }; relief: { value: number } };
  uniforms: Record<string, { value: Three }>; lightDir: Three; earthDir: Three;
}
export interface CapScene {
  mesh: Three; uniforms: Record<string, { value: Three }>; innerGrid: Grid | null; wideGrid: Grid; lightPolar: Three; camPolar: Three;
}

export { THREE };
export const R_KM = R_REF / 1000;

// ---------------------------------------------------------------- loading
export const fetchJSON = async (url: string) => { const res = await fetch(url); if (!res.ok) throw new Error(url + " " + res.status); return res.json(); };
export async function fetchBinary(url: string, byteLength: number): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength !== byteLength) throw new Error(url + ": unexpected size");
  return buffer;
}
export function textureLoader(renderer: Three, base: string) {
  const loader = new THREE.TextureLoader();
  return (name: string, srgb?: boolean) => new Promise<Three>((resolve, reject) => loader.load(base + name, (tex: Three) => {
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    resolve(tex);
  }, undefined, () => reject(new Error("texture " + name))));
}

// Everything is drawn in the globe frame: unit sphere, +X toward 0°E, +Y north, -Z toward 90°E.
// The cap shader works in the polar frame (metres; x toward 0°E, y up at the south pole, z toward 90°E).
export const CAP_MATRIX = new THREE.Matrix4().set(1 / R_KM, 0, 0, 0, 0, -1 / R_KM, 0, -1, 0, 0, -1 / R_KM, 0, 0, 0, 0, 1); // polar km -> globe

// ---------------------------------------------------------------- shaders
const SHADING = `
uniform float colorMode, realLight;
const float ALT_MIN = ${ALTITUDE_RANGE[0].toFixed(1)}, ALT_MAX = ${ALTITUDE_RANGE[1].toFixed(1)};
vec3 ramp(float x){ // height colours in the style of NASA elevation maps; display only
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.07, 0.09, 0.33), vec3(0.10, 0.33, 0.74), smoothstep(0.0, 0.2, x));
  c = mix(c, vec3(0.15, 0.70, 0.72), smoothstep(0.2, 0.4, x));
  c = mix(c, vec3(0.40, 0.78, 0.30), smoothstep(0.4, 0.55, x));
  c = mix(c, vec3(0.96, 0.90, 0.30), smoothstep(0.55, 0.7, x));
  c = mix(c, vec3(0.90, 0.42, 0.35), smoothstep(0.7, 0.85, x));
  return mix(c, vec3(0.90, 0.86, 0.80), smoothstep(0.85, 1.0, x));
}
// albedo: natural colour (linear); h: true height in metres; lit: 0..1 direct light reaching the point.
vec3 shade(vec3 albedo, float h, vec3 N, vec3 L, vec3 V, float lit){
  float mu0 = max(dot(N, L), 0.0), mu = max(dot(N, V), 0.0);
  // Lunar-Lambert blend (display): the Moon shows almost no limb darkening at full phase.
  // Even light: a fill term plus Lambert (classic hillshade), so no face of the Moon goes dark.
  float refl = mix(0.42 + 0.85 * mu0, 0.6 * 2.0 * mu0 / (mu0 + mu + 0.02) + 0.4 * mu0, realLight) * lit;
  vec3 natural = albedo * refl * 1.7;
  vec3 coloured = ramp((h - ALT_MIN) / (ALT_MAX - ALT_MIN)) * (0.07 + 0.5 * refl);
  return mix(natural, coloured, colorMode);
}`;

const GLOBE_VERTEX = `
uniform sampler2D heightMap; uniform float hMin, hMax, relief;
varying vec2 vUv; varying vec3 vPos; varying float vH;
void main(){
  vUv = uv;
  vH = mix(hMin, hMax, texture2D(heightMap, uv).r);
  vec3 p = normalize(position) * (1.0 + relief * vH / ${R_REF.toFixed(1)});
  vPos = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const GLOBE_FRAGMENT = SHADING + `
uniform sampler2D colorMap, normalMap, heightMap; uniform vec3 lightDir, earthDir; uniform float normalScale, capReady, hMin, hMax, relief;
varying vec2 vUv; varying vec3 vPos; varying float vH;
const float PI = 3.141592653589793, R = ${R_REF.toFixed(1)};
// True height (m) under a unit direction of the globe frame, from the 16 px/deg LOLA map.
float heightAt(vec3 d){
  vec2 uv = vec2(atan(-d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  return mix(hMin, hMax, textureLod(heightMap, uv, 0.0).r);
}
void main(){
  vec3 up = normalize(vPos);
  if (capReady > 0.5 && up.y < ${Math.sin((CAP_LAT - 0.03) * Math.PI / 180).toFixed(6)}) discard; // the LOLA cap draws this part
  vec3 east = normalize(vec3(up.z, 0.0, -up.x) + vec3(1e-6, 0.0, 0.0));
  vec3 north = cross(up, east);
  vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 N = normalize(tn.x * normalScale * east + tn.y * normalScale * north + tn.z * up);
  vec3 V = normalize(cameraPosition - vPos);
  float graze = dot(up, lightDir);
  float day = mix(1.0, smoothstep(-0.03, 0.03, graze), realLight);
  float lit = day;
  if (realLight > 0.5 && graze > -0.04 && graze < 0.45) {
    // Terrain shadows where the Sun is low: march toward it over the height map (curvature included).
    vec3 P = up * (1.0 + relief * heightAt(up) / R);
    float clearance = 1.0;
    for (int i = 1; i <= GLOBE_STEPS; i++) {
      float f = float(i) / float(GLOBE_STEPS), tt = 0.004 + 0.14 * f * f; // lunar radii: 7 km to 250 km
      vec3 Q = P + lightDir * tt;
      float r = length(Q);
      clearance = min(clearance, ((r - 1.0) * R - relief * heightAt(Q / r)) / (tt * R));
    }
    // One grey level of the height map is 77 m, so the edge is kept wider than the solar disc.
    lit *= smoothstep(-0.012, 0.012, clearance);
  }
  vec3 albedo = texture2D(colorMap, vUv).rgb;
  vec3 col = shade(albedo, vH, N, lightDir, V, lit);
  col += albedo * vec3(0.55, 0.7, 1.0) * 0.012 * max(dot(up, earthDir), 0.0) * (1.0 - day) * (1.0 - colorMode);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CAP_COMMON = `
uniform sampler2D hmap, hmapWide; uniform float halfInner, halfWide, relief;
const float R = ${R_REF.toFixed(1)};
float blendWide(vec2 st){ return smoothstep(halfInner - 3000.0, halfInner - 600.0, max(abs(st.x), abs(st.y))); }
// True height in metres: native 80 m grid near the pole, 320 m block means beyond it.
float H(vec2 st){
  float w = blendWide(st), wide = texture2D(hmapWide, (st + halfWide) / (2.0 * halfWide)).r;
  return w >= 1.0 ? wide : mix(texture2D(hmap, (st + halfInner) / (2.0 * halfInner)).r, wide, w);
}
// Stereographic metres + height -> polar frame metres (x toward 0E, y up, z toward 90E); see polar-math.js.
vec3 toPolar(vec2 st, float h){
  vec2 X = st / (2.0 * R); float s = dot(X, X), k = 1.0 / (1.0 + s);
  return vec3((R + h) * 2.0 * X.y * k, (h * (1.0 - s) - 2.0 * R * s) * k, (R + h) * 2.0 * X.x * k);
}`;
const CAP_VERTEX = CAP_COMMON + `
varying vec2 vSt;
void main(){
  vSt = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(toPolar(vSt, relief * H(vSt)) / 1000.0, 1.0);
}`;
const CAP_FRAGMENT = CAP_COMMON + SHADING + `
uniform sampler2D colorMap; uniform vec3 lightDir, camPolar; uniform float capRho;
varying vec2 vSt;
const float SUN_RADIUS = 0.00465; // angular radius of the solar disc, rad
const float PI = 3.141592653589793;
void main(){
  float rho = length(vSt);
  if (rho > capRho) discard;
  float h = H(vSt), hr = relief * h;
  vec3 P = toPolar(vSt, hr);
  float e = mix(80.0, 320.0, blendWide(vSt));
  vec2 ex = vec2(e, 0.0), ey = vec2(0.0, e);
  vec3 dx = toPolar(vSt + ex, relief * H(vSt + ex)) - toPolar(vSt - ex, relief * H(vSt - ex));
  vec3 dy = toPolar(vSt + ey, relief * H(vSt + ey)) - toPolar(vSt - ey, relief * H(vSt - ey));
  vec3 N = normalize(cross(dx, dy));
  float lit = 1.0;
  if (realLight > 0.5) {
    // Terrain shadow: march toward the Sun, keep the smallest clearance angle between the ray and the ground.
    float clearance = 1.0;
    for (int i = 1; i <= STEPS; i++) {
      float f = float(i) / float(STEPS), tt = 60.0 + MAX_RANGE * f * f;
      vec3 Q = P + lightDir * tt;
      float a = Q.z, b = Q.x, c = Q.y, cz = c + R, r = sqrt(a * a + b * b + cz * cz);
      vec2 st = vec2(a, b) * (2.0 * R / (r + cz));
      if (abs(st.x) > halfWide || abs(st.y) > halfWide) break;
      float altitude = (a * a + b * b + c * c + 2.0 * c * R) / (r + R);
      clearance = min(clearance, (altitude - relief * H(st)) / tt);
    }
    lit = smoothstep(-SUN_RADIUS, SUN_RADIUS, clearance);
  }
  // Natural colour from the global mosaic: longitude/latitude of this point, with the seam at 180° handled by hand.
  float uA = atan(vSt.x, vSt.y) / (2.0 * PI) + 0.5, uB = fract(uA + 0.5) - 0.5;
  float v = (2.0 * atan(rho / (2.0 * R))) / PI;
  bool useA = fwidth(uA) <= fwidth(uB);
  vec2 uv = vec2(useA ? uA : uB, v);
  vec2 gx = vec2(useA ? dFdx(uA) : dFdx(uB), dFdx(v)), gy = vec2(useA ? dFdy(uA) : dFdy(uB), dFdy(v));
  vec3 albedo = textureGrad(colorMap, uv, gx, gy).rgb;
  vec3 V = normalize(camPolar - P / 1000.0);
  gl_FragColor = vec4(shade(albedo, h, N, lightDir, V, lit), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- geometry
export function globeGeometry(nLon: number, nLat: number) {
  const position = new Float32Array((nLon + 1) * (nLat + 1) * 3), uv = new Float32Array((nLon + 1) * (nLat + 1) * 2);
  let p = 0, q = 0;
  for (let j = 0; j <= nLat; j++) for (let i = 0; i <= nLon; i++) {
    const u = i / nLon, v = j / nLat, [x, y, z] = toGlobeScene(bodyDirection(v * 180 - 90, u * 360 - 180));
    position[p++] = x; position[p++] = y; position[p++] = z; uv[q++] = u; uv[q++] = v;
  }
  const index = new Uint32Array(nLon * nLat * 6);
  let k = 0;
  for (let j = 0; j < nLat; j++) for (let i = 0; i < nLon; i++) {
    const a = j * (nLon + 1) + i, b = a + 1, c = a + nLon + 1, d = c + 1;
    index[k++] = a; index[k++] = b; index[k++] = c; index[k++] = b; index[k++] = d; index[k++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  return g;
}

export function capGeometry(span: number, segments: number) {
  const n = segments + 1, position = new Float32Array(n * n * 3), index = new Uint32Array(segments * segments * 6);
  let p = 0, k = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    position[p++] = -span + 2 * span * i / segments; position[p++] = -span + 2 * span * j / segments; position[p++] = 0;
  }
  for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    index[k++] = a; index[k++] = b; index[k++] = c; index[k++] = b; index[k++] = d; index[k++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

function heightTexture(renderer: Three, grid: Grid) {
  const n = grid.nx, metres = new Float32Array(n * n);
  for (let i = 0; i < metres.length; i++) metres[i] = grid.dn[i] * grid.scale;
  let tex: Three;
  if (renderer.extensions.has("OES_texture_float_linear")) tex = new THREE.DataTexture(metres, n, n, THREE.RedFormat, THREE.FloatType);
  else {
    // Half floats filter linearly everywhere in WebGL2; about 4 m of height resolution at 4 km.
    const half = new Uint16Array(metres.length);
    for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(metres[i]);
    tex = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType);
  }
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- scene parts
// The Moon globe. lightDir / earthDir are unit vectors of the globe frame that the caller keeps up to date.
export function createMoon({ manifest, colorTex, normalTex, heightTex, lon, lat, steps }: { manifest: MoonManifest; colorTex: Three; normalTex: Three; heightTex: Three; lon: number; lat: number; steps: number }): MoonScene {
  const lightDir = new THREE.Vector3(1, 0, 0), earthDir = new THREE.Vector3(1, 0, 0);
  const shared = { colorMode: { value: 0 }, realLight: { value: 1 }, relief: { value: 1 } };
  const uniforms = {
    ...shared, colorMap: { value: colorTex }, normalMap: { value: normalTex }, heightMap: { value: heightTex },
    hMin: { value: manifest.relief.height_min_m }, hMax: { value: manifest.relief.height_max_m },
    normalScale: { value: 1 / manifest.relief.normal_exaggeration }, capReady: { value: 0 },
    lightDir: { value: lightDir }, earthDir: { value: earthDir },
  };
  const mesh = new THREE.Mesh(globeGeometry(lon, lat),
    new THREE.ShaderMaterial({ uniforms, vertexShader: GLOBE_VERTEX, fragmentShader: GLOBE_FRAGMENT, defines: { GLOBE_STEPS: steps } }));
  return { mesh, shared, uniforms, lightDir, earthDir };
}

// The LOLA south cap for a Moon made by createMoon. The caller adds cap.mesh to the scene, sets
// moon.uniforms.capReady to 1 and calls setPolarFrame every frame.
// wideOnly: skip the native 80 m grid (8.4 MB) and draw the whole cap from the 320 m block means.
export async function createCap({ renderer, base, manifest, moon, segments, steps, wideOnly = false }: { renderer: Three; base: string; manifest: MoonManifest; moon: MoonScene; segments: number; steps: number; wideOnly?: boolean }): Promise<CapScene> {
  const inner = manifest.south_pole, wide = manifest.south_pole_wide;
  const [a, b] = await Promise.all([wideOnly ? null : fetchBinary(base + inner.file, inner.nx * inner.ny * 2), fetchBinary(base + wide.file, wide.nx * wide.ny * 2)]);
  const wideGrid = makeGrid(wide, new Int16Array(b)), innerGrid = a ? makeGrid(inner, new Int16Array(a)) : null;
  const wideTex = heightTexture(renderer, wideGrid);
  const capRho = 2 * R_REF * Math.tan((CAP_LAT + 90) * Math.PI / 360);
  const lightPolar = new THREE.Vector3(1, 0, 0), camPolar = new THREE.Vector3();
  const uniforms = {
    ...moon.shared, hmap: { value: innerGrid ? heightTexture(renderer, innerGrid) : wideTex }, hmapWide: { value: wideTex },
    // halfInner 0 makes blendWide() 1 everywhere, so the shader reads only the wide grid.
    halfInner: { value: innerGrid ? innerGrid.half : 0 }, halfWide: { value: wideGrid.half }, capRho: { value: capRho },
    colorMap: moon.uniforms.colorMap, lightDir: { value: lightPolar }, camPolar: { value: camPolar },
  };
  const mesh = new THREE.Mesh(capGeometry(capRho + 400, segments), new THREE.ShaderMaterial({
    uniforms, vertexShader: CAP_VERTEX, fragmentShader: CAP_FRAGMENT, defines: { STEPS: steps, MAX_RANGE: "260000.0" },
  }));
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(CAP_MATRIX); mesh.frustumCulled = false;
  return { mesh, uniforms, innerGrid, wideGrid, lightPolar, camPolar };
}

// Flat south-polar stereographic map of a cap (2D maps such as MoonProof): the same fragment shading,
// but each stereographic point goes straight to the screen, so the image registers pixel for pixel with
// maps drawn in stereographic x/y. stereoView = centre x, y and half width, half height, in metres.
const CAP_STEREO_VERTEX = CAP_COMMON + `
uniform vec4 stereoView;
varying vec2 vSt;
void main(){
  vSt = position.xy;
  gl_Position = vec4((vSt - stereoView.xy) / stereoView.zw, 0.0, 1.0);
}`;
export function stereoCapMaterial(cap: CapScene, steps = 1) {
  const uniforms = { ...cap.mesh.material.uniforms, stereoView: { value: new THREE.Vector4(0, 0, 1, 1) } };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: CAP_STEREO_VERTEX, fragmentShader: CAP_FRAGMENT, defines: { STEPS: steps, MAX_RANGE: "260000.0" } });
}

// Light direction and camera position in the polar frame of the cap shader.
export function setPolarFrame(cap: Pick<CapScene, "lightPolar" | "camPolar">, lightDir: { x: number; y: number; z: number }, camera: Three) {
  cap.lightPolar.set(lightDir.x, -lightDir.y, -lightDir.z);
  cap.camPolar.set(camera.position.x * R_KM, -camera.position.y * R_KM - R_KM, -camera.position.z * R_KM);
}

// Decorative star background (NASA SVS Deep Star Maps 2020; not oriented relative to the Moon).
export function createStars(starTex: Three, radius: number) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24),
    new THREE.MeshBasicMaterial({ map: starTex, color: 0x8c8c8c, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
}
