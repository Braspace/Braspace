#!/usr/bin/env node
// Smoke test de produção: percorre cada path+método de api/openapi.json e as
// páginas estáticas do Worker. Sem dependências (Node 20+, fetch nativo).
//
// Uso: node scripts/smoke-prod-worker.mjs [BASE] [--api-only]
//   BASE       padrão https://braspace-moonproof.almeida-me.workers.dev
//   --api-only pula as páginas estáticas (útil contra a API Go direta)
//
// Sai com código 1 se qualquer verificação falhar.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE = 'https://braspace-moonproof.almeida-me.workers.dev';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 30_000;
const VECTOR_DIM = 384;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const args = process.argv.slice(2);
const apiOnly = args.includes('--api-only');
const BASE = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_BASE).replace(/\/+$/, '');

const STATIC_PAGES = [
  '/moonproof/',
  ...[
    'mission.html',
    'explore.html',
    'compare.html',
    'evidence.html',
    'plan.html',
    'rules.html',
    'debrief.html',
    'recover.html',
    'cockpit.html',
  ].map((page) => `/moonproof/${page}`),
  '/moon-hd/backdrop.js',
  '/moon-hd/scene.js',
  '/data/moonhd/manifest.json',
];

// Operações sem requestBody no openapi: corpo tirado do teste de contrato
// (api/contract_openapi_test.go, brOnboardBody).
const FALLBACK_BODY_FILES = {
  '/api/onboard/report': 'examples/onboard/mission.synthetic.request.json',
  '/api/onboard/evaluate': 'examples/onboard/mission.synthetic.request.json',
};

// Campos de site em corpos de POST: se o id não existir em GET /api/sites,
// troca pelo primeiro sítio com série.
const SITE_BODY_PATHS = new Set([
  '/api/compare',
  '/api/scenarios/delay',
  '/api/onboard/site-evaluate',
  '/api/onboard/site-report',
  '/api/onboard/evaluate',
]);

// Ajustes mínimos que o schema não expressa (limit de 1..10 no vector search).
const BODY_OVERRIDES = {
  '/api/vector/search': (body) => ({ ...body, limit: 1 }),
  // The Go handler rejects a missing start_utc ("start_utc must be RFC 3339") although api/openapi.json lists only
  // lat/lon as required: send a full, realistic body here and keep that contract gap visible (see PR notes).
  '/api/onboard/navigation': (body) => ({ ...body, start_utc: '2026-12-01T00:00:00Z', duration_hours: 24, step_minutes: 60 }),
};

const rows = [];
const record = (ok, method, p, status, ms, nota) =>
  rows.push({ res: ok ? 'OK' : 'FAIL', method, path: p, status, ms, nota });

async function request(method, p, body) {
  const headers = { accept: '*/*' };
  const init = { method, headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + p, init);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      ctype: res.headers.get('content-type') ?? '',
      buf,
      ms: Math.round(performance.now() - t0),
      error: null,
    };
  } catch (err) {
    const why = err.name === 'TimeoutError' ? `timeout ${TIMEOUT_MS}ms` : (err.cause?.code ?? err.message);
    return { status: 0, ctype: '', buf: Buffer.alloc(0), ms: Math.round(performance.now() - t0), error: why };
  }
}

const mime = (ct) => ct.split(';')[0].trim().toLowerCase();
const parseJSON = (r) => {
  try {
    return JSON.parse(r.buf.toString('utf8'));
  } catch {
    return undefined;
  }
};
const snippet = (r) => r.error ?? r.buf.toString('utf8').replace(/\s+/g, ' ').slice(0, 120);

function declaredSuccess(op) {
  const codes = Object.keys(op.responses ?? {}).filter((c) => /^2\d\d$/.test(c));
  return codes.length ? codes.map(Number) : null;
}

function declaredMimes(op, status) {
  const responses = op.responses ?? {};
  const resp = responses[String(status)] ?? Object.entries(responses).find(([c]) => /^2/.test(c))?.[1];
  return resp?.content ? Object.keys(resp.content).map(mime) : null;
}

