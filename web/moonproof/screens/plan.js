import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, api, sealFor } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t, fmtNum } from "../core/i18n.js";
import { getState, setState, onState, hrefTo, DEFAULT_RULES } from "../core/state.js";

register({
  en: {
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

const escapeText = v => String(v ?? "N/D").replace(/[&<>"\x27]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\x27":"&#39;"}[c]));
const shell = mountShell({ screen: "compare", onLang: draw });
const doc = await loadSites();
const scenarios = doc.sites.slice(0, 3);
const terrain = await mountTerrain(document.getElementById("terrain"), {
  sites: doc.sites,
  selected: getState().site || scenarios[1]?.id,
  onSelect: (id) => setState({ site: id })
});

const rulesDraft = {
  night: Number(getState().night ?? DEFAULT_RULES.night),
  blackout: Number(getState().blackout ?? DEFAULT_RULES.blackout),
  battery: Number(getState().battery ?? DEFAULT_RULES.battery),
  mast: Number(new URLSearchParams(location.search).get("mast") ?? 2),
  slope: Number(new URLSearchParams(location.search).get("slope") ?? 8),
  sunMode: new URLSearchParams(location.search).get("sunMode") || "center",
  step: Number(new URLSearchParams(location.search).get("step") ?? 1)
};

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
  const live = await api("/api/compare", {
    method: "POST",
    body: { site_ids: scenarios.map((s) => s.id), start_utc: st.start || doc.window.start_utc, duration_hours: hours, include_series: false }
  });
  const metrics = await Promise.all(scenarios.map((s) => windowMetrics(doc, s, st.start, hours)));
  // No power/crew assumptions were supplied. The real API contract requires
  // a full onboard request; show N/D rather than posting invalid/fabricated inputs.
  const evals = scenarios.map(() => ({ ok: false, data: null }));

  const rows = [
    {
      label: t("plan.mNight"), unit: "h",
      vals: metrics.map((m) => m.longestDarkH.value),
      rule: `≤ ${rulesDraft.night}`,
      check: (v) => v <= rulesDraft.night,
      best: "min",
      margin: metrics[1]?.longestDarkH.value != null ? rulesDraft.night - metrics[1].longestDarkH.value : null,
      unc: "1 h grid · not independently validated", status: doc.status
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
      unc: "N/D · independent benchmark pending", status: doc.status
    },
    {
      label: t("plan.mEarth"), unit: "%",
      vals: metrics.map((m) => m.earthPct.value),
      rule: t("nd"), check: null, best: "max", margin: null,
      unc: "±0.3", status: doc.status
    },
    {
      label: t("plan.mBattery"), unit: "h",
      vals: evals.map((e) => (e.ok && e.data?.battery_margin_h != null ? e.data.battery_margin_h : null)),
      rule: `≥ 0`,
      check: (v) => v >= 0,
      best: "max",
      margin: evals[1]?.ok && evals[1].data?.battery_margin_h != null ? evals[1].data.battery_margin_h : null,
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
    const fields = [["night",0,720],["blackout",0,720],["battery",0,100],["mast",0,50],["slope",0,90]];
    const next = {};
    for (const [key,min,max] of fields) {
      const raw = rulesEl.querySelector("#r-" + key).value.trim(), value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < min || value > max) {
        rulesEl.querySelector("#r-" + key).setCustomValidity("Out-of-range assumption");
        rulesEl.querySelector("#r-" + key).reportValidity();
        return;
      }
      rulesEl.querySelector("#r-" + key).setCustomValidity("");
      next[key] = value;
    }
    Object.assign(rulesDraft,next);
    rulesDraft.sunMode = rulesEl.querySelector("#r-sun").value;
    rulesDraft.step = Number(rulesEl.querySelector("#r-step").value);
    setState({ night: rulesDraft.night, blackout: rulesDraft.blackout, battery: rulesDraft.battery, layer: "proof" });
  });

  const exportEl = document.getElementById("plan-export");
  exportEl.innerHTML = `
    <div class="mp-plan-head"><h2>${t("plan.exportTitle")}</h2></div>
    <div class="mp-export-actions">
      <button id="btn-csv" class="mp-btn-white" type="button">${t("plan.csv")}</button>
      <button id="btn-json" class="mp-btn-white" type="button">${t("plan.json")}</button>
      <button id="btn-pdf" class="mp-btn-white" type="button">${t("nav.evidence")}</button>
    </div>
    <div class="mp-url-box" id="plan-url"></div>
    <p class="mp-note">${t("plan.urlNote")}</p>
  `;

  exportEl.querySelector("#plan-url").textContent = location.href;
  exportEl.querySelector("#btn-csv").addEventListener("click", () => {
    const lines = ["site,epoch_utc,sun_visible,earth_visible,source_status,series_sha256"];
    const startUtc = st.start || doc.window.start_utc;
    const t0 = Date.parse(startUtc);
    metrics.forEach((m, idx) => {
      const series = m.series;
      if (!series || m.sunPct.value == null || !Number.isFinite(t0)) return;
      const sha = m.sunPct.detail?.sha256 || "";
      for (let h = 0; h < hours; h++) {
        const epoch = t0 + h * 3600000;
        const i = series.index(epoch);
        if (i < 0 || i >= series.count) continue;
        const columns = [scenarios[idx].id, new Date(epoch).toISOString(),
          Number(series.sunMargin[i] >= 0), Number(series.earthMargin[i] >= 0), doc.status, sha];
        lines.push(columns.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(","));
      }
    });
    downloadFile("moonproof-plan.csv", lines.join("\n"), "text/csv");
  });
  exportEl.querySelector("#btn-json").addEventListener("click", () => {
    downloadFile("moonproof-plan.json", JSON.stringify({ rules: rulesDraft, scenarios: scenarios.map((s) => s.id), rows, science_status: doc.status, scientifically_validated: false, utc_start: st.start || doc.window.start_utc, duration_hours: hours }, null, 2), "application/json");
  });
  exportEl.querySelector("#btn-pdf").addEventListener("click", () => {
    window.open(hrefTo("evidence.html"), "_blank", "noopener");
  });

  const tableEl = document.getElementById("plan-table");
  tableEl.innerHTML = `
    <div class="mp-plan-head"><h2>${t("plan.tableTitle")}</h2><span class="mp-note">${t("plan.legend")}</span></div>
    <div class="mp-table-wrap">
      <table class="mp-metrics-table">
        <thead>
          <tr>
            <th>${t("plan.colMetric")}</th><th>${t("plan.colUnit")}</th>
            <th>${escapeText(scenarios[0]?.n)} · ${escapeText(scenarios[0]?.name)}</th>
            <th>${escapeText(scenarios[1]?.n)} · ${escapeText(scenarios[1]?.name)}</th>
            <th>${escapeText(scenarios[2]?.n)} · ${escapeText(scenarios[2]?.name)}</th>
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
