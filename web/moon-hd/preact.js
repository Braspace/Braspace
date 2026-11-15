// Persistent MoonProof panel: one Preact owner and one Three.js context in the main shell.
import { h, Component, createRef, render } from "../vendor/preact/preact.module.js";
import { buildHash, parseHash } from "../ds/router.js";
import { compareDay, readSites, utcDay } from "./mission-api.js";
import { mountThree, placeSites } from "./three.js";
const today = () => new Date().toISOString().slice(0, 10);
const pct = (x) => new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(x);
export class MoonConsole extends Component {
    state = { sites: [], selected: "", day: today(), visual: "preview", busy: false, message: "Selecione um local e uma data UTC para consultar o motor.", result: null };
    stage = createRef();
    epoch = createRef();
    scene = null;
    loading = null;
    catalog = new AbortController();
    request = null;
    alive = false;
    componentDidMount() {
        this.alive = true;
        window.addEventListener("pagehide", this.stop);
        window.addEventListener("pageshow", this.restore);
        this.sync();
        void this.getCatalog();
        // The static Joel poster is first paint; hardware can opt into the full scene.
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
            void this.start();
    }
    componentDidUpdate(previous) { if (previous.site !== this.props.site || previous.day !== this.props.day)
        this.sync(); }
    componentWillUnmount() {
        this.alive = false;
        this.stop();
        this.catalog.abort();
        window.removeEventListener("pagehide", this.stop);
        window.removeEventListener("pageshow", this.restore);
    }
    stop = () => { this.loading?.abort(); this.loading = null; this.request?.abort(); this.request = null; this.scene?.dispose(); this.scene = null; };
    restore = (event) => { if (event.persisted)
        this.setState({ visual: "preview", busy: false }); };
    invalidate() { this.request?.abort(); this.request = null; this.setState({ result: null, busy: false, message: "Selecione Consultar Go + Rust para calcular a janela." }); }
    selected() { return this.state.sites.find(s => s.id === this.state.selected); }
    updateScene() {
        if (!this.scene)
            return;
        this.scene.setTime(utcDay(this.state.day) ?? "");
        placeSites(this.scene, this.state.sites, this.selected());
    }
    sync() {
        const selected = this.state.sites.find(s => s.id === this.props.site)?.id || this.state.selected;
        const day = this.props.day?.slice(0, 10);
        if (selected === this.state.selected && (!day || !utcDay(day) || day === this.state.day))
            return;
        this.invalidate();
        this.setState({ selected, day: day && utcDay(day) ? day : this.state.day }, () => this.updateScene());
    }
    async getCatalog() {
        try {
            const response = await fetch(new URL("../data/sites.json", import.meta.url), { signal: this.catalog.signal });
            if (!response.ok)
                throw new Error("Catálogo indisponível");
            const sites = readSites(await response.json());
            if (!sites.length)
                throw new Error("Nenhum local disponível");
            if (this.alive)
                this.setState({ sites, selected: sites.find(s => s.id === this.props.site)?.id ?? sites[0].id }, () => this.updateScene());
        }
        catch {
            if (this.alive && !this.catalog.signal.aborted)
                this.setState({ message: "Catálogo não disponível. Nenhum local foi inventado." });
        }
    }
    start = async () => {
        if (!this.alive || this.loading || this.scene || !this.stage.current || !this.epoch.current)
            return;
        const control = new AbortController();
        this.loading = control;
        this.setState({ visual: "loading" });
        const unavailable = () => { if (!this.alive || control.signal.aborted)
            return; this.scene = null; this.setState({ visual: "failed" }); };
        try {
            const scene = await mountThree(this.stage.current, this.epoch.current, utcDay(this.state.day) ?? "", unavailable, control.signal);
            if (!this.alive || control.signal.aborted) {
                scene.dispose();
                return;
            }
            this.scene = scene;
            this.updateScene();
            this.setState({ visual: "ready" });
        }
        catch {
            unavailable();
        }
        finally {
            if (this.loading === control)
                this.loading = null;
        }
    };
    change = (selected, day) => {
        this.invalidate();
        this.setState({ selected, day }, () => this.updateScene());
        // Route links and the panel share the same URL context; no second mission state.
        const ctx = parseHash(location.hash);
        location.hash = buildHash(ctx.path, { ...ctx.query, site: selected, t: utcDay(day) ?? undefined });
    };
    calculate = async () => {
        const { selected, day } = this.state;
        if (!selected || !utcDay(day))
            return;
        this.request?.abort();
        const control = new AbortController();
        this.request = control;
        const timer = setTimeout(() => control.abort(), 25000);
        this.setState({ busy: true, result: null, message: "Consultando Go + Rust…" });
        try {
            const result = await compareDay(selected, day, control.signal);
            if (this.alive && this.request === control)
                this.setState({ result, message: "Resultado do motor · PRELIMINAR (não validado de forma independente)." });
        }
        catch (e) {
            if (this.alive && this.request === control)
                this.setState({ message: control.signal.aborted ? "Consulta interrompida ou expirada." : e.message, result: null });
        }
        finally {
            clearTimeout(timer);
            if (this.alive && this.request === control) {
                this.request = null;
                this.setState({ busy: false });
            }
        }
    };
    render() {
        const { sites, selected, day, visual, busy, message, result } = this.state;
        return h("section", { class: "moon-console glass", "aria-labelledby": "moon-console-title" },
            h("div", { class: "moon-console-heading" },
                h("div", null,
                    h("p", { class: "t3 small" }, "BRASPACE \u00B7 MOON HD"),
                    h("h2", { id: "moon-console-title" }, "Polo Sul da Lua")),
                h("span", { class: "moon-console-seal" }, "Visual \u00B7 n\u00E3o validado")),
            h("div", { class: "moon-console-grid" },
                h("div", null,
                    h("div", { ref: this.stage, class: "moon-console-stage", tabIndex: 0, role: "region", "aria-label": "Lua 3D interativa. Use as setas para orbitar e os bot\u00F5es para ampliar.", "data-visual": visual }),
                    h("p", { class: "t3 small", role: "status" }, visual === "ready" ? "Modelo Moon HD · LOLA 80/320 m conforme o dispositivo" : visual === "loading" ? "Carregando o Moon HD; prévia do mesmo relevo." : visual === "failed" ? "3D indisponível neste dispositivo; prévia LOLA estática." : "Prévia LOLA estática · iluminação ilustrativa."),
                    h("p", { ref: this.epoch, class: "t3 small" }),
                    h("div", { class: "moon-console-controls", "aria-label": "Controles da Lua" },
                        visual !== "ready" ? h("button", { type: "button", class: "btnL", disabled: visual === "loading", onClick: this.start }, visual === "failed" ? "Tentar 3D novamente" : "Ativar 3D") : null,
                        h("button", { type: "button", class: "btnL", disabled: visual !== "ready", onClick: () => this.scene?.reset() }, "Polo sul"),
                        h("button", { type: "button", class: "btnL", disabled: visual !== "ready", onClick: () => this.scene?.zoom(.8), "aria-label": "Ampliar Lua" }, "+"),
                        h("button", { type: "button", class: "btnL", disabled: visual !== "ready", onClick: () => this.scene?.zoom(1.25), "aria-label": "Reduzir Lua" }, "\u2212"))),
                h("div", { class: "moon-console-inputs" },
                    h("label", null,
                        "Local de interesse",
                        h("select", { value: selected, onChange: e => this.change(e.currentTarget.value, day), disabled: !sites.length }, sites.length ? sites.map(s => h("option", { key: s.id, value: s.id }, s.name)) : h("option", { value: "" }, "Carregando cat\u00E1logo"))),
                    h("label", null,
                        "In\u00EDcio da janela (UTC)",
                        h("input", { type: "date", value: day, min: "2025-01-01", max: "2028-12-31", onChange: e => { if (utcDay(e.currentTarget.value))
                                this.change(selected, e.currentTarget.value); } })),
                    h("button", { type: "button", class: "btnA", disabled: !selected || busy || !utcDay(day), onClick: this.calculate }, "Consultar Go + Rust \u00B7 24 h"),
                    h("p", { class: "t2", role: "status", "aria-live": "polite" }, message),
                    result ? h("dl", { class: "moon-console-metrics" },
                        h("dt", null, "Sol acima do terreno"),
                        h("dd", null, pct(result.sun)),
                        h("dt", null, "Terra acima do terreno"),
                        h("dd", null, pct(result.earth)),
                        h("dt", null, "Maior escurid\u00E3o"),
                        h("dd", null,
                            result.darkness,
                            " h"),
                        h("dt", null, "Maior bloqueio da Terra"),
                        h("dd", null,
                            result.blackout,
                            " h")) : null,
                    h("p", { class: "t3 small" }, "Os n\u00FAmeros v\u00EAm da API e do motor cient\u00EDfico, n\u00E3o dos shaders. A visibilidade geom\u00E9trica n\u00E3o garante energia nem comunica\u00E7\u00E3o."))),
            h("p", { class: "t3 small" }, "NASA SVS \u00B7 LRO/LOLA \u00B7 JPL/NAIF SPICE. Visualiza\u00E7\u00E3o de Joel (@joeljato). Prot\u00F3tipo educativo, sem recomenda\u00E7\u00E3o de voo."));
    }
}
export function paintMoonConsole(outlet, context) { render(h(MoonConsole, { ...context }), outlet); }
