// LUA3D L4: inconsistências do Landing Lab, Debrief e Evidências vistas nas capturas do dono (16/11/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tapeTicks, scenarioStartMs, utcLabel } from "../screens/landing-model.js";
import { TEXTS } from "../screens/landing-texts.js";

const here = new URL("../screens/", import.meta.url);
const src = (f) => readFileSync(new URL(f, here), "utf8");

test("fita de velocidade vertical: passo regular, sem pular −20 (era 5, −1, −7, −13, −19, −25)", () => {
  assert.deepEqual(tapeTicks(-25, 5, 5), [5, 0, -5, -10, -15, -20, -25]);
  const t = tapeTicks(-25, 5, 5); const steps = new Set(t.slice(1).map((v, i) => t[i] - v));
  assert.equal(steps.size, 1);
});

test("fita de altitude: valores redondos e igualmente espaçados", () => {
  assert.deepEqual(tapeTicks(0, 1000, 5), [1000, 800, 600, 400, 200, 0]);
  assert.deepEqual(tapeTicks(0, 2500, 5), [2500, 2000, 1500, 1000, 500, 0]);
  assert.deepEqual(tapeTicks(5, 5, 5), []);
});

test("fitas escondem a marca que fica sob o marcador (998 sobre 1000)", () => {
  assert.match(src("landing.tsx"), /hideTicksUnder\(ui\.altRail/);
  assert.match(src("landing.tsx"), /hideTicksUnder\(ui\.vzRail/);
});

test("Guiado/Livre traduzidos em pt-BR; V. horizontal com selo SIM", () => {
  assert.equal(TEXTS["pt-BR"]["lab.mode.guided"], "Guiado");
  assert.equal(TEXTS["pt-BR"]["lab.mode.free"], "Livre");
  assert.doesNotMatch(TEXTS["pt-BR"]["lab.guided.step"], /GUIDED/);
  assert.match(src("landing.tsx"), /ui\.vhL\.append\(" ", sealEl\("SIM"\)\)/);
  assert.match(src("landing.tsx"), /ui\.vh\.append\(ui\.vhL, ui\.vhV\); \$\("vz"\)\.append\(ui\.vh\);/);
});

test("instante do cenário: ?start= vence; senão primeira hora com Sol; senão início da série", () => {
  const start = Date.parse("2025-01-01T00:00:00Z");
  assert.equal(scenarioStartMs({ start, sunMargin: [-1, -2, 0.5] }, null), start + 2 * 3600e3);
  assert.equal(scenarioStartMs({ start, sunMargin: [-1, -2] }, null), start);
  assert.equal(scenarioStartMs(null, "2025-03-04T05:00:00Z"), Date.parse("2025-03-04T05:00:00Z"));
  assert.equal(scenarioStartMs(null, null), null);
  assert.equal(utcLabel(start + 2 * 3600e3), "2025-01-01 02:00 UTC");
  assert.equal(utcLabel(NaN), null);
});

test("Debrief sem tentativa mostra local e data do cenário (não '• — • —')", () => {
  const d = src("debrief.tsx");
  assert.match(d, /t\("deb\.noattempt"\)/);
  assert.match(d, /scnTime/);
  assert.ok(TEXTS["pt-BR"]["deb.noattempt"] && TEXTS.en["deb.noattempt"]);
});

test("Evidências separa locais reais de sintéticos e não corta a linha da API", async () => {
  const { EVIDENCE_TEXTS } = await import("../screens/evidence-texts.js").then(m => ({ EVIDENCE_TEXTS: m.TEXTS || m.default || m }));
  const flat = JSON.stringify(EVIDENCE_TEXTS);
  assert.match(flat, /com dado real · \{syn\} sintéticos/);
  assert.match(flat, /with real data · \{syn\} synthetic/);
  const e = src("evidence.tsx");
  assert.match(e, /series_science_statuses\?\.SYNTHETIC/);
  assert.doesNotMatch(e, /\(\$\{t\("evidence\.api_state"\)\}\)/);
});

test("pt-BR: título da tela Missão traduzido (era 'Mission Control')", async () => {
  const { dict } = await import("../core/i18n.js");
  assert.equal(dict["pt-BR"]["mission.title"], "Controle da missão");
  assert.equal(dict.en["mission.title"], "Mission Control");
});