function unitVector(dim) {
  return Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0));
}

// Monta o corpo a partir de example/examples do openapi; sem exemplo, usa o
// fallback de arquivo ou o mínimo do schema (required), com ids reais.
async function buildBody(specPath, op, components, ctx) {
  const content = op.requestBody?.content?.['application/json'];
  let body;

  if (FALLBACK_BODY_FILES[specPath]) {
    body = JSON.parse(await readFile(path.join(ROOT, FALLBACK_BODY_FILES[specPath]), 'utf8'));
  } else if (content?.example !== undefined) {
    body = structuredClone(content.example);
  } else if (content?.examples) {
    const first = Object.values(content.examples)[0];
    if (first?.value !== undefined) body = structuredClone(first.value);
    else if (first?.externalValue) {
      // externalValue é relativo ao próprio openapi.json (pasta api/)
      body = JSON.parse(await readFile(path.resolve(ROOT, 'api', first.externalValue), 'utf8'));
    }
  }
  if (body === undefined && content?.schema) {
    body = minimal(content.schema, components, '', ctx);
  }
  if (body === undefined) return undefined;

  if (SITE_BODY_PATHS.has(specPath)) {
    const fix = (id) => (ctx.siteIds.has(id) ? id : ctx.siteWithSeries);
    if (typeof body.site_id === 'string') body.site_id = fix(body.site_id);
    if (Array.isArray(body.site_ids)) body.site_ids = [...new Set(body.site_ids.map(fix))];
    if (Array.isArray(body.candidates)) {
      body.candidates = body.candidates.map((c) => (c && typeof c.site_id === 'string' ? { ...c, site_id: fix(c.site_id) } : c));
    }
  }
  return BODY_OVERRIDES[specPath] ? BODY_OVERRIDES[specPath](body) : body;
}

function minimal(schema, components, key, ctx) {
  if (schema?.$ref) schema = components[schema.$ref.split('/').pop()];
  const type = Array.isArray(schema?.type) ? schema.type.find((t) => t !== 'null') : schema?.type;
  switch (type) {
    case 'object': {
      const out = {};
      for (const k of schema.required ?? []) out[k] = minimal(schema.properties?.[k], components, k, ctx);
      return out;
    }
    case 'array':
      if (key === 'vector') return unitVector(VECTOR_DIM);
      return schema.minItems ? [minimal(schema.items, components, key, ctx)] : [];
    case 'string':
      if (schema.format === 'date-time') return '2026-12-01T00:00:00Z';
      if (key === 'model_id') return ctx.vectorModelId;
      if (key.endsWith('site_id')) return ctx.siteWithSeries;
      if (key === 'mission_id') return 'smoke-mission-01';
      return 'smoke';
    case 'integer':
    case 'number':
      if (schema.exclusiveMinimum != null) return schema.exclusiveMinimum + 1;
      return schema.minimum ?? 0;
    case 'boolean':
      return false;
    default:
      return {};
  }
}

// Verificação genérica: status 2xx declarado no openapi e content-type declarado.
function judgeContract(op, r) {
  if (r.error) return { ok: false, note: `rede: ${r.error}` };
  const want = declaredSuccess(op);
  const statusOk = want ? want.includes(r.status) : r.status >= 200 && r.status < 300;
  if (!statusOk) return { ok: false, note: `esperado ${want?.join('/') ?? '2xx'}; ${snippet(r)}` };
  const mimes = declaredMimes(op, r.status);
  const got = mime(r.ctype);
  if (mimes && !mimes.includes(got)) {
    return { ok: false, note: `content-type ${got || '(vazio)'} != ${mimes.join('|')}` };
  }
  if (got === 'application/json' && parseJSON(r) === undefined) {
    return { ok: false, note: 'JSON inválido' };
  }
  return { ok: true, note: got || 'sem corpo' };
}

