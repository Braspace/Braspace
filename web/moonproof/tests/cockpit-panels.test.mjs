import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PANEL_IDS, togglePanel, layoutState} from '../screens/cockpit-panels.js';
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
