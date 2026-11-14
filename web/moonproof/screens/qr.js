// Minimal QR Code encoder (ISO/IEC 18004): byte mode, error correction L, versions 1-40, automatic mask.
// Pure and deterministic (same text -> same matrix), no dependency, no network. Used by the Class Kit
// "Build activity" screen to draw the REAL share link as a QR code (the design's QR is only illustrative).
// ponytail: byte mode + level L only (shortest symbol for a URL); add EC levels M/Q/H if a caller needs repair margin.

const ECC_PER_BLOCK = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
const NUM_BLOCKS = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];
const FORMAT_L = 1; // level L indicator in the format information

const rawModules = v => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
};
export const dataCapacityBytes = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];

function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}

/** Data codewords (mode, count, bytes, terminator, padding) for version `ver`. */
function dataCodewords(bytes, ver) {
  const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  const cap = dataCapacityBytes(ver) * 8;
  put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const out = []; for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xEC; out.length < cap / 8; pad ^= 0xEC ^ 0x11) out.push(pad);
  return out;
}

/** Split into blocks, append Reed-Solomon codewords and interleave. */
function interleave(data, ver) {
  const nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
  return out;
}

function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
  for (let p = ver * 4 + 10; r.length < n; p -= step) r.splice(1, 0, p);
  return r;
}

const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

function penalty(m, size) {
  let p = 0, dark = 0;
  const line = a => { // rule 1 (runs >= 5) and rule 3 (1:1:3:1:1 finder-like pattern with 4 light modules beside it)
    let run = 1;
    for (let i = 1; i <= a.length; i++) { if (i < a.length && a[i] === a[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
    const s = "0000" + a.map(Number).join("") + "0000";
    for (const pat of ["10111010000", "00001011101"]) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
  };
  for (let y = 0; y < size; y++) { line(m[y]); line(m.map(r => r[y])); for (let x = 0; x < size; x++) if (m[y][x]) dark++; }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3; // rule 2
  return p + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10; // rule 4
}

/**
 * qrMatrix(text) -> { version, size, mask, modules } where modules[y][x] === true is a dark module.
 * Throws RangeError when the text does not fit version 40-L (2953 bytes).
 */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1; while (ver <= 40 && bytes.length > dataCapacityBytes(ver) - (ver < 10 ? 2 : 3)) ver++;
  if (ver > 40) throw new RangeError("QR payload too long");
  const size = ver * 4 + 17, mod = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };
  const inb = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const format = mask => {
    const d = (FORMAT_L << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((d << 10) | r) ^ 0x5412, b = i => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, b(i)); set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i)); set(8, size - 8, true);
  };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); if (inb(cx + dx, cy + dy)) set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  const al = alignPositions(ver);
  al.forEach((cy, i) => al.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  format(0);
  if (ver >= 7) {
    let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const bits = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const v = ((bits >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, v); set(b, a, v); }
  }
  const cw = interleave(dataCodewords(bytes, ver), ver);
  for (let i = 0, right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  const apply = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) mod[y][x] = !mod[y][x]; };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) { apply(k); format(k); const p = penalty(mod, size); if (p < bestP) { best = k; bestP = p; } apply(k); }
  apply(best); format(best);
  return { version: ver, size, mask: best, modules: mod };
}

/** SVG markup (dark modules as one path, `shape-rendering` crisp). `fg`/`label` are optional. */
export function qrSvg(text, { fg = "#0A0D10", label = "QR code" } = {}) {
  const { size, modules } = qrMatrix(text); let d = "";
  modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${String(label).replace(/"/g, "&quot;")}" shape-rendering="crispEdges"><path d="${d}" fill="${fg}"/></svg>`;
}
