// Loads the precomputed NASA-derived products and computes time-window metrics.
// The metric logic mirrors api/cmd/threesitepipeline (centre of the disc vs
// LOLA terrain horizon). Inputs are quantised to 0.01°, so window metrics can differ
// from the pipeline summary only for samples within 0.01° of the horizon.
export const HOUR_MS = 3600 * 1000;
export function decodeSeries(buf, count) {
    if (buf.byteLength !== count * 8)
        throw new Error("series has unexpected byte length");
    const u16 = new Uint16Array(buf), i16 = new Int16Array(buf);
    const f = (arr, k) => Float32Array.from(arr.subarray(k * count, (k + 1) * count), v => v / 100);
    return { sunAz: f(u16, 0), sunEl: f(i16, 1), earthAz: f(u16, 2), earthEl: f(i16, 3) };
}
export function horizonAt(horizon, az) {
    const n = horizon.length, step = 360 / n;
    const x = (((az % 360) + 360) % 360) / step;
    const i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
    return horizon[i].el * (1 - f) + horizon[j].el * f;
}
export class SiteSeries {
    constructor(meta, series) {
        this.meta = meta;
        this.s = series;
        this.start = Date.parse(meta.series.start_utc);
        this.count = meta.series.count;
        this.horizon = meta.terrain_horizon;
        const n = this.count;
        this.sunMargin = new Float32Array(n);
        this.earthMargin = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            this.sunMargin[i] = series.sunEl[i] - horizonAt(this.horizon, series.sunAz[i]);
            this.earthMargin[i] = series.earthEl[i] - horizonAt(this.horizon, series.earthAz[i]);
        }
    }
    static async load(base) {
        const [mRes, bRes] = await Promise.all([fetch(base + ".json"), fetch(base + ".bin")]);
        if (!mRes.ok || !bRes.ok)
            throw new Error(`site series unavailable: ${base}`);
        const meta = await mRes.json();
        const buf = await bRes.arrayBuffer();
        if (globalThis.crypto?.subtle) {
            const d = await crypto.subtle.digest("SHA-256", buf);
            const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
            if (hex !== meta.series.sha256)
                throw new Error("site series checksum mismatch");
        }
        return new SiteSeries(meta, decodeSeries(buf, meta.series.count));
    }
    get end() { return this.start + (this.count - 1) * HOUR_MS; }
    /** Index of the sample at or before t, or -1 when t is outside the computed window. */
    index(t) {
        const i = Math.floor((t - this.start) / HOUR_MS);
        return i >= 0 && i < this.count ? i : -1;
    }
    /** Interpolated geometry at time t (azimuths unwrapped). null outside the window. */
    at(t) {
        const x = (t - this.start) / HOUR_MS;
        if (!(x >= 0 && x <= this.count - 1))
            return null;
        const i = Math.min(Math.floor(x), this.count - 2), f = x - i;
        const lerp = (a) => a[i] + (a[i + 1] - a[i]) * f;
        const lerpAz = (a) => { let d = a[i + 1] - a[i]; if (d > 180)
            d -= 360; if (d < -180)
            d += 360; return ((a[i] + d * f) % 360 + 360) % 360; };
        const sunAz = lerpAz(this.s.sunAz), earthAz = lerpAz(this.s.earthAz);
        const sunEl = lerp(this.s.sunEl), earthEl = lerp(this.s.earthEl);
        return {
            sunAz, sunEl, earthAz, earthEl,
            sunMargin: sunEl - horizonAt(this.horizon, sunAz),
            earthMargin: earthEl - horizonAt(this.horizon, earthAz),
        };
    }
    /** Window metrics over [t0, t0 + hours). {status:"NOT_COMPUTED"} if out of range. */
    window(t0, hours) {
        const i0 = Math.ceil((t0 - this.start) / HOUR_MS);
        const i1 = i0 + hours;
        if (i0 < 0 || i1 > this.count)
            return { status: "NOT_COMPUTED", reason: "Requested dates are outside the computed ephemeris window." };
        let sun = 0, earth = 0, both = 0, dark = 0, maxDark = 0, gap = 0, maxGap = 0, maxSunEl = -Infinity, darkRuns = 0, blackoutRuns = 0;
        for (let i = i0; i < i1; i++) {
            const s = this.sunMargin[i] >= 0, e = this.earthMargin[i] >= 0;
            if (s) {
                sun++;
                dark = 0;
            }
            else {
                if (dark === 0)
                    darkRuns++;
                dark++;
                if (dark > maxDark)
                    maxDark = dark;
            }
            if (e) {
                earth++;
                gap = 0;
            }
            else {
                if (gap === 0)
                    blackoutRuns++;
                gap++;
                if (gap > maxGap)
                    maxGap = gap;
            }
            if (s && e)
                both++;
            if (this.s.sunEl[i] > maxSunEl)
                maxSunEl = this.s.sunEl[i];
        }
        return {
            status: "COMPUTED", hours,
            sunPct: (100 * sun) / hours, earthPct: (100 * earth) / hours, bothPct: (100 * both) / hours,
            longestDarkH: maxDark, longestBlackoutH: maxGap, maxSunElDeg: maxSunEl, darkRuns, blackoutRuns,
        };
    }
    /** Fraction of hours per day with the body above the terrain horizon, for `days` days from t0. */
    daily(t0, days, body) {
        const m = body === "sun" ? this.sunMargin : this.earthMargin;
        const i0 = Math.ceil((t0 - this.start) / HOUR_MS), out = [];
        for (let d = 0; d < days; d++) {
            let n = 0, v = 0;
            for (let h = 0; h < 24; h++) {
                const i = i0 + d * 24 + h;
                if (i >= 0 && i < this.count) {
                    n++;
                    if (m[i] >= 0)
                        v++;
                }
            }
            out.push(n ? v / n : NaN);
        }
        return out;
    }
    /** Hours from t until the body next becomes `visible` (true/false); NOT_COMPUTED outside. */
    nextState(t, body, visible) {
        const m = body === "sun" ? this.sunMargin : this.earthMargin;
        const i = this.index(t);
        if (i < 0)
            return { status: "NOT_COMPUTED" };
        if ((m[i] >= 0) === visible)
            return { status: "COMPUTED", hours: 0, at: t };
        for (let k = i + 1; k < this.count; k++)
            if ((m[k] >= 0) === visible)
                return { status: "COMPUTED", hours: k - (t - this.start) / HOUR_MS, at: this.start + k * HOUR_MS };
        return { status: "COMPUTED", hours: Infinity, at: null };
    }
    /** Hours until the visibility of 'sun' or 'earth' next changes, from time t. */
    nextChange(t, body) {
        const m = body === "sun" ? this.sunMargin : this.earthMargin;
        const i = this.index(t);
        if (i < 0)
            return { status: "NOT_COMPUTED" };
        const vis = m[i] >= 0;
        for (let k = i + 1; k < this.count; k++) {
            if ((m[k] >= 0) !== vis)
                return { status: "COMPUTED", visible: vis, hours: k - (t - this.start) / HOUR_MS, at: this.start + k * HOUR_MS };
        }
        return { status: "COMPUTED", visible: vis, hours: Infinity, at: null };
    }
}
export function rankSites(entries, t0, hours, { minSunPct = 0, maxBlackoutH = Infinity } = {}) {
    return entries.map(({ site, series }) => {
        const w = series.window(t0, hours);
        if (w.status !== "COMPUTED")
            return { site, w, violations: ["NOT_COMPUTED"], score: -Infinity };
        const violations = [];
        if (w.sunPct < minSunPct)
            violations.push(`Sunlight ${w.sunPct.toFixed(0)}% < ${minSunPct}%`);
        if (w.longestBlackoutH > maxBlackoutH)
            violations.push(`Earth blackout ${w.longestBlackoutH} h > ${maxBlackoutH} h`);
        return { site, w, violations, score: w.bothPct - (violations.length ? 1000 : 0) };
    }).sort((a, b) => b.score - a.score);
}
// Handoff from the SPA (#site=&t=&d=). Unknown site or out-of-coverage time keeps the default, never guesses (BR-02).
export function parseEntryHash(hash, sites, start, end) {
    const q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const out = {};
    const id = q.get("site");
    if (id && sites.some(s => s.id === id))
        out.siteId = id;
    const raw = q.get("t");
    if (raw) {
        const t = Date.parse(raw.length === 10 ? raw + "T00:00Z" : /Z|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + "Z");
        if (Number.isFinite(t))
            out.t = Math.min(Math.max(Math.floor(t / HOUR_MS) * HOUR_MS, start), end);
    }
    const d = Number(q.get("d"));
    if (d > 0)
        out.compareH = d * 24;
    return out;
}
