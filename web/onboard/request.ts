declare var module: { exports: unknown } | undefined;
type OnboardPowerKey = "battery_capacity_wh" | "initial_charge_wh" | "reserve_wh" | "solar_generation_w" | "load_w";
type OnboardCandidate = {
  id: string; site_id: string; start_utc: string; step_minutes: number;
  samples: { sun_visible: boolean; earth_visible: boolean }[];
  power?: Partial<Record<OnboardPowerKey, number>>; max_comm_blackout_hours: number;
  source_claim?: string;
};
declare var OnboardRequest: OnboardRequestApi;
interface OnboardRequestApi {
  buildRequest(missionId: string, candidates: OnboardCandidate[]): { ok: boolean; errors: string[]; body: { mission_id: string; candidates: OnboardCandidate[] } };
  validateCandidate(c: OnboardCandidate): string[];
  MAX_CANDIDATES: number; MAX_SAMPLES: number; MAX_DURATION_MIN: number;
}
// Builds and validates requests for POST /api/onboard/evaluate.
// Limits mirror api/onboard/onboard.go (validate). The API stays the authority:
// these checks only give faster feedback in the form.
(function (root: Record<string, unknown>) {
  "use strict";

  const MAX_CANDIDATES = 8;
  const MAX_SAMPLES = 720;
  const MAX_DURATION_MIN = 43200; // 30 days
  const MAX_VALUE = 1e8;

  function finite(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }

  function validateCandidate(c: OnboardCandidate): string[] {
    const errs: string[] = [];
    if (!c.id || c.id.trim() === "" || c.id.length > 96) errs.push("id obrigatório (até 96 caracteres)");
    if (!c.site_id || c.site_id.trim() === "") errs.push("site_id obrigatório");
    if (!Number.isFinite(Date.parse(c.start_utc))) errs.push("start_utc deve ser RFC 3339, por exemplo 2026-12-01T00:00:00Z");
    if (!Number.isInteger(c.step_minutes) || c.step_minutes < 1 || c.step_minutes > 360) errs.push("passo entre 1 e 360 min");
    if (!Array.isArray(c.samples) || c.samples.length < 1 || c.samples.length > MAX_SAMPLES) errs.push("entre 1 e " + MAX_SAMPLES + " amostras");
    if (Array.isArray(c.samples) && c.step_minutes * c.samples.length > MAX_DURATION_MIN) errs.push("duração acima de 30 dias");
    if (Array.isArray(c.samples)) {
      const bad = c.samples.findIndex(s => typeof s.sun_visible !== "boolean" || typeof s.earth_visible !== "boolean");
      if (bad >= 0) errs.push("amostra " + bad + " sem os dois booleanos");
    }
    const p: Partial<Record<OnboardPowerKey, number>> = c.power || {};
    for (const k of ["battery_capacity_wh", "initial_charge_wh", "reserve_wh", "solar_generation_w", "load_w"] as OnboardPowerKey[]) {
      if (!finite(p[k]) || p[k] < 0 || p[k] > MAX_VALUE) errs.push(k + " deve ser número finito entre 0 e 1e8");
    }
    if (!finite(c.max_comm_blackout_hours) || c.max_comm_blackout_hours < 0) errs.push("limite de bloqueio inválido");
    if (errs.length === 0) {
      if (p.battery_capacity_wh! <= 0) errs.push("capacidade da bateria deve ser maior que zero");
      if (p.initial_charge_wh! > p.battery_capacity_wh!) errs.push("carga inicial acima da capacidade");
      if (p.reserve_wh! > p.battery_capacity_wh!) errs.push("reserva acima da capacidade");
      const durationH = (c.step_minutes * c.samples.length) / 60;
      if (c.max_comm_blackout_hours > durationH) errs.push("limite de bloqueio maior que a duração do cenário");
    }
    return errs;
  }

  function buildRequest(missionId: string, candidates: OnboardCandidate[]) {
    const errors: string[] = [];
    if (!missionId || missionId.trim() === "" || missionId.length > 96) errors.push("mission_id obrigatório (até 96 caracteres)");
    if (candidates.length < 1 || candidates.length > MAX_CANDIDATES) errors.push("entre 1 e " + MAX_CANDIDATES + " cenários");
    const ids = new Set<string>();
    candidates.forEach(c => {
      if (ids.has(c.id)) errors.push("id repetido: " + c.id);
      ids.add(c.id);
      validateCandidate(c).forEach(e => errors.push((c.id || "(sem id)") + ": " + e));
    });
    return { ok: errors.length === 0, errors, body: { mission_id: missionId, candidates } };
  }

  const api = { buildRequest, validateCandidate, MAX_CANDIDATES, MAX_SAMPLES, MAX_DURATION_MIN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardRequest = api;
})((typeof window !== "undefined" ? window : globalThis) as unknown as Record<string, unknown>);
