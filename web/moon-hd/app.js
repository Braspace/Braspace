// BRASPACE Moon HD: the whole Moon and the south pole, lit by the Sun where NAIF SPICE puts it.
//
// Globe  : NASA SVS CGI Moon Kit colour (LROC WAC) + LOLA 16 px/deg relief (normal map and displacement).
// Pole   : native 80 m LOLA grid (LDEM_80S_80M centre crop), true scale, curvature included, with terrain
//          shadows ray-marched in the fragment shader toward the Sun.
// Display only. Relief exaggeration on the globe, the photometric function, earthshine and the star
// background are visual choices; no landing metric is computed here. See data/moonhd/manifest.json.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/controls/OrbitControls.js/+esm";
import { decodeEphemeris, indexAt, timeAt, pointsAt, bodyDirection, toGlobeScene, toPolarScene, signedLon, elevationAtSouthPole } from "./ephemeris.js";
import { R_REF, stereoToLocal, localToScene, latLonToStereo, makeGrid } from "./polar-math.js";

const DATA = "./data/moonhd/";
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- text
const TEXT = {
  en: {
    subtitle: "NASA LRO imagery and LOLA terrain, Sun and Earth from NAIF SPICE", status: "VISUAL PRODUCT · NOT VALIDATED",
    viewGlobe: "Globe", viewPole: "South pole · LOLA 80 m", subSolar: "Sub-solar point", subEarth: "Sub-Earth point",
    sunPole: "Sun elevation at the pole", earthPole: "Earth elevation at the pole", play: "Play", pause: "Pause", now: "Now",
    relief: "Relief ×", tint: "Altitude tint", markers: "Sites", exposure: "Exposure", loading: "Loading NASA data…",
    loadingPole: "Loading LOLA 80 m terrain…", failed: "Could not load the Moon HD data.", sun: "Sun", earth: "Earth",
    noteGlobe: "Relief is exaggerated for display. Sun and Earth are drawn at their true angular size, not at their true distance.",
    notePole: "True scale, native LOLA 80 m. Shadows are cast only by terrain inside this 164 km grid; the Sun is a 0.53° disc with an approximate penumbra.",
    statusTitle: "Rendered from NASA data for display. Not independently validated, not a NASA product.",
    credits: "Imagery and elevation: NASA's Scientific Visualization Studio (CGI Moon Kit) · Terrain: NASA LRO/LOLA (LDEM_80S_80M) · Geometry: NASA/JPL NAIF SPICE (DE440). Not a NASA product; not endorsed by NASA.",
  },
  pt: {
    subtitle: "Imagens do LRO e relevo LOLA da NASA, Sol e Terra pelo NAIF SPICE", status: "PRODUTO VISUAL · NÃO VALIDADO",
    viewGlobe: "Globo", viewPole: "Polo sul · LOLA 80 m", subSolar: "Ponto subsolar", subEarth: "Ponto subterrestre",
    sunPole: "Elevação do Sol no polo", earthPole: "Elevação da Terra no polo", play: "Reproduzir", pause: "Pausar", now: "Agora",
    relief: "Relevo ×", tint: "Cor por altitude", markers: "Locais", exposure: "Exposição", loading: "Carregando dados da NASA…",
    loadingPole: "Carregando o relevo LOLA de 80 m…", failed: "Não foi possível carregar os dados do Moon HD.", sun: "Sol", earth: "Terra",
    noteGlobe: "O relevo está exagerado para exibição. Sol e Terra aparecem no tamanho angular real, não na distância real.",
    notePole: "Escala real, LOLA nativo de 80 m. As sombras vêm só do relevo dentro desta grade de 164 km; o Sol é um disco de 0,53° com penumbra aproximada.",
    statusTitle: "Renderizado a partir de dados da NASA para exibição. Sem validação independente; não é um produto da NASA.",
    credits: "Imagens e elevação: NASA's Scientific Visualization Studio (CGI Moon Kit) · Relevo: NASA LRO/LOLA (LDEM_80S_80M) · Geometria: NASA/JPL NAIF SPICE (DE440). Não é um produto da NASA nem tem o endosso dela.",
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
const maxTexture = renderer.capabilities.maxTextureSize;
const loader = new THREE.TextureLoader();
const loadTexture = (name, srgb) => new Promise((resolve, reject) => loader.load(DATA + name, tex => {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  resolve(tex);
}, undefined, () => reject(new Error("texture " + name))));
const fetchOK = async (url, kind) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  return kind === "json" ? res.json() : res.arrayBuffer();
};

const sunGlobe = new THREE.Vector3(1, 0, 0), earthGlobe = new THREE.Vector3(1, 0, 0);
const sunPolar = new THREE.Vector3(1, 0, 0), earthPolar = new THREE.Vector3(1, 0, 0);

// ---------------------------------------------------------------- shared sky
function makeSky(starTexture, distance, sunRadius, earthRadius) {
  const group = new THREE.Group();
  const stars = new THREE.Mesh(new THREE.SphereGeometry(distance * 1.5, 48, 24),
    new THREE.MeshBasicMaterial({ map: starTexture, color: 0x8c8c8c, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false }));
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 sunDir; varying vec3 vN; void main(){ float d = smoothstep(-0.05, 0.25, dot(normalize(vN), sunDir)); gl_FragColor = vec4(mix(vec3(0.01, 0.015, 0.03), vec3(0.25, 0.45, 0.85), d), 1.0); }",
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(earthRadius, 32, 16), earthMaterial);
  group.add(stars, sun, earth);
  return { group, stars, sun, earth, earthMaterial, distance };
}

