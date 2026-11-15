import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { showFallback, fallbackText, startViewer } from '../moon-hd/bootstrap.js';

const fake = () => { const states = new Set(); return {firstElementChild:{textContent:''},classList:{contains:x=>states.has(x),add:x=>states.add(x)}}; };
test('no WebGL or failed CDN import shows accessible fallback',async()=>{
  const box=fake(); await startViewer({box,lang:'pt',load:async()=>{throw new Error('no WebGL')}});
  assert.ok(box.classList.contains('error')); assert.match(box.firstElementChild.textContent,/LOLA 80 m/);
});
test('stalled import ends loading; a completed renderer is never overridden',async()=>{
  const box=fake(); const timer=await startViewer({box,lang:'en',timeout:1,load:async()=>{}});
  await new Promise(r=>setTimeout(r,15)); clearTimeout(timer); assert.ok(box.classList.contains('error'));
  const ready=fake(); ready.classList.add('done'); showFallback(ready,'en'); assert.ok(!ready.classList.contains('error'));
  assert.match(fallbackText('en'),/illustrative lighting/);
});
test('preview is a checked lightweight WebP, not a fabricated asset',()=>{
  const file=readFileSync(new URL('../moon-hd/pole-preview.webp',import.meta.url));
  assert.equal(file.toString('ascii',8,12),'WEBP'); assert.ok(file.length<100000);
  assert.equal(createHash('sha256').update(file).digest('hex'),'9eacf3af78202bb35ee41d5c795621ecb1cf168a30260e5cda39f26eba4e99b7');
});
test('every rendered MoonProof page and the 3D viewer link the preview stylesheet; entry redirects without loading Moon assets',()=>{
  for (const page of ['moon-hd.html',...readdirSync(new URL('../moonproof/',import.meta.url)).filter(f=>f.endsWith('.html')).map(f=>'moonproof/'+f)]) {
    const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');
    if (page === 'moonproof/index.html') {
      assert.match(html,/src="screens\/entry\.js"/);
      assert.doesNotMatch(html,/moon-hd\/preview\.css|backdrop\.js/);
      continue;
    }
    assert.match(html,/moon-hd\/preview\.css/,page);
    if (/moonproof\/(mission|explore|compare|recover|cockpit|landing|plan|present|activity)\.html/.test(page)) assert.match(html,/data-moon-preview="map"/,page);
  }
});
