// K3 "Build activity": real QR of the share link (qr.js), role="switch" permissions, i18n parity. No browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { qrMatrix, qrSvg, dataCapacityBytes } from "../moonproof/screens/qr.js";

const read = f => fs.readFileSync(new URL(`../moonproof/${f}`, import.meta.url), "utf8");

// ---- Independent QR reader (own GF(256) log tables, own function-module map, spec tables for level L) ----
const TOT = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532]; // total codewords, versions 1..13
const ECC = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26];             // EC codewords per block (L)
const BLK = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4];                         // blocks (L)
const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62]];
const EXP = [], LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
const mul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);
const bch = (v, poly, nbits) => { let r = v << nbits; for (let i = 31; i >= nbits; i--) if ((r >>> i) & 1) r ^= poly << (i - nbits); return r; };

function readQr(m) {
  const size = m.length, ver = (size - 17) / 4;
  assert.ok(Number.isInteger(ver) && ver >= 1 && ver <= 13, `size ${size} is a QR size in the tested range`);
  const g = (x, y) => (m[y][x] ? 1 : 0);
  // format information: both copies must agree and be a valid BCH(15,5) codeword for level L
  let f1 = 0, f2 = 0; const p1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  p1.forEach(([x, y], i) => { f1 |= g(x, y) << i; });
  for (let i = 0; i < 15; i++) f2 |= (i < 8 ? g(size - 1 - i, 8) : g(8, size - 15 + i)) << i;
  assert.equal(f1, f2, "format copies agree");
  const fmt = f1 ^ 0x5412;
  assert.equal(fmt, (fmt >>> 10 << 10) | bch(fmt >>> 10, 0x537, 10), "format BCH valid");
  assert.equal(fmt >>> 13, 1, "error correction level L");
  const mask = (fmt >>> 10) & 7;
  assert.equal(g(8, size - 8), 1, "dark module");
  // function modules (spec): finders+separators+format strips, timing, alignment, version blocks
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) || x === 6 || y === 6) fn[y][x] = true;
    if (ver >= 7 && ((x < 6 && y >= size - 11 && y < size - 8) || (y < 6 && x >= size - 11 && x < size - 8))) fn[y][x] = true;
  }
  const al = ALIGN[ver];
  al.forEach((cy, i) => al.forEach((cx, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fn[cy + dy][cx + dx] = true; }));
  // read zigzag, unmask
  const M = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (((x / 3) | 0) + ((y / 2) | 0)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0][mask];
  const bits = [];
  for (let right = size - 1, up = true; right >= 1; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) for (const x of [right, right - 1]) { const y = up ? size - 1 - k : k; if (!fn[y][x]) bits.push(g(x, y) ^ (M(x, y) ? 1 : 0)); }
  }
  const cw = []; for (let i = 0; i + 8 <= TOT[ver] * 8; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  assert.equal(cw.length, TOT[ver]);
  // de-interleave, then every block (data + EC) must have zero syndromes
  const nb = BLK[ver], e = ECC[ver], nShort = nb - (TOT[ver] % nb), shortLen = Math.floor(TOT[ver] / nb), blocks = Array.from({ length: nb }, () => []);
  let p = 0;
  for (let i = 0; i < shortLen - e; i++) for (let b = 0; b < nb; b++) blocks[b].push(cw[p++]);
  for (let b = nShort; b < nb; b++) blocks[b].push(cw[p++]);
  for (let i = 0; i < e; i++) for (let b = 0; b < nb; b++) blocks[b].push(cw[p++]);
  for (const blk of blocks) for (let s = 0; s < e; s++) { let acc = 0; for (const c of blk) acc = mul(acc, EXP[s]) ^ c; assert.equal(acc, 0, "Reed-Solomon syndrome is zero"); }
  const data = blocks.flatMap(b => b.slice(0, b.length - e));
  const stream = data.map(b => b.toString(2).padStart(8, "0")).join("");
  assert.equal(stream.slice(0, 4), "0100", "byte mode");
  const cb = ver < 10 ? 8 : 16, n = parseInt(stream.slice(4, 4 + cb), 2);
  const out = []; for (let i = 0; i < n; i++) out.push(parseInt(stream.slice(4 + cb + 8 * i, 12 + cb + 8 * i), 2));
  return { version: ver, mask, text: new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(out)) };
}

const URL_SAMPLE = "http://127.0.0.1:5415/moonproof/activity.html?site=a&layer=why&allowSite=1&allowDate=0&allowProof=0&allowRules=0&allowLab=1";
const CAP = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428];

test("qr: data capacity table matches the standard (level L)", () => {
  CAP.forEach((c, v) => { if (v) assert.equal(dataCapacityBytes(v), c, `version ${v}`); });
  assert.equal(dataCapacityBytes(40), 2956);
});

