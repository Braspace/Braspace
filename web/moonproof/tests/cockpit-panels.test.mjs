import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PANEL_IDS, togglePanel, layoutState, requestSharedMoon} from '../screens/cockpit-panels.js';
test('all nine panels can be independently closed and restored without mutating state',()=>{
  const old=new Set(); let next=old;
  for(const panel of PANEL_IDS) next=togglePanel(next,panel);
  assert.equal(old.size,0); assert.equal(next.size,9);
  assert.deepEqual(layoutState(next),{left:true,right:true,sheet:true,timeline:true,report:true});
  for(const panel of PANEL_IDS) next=togglePanel(next,panel);
  assert.equal(next.size,0);
});
test('mobile sheet closes only with both panels hidden; timeline/report remain independent',()=>{
  const left=new Set(PANEL_IDS.slice(0,3));
  assert.deepEqual(layoutState(left),{left:true,right:false,sheet:false,timeline:false,report:false});
  assert.equal(layoutState(new Set(PANEL_IDS.slice(0,7))).sheet,true);
  assert.equal(layoutState(new Set(['crew'])).right,false);
});
test('every state has a CSS hiding target and the independent controller is loaded by cockpit',()=>{
  const css=readFileSync(new URL('../screens/cockpit-panels.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../cockpit.html',import.meta.url),'utf8');
  for(const id of PANEL_IDS.slice(0,7)) assert.ok(css.includes(`data-ck-hidden~="${id}"`),id);
  for(const id of ['left','right','sheet','timeline','report']) assert.ok(css.includes(`data-ck-hide-${id}`),id);
  assert.match(html,/id="ck-panel-controls"/); assert.match(html,/screens\/cockpit-panels\.js/); assert.match(html,/screens\/cockpit-panels\.css/);
});

test('controller matches current Preact DOM, keeps a single shared Three.js scene',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const css=read('screens/cockpit-panels.css'), html=read('cockpit.html'), js=read('screens/cockpit-panels.js');
  assert.match(css,/data-ck-hidden~="battery"\] #left>mp-node/,'battery is inside DomNode host');
  assert.match(css,/data-ck-hidden~="illumination"\] #left>\.ck-acc-sun/,'Sun card is an accordion');
  assert.match(html,/data-moon-lazy/,'do not replace the shared GPU scene with duplicate renderer');
  assert.match(html,/\.\.\/moon-hd\/backdrop\.js/);
  assert.doesNotMatch(js,/WebGLRenderer|createCap\(|new THREE\.Scene/,'panel visibility does not instantiate WebGL');
  assert.match(js,/\.moon-ui \.moon-open/,'Moon only requests the same scene as the existing button');
  assert.equal(requestSharedMoon(),false,'SSR/Node needs no document or GPU');
});

test('Moon-only deferred open never overrides a user who restored the panels',()=>{
  // Backdrop.js is lazy and may not expose its button until a later load/timer tick.
  const hadDocument=Object.hasOwn(globalThis,'document');
  const oldDocument=globalThis.document, oldTimeout=globalThis.setTimeout;
  let schedule, clicks=0, wanted=true, available=false;
  globalThis.document={readyState:'complete',querySelector:()=> available ? {disabled:false,click:()=>{clicks++;}} : null};
  globalThis.setTimeout=callback=>{schedule=callback;return 1;};
  try{
    assert.equal(requestSharedMoon(()=>wanted),false,'not yet ready');
    assert.equal(typeof schedule,'function','deferred request scheduled');
    wanted=false;available=true; // user has restored all nine cards before Moon backdrop appears
    schedule();
    assert.equal(clicks,0,'stale callback must not hide restored UI');
    wanted=true;
    assert.equal(requestSharedMoon(()=>wanted),true,'new explicit request should still work');
    assert.equal(clicks,1,'only the fresh request opens the existing backdrop');
  }finally{
    globalThis.setTimeout=oldTimeout;
    if(hadDocument)globalThis.document=oldDocument;else delete globalThis.document;
  }
});
