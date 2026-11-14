// BRASPACE Moon HD: one 3D Moon, from the whole globe down to the south pole, lit by the Sun where NAIF SPICE puts it.
//
// Globe     : NASA SVS CGI Moon Kit colour (LROC WAC) + LOLA 16 px/deg relief (normal map and displacement).
// South cap : everything south of 80.35 S is a separate mesh on the same sphere, built from LDEM_80S_80M
//             (320 m block means out to 80 S, native 80 m inside 164 km of the pole), with terrain shadows
//             ray-marched in the fragment shader toward the Sun.
// Options   : natural colour or colour by altitude; real sunlight or an even light with no night side.
// Display only. Relief exaggeration, the photometric function, the even light, earthshine and the star
// background are visual choices; no landing metric is computed here. See data/moonhd/manifest.json.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/controls/OrbitControls.js/+esm";
import { decodeEphemeris, indexAt, timeAt, pointsAt, bodyDirection, toGlobeScene, signedLon, elevationAtSouthPole } from "./ephemeris.js";
import { R_REF, latLonToStereo, makeGrid, CAP_LAT, ALTITUDE_RANGE } from "./polar-math.js";

const DATA = "./data/moonhd/";
const R_KM = R_REF / 1000;
const $ = id => document.getElementById(id);
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
    credits: "Imagery and elevation: NASA's Scientific Visualization Studio (CGI Moon Kit) · Terrain: NASA LRO/LOLA (LDEM_80S_80M) · Geometry: NASA/JPL NAIF SPICE (DE440) · Names: IAU/USGS Gazetteer. Not a NASA product; not endorsed by NASA.",
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
    credits: "Imagens e elevação: NASA's Scientific Visualization Studio (CGI Moon Kit) · Relevo: NASA LRO/LOLA (LDEM_80S_80M) · Geometria: NASA/JPL NAIF SPICE (DE440) · Nomes: IAU/USGS Gazetteer. Não é um produto da NASA nem tem o endosso dela.",
  },
};
let lang = params.get("lang") === "pt" ? "pt" : "en";
const t = key => TEXT[lang][key] ?? TEXT.en[key] ?? key;

// ---------------------------------------------------------------- renderer
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const small = window.matchMedia("(max-width: 720px)").matches;
const loader = new THREE.TextureLoader();
const loadTexture = (name, srgb) => new Promise((resolve, reject) => loader.load(DATA + name, tex => {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  resolve(tex);
}, undefined, () => reject(new Error("texture " + name))));
const fetchJSON = async url => { const res = await fetch(url); if (!res.ok) throw new Error(url + " " + res.status); return res.json(); };
async function fetchBinary(url, byteLength) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength !== byteLength) throw new Error(url + ": unexpected size");
  return buffer;
}

