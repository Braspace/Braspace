package onboard

// The mission report is an educational evidence artifact, not a prediction of
// a flight-qualified lunar mission. It uses exactly the same Evaluate contract
// as the JSON onboard endpoint and preserves its unverified-data warning.

import (
	"bytes"
	"encoding/json"
	"html/template"
	"io"
	"mime"
	"net/http"

	"github.com/Braspace/Braspace/api/internal/jsoncontract"
)

const reportTemplate = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BRASPACE | MoonProof Mission Report</title>
<style>
:root { color-scheme: light; font-family: system-ui, sans-serif; color:#111e35; background:#f3f6fb }
* { box-sizing:border-box }
body { margin:0 auto; max-width:1080px; padding:32px 24px; line-height:1.42 }
header { padding:28px; border-radius:14px; background:#0a152a; color:#fff }
header h1 { font-size:28px; margin:8px 0 6px }
header small { color:#9cb7d5 }
h2 { margin-top:30px; border-bottom:2px solid #dae3ef; padding-bottom:8px }
h3 { margin:20px 0 6px }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap:anywhere }
.warning { padding:14px 16px; border:2px solid #bb653a; border-radius:8px; background:#fff1e7; margin-top:16px }
.card { border:1px solid #cbd5e4; border-radius:10px; background:white; padding:16px; margin-top:16px; break-inside:avoid }
table { width:100%; border-collapse:collapse; font-size:12px; margin:10px 0 }
th,td { border:1px solid #cbd5e4; padding:7px; text-align:left; vertical-align:top }
th { background:#edf3fa }
caption { text-align:left; font-weight:700; padding:8px 0 }
.label { color:#344f78; font-weight:700 }
.unknown { color:#925522; font-weight:700 }
small,footer { font-size:12px }
@page { size:A4; margin:15mm }
@media print {
  :root { color:#000; background:white }
  body { padding:0; max-width:none }
  header { border:1px solid #555; background:white; color:#000 }
  header small { color:#333 }
  .warning { background:white; color:#000; border-color:#000 }
  .card { break-inside:avoid; box-shadow:none }
  h2 { break-after:avoid }
  a { color:#000 }
}
</style>
</head>
<body>
<header>
<small>BRASPACE · NASA Space Apps Challenge 2026 · South Pole MoonProof Lab</small>
<h1>Lunar Mission Computer — Evidence Report</h1>
<p>Mission: <strong>{{.MissionID}}</strong></p>
<p>Science status: <strong>{{.ScienceStatus}}</strong> · Software model: <strong>{{.Version}}</strong></p>
</header>
<section class="warning" role="note">
<strong>NOT FLIGHT SOFTWARE — UNVERIFIED INPUTS</strong><br>
Educational scenario simulation only. Sun and Earth visibility values, site names, and dataset identifiers are supplied by callers, not verified NASA/JPL calculations. No NASA endorsement, mission safety or landing recommendation is claimed.
</section>
<section>
<h2>Scenario receipt</h2>
<p><span class="label">Input SHA-256:</span> <span class="mono">{{.InputsSHA256}}</span></p>
<p><span class="label">Decision:</span> {{.Decision}}</p>
<p><span class="label">Educational candidate:</span>
{{if .LaboratoryCandidateID}}<strong>{{.LaboratoryCandidateID}}</strong> (assumed constraints only){{else}}<span class="unknown">NONE — no supplied scenario satisfies all assumed constraints</span>{{end}}</p>
<p><span class="label">NASA flight recommendation:</span> NONE — unverified evidence.</p>
</section>
{{with .Appendix}}
<section>
<h2>Crew consumables and combined decision</h2>
<p><span class="label">Visibility source:</span> {{.VisibilitySource}}</p>
<p><span class="label">Combined decision (energy + comms + consumables):</span>
{{if .CombinedCandidateID}}<strong>{{.CombinedCandidateID}}</strong> meets every assumed limit{{else}}<span class="unknown">NONE — no candidate meets energy, comms and consumable limits together</span>{{end}}</p>
<p><span class="label">Consumption rate source:</span> {{if .RateSource}}{{.RateSource}}{{else}}<span class="unknown">no crew declared — consumables UNKNOWN</span>{{end}}</p>
{{range .Candidates}}
<article class="card">
<h3>{{.ID}} — {{.SiteID}} · {{if .Admissible}}meets all assumed limits{{else}}<span class="unknown">breaches assumed limits</span>{{end}}</h3>
<p><span class="label">Series:</span> {{.ScienceStatus}} · <span class="mono">{{.Provenance}}</span></p>
<table>
<caption>Consumables over the window (status {{.ConsumablesStatus}})</caption>
<thead><tr><th>Resource</th><th>Stock at start (kg)</th><th>Used while waiting (kg)</th><th>Needed (kg)</th><th>Autonomy (h)</th><th>Margin (h)</th><th>Runs out (UTC)</th><th>Status</th></tr></thead>
<tbody>
{{range .Consumables}}
<tr><td>{{.Resource}}</td><td>{{.StockAtStartKg}}</td><td>{{.UsedDuringDelayKg}}</td><td>{{.RequiredKg}}</td><td>{{.AutonomyHours}}</td><td>{{.MarginHours}}</td><td>{{if .DepletionUTC}}{{.DepletionUTC}}{{else}}after window{{end}}</td><td>{{.Status}}</td></tr>
{{else}}
<tr><td colspan="8">No crew declared.</td></tr>
{{end}}
</tbody>
</table>
{{if .Risks}}
<table>
<caption>Consumable risks</caption>
<thead><tr><th>Category</th><th>Severity</th><th>Measured</th><th>Allowed / trigger</th><th>Why it matters</th></tr></thead>
<tbody>
{{range .Risks}}<tr><td>{{.Category}}</td><td>{{.Severity}}</td><td>{{.Measured}} {{.Unit}}</td><td>{{.Allowed}} {{.Unit}}</td><td>{{.Explanation}}</td></tr>{{end}}
</tbody>
</table>
{{end}}
</article>
{{end}}
</section>
{{end}}
<section>
<h2>Scenario comparisons and operational risk register</h2>
{{range .Options}}
<article class="card">
<h3>{{.ID}} — {{.SiteID}}</h3>
<p><span class="label">Start (UTC):</span> {{.StartUTC}} · <span class="label">Mode:</span> {{.EndMode}} · <span class="label">Status:</span> {{.SimulationStatus}}</p>
<p><span class="label">Caller source claim (not authenticated):</span> {{if .SourceClaimUnverified}}{{.SourceClaimUnverified}}{{else}}UNKNOWN{{end}}</p>
<table>
<caption>Energy and line-of-sight metrics</caption>
<thead><tr><th>Metric</th><th>Measured</th><th>Unit</th></tr></thead>
<tbody>
<tr><td>Duration</td><td>{{.Metrics.DurationHours}}</td><td>hours</td></tr>
<tr><td>Minimum battery reserve</td><td>{{.Metrics.MinChargeWh}}</td><td>Wh</td></tr>
<tr><td>Final battery charge</td><td>{{.Metrics.FinalChargeWh}}</td><td>Wh</td></tr>
<tr><td>Unserved load</td><td>{{.Metrics.UnservedEnergyWh}}</td><td>Wh</td></tr>
<tr><td>Longest geometric darkness</td><td>{{.Metrics.LongestDarknessHours}}</td><td>hours</td></tr>
<tr><td>Longest Earth obstruction</td><td>{{.Metrics.LongestEarthObstructionHours}}</td><td>hours</td></tr>
</tbody>
</table>
<table>
<caption>Risks against caller-declared thresholds</caption>
<thead><tr><th>Category</th><th>Severity</th><th>Measured</th><th>Allowed / trigger</th><th>Why it matters</th></tr></thead>
<tbody>
{{range .Risks}}
<tr><td>{{.Category}}</td><td>{{.Severity}}</td><td>{{.Measured}} {{.Unit}}</td><td>{{.Allowed}} {{.Unit}}</td><td>{{.Explanation}}</td></tr>
{{else}}
<tr><td colspan="5">No assumed constraint violation was detected. This is NOT proof of lunar mission safety or NASA data validity.</td></tr>
{{end}}
</tbody>
</table>
<details>
<summary>Time-series state trace ({{len .Timeline}} samples)</summary>
<table>
<thead><tr><th>Epoch UTC</th><th>Sun</th><th>Earth</th><th>Charge (Wh)</th><th>Unserved (Wh)</th><th>Mode</th></tr></thead>
<tbody>
{{range .Timeline}}
<tr><td>{{.EpochUTC}}</td><td>{{.SunVisible}}</td><td>{{.EarthVisible}}</td><td>{{.ChargeWh}}</td><td>{{.UnservedEnergyWh}}</td><td>{{.Mode}}</td></tr>
{{end}}
</tbody>
</table>
</details>
</article>
{{end}}
</section>
<section>
<h2>Assumptions, limitations and dataset provenance</h2>
<p>No actual NASA source ID, downloadable dataset checksum, coordinate frame or ephemeris kernel is validated by this endpoint. A caller-provided source name is a <em>claim</em>, not scientific provenance. See the team's independently audited NASA source manifest before stating an input is NASA-backed.</p>
<ul>{{range .Limitations}}<li>{{.}}</li>{{end}}</ul>
</section>
<footer>
<p><strong>Review checklist:</strong> Compare every numeric value with the corresponding <span class="mono">/api/onboard/evaluate</span> JSON response; verify risk thresholds and science status; cite primary NASA/LROC/JPL assets when actually integrated.</p>
<p>This self-contained HTML document can be saved as PDF using your browser's Print → Save as PDF feature. No external network resource, JavaScript, logo, tracking or third-party script is required.</p>
</footer>
</body></html>`;

var missionReport = template.Must(template.New("mission-report").Parse(reportTemplate))

// ReportAppendix adds crew consumables and the combined decision to the
// report. It is optional: /api/onboard/report renders without it.
type ReportAppendix struct {
	VisibilitySource    string
	CombinedCandidateID string
	RateSource          string
	Candidates          []AppendixCandidate
}

type AppendixCandidate struct {
	ID, SiteID, ScienceStatus, Provenance, ConsumablesStatus string
	Admissible                                             bool
	Consumables                                            []ConsumableRow
	Risks                                                  []Risk
}

type ConsumableRow struct {
	Resource, Status                                                                  string
	StockAtStartKg, UsedDuringDelayKg, RequiredKg, AutonomyHours, MarginHours float64
	DepletionUTC                                                                      string
}

type reportView struct {
	Response
	Appendix *ReportAppendix
}

// RenderReport renders the printable report for an evaluated response,
// optionally with the consumables appendix.
func RenderReport(resp Response, appendix *ReportAppendix) ([]byte, error) {
	var buf bytes.Buffer
	if err := missionReport.Execute(&buf, reportView{Response: resp, Appendix: appendix}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ReportHandler computes a fresh report from the exact same onboard request as
// /api/onboard/evaluate. It returns standalone print-friendly HTML.
func ReportHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			http.Error(w, "application/json required", http.StatusUnsupportedMediaType)
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
		if err != nil || len(raw) > MaxRequestBytes {
			http.Error(w, "maximum request size exceeded", http.StatusRequestEntityTooLarge)
			return
		}
		if err := jsoncontract.Check(raw); err != nil {
			http.Error(w, "invalid JSON document", http.StatusBadRequest)
			return
		}
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.DisallowUnknownFields()
		var req Request
		if err := dec.Decode(&req); err != nil {
			http.Error(w, "invalid JSON contract", http.StatusBadRequest)
			return
		}
		var trailing any
		if err := dec.Decode(&trailing); err != io.EOF {
			http.Error(w, "trailing JSON not allowed", http.StatusBadRequest)
			return
		}
		out, err := Evaluate(req)
		if err != nil {
			http.Error(w, "invalid mission scenario", http.StatusUnprocessableEntity)
			return
		}
		page, err := RenderReport(out, nil)
		if err != nil {
			http.Error(w, "report generation failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", "inline; filename=\"braspace-mission-report.html\"")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(page)
	})
}
