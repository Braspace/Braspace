// Deliberately isolated from site selection, geometry, mission passports and trust seals.
import { getVectorStatus, searchMetadata, VECTOR_DIMENSION } from "../core/vector-search.js";

const STRINGS = {
  en: {
    title: "Source metadata search · pgvector", note: "Optional metadata retrieval only. Similarity is not scientific validation, landing safety or lunar geometry.",
    loading: "Checking metadata index…", disabled: "Disabled by server configuration; mission features remain independent.",
    unavailable: "Configured but unavailable; refresh after the index is ready.", offline: "Metadata API unavailable or incompatible; the static sources remain usable.", ready: "Index available · model:",
    refresh: "Refresh index status", advanced: "Advanced search with a compatible embedding", input: "Model-labelled JSON embedding", instructions: "Paste JSON with model_id and vector, generated separately by the exact configured model (384 dimensions). An optional limit is checked, but the result count below is used. This browser does not generate embeddings. Only the BRASPACE API receives the vector.",
    limit: "Maximum results", search: "Search source metadata", searching: "Searching source metadata…", empty: "No source matched the configured model.",
    similarity: "Metadata cosine similarity", source: "Source reference", sha: "SHA-256 (index metadata)", results: "Results", invalid: "Invalid embedding or limit. Confirm the model identifier, exactly 384 finite numeric values and nonzero norm.",
    mismatch: "The supplied model does not match the server index.", failed: "Search unavailable or response incompatible. Refresh status and retry; no results inferred.", tooLarge: "JSON must fit within 16 KiB.",
  },
  "pt-BR": {
    title: "Busca de metadados de fontes · pgvector", note: "Recuperação opcional de metadados. Similaridade não valida a ciência, a segurança do pouso ou a geometria lunar.",
    loading: "Verificando índice de metadados…", disabled: "Desativado na configuração do servidor; os recursos da missão são independentes.",
    unavailable: "Configurado, mas indisponível; atualize quando o índice estiver pronto.", offline: "API de metadados indisponível ou incompatível; as fontes estáticas continuam disponíveis.", ready: "Índice disponível · modelo:",
    refresh: "Atualizar estado do índice", advanced: "Busca avançada com embedding compatível", input: "Embedding JSON com identificador do modelo", instructions: "Cole um JSON com model_id e vector, gerado separadamente pelo modelo exato configurado (384 dimensões). O campo opcional limit é conferido, mas vale a quantidade abaixo. Este navegador não gera embeddings. Apenas a API BRASPACE recebe o vetor.",
    limit: "Máximo de resultados", search: "Buscar metadados de fontes", searching: "Buscando metadados de fontes…", empty: "Nenhuma fonte encontrada para o modelo configurado.",
    similarity: "Similaridade cosseno dos metadados", source: "Referência da fonte", sha: "SHA-256 (metadados do índice)", results: "Resultados", invalid: "Embedding ou limite inválido. Confirme o modelo, exatamente 384 valores numéricos finitos e norma diferente de zero.",
    mismatch: "O modelo fornecido não corresponde ao índice do servidor.", failed: "Busca indisponível ou resposta incompatível. Atualize o estado e tente novamente; nenhum resultado foi inferido.", tooLarge: "O JSON deve ter no máximo 16 KiB.",
  },
};

const node = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };

/** A small independent component; no search is sent until the explicit submit action. */
export function mountVectorSearch(container, { locale = "en", fetcher = fetch } = {}) {
  if (!container) return { setLocale() {} };
  let strings = STRINGS[locale] || STRINGS.en;
  let status = { state: "loading" }, response = null, pending = false, generation = 0;
  const heading = node("h2"), note = node("p", null, "metadata-vector-note");
  const stateLine = node("p", null, "metadata-vector-state"); stateLine.setAttribute("role", "status");
  const refreshButton = node("button", null, "metadata-vector-btn"); refreshButton.type = "button";
  const details = node("details"), summary = node("summary");
  const instructions = node("p", null, "metadata-vector-note");
  const form = node("form"); form.noValidate = true;
  const token = container.id || "vector-search";
  const textLabel = node("label"), text = node("textarea"); text.id = token + "-embedding";
  textLabel.htmlFor = text.id; text.rows = 4; text.maxLength = 16384; text.spellcheck = false; text.autocomplete = "off"; text.setAttribute("aria-describedby", token + "-instructions");
  instructions.id = token + "-instructions";
  const countLabel = node("label"), count = node("select"); count.id = token + "-limit"; countLabel.htmlFor = count.id;
  count.append(...Array.from({length:10}, (_,i) => { const o = node("option", i+1); o.value = String(i+1); return o; })); count.value = "5";
  const submit = node("button", null, "metadata-vector-btn"); submit.type = "submit";
  const output = node("div", null, "metadata-vector-results"); output.setAttribute("aria-live", "polite");
  form.append(textLabel, text, countLabel, count, submit); details.append(summary, instructions, form);
  container.classList.add("metadata-vector"); container.replaceChildren(heading, note, stateLine, refreshButton, details, output);
  const errorText = code => code === "REQUEST_TOO_LARGE" ? strings.tooLarge : code === "MODEL_MISMATCH" ? strings.mismatch : ["INVALID_MODEL", "INVALID_JSON", "INVALID_LIMIT", "INVALID_VECTOR"].includes(code) ? strings.invalid : strings.failed;
  function paint() {
    heading.textContent = strings.title; note.textContent = strings.note;
    stateLine.dataset.state = status.state;
    stateLine.textContent = status.state === "ready" ? `${strings.ready} ${status.modelId} · ${VECTOR_DIMENSION}D` : strings[status.state];
    refreshButton.textContent = strings.refresh; refreshButton.disabled = pending || status.state === "loading";
    summary.textContent = strings.advanced; instructions.textContent = strings.instructions;
    textLabel.textContent = strings.input; countLabel.textContent = strings.limit; submit.textContent = pending ? strings.searching : strings.search;
    details.hidden = status.state !== "ready";
    text.disabled = count.disabled = submit.disabled = pending || status.state !== "ready";
    output.replaceChildren();
    if (pending) { output.append(node("p", strings.searching)); return; }
    if (!response) return;
    if (!response.ok) { output.append(node("p", errorText(response.code))); return; }
    if (!response.results.length) { output.append(node("p", strings.empty)); return; }
    output.append(node("h3", strings.results));
    const list = node("ol");
    for (const hit of response.results) {
      const li = node("li"), a = node("a", hit.title); a.href = hit.source_url; a.target = "_blank"; a.rel = "noopener noreferrer";
      const score = new Intl.NumberFormat(locale, {maximumFractionDigits: 6}).format(hit.similarity);
      li.append(a, node("p", `${strings.source}: ${hit.source_ref}`), node("p", `${strings.similarity}: ${score}`), node("p", `${strings.sha}: ${hit.sha256}`, "metadata-vector-hash")); list.append(li);
    }
    output.append(list);
  }
  async function refresh() {
    const ticket = ++generation; const previous = status.modelId; response = null; pending = false;
    status = { state: "loading" }; paint();
    const next = await getVectorStatus(fetcher);
    if (ticket !== generation) return;
    status = next;
    if (status.state !== "ready" || previous !== status.modelId) text.value = "";
    paint();
  }
  refreshButton.addEventListener("click", refresh);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (status.state !== "ready" || pending) return;
    const ticket = ++generation;
    // Capture values first, then disable controls while the request is in flight.
    const embedding = text.value, limit = Number(count.value);
    pending = true; response = null; paint();
    const result = await searchMetadata(embedding, status, limit, fetcher);
    if (ticket !== generation) return;
    pending = false;
    response = result;
    if (!result.ok && result.code === "VECTOR_UNAVAILABLE") status = { state: "unavailable", modelId: status.modelId };
    paint();
  });
  refresh();
  return { setLocale(next) { locale = next; strings = STRINGS[next] || STRINGS.en; paint(); } };
}