// ---------------------------------------------------------------- globe
const GLOBE_VERTEX = `
uniform sampler2D heightMap; uniform float hMin, hMax, relief;
varying vec2 vUv; varying vec3 vPos;
void main(){
  vUv = uv;
  float h = mix(hMin, hMax, texture2D(heightMap, uv).r);
  vec3 p = normalize(position) * (1.0 + relief * h / ${R_REF.toFixed(1)});
  vPos = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const GLOBE_FRAGMENT = `
uniform sampler2D colorMap, normalMap; uniform vec3 sunDir, earthDir; uniform float normalScale;
varying vec2 vUv; varying vec3 vPos;
void main(){
  vec3 up = normalize(vPos);
  vec3 east = normalize(vec3(up.z, 0.0, -up.x) + vec3(1e-6, 0.0, 0.0));
  vec3 north = cross(up, east);
  vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 N = normalize(tn.x * normalScale * east + tn.y * normalScale * north + tn.z * up);
  vec3 V = normalize(cameraPosition - vPos);
  float mu0 = max(dot(N, sunDir), 0.0), mu = max(dot(N, V), 0.0);
  float day = smoothstep(-0.03, 0.03, dot(up, sunDir));
  // Lunar-Lambert blend (display): the Moon has almost no limb darkening at full phase.
  float refl = (0.65 * 2.0 * mu0 / (mu0 + mu + 1e-3) + 0.35 * mu0) * day;
  vec3 albedo = texture2D(colorMap, vUv).rgb;
  vec3 col = albedo * refl * 1.7;
  col += albedo * vec3(0.55, 0.7, 1.0) * 0.012 * max(dot(up, earthDir), 0.0) * (1.0 - day);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

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

// ---------------------------------------------------------------- south pole
const POLAR_COMMON = `
uniform sampler2D hmap; uniform float halfExtent;
const float R = ${R_REF.toFixed(1)};
float H(vec2 st){ return texture2D(hmap, (st + halfExtent) / (2.0 * halfExtent)).r; }
// Stereographic metres + height -> polar scene metres (x toward 0E, y up, z toward 90E); see polar-math.js.
vec3 toScene(vec2 st, float h){
  vec2 X = st / (2.0 * R); float s = dot(X, X), k = 1.0 / (1.0 + s);
  return vec3((R + h) * 2.0 * X.y * k, (h * (1.0 - s) - 2.0 * R * s) * k, (R + h) * 2.0 * X.x * k);
}`;
const POLAR_VERTEX = POLAR_COMMON + `
varying vec2 vSt;
void main(){
  vSt = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(toScene(vSt, H(vSt)) / 1000.0, 1.0);
}`;
const POLAR_FRAGMENT = POLAR_COMMON + `
uniform vec3 sunDir; uniform float texel, tint, hMin, hMax;
varying vec2 vSt;
const float SUN_RADIUS = 0.00465; // angular radius of the solar disc, rad
vec3 ramp(float x){ // dark blue -> teal -> sand -> white, display only
  return mix(mix(vec3(0.10, 0.16, 0.42), vec3(0.10, 0.55, 0.55), smoothstep(0.0, 0.45, x)),
             mix(vec3(0.85, 0.72, 0.42), vec3(1.0), smoothstep(0.75, 1.0, x)), smoothstep(0.4, 0.75, x));
}
void main(){
  float h = H(vSt);
  vec3 P = toScene(vSt, h);
  vec2 ex = vec2(texel, 0.0), ey = vec2(0.0, texel);
  vec3 dx = toScene(vSt + ex, H(vSt + ex)) - toScene(vSt - ex, H(vSt - ex));
  vec3 dy = toScene(vSt + ey, H(vSt + ey)) - toScene(vSt - ey, H(vSt - ey));
  vec3 N = normalize(cross(dx, dy));
  // Terrain shadow: march toward the Sun, keep the smallest clearance angle between the ray and the ground.
  float clearance = 1.0;
  for (int i = 1; i <= STEPS; i++) {
    float f = float(i) / float(STEPS), tt = 60.0 + MAX_RANGE * f * f;
    vec3 Q = P + sunDir * tt;
    float a = Q.z, b = Q.x, c = Q.y, cz = c + R, r = sqrt(a * a + b * b + cz * cz);
    vec2 st = vec2(a, b) * (2.0 * R / (r + cz));
    if (abs(st.x) > halfExtent || abs(st.y) > halfExtent) break;
    float altitude = (a * a + b * b + c * c + 2.0 * c * R) / (r + R);
    clearance = min(clearance, (altitude - H(st)) / tt);
  }
  float lit = smoothstep(-SUN_RADIUS, SUN_RADIUS, clearance);
  vec3 V = normalize(cameraPosition - P / 1000.0);
  float mu0 = max(dot(N, sunDir), 0.0), mu = max(dot(N, V), 0.0);
  float refl = (0.5 * 2.0 * mu0 / (mu0 + mu + 0.05) + 0.5 * mu0 * 4.0) * lit;
  vec3 base = mix(vec3(0.62, 0.60, 0.57), ramp((h - hMin) / (hMax - hMin)), tint * 0.55);
  vec3 col = base * (refl * 0.9 + 0.004 + tint * 0.05);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function polarGeometry(half, segments) {
  const n = segments + 1, position = new Float32Array(n * n * 3), index = new Uint32Array(segments * segments * 6);
  let p = 0, k = 0;
  // Stay half a texel inside the raster so the edge vertices sample real data.
  const span = half - 40;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    position[p++] = -span + 2 * span * i / segments; position[p++] = -span + 2 * span * j / segments; position[p++] = 0;
  }
  for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    // Stereographic +x is scene +z and +y is scene +x: this winding faces up (+y).
    index[k++] = a; index[k++] = b; index[k++] = c; index[k++] = b; index[k++] = d; index[k++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
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
  projected.copy(label.position).project(camera);
  const show = visible && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
  label.el.hidden = !show;
  if (show) label.el.style.transform = `translate(${((projected.x + 1) / 2 * innerWidth + 8).toFixed(1)}px, ${((1 - projected.y) / 2 * innerHeight - 10).toFixed(1)}px)`;
}

// ---------------------------------------------------------------- app
async function main() {
  const manifest = await fetchOK(DATA + "manifest.json", "json");
  const [ephBuffer, catalog, colorTex, normalTex, heightTex, starTex] = await Promise.all([
    fetchOK(DATA + manifest.ephemeris.file),
    fetchOK("./data/sites.json", "json").catch(() => ({ sites: [], features: [] })),
    loadTexture("color_4k.jpg", true), loadTexture("normal_4k.jpg", false), loadTexture("height_2k.jpg", false), loadTexture("stars_4k.jpg", true),
  ]);
  const eph = decodeEphemeris(ephBuffer, manifest.ephemeris);

  // ---- globe scene
  const globe = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(32, 1, 0.01, 400), labels: [] };
  const globeUniforms = {
    colorMap: { value: colorTex }, normalMap: { value: normalTex }, heightMap: { value: heightTex },
    hMin: { value: manifest.relief.height_min_m }, hMax: { value: manifest.relief.height_max_m },
    relief: { value: 4 }, normalScale: { value: 4 / manifest.relief.normal_exaggeration },
    sunDir: { value: sunGlobe }, earthDir: { value: earthGlobe },
  };
  globe.scene.add(new THREE.Mesh(globeGeometry(small ? 384 : 768, small ? 192 : 384),
    new THREE.ShaderMaterial({ uniforms: globeUniforms, vertexShader: GLOBE_VERTEX, fragmentShader: GLOBE_FRAGMENT })));
  globe.sky = makeSky(starTex, 60, 60 * Math.tan(0.00465), 60 * Math.tan(0.0166));
  globe.scene.add(globe.sky.group);
  globe.controls = new OrbitControls(globe.camera, canvas);
  Object.assign(globe.controls, { enablePan: false, enableDamping: true, minDistance: 1.25, maxDistance: 14, rotateSpeed: 0.5 });
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a59, toneMapped: false });
  const featureMaterial = new THREE.MeshBasicMaterial({ color: 0x9aa6bd, toneMapped: false });
  const globeMarkers = new THREE.Group();
  globe.scene.add(globeMarkers);
  for (const site of catalog.sites || []) {
    if (!Number.isFinite(site.lat) || !Number.isFinite(site.lon)) continue;
    const dir = new THREE.Vector3(...toGlobeScene(bodyDirection(site.lat, site.lon)));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), markerMaterial);
    dot.position.copy(dir).multiplyScalar(1.03);
    globeMarkers.add(dot);
    globe.labels.push({ el: makeLabel(site.name || site.id, "site"), position: dot.position, normal: dir });
  }
  globe.labels.push({ el: makeLabel("", "body"), position: globe.sky.sun.position, key: "sun" },
    { el: makeLabel("", "body"), position: globe.sky.earth.position, key: "earth" });

  // ---- polar scene (terrain arrives later)
  const polar = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(38, 1, 0.05, 6000), labels: [], ready: false };
  polar.camera.position.set(52, 46, 88);
  polar.sky = makeSky(starTex, 1500, 1500 * Math.tan(0.00465), 1500 * Math.tan(0.0166));
  polar.scene.add(polar.sky.group);
  polar.controls = new OrbitControls(polar.camera, canvas);
  Object.assign(polar.controls, { enableDamping: true, minDistance: 2, maxDistance: 500, maxPolarAngle: Math.PI * 0.497, rotateSpeed: 0.5, enabled: false });
  polar.controls.target.set(0, -1.5, 0);
  polar.labels.push({ el: makeLabel("", "body"), position: polar.sky.sun.position, key: "sun" },
    { el: makeLabel("", "body"), position: polar.sky.earth.position, key: "earth" });
  const polarMarkers = new THREE.Group();
  polar.scene.add(polarMarkers);
  let polarUniforms = null;

  async function loadPolar() {
    const meta = manifest.south_pole;
    const grid = makeGrid(meta, new Int16Array(await fetchOK(DATA + meta.file)));
    polarUniforms = {
      hmap: { value: heightTexture(grid) }, halfExtent: { value: grid.half }, texel: { value: grid.spacing },
      sunDir: { value: sunPolar }, tint: { value: $("tint").checked ? 1 : 0 }, hMin: { value: meta.min_m }, hMax: { value: meta.max_m },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: polarUniforms, vertexShader: POLAR_VERTEX, fragmentShader: POLAR_FRAGMENT,
      defines: { STEPS: small ? 72 : 144, MAX_RANGE: (2 * grid.half).toFixed(1) },
    });
    polar.scene.add(new THREE.Mesh(polarGeometry(grid.half, small ? 384 : 896), material));
    const add = (item, kind) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
      const [x, y] = latLonToStereo(item.lat, item.lon);
      if (!grid.contains(x, y)) return;
      const h = grid.heightAt(x, y), base = localToScene(stereoToLocal(x, y, h)), top = localToScene(stereoToLocal(x, y, h + (kind === "site" ? 900 : 2600)));
      const pin = new THREE.Mesh(new THREE.SphereGeometry(kind === "site" ? 0.35 : 0.25, 12, 8), kind === "site" ? markerMaterial : featureMaterial);
      pin.position.set(...top);
      const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...base), pin.position]),
        new THREE.LineBasicMaterial({ color: kind === "site" ? 0xff7a59 : 0x9aa6bd, toneMapped: false }));
      polarMarkers.add(pin, stem);
      polar.labels.push({ el: makeLabel(item.name || item.id, kind), position: pin.position });
    };
    add({ name: lang === "pt" ? "Polo sul" : "South pole", lat: -90, lon: 0 }, "feature");
    for (const f of catalog.features || []) add(f, "feature");
    for (const s of catalog.sites || []) add(s, "site");
    polar.ready = true;
  }
  const polarLoading = loadPolar();

  // ---- state
  let mode = "globe", index = indexAt(eph, Date.parse(params.get("t") || "") || Date.now()), playing = false;
  const active = () => (mode === "globe" ? globe : polar);
  const slider = $("time");
  slider.max = String(eph.count - 1);

  const fmt = (v, pos, neg) => Math.abs(v).toFixed(2) + "° " + (v >= 0 ? pos : neg);
  function applyTime() {
    const { sun, earth } = pointsAt(eph, index);
    const sb = bodyDirection(sun.lat, sun.lon), eb = bodyDirection(earth.lat, earth.lon);
    sunGlobe.set(...toGlobeScene(sb)); earthGlobe.set(...toGlobeScene(eb));
    sunPolar.set(...toPolarScene(sb)); earthPolar.set(...toPolarScene(eb));
    for (const [view, s, e] of [[globe, sunGlobe, earthGlobe], [polar, sunPolar, earthPolar]]) {
      view.sky.sun.position.copy(s).multiplyScalar(view.sky.distance);
      view.sky.earth.position.copy(e).multiplyScalar(view.sky.distance);
      view.sky.earthMaterial.uniforms.sunDir.value.copy(s);
    }
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
    $("view-note").textContent = t(mode === "globe" ? "noteGlobe" : "notePole");
    for (const view of [globe, polar]) for (const l of view.labels) if (l.key) l.el.textContent = t(l.key);
  }

  async function setMode(next) {
    if (next === "pole" && !polar.ready) {
      const box = $("loading");
      box.firstElementChild.textContent = t("loadingPole"); box.classList.remove("done");
      try { await polarLoading; } finally { box.classList.add("done"); }
    }
    mode = next;
    globe.controls.enabled = mode === "globe"; polar.controls.enabled = mode === "pole";
    $("view-globe").setAttribute("aria-pressed", String(mode === "globe"));
    $("view-pole").setAttribute("aria-pressed", String(mode === "pole"));
    $("opt-relief").hidden = mode !== "globe"; $("opt-tint").hidden = mode !== "pole";
    for (const l of (mode === "globe" ? polar : globe).labels) l.el.hidden = true;
    applyText();
  }

  // ---- controls
  $("view-globe").addEventListener("click", () => setMode("globe"));
  $("view-pole").addEventListener("click", () => setMode("pole").catch(fail));
  $("play").addEventListener("click", () => { playing = !playing; applyText(); });
  $("now").addEventListener("click", () => { index = indexAt(eph, Date.now()); applyTime(); });
  $("lang").addEventListener("click", () => { lang = lang === "pt" ? "en" : "pt"; applyText(); });
  slider.addEventListener("input", () => { index = Number(slider.value); applyTime(); });
  $("relief").addEventListener("input", e => {
    const v = Number(e.target.value);
    globeUniforms.relief.value = v; globeUniforms.normalScale.value = v / manifest.relief.normal_exaggeration; $("relief-out").textContent = String(v);
  });
  $("tint").addEventListener("change", e => { if (polarUniforms) polarUniforms.tint.value = e.target.checked ? 1 : 0; });
  $("markers").addEventListener("change", e => { globeMarkers.visible = polarMarkers.visible = e.target.checked; });
  $("exposure").addEventListener("input", e => { renderer.toneMappingExposure = Number(e.target.value); });
  renderer.toneMappingExposure = Number($("exposure").value);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    for (const view of [globe, polar]) { view.camera.aspect = innerWidth / innerHeight; view.camera.updateProjectionMatrix(); }
  }
  addEventListener("resize", resize);
  resize();

  // ---- loop
  const toCamera = new THREE.Vector3();
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) {
      index += dt * Number($("speed").value);
      if (index >= eph.count - 1) { index = eph.count - 1; playing = false; applyText(); }
      applyTime();
    }
    const view = active();
    view.controls.update();
    view.sky.stars.position.copy(view.camera.position);
    renderer.render(view.scene, view.camera);
    const showSites = $("markers").checked;
    for (const l of view.labels) {
      let visible = l.key ? true : showSites;
      if (visible && l.normal) visible = toCamera.copy(view.camera.position).sub(l.position).normalize().dot(l.normal) > 0.12;
      if (visible && l.key && mode === "globe") visible = view.camera.position.dot(l.position) / view.camera.position.length() / l.position.length() < 0.999;
      placeLabel(l, view.camera, visible);
    }
  });

  applyTime();
  // First view: from the sunlit side, looking up from the south so the polar region is in frame.
  globe.camera.position.copy(sunGlobe).multiplyScalar(0.75).add(earthGlobe.clone().multiplyScalar(0.45)).setY(-0.62).normalize().multiplyScalar(small ? 6.4 : 4.6);
  await setMode(params.get("view") === "pole" ? "pole" : "globe");
  $("loading").classList.add("done");

  // Sharper globe on capable screens, after the first frame is already up.
  if (!small && maxTexture >= 8192 && manifest.files["color_8k.jpg"])
    loadTexture("color_8k.jpg", true).then(tex => { globeUniforms.colorMap.value.dispose(); globeUniforms.colorMap.value = tex; }).catch(() => {});
}

function fail(error) {
  console.error(error);
  const box = $("loading");
  box.classList.remove("done"); box.classList.add("error");
  box.firstElementChild.textContent = t("failed");
}
main().catch(fail);
