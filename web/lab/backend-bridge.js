import { apiURL } from "../api-base.js";
import { embedProvenanceText, VECTOR_DIMENSIONS, VECTOR_MODEL_ID } from "../vector-embed.js";
const sitePattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function validUTC(utc) {
    if (typeof utc !== "string" || !datePattern.test(utc) || !Number.isFinite(Date.parse(utc)))
        throw new TypeError("expected UTC RFC3339");
    return utc;
}
async function json(path, options = {}, fetcher = fetch) {
    const response = await fetcher(apiURL(path), { redirect: "error", signal: AbortSignal.timeout(12000), ...options });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const err = new Error(body?.code || "HTTP_" + response.status);
        err.status = response.status;
        err.code = body?.code || "HTTP_ERROR";
        throw err;
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("INVALID_API_JSON");
    return body;
}
export async function backendStatus(fetcher = fetch) {
    const health = await json("/api/health", {}, fetcher);
    const catalog = await json("/api/sites", {}, fetcher);
    if (!["ready", "unavailable"].includes(health.engine) || !Array.isArray(catalog.sites))
        throw new Error("INVALID_BACKEND_CONTRACT");
    return { engine: health.engine, dataSource: health.data_source || "unknown", sites: catalog.sites.map((site) => ({ id: site.id, scienceStatus: site.series?.science_status || "NO_SERIES_DATA" })) };
}
export async function backendSky(siteId, utc, hours, fetcher = fetch) {
    if (!sitePattern.test(siteId) || !Number.isFinite(hours) || hours <= 0 || hours > 720)
        throw new TypeError("invalid site or hours");
    validUTC(utc);
    const body = await json("/api/sites/" + siteId + "/sky?start=" + encodeURIComponent(utc) + "&hours=" + hours, {}, fetcher);
    if (body.site_id !== siteId || !Array.isArray(body.samples) || !Array.isArray(body.terrain_horizon) || !body.provenance || typeof body.science_status !== "string")
        throw new Error("INVALID_SKY_CONTRACT");
    return body;
}
export async function backendCompare(request, fetcher = fetch) {
    if (!Array.isArray(request?.site_ids) || request.site_ids.length < 1 || request.site_ids.length > 3 || !request.site_ids.every((id) => sitePattern.test(id)))
        throw new TypeError("invalid sites");
    validUTC(request.start_utc);
    if (!Number.isFinite(request.duration_hours) || request.duration_hours <= 0 || request.duration_hours > 720)
        throw new TypeError("invalid duration");
    const result = await json("/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }, fetcher);
    if (!Array.isArray(result.results) || typeof result.scientifically_validated !== "boolean")
        throw new Error("INVALID_COMPARE_CONTRACT");
    return result;
}
export function presentationStatus(series) {
    // Only an explicit, separately reviewed validated flag may promote a claim.
    if (!series || series.science_status !== "VALIDATED" || series.scientifically_validated !== true)
        return "PRELIMINARY / UNVERIFIED";
    return "SOURCE-VALIDATED (review numerical methodology)";
}
export async function backendVectorAvailability(fetcher = fetch) {
    // Missing or disabled endpoint is a normal condition; never infer semantic
    // quality or NASA geometry validity from a vector index.
    try {
        const result = await json("/api/vector/status", {}, fetcher);
        if (typeof result.enabled !== "boolean" || typeof result.available !== "boolean" || result.dimension !== VECTOR_DIMENSIONS) {
            return { enabled: false, available: false, reason: "INVALID_VECTOR_CONTRACT" };
        }
        return { enabled: result.enabled, available: result.available, modelID: result.model_id || "", purpose: "source metadata only" };
    }
    catch (e) {
        return { enabled: false, available: false, reason: e.code || "NOT_CONFIGURED" };
    }
}
export async function backendVectorSearch(query, { limit = 5, modelID = VECTOR_MODEL_ID } = {}, fetcher = fetch) {
    const vector = embedProvenanceText(query);
    const result = await json("/api/vector/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model_id: modelID, vector, limit })
    }, fetcher);
    if (!Array.isArray(result.results) || result.scientifically_validated !== false) {
        throw new Error("INVALID_VECTOR_SEARCH_CONTRACT");
    }
    return {
        modelID: result.model_id || modelID,
        results: result.results,
        limitations: Array.isArray(result.limitations) ? result.limitations : [],
        scientificallyValidated: false
    };
}
export async function backendOnboardTraining(fetcher = fetch) {
    // This fixture is intentionally synthetic and isolated from the NASA Lab's
    // candidate coordinates/ephemerides. It exercises the real Go energy model.
    const fixture = {
        mission_id: "POLAR-LAB-SYNTHETIC-TRAINING",
        candidates: [{
                id: "training-only", site_id: "synthetic-demo-a",
                start_utc: "2026-12-01T00:00:00Z",
                source_claim: "SYNTHETIC-NOT-NASA",
                step_minutes: 60, max_comm_blackout_hours: 1,
                power: { battery_capacity_wh: 200, initial_charge_wh: 150, reserve_wh: 50, solar_generation_w: 0, load_w: 80 },
                samples: [{ sun_visible: false, earth_visible: false }, { sun_visible: false, earth_visible: false }]
            }]
    };
    const result = await json("/api/onboard/evaluate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fixture)
    }, fetcher);
    if (result.science_status !== "UNVERIFIED_INPUTS" || result.no_flight_recommendation !== true ||
        !Array.isArray(result.options) || result.options.length !== 1)
        throw new Error("INVALID_ONBOARD_CONTRACT");
    const option = result.options[0];
    return {
        scienceStatus: result.science_status,
        decision: result.decision,
        mode: option.end_mode,
        simulationStatus: option.simulation_status,
        risks: Array.isArray(option.risks) ? option.risks.length : 0,
        trainingOnly: true
    };
}
