import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, api, sealFor } from "../core/data.js";
import { H1_PROFILE, HOUR_MS, runScenario } from "./cockpit-model.js";
import { sealEl } from "../core/layers.js";
import { register, t, fmtNum } from "../core/i18n.js";
import { getState, setState, onState, hrefTo, DEFAULT_RULES } from "../core/state.js";
import { parseRules, shareUrl, shortVersion } from "./plan-model.js";
import { pickVersion, parseConfigCommit } from "./evidence-model.js";

register({
  en: {
    "plan.h1": "Planning Kit",
    "plan.title": "Mission rules",
    "plan.editable": "editable · assumed limit",
    "plan.night": "Max night",
    "plan.blackout": "Max Earth blackout",
    "plan.battery": "Battery floor",
    "plan.mast": "Mast height",
    "plan.slope": "Max slope",
    "plan.sunMode": "Sun visible when",
    "plan.sunCenter": "disk center",
    "plan.sunLimb": "upper limb",
    "plan.step": "Calculation step",
    "plan.recalc": "Recalculate 3 scenarios",
    "plan.ruleNote": "Changing a rule creates a new scenario; the original stays saved.",
    "plan.exportTitle": "Export & reproduce",
    "plan.csv": "CSV · hourly",
    "plan.json": "JSON",
    "plan.pdf": "PDF Passport",
    "plan.version": "Plan version",
    "plan.urlNote": "The link reopens this exact calculation with the same rules and version.",
    "plan.tableTitle": "All metrics · Proof layer",
    "plan.legend": "Red = violates rule · green = best value",
    "plan.colMetric": "Metric",
    "plan.colUnit": "Unit",
    "plan.colRule": "Rule",
    "plan.colMargin": "Margin B",
    "plan.colUnc": "Uncertainty",
    "plan.colOrigin": "Origin",
    "plan.mNight": "Longest night",
    "plan.mBlackout": "Longest Earth blackout",
    "plan.mSun": "Sun visible",
    "plan.mEarth": "Earth visible",
    "plan.mBoth": "Sun + Earth together",
    "plan.mBattery": "Battery margin",
    "plan.mSlope": "Site slope",
    "plan.mRough": "Roughness < 20 m",
    "plan.noSource": "no source"
  },
  "pt-BR": {
    "plan.h1": "Kit Planejamento",
    "plan.title": "Regras da missão",
    "plan.editable": "editáveis · limite assumido",
    "plan.night": "Noite máxima",
    "plan.blackout": "Perda máxima da Terra",
    "plan.battery": "Piso da bateria",
    "plan.mast": "Altura do mastro",
    "plan.slope": "Declividade máxima",
    "plan.sunMode": "Sol visível quando",
    "plan.sunCenter": "centro do disco",
    "plan.sunLimb": "borda superior",
    "plan.step": "Passo de cálculo",
    "plan.recalc": "Recalcular 3 cenários",
    "plan.ruleNote": "Mudar uma regra gera um cenário novo; o original fica salvo.",
    "plan.exportTitle": "Exportar e reproduzir",
    "plan.csv": "CSV · hora a hora",
    "plan.json": "JSON",
    "plan.pdf": "Passaporte PDF",
    "plan.version": "Versão do plano",
    "plan.urlNote": "O link reabre exatamente este cálculo, com as mesmas regras e a mesma versão.",
    "plan.tableTitle": "Todas as métricas · camada Prova",
    "plan.legend": "Vermelho = viola a regra · verde = melhor valor",
    "plan.colMetric": "Métrica",
    "plan.colUnit": "Unid.",
    "plan.colRule": "Regra",
    "plan.colMargin": "Margem B",
    "plan.colUnc": "Incerteza",
    "plan.colOrigin": "Origem",
    "plan.mNight": "Maior noite",
    "plan.mBlackout": "Maior perda da Terra",
    "plan.mSun": "Sol visível",
    "plan.mEarth": "Terra visível",
    "plan.mBoth": "Sol + Terra juntos",
    "plan.mBattery": "Folga da bateria",
    "plan.mSlope": "Declividade no ponto",
    "plan.mRough": "Rugosidade < 20 m",
    "plan.noSource": "sem fonte"
  }
});

