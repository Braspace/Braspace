import { loadSites, timeFromQuery, isoHour } from "./data.js";
export function initMoonStage() {
    const stage = document.getElementById("moon-stage");
    const controls = document.getElementById("moon-controls");
    const toggle = document.getElementById("moon-toggle");
    const reset = document.getElementById("moon-reset");
    const zoomIn = document.getElementById("moon-zoom-in");
    const zoomOut = document.getElementById("moon-zoom-out");
    const status = document.getElementById("moon-status");
    const view = document.getElementById("view");
    const strip = document.getElementById("pstrip");
    const footer = document.querySelector("footer");
    let moon = null, active = false, started = false, disposed = false;
    let current;
    let generation = 0;
    function setActive(value) {
        active = value;
        document.body.classList.toggle("moon-scene-active", value);
        stage.inert = !value;
        stage.setAttribute("aria-hidden", String(!value));
        stage.tabIndex = value ? 0 : -1;
        controls.hidden = !value;
        view.hidden = strip.hidden = footer.hidden = value;
        toggle.setAttribute("aria-pressed", String(value));
        toggle.textContent = value ? "Voltar ao conteúdo" : "Interagir com a Lua";
    }
    function unavailable() {
        moon = null;
        stage.classList.remove("moon-live");
        reset.disabled = zoomIn.disabled = zoomOut.disabled = true;
        status.textContent = "Prévia estática do relevo LOLA 80 m. Cena 3D indisponível neste navegador; a análise continua acessível.";
    }
    async function sync() {
        const instance = moon, ctx = current, id = ++generation;
        if (!instance || !ctx)
            return;
        try {
            const catalog = await loadSites();
            if (moon !== instance || id !== generation)
                return;
            instance.setTime(isoHour(timeFromQuery(ctx.query, catalog.window)));
            status.textContent = status.textContent?.replace("Moon HD · visual epoch", "Lua HD · época visual") ?? "";
            instance.setSites(catalog.sites.map(s => ({ coordinate: { latitude_deg: s.lat, longitude_deg: s.lon } })));
            const selected = catalog.sites.find(s => s.id === ctx.site);
            if (selected)
                instance.focus(selected.lat, selected.lon);
        }
        catch {
            if (moon === instance && id === generation)
                status.textContent = "Cena visual disponível; cenário científico não carregado.";
        }
    }
    async function start() {
        if (started || disposed)
            return;
        started = true;
        try {
            const adapter = await import("../moon-hd/classic-adapter.js");
            if (disposed)
                return;
            const instance = await adapter.createMoon(stage, status, { date: current?.query.t, onUnavailable: unavailable });
            if (disposed) {
                instance.dispose();
                return;
            }
            moon = instance;
            stage.classList.add("moon-live");
            reset.disabled = zoomIn.disabled = zoomOut.disabled = false;
            void sync();
        }
        catch {
            unavailable();
        }
    }
    toggle.addEventListener("click", () => {
        setActive(!active);
        if (active) {
            void start();
            stage.focus();
        }
        else
            toggle.focus();
    });
    reset.addEventListener("click", () => moon?.reset());
    zoomIn.addEventListener("click", () => moon?.zoom(-.3));
    zoomOut.addEventListener("click", () => moon?.zoom(.3));
    stage.addEventListener("keydown", e => {
        if (e.key === "Escape" && active) {
            e.preventDefault();
            setActive(false);
            toggle.focus();
        }
    });
    // Close the scene before the router moves focus to the new route heading.
    addEventListener("hashchange", () => { if (active)
        setActive(false); });
    addEventListener("pagehide", e => { if (!e.persisted) {
        disposed = true;
        moon?.dispose();
    } });
    setActive(false);
    if (document.readyState === "complete")
        void start();
    else
        addEventListener("load", () => { void start(); }, { once: true });
    return { update(ctx) { current = ctx; void sync(); } };
}