test("qr: every symbol reads back to the original text (format, mask, Reed-Solomon, payload)", () => {
  const samples = ["HELLO", "https://example.org/a?b=c", URL_SAMPLE, "x".repeat(140), "y".repeat(250), "Olá, Lua ✓ " + "é".repeat(40), "z".repeat(420)];
  const versions = new Set();
  for (const text of samples) {
    const q = qrMatrix(text), r = readQr(q.modules);
    assert.equal(r.text, text);
    assert.equal(r.version, q.version); assert.equal(r.mask, q.mask);
    const bytes = new TextEncoder().encode(text).length;
    assert.ok(bytes <= CAP[q.version] - (q.version < 10 ? 2 : 3), "fits"); // mode+count overhead
    if (q.version > 1) assert.ok(bytes > CAP[q.version - 1] - (q.version - 1 < 10 ? 2 : 3), "smallest version that fits");
    versions.add(q.version);
  }
  assert.ok(versions.size >= 6, "several versions incl. >=7 (version blocks) and unequal blocks");
});

test("qr: finder patterns, timing, size, determinism, svg", () => {
  const a = qrMatrix(URL_SAMPLE), b = qrMatrix(URL_SAMPLE), m = a.modules;
  assert.deepEqual(a, b);
  assert.equal(a.size, a.version * 4 + 17);
  for (const [ox, oy] of [[0, 0], [a.size - 7, 0], [0, a.size - 7]]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(m[oy + y][ox + x], ring !== 2, `finder ${ox},${oy} @${x},${y}`);
    }
  }
  for (let i = 8; i < a.size - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.notDeepEqual(qrMatrix(URL_SAMPLE + "x").modules, m);
  const svg = qrSvg(URL_SAMPLE, { label: 'QR "x"' });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 41 41"/);
  assert.match(svg, /aria-label="QR &quot;x&quot;"/);
  assert.throws(() => qrMatrix("a".repeat(3000)), RangeError);
});

test("activity.js: switches are role=switch with aria-checked, QR comes from the real share URL", () => {
  const js = read("screens/activity.tsx"), css = read("screens/activity.css"), html = read("activity.html");
  assert.match(js, /role="switch"/);
  assert.match(js, /aria-checked=\{cfg\[k\]\}/);
  assert.doesNotMatch(js, /aria-pressed=\{cfg\[/, "switches no longer use aria-pressed");
  assert.match(js, /qrSvg\(url,/);
  assert.match(js, /const url = shareUrl\(\)/);
  assert.doesNotMatch(js + css + html, /moonproof\.app|LUA-7K2/);
  assert.match(css, /\.mp-switch::after\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px/);
  assert.match(css, /\.mp-qr\s*\{[^}]*width:\s*84px;[^}]*height:\s*84px;[^}]*padding:\s*5px/);
  assert.match(css, /\.mp-qr\s*\{[^}]*background:\s*var\(--pill\)/);
});

test("activity: permissions are a solid black card; preview frame, markers and layer tabs follow the design", () => {
  const js = read("screens/activity.tsx"), css = read("screens/activity.css"), html = read("activity.html");
  assert.match(html, /id="act-controls" class="mp-card /);
  assert.doesNotMatch(html, /id="act-controls"[^>]*mp-glass/);
  assert.match(css, /\.mp-preview-frame\s*\{[^}]*height:\s*300px/);
  assert.match(css, /\.mp-pv-marker\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px/);
  assert.match(css, /\.mp-layer-tab\.is-open\s*\{[^}]*rgba\(46,196,160,\.16\)[^}]*#7FE6CB/);
  assert.match(css, /\.mp-chip, \.mp-layer-tab\s*\{[^}]*height:\s*28px/);
  assert.match(js, /role="tablist"/); assert.match(js, /role="tab"/); assert.match(js, /aria-selected=/);
  assert.match(js, /mp-pv-badge/); assert.match(js, /loadRegion/);
});

test("activity.js i18n: en and pt-BR have the same keys, incl. the access note", () => {
  const js = read("screens/activity.tsx"), [en, pt] = js.split('"pt-BR": {');
  const keys = s => [...s.matchAll(/"(act\.[A-Za-z0-9]+)":/g)].map(m => m[1]).sort();
  assert.deepEqual(keys(en), keys(pt));
  assert.ok(keys(pt).includes("act.access") && keys(pt).includes("act.qrLabel"));
  assert.match(pt, /"act\.access": "Alunos entram sem conta · você acompanha as respostas aqui"/);
  assert.match(en, /"act\.access": "Students join without an account · you follow the answers here"/);
});

// Board geometry (V3Atividade, measured by DOM at 1440x900): no context bar, panels anchored at the board's own top.
const activityGeometryChecks = (js, css) => [
  [/mountShell\(\{[^}]*context:\s*null/.test(js) && !/shell\.setContext/.test(js), "shell mounted with context null (the board has no context bar)"],
  [/\.mp-act-layout\s*\{[^}]*inset:\s*97px 29px 28px 29px/.test(css), "panels start at y=97 with 29 px side margins"],
  [/grid-template-columns:\s*320px minmax\(0, 552fr\) minmax\(300px, 510fr\)/.test(css), "columns 320 / 552 / 510"],
  [/\.mp-act-share\s*\{[^}]*padding:\s*13px 21px 13px/.test(css), "share bar 129 px tall (96 px QR + padding)"],
  [/\.mp-btn-jade\s*\{[^}]*height:\s*47px/.test(css) && /\.mp-btn-outline\s*\{[^}]*height:\s*47px/.test(css), "share buttons 47 px"],
];
test("activity: panel geometry follows the V3Atividade board", () => {
  for (const [ok, what] of activityGeometryChecks(read("screens/activity.tsx"), read("screens/activity.css"))) assert.ok(ok, what);
});