// Everything is drawn in the globe frame: unit sphere, +X toward 0°E, +Y north, -Z toward 90°E.
// The cap shader works in the polar frame (metres; x toward 0°E, y up at the south pole, z toward 90°E).
const CAP_MATRIX = new THREE.Matrix4().set(1 / R_KM, 0, 0, 0, 0, -1 / R_KM, 0, -1, 0, 0, -1 / R_KM, 0, 0, 0, 0, 1); // polar km -> globe

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
uniform sampler2D colorMap, normalMap; uniform vec3 lightDir, earthDir; uniform float normalScale, capReady;
varying vec2 vUv; varying vec3 vPos; varying float vH;
void main(){
  vec3 up = normalize(vPos);
  if (capReady > 0.5 && up.y < ${Math.sin((CAP_LAT - 0.03) * Math.PI / 180).toFixed(6)}) discard; // the LOLA cap draws this part
  vec3 east = normalize(vec3(up.z, 0.0, -up.x) + vec3(1e-6, 0.0, 0.0));
  vec3 north = cross(up, east);
  vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 N = normalize(tn.x * normalScale * east + tn.y * normalScale * north + tn.z * up);
  vec3 V = normalize(cameraPosition - vPos);
  float day = mix(1.0, smoothstep(-0.03, 0.03, dot(up, lightDir)), realLight);
  vec3 albedo = texture2D(colorMap, vUv).rgb;
  vec3 col = shade(albedo, vH, N, lightDir, V, day);
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
function globeGeometry(nLon, nLat) {
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

function capGeometry(span, segments) {
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

function heightTexture(grid) {
  const n = grid.nx, metres = new Float32Array(n * n);
  for (let i = 0; i < metres.length; i++) metres[i] = grid.dn[i] * grid.scale;
  let tex;
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

// ---------------------------------------------------------------- labels
const labelLayer = $("labels");
function makeLabel(text, kind) {
  const el = document.createElement("div");
  el.className = "label " + kind; el.textContent = text; el.hidden = true;
  labelLayer.appendChild(el);
  return el;
}
const projected = new THREE.Vector3();
function placeLabel(label, camera, visible) {
  if (visible) projected.copy(label.position).project(camera);
  const show = visible && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
  label.el.hidden = !show;
  if (show) label.el.style.transform = `translate(${((projected.x + 1) / 2 * innerWidth + 8).toFixed(1)}px, ${((1 - projected.y) / 2 * innerHeight - 10).toFixed(1)}px)`;
}

// ---------------------------------------------------------------- app
async function main() {
  const manifest = await fetchJSON(DATA + "manifest.json");
  const [ephBuffer, catalog, gazetteer, colorTex, normalTex, heightTex, starTex] = await Promise.all([
    fetchBinary(DATA + manifest.ephemeris.file, manifest.ephemeris.count * 8),
    fetchJSON("./data/sites.json").catch(() => ({ sites: [] })),
    fetchJSON(DATA + manifest.features.file).catch(() => ({ features: [] })),
    loadTexture("color_4k.jpg", true), loadTexture("normal_4k.jpg", false), loadTexture("height_2k.jpg", false), loadTexture("stars_4k.jpg", true),
  ]);
  const eph = decodeEphemeris(ephBuffer, manifest.ephemeris);

  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(1, 0, 0), earthDir = new THREE.Vector3(1, 0, 0), lightDir = new THREE.Vector3(1, 0, 0);
  const shared = { colorMode: { value: 0 }, realLight: { value: 1 }, relief: { value: 1 } };

  // ---- globe
  const globeUniforms = {
    ...shared, colorMap: { value: colorTex }, normalMap: { value: normalTex }, heightMap: { value: heightTex },
    hMin: { value: manifest.relief.height_min_m }, hMax: { value: manifest.relief.height_max_m },
    normalScale: { value: 1 / manifest.relief.normal_exaggeration }, capReady: { value: 0 },
    lightDir: { value: lightDir }, earthDir: { value: earthDir },
  };
  scene.add(new THREE.Mesh(globeGeometry(small ? 384 : 768, small ? 192 : 384),
    new THREE.ShaderMaterial({ uniforms: globeUniforms, vertexShader: GLOBE_VERTEX, fragmentShader: GLOBE_FRAGMENT })));

  // ---- sky: stars (decorative), Sun and Earth at their true angular size
  const SKY = 60;
  const stars = new THREE.Mesh(new THREE.SphereGeometry(SKY * 1.5, 48, 24),
    new THREE.MeshBasicMaterial({ map: starTex, color: 0x8c8c8c, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.00465), 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false }));
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 sunDir; varying vec3 vN; void main(){ float d = smoothstep(-0.05, 0.25, dot(normalize(vN), sunDir)); gl_FragColor = vec4(mix(vec3(0.01, 0.015, 0.03), vec3(0.25, 0.45, 0.85), d), 1.0); }",
  });
  const earthBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.0166), 32, 16), earthMaterial);
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
  for (const s of catalog.sites || []) if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) sitePoints.push(addName(s.name || s.id, s.lat, s.lon, "site"));
  for (const f of gazetteer.features || []) addName(f.name, f.lat, f.lon, f.type === "Mare" || f.type === "Oceanus" ? "mare" : "feature");
  const poleLabel = addName("", -90, 0, "feature"); poleLabel.key = "southPole";
  labels.push({ el: makeLabel("", "body"), position: sunBall.position, key: "sun", kind: "body" },
    { el: makeLabel("", "body"), position: earthBall.position, key: "earth", kind: "body" });
  const siteGeometry = new THREE.BufferGeometry();
  const sites = new THREE.Points(siteGeometry, new THREE.PointsMaterial({ color: 0xff7a59, size: 7, sizeAttenuation: false, toneMapped: false, depthTest: false }));
  sites.frustumCulled = false;
  scene.add(sites);
  function liftLabels() {
    const k = shared.relief.value;
    for (const l of labels) if (l.normal) l.position.copy(l.normal).multiplyScalar(1 + (k * l.height + 1500) / R_REF);
    siteGeometry.setFromPoints(sitePoints.map(l => l.position));
  }
  liftLabels();

  // ---- south cap (arrives after the first frame)
  let capUniforms = null;
  const camPolar = new THREE.Vector3(), lightPolar = new THREE.Vector3(1, 0, 0);
  async function loadCap() {
    const inner = manifest.south_pole, wide = manifest.south_pole_wide;
    const [a, b] = await Promise.all([fetchBinary(DATA + inner.file, inner.nx * inner.ny * 2), fetchBinary(DATA + wide.file, wide.nx * wide.ny * 2)]);
    const innerGrid = makeGrid(inner, new Int16Array(a)), wideGrid = makeGrid(wide, new Int16Array(b));
    const capRho = 2 * R_REF * Math.tan((CAP_LAT + 90) * Math.PI / 360);
    capUniforms = {
      ...shared, hmap: { value: heightTexture(innerGrid) }, hmapWide: { value: heightTexture(wideGrid) },
      halfInner: { value: innerGrid.half }, halfWide: { value: wideGrid.half }, capRho: { value: capRho },
      colorMap: globeUniforms.colorMap, lightDir: { value: lightPolar }, camPolar: { value: camPolar },
    };
    const mesh = new THREE.Mesh(capGeometry(capRho + 400, small ? 448 : 1024), new THREE.ShaderMaterial({
      uniforms: capUniforms, vertexShader: CAP_VERTEX, fragmentShader: CAP_FRAGMENT,
      defines: { STEPS: small ? 72 : 144, MAX_RANGE: "260000.0" },
    }));
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(CAP_MATRIX); mesh.frustumCulled = false;
    scene.add(mesh);
    globeUniforms.capReady.value = 1;
    for (const l of labels) {
      if (!l.normal || l.lat > CAP_LAT) continue;
      const [x, y] = latLonToStereo(l.lat, l.lon);
      if (wideGrid.contains(x, y)) l.height = (innerGrid.contains(x, y) ? innerGrid : wideGrid).heightAt(x, y);
    }
    liftLabels();
  }
  const capLoading = loadCap();

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
    $("clock").textContent = new Date(timeAt(eph, index)).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    $("r-sun").textContent = fmt(sun.lat, "N", "S") + ", " + fmt(signedLon(sun.lon), "E", "W");
    $("r-earth").textContent = fmt(earth.lat, "N", "S") + ", " + fmt(signedLon(earth.lon), "E", "W");
    const el = elevationAtSouthPole(sun.lat), eel = elevationAtSouthPole(earth.lat);
    $("r-el").textContent = (el >= 0 ? "+" : "−") + Math.abs(el).toFixed(2) + "°";
    $("r-eel").textContent = (eel >= 0 ? "+" : "−") + Math.abs(eel).toFixed(2) + "°";
    if (document.activeElement !== slider) slider.value = String(Math.round(index));
  }

  function applyText() {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    $("status").title = t("statusTitle");
    $("play").textContent = t(playing ? "pause" : "play");
    $("lang").textContent = lang === "pt" ? "EN" : "PT";
    const notes = [t(mode === "globe" ? "noteGlobe" : "notePole")];
    if (shared.relief.value > 1) notes.push(t("noteRelief"));
    if (shared.realLight.value < 0.5) notes.push(t("noteEven"));
    if (shared.colorMode.value > 0.5) notes.push(t("noteAltitude"));
    $("view-note").textContent = notes.join(" ");
    for (const l of labels) if (l.key) l.el.textContent = t(l.key);
  }

  async function setMode(next) {
    if (next === "pole" && !capUniforms) {
      const box = $("loading");
      box.firstElementChild.textContent = t("loadingPole"); box.classList.remove("done");
      try { await capLoading; } finally { box.classList.add("done"); }
    }
    mode = next;
    globe.controls.enabled = mode === "globe"; pole.controls.enabled = mode === "pole";
    $("view-globe").setAttribute("aria-pressed", String(mode === "globe"));
    $("view-pole").setAttribute("aria-pressed", String(mode === "pole"));
    applyText();
  }

  // ---- controls
  $("view-globe").addEventListener("click", () => setMode("globe"));
  $("view-pole").addEventListener("click", () => setMode("pole").catch(fail));
  $("play").addEventListener("click", () => { playing = !playing; applyText(); });
  $("now").addEventListener("click", () => { index = indexAt(eph, Date.now()); applyTime(); });
  $("lang").addEventListener("click", () => { lang = lang === "pt" ? "en" : "pt"; applyText(); });
  slider.addEventListener("input", () => { index = Number(slider.value); applyTime(); });
  const setRelief = v => {
    shared.relief.value = v; globeUniforms.normalScale.value = v / manifest.relief.normal_exaggeration;
    $("relief-out").textContent = String(v); liftLabels(); applyText();
  };
  $("relief").addEventListener("input", e => setRelief(Number(e.target.value)));
  $("color").addEventListener("change", e => { shared.colorMode.value = e.target.value === "altitude" ? 1 : 0; applyText(); });
  $("light").addEventListener("change", e => { shared.realLight.value = e.target.value === "even" ? 0 : 1; applyText(); });
  $("exposure").addEventListener("input", e => { renderer.toneMappingExposure = Number(e.target.value); });
  renderer.toneMappingExposure = Number($("exposure").value);
  if (params.get("color") === "altitude") { $("color").value = "altitude"; shared.colorMode.value = 1; }
  if (params.get("light") === "even") { $("light").value = "even"; shared.realLight.value = 0; }
  setRelief(Number($("relief").value));

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    for (const view of [globe, pole]) { view.camera.aspect = innerWidth / innerHeight; view.camera.updateProjectionMatrix(); }
  }
  addEventListener("resize", resize);
  resize();

  // ---- loop
  const toCamera = new THREE.Vector3(), right = new THREE.Vector3(), upCam = new THREE.Vector3(), back = new THREE.Vector3();
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) {
      index += dt * Number($("speed").value);
      if (index >= eph.count - 1) { index = eph.count - 1; playing = false; applyText(); }
      applyTime();
    }
    const { camera, controls } = active();
    controls.update();
    camera.updateMatrixWorld();
    stars.position.copy(camera.position);
    // Light: the Sun, or an even light fixed to the camera (from the upper left) that leaves no night side.
    if (shared.realLight.value > 0.5) lightDir.copy(sunDir);
    else {
      camera.matrixWorld.extractBasis(right, upCam, back); // back = camera +Z, pointing from the scene toward the viewer
      lightDir.copy(back).multiplyScalar(0.45).addScaledVector(right, -0.62).addScaledVector(upCam, 0.64).normalize();
    }
    lightPolar.set(lightDir.x, -lightDir.y, -lightDir.z);
    camPolar.set(camera.position.x * R_KM, -camera.position.y * R_KM - R_KM, -camera.position.z * R_KM);
    renderer.render(scene, camera);

    const names = $("markers").checked, distance = camera.position.length();
    sites.visible = names;
    for (const l of labels) {
      let visible = l.kind === "body" || names;
      if (visible && l.kind === "feature") visible = mode === "pole" || distance < 2.4;
      if (visible && l.kind === "mare") visible = mode === "globe" && distance > 2.4;
      if (visible && l.normal) visible = toCamera.copy(camera.position).sub(l.position).normalize().dot(l.normal) > (mode === "pole" ? 0.01 : 0.15);
      if (visible && l.kind === "body") visible = !(mode === "globe" && camera.position.dot(l.position) / distance / l.position.length() > 0.999);
      placeLabel(l, camera, visible);
    }
  });

  applyTime();
  // First view: from the sunlit side, looking up from the south so the polar region is in frame.
  globe.camera.position.copy(sunDir).multiplyScalar(0.75).add(earthDir.clone().multiplyScalar(0.45)).setY(-0.62).normalize().multiplyScalar(small ? 6.4 : 4.6);
  await setMode(params.get("view") === "pole" ? "pole" : "globe");
  $("loading").classList.add("done");

  // Sharper colour on capable screens, after the first frame is already up.
  if (!small && renderer.capabilities.maxTextureSize >= 8192 && manifest.files["color_8k.jpg"])
    loadTexture("color_8k.jpg", true).then(tex => { globeUniforms.colorMap.value.dispose(); globeUniforms.colorMap.value = tex; }).catch(() => {});
}

function fail(error) {
  console.error(error);
  const box = $("loading");
  box.classList.remove("done"); box.classList.add("error");
  box.firstElementChild.textContent = t("failed");
}
main().catch(fail);
