"use strict";
// Navigation availability for a lunar receiver that tries to use Earth GNSS (GPS-like) satellites.
// EDUCATIONAL, SYNTHETIC. Not an ephemeris and not a receiver model.
// - Geometry is Moon-centred. The site position comes from its latitude and longitude (model.js SITES).
// - The Earth is at the sub-Earth point (0, 0) plus an approximate libration (a premise, not an ephemeris).
// - The GNSS constellation is a generic 24-satellite shell (6 planes), NOT real almanac data.
// - Occultation by the Moon and by the Earth is geometric. Sidelobe tracking (as in LuGRE) is NOT modelled.
// - Premises (libration, elevation mask, GDOP limit, minimum satellites) are the team's choice, not validated.
// Units: km. Angles in degrees at the API surface, radians internally.
(function (root) {
    "use strict";
    const PREMISES = {
        moonRadiusKm: 1737.4, // mean lunar radius
        earthRadiusKm: 6371, // mean Earth radius
        earthMoonKm: 384400, // mean Earth-Moon distance
        gnssRadiusKm: 26560, // GPS-like orbit radius (about 20 200 km altitude)
        gnssInclinationDeg: 55,
        gnssPeriodH: 11.967, // about half a sidereal day
        planes: 6,
        perPlane: 4,
        librationLatDeg: 6.7, // amplitude of the sub-Earth latitude swing (approximate)
        librationLonDeg: 7.9, // amplitude of the sub-Earth longitude swing (approximate)
        librationPeriodH: 27.32 * 24, // sidereal month
        elevationMaskDeg: 5, // satellites below this elevation are ignored
        gdopMax: 6, // availability requires GDOP at or below this value
        minSatellites: 4 // a position fix needs at least four satellites
    };
    const D2R = Math.PI / 180;
    // Unit vector of a point on the sphere given latitude and longitude in degrees.
    function unitFromLatLon(latDeg, lonDeg) {
        const la = latDeg * D2R, lo = lonDeg * D2R;
        return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    }
    // Earth centre, Moon-centred, at tH hours. Sub-Earth point = (0, 0) plus a libration swing.
    function earthCentre(tH, P) {
        const w = (2 * Math.PI * tH) / P.librationPeriodH;
        const u = unitFromLatLon(P.librationLatDeg * Math.sin(w), P.librationLonDeg * Math.sin(w + 1));
        return [P.earthMoonKm * u[0], P.earthMoonKm * u[1], P.earthMoonKm * u[2]];
    }
    // GNSS satellites, Moon-centred, at tH hours: Earth centre plus an Earth-centred orbit.
    function satellitesAt(tH, P) {
        const inc = P.gnssInclinationDeg * D2R;
        const ci = Math.cos(inc), si = Math.sin(inc);
        const E = earthCentre(tH, P);
        const sats = [];
        for (let pl = 0; pl < P.planes; pl++) {
            const raan = (2 * Math.PI * pl) / P.planes;
            const cr = Math.cos(raan), sr = Math.sin(raan);
            for (let k = 0; k < P.perPlane; k++) {
                const phase = (2 * Math.PI * k) / P.perPlane + (2 * Math.PI * pl) / (P.planes * P.perPlane);
                const th = phase + (2 * Math.PI * tH) / P.gnssPeriodH;
                const cth = Math.cos(th), sth = Math.sin(th);
                const x = P.gnssRadiusKm * (cr * cth - sr * ci * sth);
                const y = P.gnssRadiusKm * (sr * cth + cr * ci * sth);
                const z = P.gnssRadiusKm * (si * sth);
                sats.push([E[0] + x, E[1] + y, E[2] + z]);
            }
        }
        return sats;
    }
    // Distance from point c to the segment from a (start) to b (end).
    function segmentDistance(a, b, c) {
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        let t = dd > 0 ? (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / dd : 0;
        t = Math.max(0, Math.min(1, t));
        const q = [a[0] + t * d[0] - c[0], a[1] + t * d[1] - c[1], a[2] + t * d[2] - c[2]];
        return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
    }
    // A satellite is usable from the site when it is above the mask and the line of sight
    // clears both the Moon and the Earth. Returns the unit line-of-sight vector, or null.
    function usable(sat, site, earthC, P) {
        const v = [sat[0] - site[0], sat[1] - site[1], sat[2] - site[2]];
        const r = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        const zen = unitFromSite(site);
        const sinEl = (v[0] * zen[0] + v[1] * zen[1] + v[2] * zen[2]) / r;
        if (Math.asin(sinEl) / D2R < P.elevationMaskDeg)
            return null;
        const origin = [0, 0, 0];
        if (segmentDistance(site, sat, origin) < P.moonRadiusKm - 1e-6)
            return null;
        if (segmentDistance(site, sat, earthC) < P.earthRadiusKm)
            return null;
        return [v[0] / r, v[1] / r, v[2] / r];
    }
    function unitFromSite(site) {
        const n = Math.sqrt(site[0] * site[0] + site[1] * site[1] + site[2] * site[2]);
        return [site[0] / n, site[1] / n, site[2] / n];
    }
    // Geometric dilution of precision from unit vectors (rows [ux, uy, uz, 1]).
    // Returns Infinity when the geometry is singular or there are fewer than four rows.
    function gdop(units) {
        if (units.length < 4)
            return Infinity;
        const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
        for (const u of units) {
            const row = [u[0], u[1], u[2], 1];
            for (let i = 0; i < 4; i++)
                for (let j = 0; j < 4; j++)
                    A[i][j] += row[i] * row[j];
        }
        const inv = invert4(A);
        if (!inv)
            return Infinity;
        const tr = inv[0][0] + inv[1][1] + inv[2][2] + inv[3][3];
        return tr > 0 ? Math.sqrt(tr) : Infinity;
    }
    // Gauss-Jordan inverse of a 4x4 matrix; null when singular.
    function invert4(M) {
        const n = 4;
        const a = M.map((r, i) => r.concat([0, 1, 2, 3].map(j => (i === j ? 1 : 0))));
        for (let c = 0; c < n; c++) {
            let piv = c;
            for (let r = c + 1; r < n; r++)
                if (Math.abs(a[r][c]) > Math.abs(a[piv][c]))
                    piv = r;
            if (Math.abs(a[piv][c]) < 1e-12)
                return null;
            [a[c], a[piv]] = [a[piv], a[c]];
            const d = a[c][c];
            for (let j = 0; j < 2 * n; j++)
                a[c][j] /= d;
            for (let r = 0; r < n; r++) {
                if (r === c)
                    continue;
                const f = a[r][c];
                for (let j = 0; j < 2 * n; j++)
                    a[r][j] -= f * a[c][j];
            }
        }
        return a.map(r => r.slice(n));
    }
    // Site position, Moon-centred, in km. opts: { lat, lon } in degrees.
    function sitePosition(latDeg, lonDeg, P) {
        const u = unitFromLatLon(latDeg, lonDeg);
        return [P.moonRadiusKm * u[0], P.moonRadiusKm * u[1], P.moonRadiusKm * u[2]];
    }
    // One record per sample.
    function track(opts) {
        const P = Object.assign({}, PREMISES, opts.premises || {});
        const site = sitePosition(opts.lat, opts.lon, P);
        const out = [];
        const t0H = (opts.startMs + (opts.delayH || 0) * 3600e3) / 3600e3;
        for (let i = 0; i < opts.count; i++) {
            const tH = t0H + (i * opts.stepMin) / 60;
            const earthC = earthCentre(tH, P);
            const units = [];
            for (const s of satellitesAt(tH, P)) {
                const u = usable(s, site, earthC, P);
                if (u)
                    units.push(u);
            }
            const g = gdop(units);
            const ok = units.length >= P.minSatellites && g <= P.gdopMax;
            out.push({ i, tH, satellites: units.length, gdop: g, nav_available: ok });
        }
        return out;
    }
    // Outages are the runs of samples with no navigation availability.
    function outages(tr, stepMin) {
        const runs = [];
        let start = null;
        tr.forEach((s, i) => {
            if (!s.nav_available && start === null)
                start = i;
            if (s.nav_available && start !== null) {
                runs.push([start, i - 1]);
                start = null;
            }
        });
        if (start !== null)
            runs.push([start, tr.length - 1]);
        return runs.map(([a, b]) => ({ from: a, to: b, hours: ((b - a + 1) * stepMin) / 60 }));
    }
    function summary(tr, stepMin) {
        const n = tr.length || 1;
        const avail = tr.filter(s => s.nav_available).length;
        const runs = outages(tr, stepMin);
        const finite = tr.map(s => s.gdop).filter(Number.isFinite).sort((a, b) => a - b);
        return {
            availability: avail / n,
            availableH: (avail * stepMin) / 60,
            totalH: (tr.length * stepMin) / 60,
            minSatellites: tr.reduce((m, s) => Math.min(m, s.satellites), Infinity),
            medianGdop: finite.length ? finite[Math.floor(finite.length / 2)] : Infinity,
            longestOutageH: runs.reduce((m, r) => Math.max(m, r.hours), 0),
            outageCount: runs.length
        };
    }
    // Share of samples with a fix under a given GDOP limit (the satellite count is the same as in track).
    function availabilityAt(tr, gdopLimit, minSatellites) {
        const need = minSatellites === undefined ? P_MIN : minSatellites;
        if (!tr.length)
            return 0;
        const ok = tr.filter(s => s.satellites >= need && s.gdop <= gdopLimit).length;
        return ok / tr.length;
    }
    const P_MIN = PREMISES.minSatellites;
    const api = { PREMISES, unitFromLatLon, earthCentre, satellitesAt, sitePosition, usable, segmentDistance, gdop, invert4, track, outages, summary, availabilityAt };
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
    root.OnboardNav = api;
})((typeof window !== "undefined" ? window : globalThis));
