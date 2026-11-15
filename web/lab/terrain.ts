// Terrain tiles produced by science/build_web_assets.py from NASA LRO/LOLA LDEM_80S_80M.
// Header JSON: { nx, ny, spacing_m, origin_x_m, origin_y_m, scale_m, offset_m, nodata, sha256, ... }
// Body: Int16 little-endian, row-major, row 0 at origin_y_m (south/min-y edge), increasing +y.
// Height (m) = offset_m + scale_m * value. Values equal to nodata are missing.

export interface TerrainHeader {
  nx: number; ny: number; spacing_m: number; origin_x_m: number; origin_y_m: number;
  scale_m: number; offset_m: number; nodata: number; sha256?: string;
  [extra: string]: unknown;
}

export class TerrainGrid {
  declare h: TerrainHeader;
  declare nx: number; declare ny: number; declare dx: number; declare x0: number; declare y0: number;
  declare data: Float32Array;
  declare min: number; declare max: number; declare missing: number;

  constructor(header: TerrainHeader, int16: Int16Array) {
    this.h = header;
    this.nx = header.nx; this.ny = header.ny;
    this.dx = header.spacing_m;
    this.x0 = header.origin_x_m; this.y0 = header.origin_y_m;
    this.data = new Float32Array(int16.length);
    let min = Infinity, max = -Infinity, missing = 0;
    for (let i = 0; i < int16.length; i++) {
      if (int16[i] === header.nodata) { this.data[i] = NaN; missing++; continue; }
      const v = header.offset_m + header.scale_m * int16[i];
      this.data[i] = v; if (v < min) min = v; if (v > max) max = v;
    }
    this.min = min; this.max = max; this.missing = missing;
  }

  static async load(baseUrl: string): Promise<TerrainGrid> {
    const [hRes, bRes] = await Promise.all([fetch(baseUrl + ".json"), fetch(baseUrl + ".bin")]);
    if (!hRes.ok || !bRes.ok) throw new Error(`terrain tile unavailable: ${baseUrl}`);
    const header = await hRes.json();
    const buf = await bRes.arrayBuffer();
    if (buf.byteLength !== header.nx * header.ny * 2) throw new Error("terrain tile has unexpected byte length");
    if (header.sha256 && globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
      if (hex !== header.sha256) throw new Error("terrain tile checksum mismatch");
    }
    return new TerrainGrid(header, new Int16Array(buf));
  }

  at(i: number, j: number): number { return this.data[j * this.nx + i]; }

  contains(x: number, y: number): boolean {
    const fx = (x - this.x0) / this.dx, fy = (y - this.y0) / this.dx;
    return fx >= 0 && fy >= 0 && fx <= this.nx - 1 && fy <= this.ny - 1;
  }

  /** Bilinear height (m); NaN outside the grid or next to missing pixels. */
  height(x: number, y: number): number {
    const fx = (x - this.x0) / this.dx, fy = (y - this.y0) / this.dx;
    if (!(fx >= 0 && fy >= 0 && fx <= this.nx - 1 && fy <= this.ny - 1)) return NaN;
    const i = Math.min(Math.floor(fx), this.nx - 2), j = Math.min(Math.floor(fy), this.ny - 2);
    const tx = fx - i, ty = fy - j;
    const a = this.at(i, j), b = this.at(i + 1, j), c = this.at(i, j + 1), d = this.at(i + 1, j + 1);
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  /** Surface normal and slope (deg) from central differences at grid spacing. */
  normal(x: number, y: number): { normal: number[]; slopeDeg: number } {
    const e = this.dx;
    const hx = (this.height(x + e, y) - this.height(x - e, y)) / (2 * e);
    const hy = (this.height(x, y + e) - this.height(x, y - e)) / (2 * e);
    const n: [number, number, number] = [-hx, -hy, 1];
    const len = Math.hypot(...n);
    return { normal: n.map(v => v / len), slopeDeg: Math.atan(Math.hypot(hx, hy)) * 180 / Math.PI };
  }

  /** Per-cell slope (deg) array, NaN on edges/missing data. */
  slopeField(): Float32Array {
    const out = new Float32Array(this.nx * this.ny).fill(NaN);
    const e2 = 2 * this.dx;
    for (let j = 1; j < this.ny - 1; j++) for (let i = 1; i < this.nx - 1; i++) {
      const hx = (this.at(i + 1, j) - this.at(i - 1, j)) / e2;
      const hy = (this.at(i, j + 1) - this.at(i, j - 1)) / e2;
      out[j * this.nx + i] = Math.atan(Math.hypot(hx, hy)) * 180 / Math.PI;
    }
    return out;
  }
}
