import { backendStatus, backendSky, backendVectorAvailability, backendOnboardTraining, presentationStatus } from "./backend-bridge.js";
// Both controls are present in lab.html; `button` keeps the optional-chaining guard of the original.
const button = document.getElementById("api-sync");
const feedback = document.getElementById("api-feedback");
async function refresh() {
    button.disabled = true;
    feedback.textContent = "Go/PostgreSQL API: checking…";
    try {
        const status = await backendStatus();
        const available = status.sites.filter((s) => s.scienceStatus !== "NO_SERIES_DATA").length;
        let note = status.engine === "ready" ? "Go/Rust engine ready" : "Go/Rust engine unavailable";
        note += " · " + status.dataSource + " · " + available + " sites with series";
        const selected = status.sites.find((s) => s.id === "peak-near-shackleton");
        if (selected?.scienceStatus && selected.scienceStatus !== "NO_SERIES_DATA") {
            try {
                // No scientific status elevation; this call is diagnostic only.
                const sky = await backendSky(selected.id, "2026-12-01T00:00:00Z", 6);
                note += " · site sky: " + presentationStatus(sky);
            }
            catch (e) {
                note += " · sky unavailable (" + (e.code || "coverage/engine") + ")";
            }
        }
        else {
            note += " · chosen Shackleton site has no Go series; NASA-derived lab data remains separate";
        }
        const vector = await backendVectorAvailability();
        note += " · pgvector metadata " + (vector.available ? "available" : vector.enabled ? "not ready" : "disabled");
        feedback.textContent = note + ".";
    }
    catch (e) {
        feedback.textContent = "Go/PostgreSQL API offline or incompatible (" + (e.code || "unavailable") + "); the preliminary Polar Lab continues with its versioned static assets.";
    }
    finally {
        button.disabled = false;
    }
}
button?.addEventListener("click", refresh);
refresh();
const simButton = document.getElementById("api-simulate");
const simResult = document.getElementById("api-sim-result");
simButton?.addEventListener("click", async () => {
    simButton.disabled = true;
    simResult.textContent = "Running a SYNTHETIC training example via Go API…";
    try {
        const result = await backendOnboardTraining();
        simResult.textContent = "Go onboard: " + result.scienceStatus + " · " +
            (result.simulationStatus || "unknown") + " · " + result.risks +
            " modeled risk(s). TRAINING ONLY — not NASA data or flight software.";
    }
    catch (e) {
        simResult.textContent = "Go onboard training unavailable (" + (e.code || "API error") + "). No mission values inferred.";
    }
    finally {
        simButton.disabled = false;
    }
});
