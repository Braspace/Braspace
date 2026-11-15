import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as entry from './moonproof-worker.mjs';
test('wrangler entry exports only the default fetch handler (workerd rejects other named exports)', async () => {
  assert.deepEqual(Object.keys(entry), ['default']);
  const r = await entry.default.fetch(new Request('https://x.test/moonproof/'), {ASSETS:{fetch:async()=>new Response('ASSET')}});
  assert.equal(await r.text(), 'ASSET');
  const api = await entry.default.fetch(new Request('https://x.test/api/nope'), {ASSETS:{fetch:async()=>new Response('ASSET')}});
  assert.equal(api.status, 404);
});
