// Persistent MoonProof panel: one Preact owner and one Three.js context in the main shell.
import { h, Component, createRef, render } from "../vendor/preact/preact.module.js";
import { buildHash, parseHash } from "../ds/router.js";
import { compareDay, readSites, utcDay, type LunarSite, type Visibility } from "./mission-api.js";
import { mountThree, placeSites, type MoonController } from "./three.js";

interface Context { site?: string; day?: string; path: string; }
interface State { sites: LunarSite[]; selected: string; day: string; visual: "preview" | "loading" | "ready" | "failed"; busy: boolean; message: string; result: Visibility | null; }
const today = () => new Date().toISOString().slice(0, 10);
const pct = (x: number) => new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(x);

export class MoonConsole extends Component<Context, State> {
  state: State = { sites: [], selected: "", day: today(), visual: "preview", busy: false, message: "Selecione um local e uma data UTC para consultar o motor.", result: null };
  private stage = createRef<HTMLDivElement>();
  private epoch = createRef<HTMLParagraphElement>();
  private scene: MoonController | null = null;
  private loading: AbortController | null = null;
  private catalog = new AbortController();
  private request: AbortController | null = null;
  private alive = false;
  componentDidMount() {
    this.alive = true;
    window.addEventListener("pagehide", this.stop);
    window.addEventListener("pageshow", this.restore);
    this.sync();
    void this.getCatalog();
    // The static Joel poster is first paint; hardware can opt into the full scene.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) void this.start();
  }
  componentDidUpdate(previous: Context) { if (previous.site !== this.props.site || previous.day !== this.props.day) this.sync(); }
  componentWillUnmount() {
    this.alive = false;
    this.stop(); this.catalog.abort();
    window.removeEventListener("pagehide", this.stop); window.removeEventListener("pageshow", this.restore);
  }
  private stop = () => { this.loading?.abort(); this.loading = null; this.request?.abort(); this.request = null; this.scene?.dispose(); this.scene = null; };
  private restore = (event: PageTransitionEvent) => { if (event.persisted) this.setState({ visual: "preview", busy: false }); };
  private invalidate() { this.request?.abort(); this.request = null; this.setState({ result: null, busy: false, message: "Selecione Consultar Go + Rust para calcular a janela." }); }
  private selected() { return this.state.sites.find(s => s.id === this.state.selected); }
  private updateScene() {
    if (!this.scene) return;
    this.scene.setTime(utcDay(this.state.day) ?? "");
    placeSites(this.scene, this.state.sites, this.selected());
  }
  private sync() {
    const selected = this.state.sites.find(s => s.id === this.props.site)?.id || this.state.selected;
    const day = this.props.day?.slice(0, 10);
    if (selected === this.state.selected && (!day || !utcDay(day) || day === this.state.day)) return;
    this.invalidate();
    this.setState({ selected, day: day && utcDay(day) ? day : this.state.day }, () => this.updateScene());
  }
  private async getCatalog() {
    try {
      const response = await fetch(new URL("../data/sites.json", import.meta.url), { signal: this.catalog.signal });
      if (!response.ok) throw new Error("Catálogo indisponível");
      const sites = readSites(await response.json());
      if (!sites.length) throw new Error("Nenhum local disponível");
      if (this.alive) this.setState({ sites, selected: sites.find(s => s.id === this.props.site)?.id ?? sites[0].id }, () => this.updateScene());
    } catch { if (this.alive && !this.catalog.signal.aborted) this.setState({ message: "Catálogo não disponível. Nenhum local foi inventado." }); }
  }
  private start = async () => {
    if (!this.alive || this.loading || this.scene || !this.stage.current || !this.epoch.current) return;
    const control = new AbortController(); this.loading = control;
    this.setState({ visual: "loading" });
    const unavailable = () => { if (!this.alive || control.signal.aborted) return; this.scene = null; this.setState({ visual: "failed" }); };
    try {
      const scene = await mountThree(this.stage.current, this.epoch.current, utcDay(this.state.day) ?? "", unavailable, control.signal);
      if (!this.alive || control.signal.aborted) { scene.dispose(); return; }
      this.scene = scene; this.updateScene(); this.setState({ visual: "ready" });
    } catch { unavailable(); }
    finally { if (this.loading === control) this.loading = null; }
  };
  private change = (selected: string, day: string) => {
    this.invalidate(); this.setState({ selected, day }, () => this.updateScene());
    // Route links and the panel share the same URL context; no second mission state.
    const ctx = parseHash(location.hash);
    location.hash = buildHash(ctx.path, { ...ctx.query, site: selected, t: utcDay(day) ?? undefined });
  };
  private calculate = async () => {
    const { selected, day } = this.state;
    if (!selected || !utcDay(day)) return;
    this.request?.abort(); const control = new AbortController(); this.request = control;
    const timer = setTimeout(() => control.abort(), 25000);
    this.setState({ busy: true, result: null, message: "Consultando Go + Rust…" });
    try {
      const result = await compareDay(selected, day, control.signal);
      if (this.alive && this.request === control) this.setState({ result, message: "Resultado do motor · PRELIMINAR (não validado de forma independente)." });
    } catch (e) {
      if (this.alive && this.request === control) this.setState({ message: control.signal.aborted ? "Consulta interrompida ou expirada." : (e as Error).message, result: null });
    } finally { clearTimeout(timer); if (this.alive && this.request === control) { this.request = null; this.setState({ busy: false }); } }
  };
  render() {
    const { sites, selected, day, visual, busy, message, result } = this.state;
    return <section class="moon-console glass" aria-labelledby="moon-console-title">
      <div class="moon-console-heading"><div><p class="t3 small">BRASPACE · MOON HD</p><h2 id="moon-console-title">Polo Sul da Lua</h2></div><span class="moon-console-seal">Visual · não validado</span></div>
      <div class="moon-console-grid">
        <div>
          <div ref={this.stage} class="moon-console-stage" tabIndex={0} role="region" aria-label="Lua 3D interativa. Use as setas para orbitar e os botões para ampliar." data-visual={visual} />
          <p class="t3 small" role="status">{visual === "ready" ? "Modelo Moon HD · LOLA 80/320 m conforme o dispositivo" : visual === "loading" ? "Carregando o Moon HD; prévia do mesmo relevo." : visual === "failed" ? "3D indisponível neste dispositivo; prévia LOLA estática." : "Prévia LOLA estática · iluminação ilustrativa."}</p>
          <p ref={this.epoch} class="t3 small" />
          <div class="moon-console-controls" aria-label="Controles da Lua">
            {visual !== "ready" ? <button type="button" class="btnL" disabled={visual === "loading"} onClick={this.start}>{visual === "failed" ? "Tentar 3D novamente" : "Ativar 3D"}</button> : null}
            <button type="button" class="btnL" disabled={visual !== "ready"} onClick={() => this.scene?.reset()}>Polo sul</button>
            <button type="button" class="btnL" disabled={visual !== "ready"} onClick={() => this.scene?.zoom(.8)} aria-label="Ampliar Lua">+</button>
            <button type="button" class="btnL" disabled={visual !== "ready"} onClick={() => this.scene?.zoom(1.25)} aria-label="Reduzir Lua">−</button>
          </div>
        </div>
        <div class="moon-console-inputs">
          <label>Local de interesse<select value={selected} onChange={e => this.change(e.currentTarget.value, day)} disabled={!sites.length}>{sites.length ? sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">Carregando catálogo</option>}</select></label>
          <label>Início da janela (UTC)<input type="date" value={day} min="2025-01-01" max="2028-12-31" onChange={e => { if (utcDay(e.currentTarget.value)) this.change(selected, e.currentTarget.value); }} /></label>
          <button type="button" class="btnA" disabled={!selected || busy || !utcDay(day)} onClick={this.calculate}>Consultar Go + Rust · 24 h</button>
          <p class="t2" role="status" aria-live="polite">{message}</p>
          {result ? <dl class="moon-console-metrics"><dt>Sol acima do terreno</dt><dd>{pct(result.sun)}</dd><dt>Terra acima do terreno</dt><dd>{pct(result.earth)}</dd><dt>Maior escuridão</dt><dd>{result.darkness} h</dd><dt>Maior bloqueio da Terra</dt><dd>{result.blackout} h</dd></dl> : null}
          <p class="t3 small">Os números vêm da API e do motor científico, não dos shaders. A visibilidade geométrica não garante energia nem comunicação.</p>
        </div>
      </div>
      <p class="t3 small">NASA SVS · LRO/LOLA · JPL/NAIF SPICE. Visualização de Joel (@joeljato). Protótipo educativo, sem recomendação de voo.</p>
    </section>;
  }
}

export function paintMoonConsole(outlet: HTMLElement, context: Context) { render(<MoonConsole {...context} />, outlet); }
