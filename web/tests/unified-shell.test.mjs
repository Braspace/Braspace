import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MODES,TOOLS,activeMode,scenarioQuery} from '../shell/modes.js';
import {buildHash} from '../ds/router.js';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('three entry experiences, existing workflows remain discoverable', () => {
  assert.deepEqual(MODES.map(m=>m.label),['Aluno','Professor','Engenheiro de missão']);
  assert.deepEqual(MODES.map(m=>m.path),['/explorar','/aula','/comparar/tecnico']);
  for (const path of ['/comparar','/aula/atividade','/bordo','/bordo/replanejar','/terreno','/evidencias']) assert.ok(TOOLS.some(t=>t.path===path),path);
  assert.equal(activeMode('/bordo/energia'),'/comparar/tecnico');
  assert.equal(activeMode('/aula/atividade'),'/aula');
  assert.equal(activeMode('/comparar'),'/explorar');
  assert.equal(activeMode('/evidencias'),null);
});
test('every entry preserves selected site and mission window', () => {
  for (const mode of MODES) assert.equal(buildHash(mode.path,scenarioQuery({t:'2026-11-15',d:'28'},'nobile-rim-1')),`#${mode.path}?d=28&site=nobile-rim-1&t=2026-11-15`);
});
test('one persistent Moon host and native modal, no second auto-mount', () => {
  const html=read('index.html'), source=read('shell/moon-stage.ts');
  assert.equal((html.match(/id="moon-stage"/g)||[]).length,1);
  assert.doesNotMatch(html,/data-moon-backdrop/);
  assert.match(html,/<dialog id="tools-dialog"[^>]*aria-labelledby="tools-title"/);
  assert.match(html,/id="open-tools" aria-haspopup="dialog"/);
  assert.match(source,/stage\.inert = !value/);
  assert.match(source,/adapter\.createMoon\(stage, status/);
  assert.match(source,/if \(started \|\| disposed\) return/);
  assert.match(source,/e\.key === "Escape"/);
  assert.match(read('shell/shell.css'),/var\(--moon-pole-preview\)/);
  assert.match(read('shell/shell.css'),/prefers-reduced-motion: reduce/);
});
test('PWA has scoped install metadata and explicit CSP/static paths', () => {
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url,'./#/'); assert.equal(manifest.scope,'./'); assert.equal(manifest.display,'standalone');
  assert.match(read('index.html'),/rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(read('dev-server.mjs'),/manifest-src 'self'/);assert.match(read('dev-server.mjs'),/worker-src 'self'/);
  assert.match(read('offline.html'),/Sem conexão/);
});
test('worker bypasses API, POST, cross-origin and science assets; offline root gives explicit notice', async () => {
  const handlers={}, matched=[];
  const self={location:{origin:'https://example.test'},registration:{scope:'https://example.test/app/'},addEventListener:(type,handler)=>handlers[type]=handler};
  const cache={match:async path=>{matched.push(path);return 'offline notice';}};
  runInNewContext(read('sw.js'),{self,URL,caches:{open:async()=>cache},fetch:async()=>{throw new Error('offline');}});
  function dispatch(path,{method='GET',mode='cors',origin=self.location.origin}={}) {
    let result; handlers.fetch({request:{url:origin+path,method,mode},respondWith:p=>result=p});return result;
  }
  assert.equal(dispatch('/app/api/compare'),undefined);
  assert.equal(dispatch('/app/data/sites.json'),undefined);
  assert.equal(dispatch('/app/api/onboard/evaluate',{method:'POST'}),undefined);
  assert.equal(dispatch('/app/',{mode:'navigate',origin:'https://other.test'}),undefined);
  assert.equal(await dispatch('/app/',{mode:'navigate'}),'offline notice');
  assert.deepEqual(matched,['./offline.html']);
});