// Verificações específicas além do contrato genérico.
function judgeSpecific(p, r, contract) {
  if (!contract.ok) return contract;
  const j = parseJSON(r);
  if (p === '/api/health') {
    return j?.data_source === 'postgres'
      ? { ok: true, note: 'data_source=postgres' }
      : { ok: false, note: `data_source=${j?.data_source ?? '(ausente)'}` };
  }
  if (p === '/api/vector/status') {
    return j?.enabled === true && j?.dimension === VECTOR_DIM
      ? { ok: true, note: `enabled, dim=${VECTOR_DIM}` }
      : { ok: false, note: `enabled=${j?.enabled} dimension=${j?.dimension}` };
  }
  if (p === '/api/vector/search') {
    const list = Array.isArray(j) ? j : j?.results;
    return Array.isArray(list)
      ? { ok: true, note: `${list.length} resultado(s)` }
      : { ok: false, note: 'resposta sem lista results' };
  }
  return contract;
}

async function bootstrap() {
  const sites = await request('GET', '/api/sites');
  const sitesJSON = parseJSON(sites);
  if (sites.status !== 200 || !Array.isArray(sitesJSON?.sites) || sitesJSON.sites.length === 0) {
    throw new Error(`GET /api/sites não retornou sítios (status ${sites.status} ${sites.error ?? ''})`);
  }
  const layers = await request('GET', '/api/layers');
  const layersJSON = parseJSON(layers);
  if (layers.status !== 200 || !Array.isArray(layersJSON?.layers) || layersJSON.layers.length === 0) {
    throw new Error(`GET /api/layers não retornou camadas (status ${layers.status} ${layers.error ?? ''})`);
  }
  const status = parseJSON(await request('GET', '/api/vector/status')) ?? {};
  const siteList = sitesJSON.sites;
  return {
    siteId: siteList[0].id,
    siteWithSeries: (siteList.find((s) => s.series) ?? siteList[0]).id,
    siteIds: new Set(siteList.map((s) => s.id)),
    layerId: layersJSON.layers[0].id,
    vectorModelId: status.model_id ?? 'braspace-lexical-384-v1',
  };
}

function printTable(all) {
  const headers = ['RES', 'MÉTODO', 'PATH', 'STATUS', 'MS', 'NOTA'];
  const cells = all.map((r) => [r.res, r.method, r.path, String(r.status), String(r.ms), r.nota]);
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (c) => c.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const c of cells) console.log(line(c));
}

async function main() {
  console.log(`Base: ${BASE}${apiOnly ? '  (--api-only: páginas estáticas puladas)' : ''}`);
  const spec = JSON.parse(await readFile(path.join(ROOT, 'api', 'openapi.json'), 'utf8'));
  const components = spec.components?.schemas ?? {};
  const ctx = await bootstrap();

  for (const [specPath, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const id = specPath.startsWith('/api/layers/') ? ctx.layerId : ctx.siteId;
      const concrete = specPath.replace('{id}', encodeURIComponent(id));
      const body = method === 'post' ? await buildBody(specPath, op, components, ctx) : undefined;
      const r = await request(method.toUpperCase(), concrete, body);
      const verdict = judgeSpecific(specPath, r, judgeContract(op, r));
      record(verdict.ok, method.toUpperCase(), concrete, r.status, r.ms, verdict.note);
    }
  }

  if (!apiOnly) {
    for (const page of STATIC_PAGES) {
      const r = await request('GET', page);
      const ok = r.status === 200;
      record(ok, 'GET', page, r.status, r.ms, ok ? mime(r.ctype) || 'sem content-type' : snippet(r));
    }
  }

  printTable(rows);
  const fails = rows.filter((r) => r.res === 'FAIL').length;
  console.log(`\nTotal: ${rows.length}  OK: ${rows.length - fails}  FAIL: ${fails}`);
  process.exitCode = fails ? 1 : 0;
}

main().catch((err) => {
  console.error(`ERRO: ${err.message}`);
  process.exitCode = 1;
});