const shell = mountShell({ screen: "compare", onLang: draw });
const doc = await loadSites();
const scenarios = doc.sites.slice(0, 3);
const terrain = await mountTerrain(document.getElementById("terrain"), {
  sites: doc.sites,
  selected: getState().site || scenarios[1]?.id,
  onSelect: (id) => setState({ site: id })
});

// Rules (editable defaults live in plan-model.js on top of DEFAULT_RULES): `rules=` in the link wins over the single params; the three limits that core/state.js owns are reconciled once.
const rulesDraft = parseRules(location.search);
if (rulesDraft.night !== getState().night || rulesDraft.blackout !== getState().blackout || rulesDraft.battery !== getState().battery) {
  setState({ night: rulesDraft.night, blackout: rulesDraft.blackout, battery: rulesDraft.battery });
}
// Plan version = deployment commit (config.js) or /api/health; absent → "—" + N/D. Same source as the Evidence screen.
const [health, cfg] = await Promise.all([
  api("/api/health", { timeoutMs: 3000 }),
  fetch(((window.BRASPACE_API_BASE) || "") + "/config.js", { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => "")
]);
const version = pickVersion({ configCommit: parseConfigCommit(cfg), health: health.ok ? health.data : null });

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function computeRows() {
  const st = getState();
  const hours = st.hours || 336;
  const metrics = await Promise.all(scenarios.map((s) => windowMetrics(doc, s, st.start, hours)));
  const startIso = new Date(metrics[0].t0).toISOString().replace(".000Z", "Z");
  const live = await api("/api/compare", {
    method: "POST",
    body: { site_ids: scenarios.map((s) => s.id), start_utc: startIso, duration_hours: hours, include_series: false }
  });
  const floorWh = H1_PROFILE.battery_capacity_wh * (rulesDraft.battery / 100);
  const power = { ...H1_PROFILE, reserve_wh: floorWh };
  const evals = await Promise.all(
    scenarios.map(async (s, idx) => {
      const m = metrics[idx];
      const series = m.series;
      const i0 = Math.max(0, Math.ceil((m.t0 - series.start) / HOUR_MS));
      const samples = Array.from(
        { length: Math.max(0, Math.min(hours, series.count - i0)) },
        (_, h) => ({ sun_visible: series.sunMargin[i0 + h] >= 0, earth_visible: series.earthMargin[i0 + h] >= 0 })
      );
      const res = await runScenario(api, {
        siteId: s.id,
        startIso: new Date(m.t0).toISOString().replace(".000Z", "Z"),
        hours,
        power,
        maxBlackoutH: Math.min(rulesDraft.blackout, hours),
        samples
      });
      if (!res.ok || !res.trace?.length) return null;
      const minCharge = Math.min(...res.trace);
      return Number(((minCharge - floorWh) / H1_PROFILE.load_w).toFixed(1));
    })
  );

  const rows = [
    {
      label: t("plan.mNight"), unit: "h",
      vals: metrics.map((m) => m.longestDarkH.value),
      rule: `≤ ${rulesDraft.night}`,
      check: (v) => v <= rulesDraft.night,
      best: "min",
      margin: metrics[1]?.longestDarkH.value != null ? rulesDraft.night - metrics[1].longestDarkH.value : null,
      unc: "±1", status: doc.status
    },
    {
      label: t("plan.mBlackout"), unit: "h",
      vals: metrics.map((m) => m.longestBlackoutH.value),
      rule: `≤ ${rulesDraft.blackout}`,
      check: (v) => v <= rulesDraft.blackout,
      best: "min",
      margin: metrics[1]?.longestBlackoutH.value != null ? rulesDraft.blackout - metrics[1].longestBlackoutH.value : null,
      unc: "±1", status: doc.status
    },
    {
      label: t("plan.mSun"), unit: "%",
      vals: metrics.map((m) => m.sunPct.value),
      rule: t("nd"), check: null, best: "max", margin: null,
      unc: "±0.3", status: doc.status
    },
    {
      label: t("plan.mEarth"), unit: "%",
      vals: metrics.map((m) => m.earthPct.value),
      rule: t("nd"), check: null, best: "max", margin: null,
      unc: "±0.3", status: doc.status
    },
    {
      label: t("plan.mBattery"), unit: "h",
      vals: evals,
      rule: `≥ 0`,
      check: (v) => v >= 0,
      best: "max",
      margin: evals[1] ?? null,
      unc: "SIM", status: "SYNTHETIC"
    },
    {
      label: t("plan.mSlope"), unit: "°",
      vals: scenarios.map((s) => s.metrics?.slope_deg ?? null),
      rule: `≤ ${rulesDraft.slope}`,
      check: (v) => v <= rulesDraft.slope,
      best: "min",
      margin: scenarios[1]?.metrics?.slope_deg != null ? rulesDraft.slope - scenarios[1].metrics.slope_deg : null,
      unc: "DEM", status: doc.status
    },
    {
      label: t("plan.mRough"), unit: t("nd"),
      vals: [null, null, null],
      rule: t("nd"), check: null, best: null, margin: null,
      unc: t("plan.noSource"), status: "NOT_COMPUTED"
    }
  ];
  return { live, metrics, rows };
}

async function draw() {
  document.getElementById("plan-h1").textContent = t("plan.h1");
  document.title = `MoonProof · ${t("plan.h1")}`;
  const st = getState();
  const { live, metrics, rows } = await computeRows();
  shell.setContext({
    site: `${scenarios.length} cenários`,
    date: (st.start || "2027-03-14T06:00:00Z").slice(0, 10),
    days: fmtNum((st.hours || 336) / 24),
    seal: sealFor(doc.status),
    online: live.ok,
    action: { label: t("plan.pdf"), href: hrefTo("evidence.html") }
  });

  const rulesEl = document.getElementById("plan-rules");
  rulesEl.innerHTML = `
    <div class="mp-plan-head"><h2>${t("plan.title")}</h2><span class="mp-plan-tag">${t("plan.editable")}</span></div>
    <label class="mp-rule-row"><span>${t("plan.night")}</span><input id="r-night" type="number" value="${rulesDraft.night}"><span>h</span></label>
    <label class="mp-rule-row"><span>${t("plan.blackout")}</span><input id="r-blackout" type="number" value="${rulesDraft.blackout}"><span>h</span></label>
    <label class="mp-rule-row"><span>${t("plan.battery")}</span><input id="r-battery" type="number" value="${rulesDraft.battery}"><span>%</span></label>
    <label class="mp-rule-row"><span>${t("plan.mast")}</span><input id="r-mast" type="number" value="${rulesDraft.mast}"><span>m</span></label>
    <label class="mp-rule-row"><span>${t("plan.slope")}</span><input id="r-slope" type="number" value="${rulesDraft.slope}"><span>°</span></label>
    <div class="mp-plan-sep" role="presentation"></div>
    <label class="mp-rule-select"><span>${t("plan.sunMode")}</span>
      <select id="r-sun">
        <option value="center" ${rulesDraft.sunMode === "center" ? "selected" : ""}>${t("plan.sunCenter")}</option>
        <option value="limb" ${rulesDraft.sunMode === "limb" ? "selected" : ""}>${t("plan.sunLimb")}</option>
      </select>
    </label>
    <label class="mp-rule-select"><span>${t("plan.step")}</span>
      <select id="r-step">
        <option value="1" ${rulesDraft.step === 1 ? "selected" : ""}>1 h</option>
        <option value="3" ${rulesDraft.step === 3 ? "selected" : ""}>3 h</option>
      </select>
    </label>
    <button id="btn-recalc" class="mp-btn-jade" type="button">${t("plan.recalc")}</button>
    <p class="mp-note">${t("plan.ruleNote")}</p>
  `;

  rulesEl.querySelector("#btn-recalc").addEventListener("click", () => {
    rulesDraft.night = Number(rulesEl.querySelector("#r-night").value);
    rulesDraft.blackout = Number(rulesEl.querySelector("#r-blackout").value);
    rulesDraft.battery = Number(rulesEl.querySelector("#r-battery").value);
    rulesDraft.mast = Number(rulesEl.querySelector("#r-mast").value);
    rulesDraft.slope = Number(rulesEl.querySelector("#r-slope").value);
    rulesDraft.sunMode = rulesEl.querySelector("#r-sun").value;
    rulesDraft.step = Number(rulesEl.querySelector("#r-step").value);
    setState({ night: rulesDraft.night, blackout: rulesDraft.blackout, battery: rulesDraft.battery, layer: "proof" });
  });

  // The page URL itself carries the scenario, rules= and v=, so a reload reproduces this calculation.
  const shareHref = shareUrl(location.href, rulesDraft, version?.value);
  history.replaceState(null, "", new URL(shareHref).search + location.hash);
  const exportEl = document.getElementById("plan-export");
  exportEl.innerHTML = `
    <div class="mp-plan-head"><h2>${t("plan.exportTitle")}</h2><p class="mp-note mp-version"><span>${t("plan.version")}</span> <b>${shortVersion(version?.value) ?? t("nd")}</b><span class="mp-version-seal"></span></p></div>
    <div class="mp-export-actions">
      <button id="btn-csv" class="mp-btn-white" type="button">${t("plan.csv")}</button>
      <button id="btn-json" class="mp-btn-white" type="button">${t("plan.json")}</button>
      <button id="btn-pdf" class="mp-btn-white" type="button">${t("plan.pdf")}</button>
    </div>
    <div class="mp-url-box" id="plan-url">${shareHref}</div>
    <p class="mp-note">${t("plan.urlNote")}</p>
  `;

  if (!version) exportEl.querySelector(".mp-version-seal").appendChild(sealEl("N/D"));
  exportEl.querySelector("#btn-csv").addEventListener("click", () => {
    const header = "site,hour_idx,sun,earth";
    const lines = [header];
    metrics.forEach((m, idx) => {
      const s = scenarios[idx];
      (m.series || []).slice(0, 48).forEach((pt, h) => {
        lines.push(`${s.id},${h},${pt.sun ?? ""},${pt.earth ?? ""}`);
      });
    });
    downloadFile("moonproof-plan.csv", lines.join("\n"), "text/csv");
  });
  exportEl.querySelector("#btn-json").addEventListener("click", () => {
    downloadFile("moonproof-plan.json", JSON.stringify({ rules: rulesDraft, scenarios: scenarios.map((s) => s.id), rows }, null, 2), "application/json");
  });
  exportEl.querySelector("#btn-pdf").addEventListener("click", () => {
    window.open(hrefTo("evidence.html") + "&print=1", "_blank", "noopener");
  });

  const tableEl = document.getElementById("plan-table");
  tableEl.innerHTML = `
    <div class="mp-plan-head"><h2>${t("plan.tableTitle")}</h2><span class="mp-note">${t("plan.legend")}</span></div>
    <div class="mp-table-wrap">
      <table class="mp-metrics-table">
        <thead>
          <tr>
            <th>${t("plan.colMetric")}</th><th>${t("plan.colUnit")}</th>
            ${scenarios.map((s, i) => `<th scope="col" title="${s.n} · ${s.name}"><span class="mp-col-letter">${String.fromCharCode(65 + i)}</span><small class="mp-col-site">${s.n} · ${s.name}</small></th>`).join("")}
            <th>${t("plan.colRule")}</th><th>${t("plan.colMargin")}</th>
            <th>${t("plan.colUnc")}</th><th>${t("plan.colOrigin")}</th>
          </tr>
        </thead>
        <tbody id="plan-tbody"></tbody>
      </table>
    </div>
  `;
  const tbody = tableEl.querySelector("#plan-tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    const validVals = r.vals.filter((v) => v != null);
    const bestVal = r.best && validVals.length ? (r.best === "min" ? Math.min(...validVals) : Math.max(...validVals)) : null;
    const cells = r.vals.map((v) => {
      if (v == null) return `<td>${t("nd")}</td>`;
      const bad = r.check && !r.check(v);
      const best = !bad && bestVal != null && v === bestVal;
      const cls = bad ? "mp-val-bad" : best ? "mp-val-best" : "";
      return `<td class="${cls}">${fmtNum(v)}</td>`;
    }).join("");
    const marginText = r.margin == null ? t("nd") : (r.margin >= 0 ? `+${fmtNum(r.margin)}` : fmtNum(r.margin));
    tr.innerHTML = `<td>${r.label}</td><td>${r.unit}</td>${cells}<td>${r.rule}</td><td>${marginText}</td><td>${r.unc}</td><td class="mp-seal-cell"></td>`;
    tr.querySelector(".mp-seal-cell").appendChild(sealEl(sealFor(r.status)));
    tbody.appendChild(tr);
  }
}

onState(() => draw());
draw();
