#!/usr/bin/env node
// MoonProof backend/frontend integration smoke check. Node 20+, no dependencies.
// Usage: MOONPROOF_BASE_URL=http://127.0.0.1:8080 node scripts/backend-smoke.mjs
// Optional: MOONPROOF_REQUIRE_SITES=1 to gate the frontend site catalog.
const base = process.env.MOONPROOF_BASE_URL || 'http://127.0.0.1:8080';
const requireSites = process.env.MOONPROOF_REQUIRE_SITES === '1';
const timeoutMs = 5000;
let failures = 0;
async function probe(path, required, checkJson = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(path, base);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP(S) URL required');
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    if (checkJson) {
      const data = await response.json();
      if (!data || typeof data !== 'object') throw new Error('invalid JSON object');
    }
    console.log('PASS ' + path + ' (' + response.status + ')');
  } catch (error) {
    console.log((required ? 'FAIL ' : 'SKIP ') + path + ': ' + error.message);
    if (required) failures++;
  } finally {
    clearTimeout(timer);
  }
}
await probe('/healthz', true);
await probe('/readyz', true);
await probe('/v1/capabilities', true, true);
await probe('/api/sites', requireSites, true);
if (failures) {
  console.error(failures + ' required backend smoke checks failed');
  process.exitCode = 1;
} else {
  console.log('Backend smoke checks passed. This does NOT establish scientific validity or public deployment.');
}
