import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAutoOpenTour,hasCompletedSiteWelcome} from '../screens/tour.js';
test('only the first site welcome opens automatically; lessons and other screens are opt-in',()=>{
 assert.equal(shouldAutoOpenTour('entry',false),true);
 assert.equal(shouldAutoOpenTour('entry',true),false);
 for(const mode of ['present','class','cockpit','explore','plan','recover','compare'])assert.equal(shouldAutoOpenTour(mode,false),false,mode);
 assert.equal(hasCompletedSiteWelcome({getItem:k=>k==='moonproof.tour.welcome.v1'?'done':null}),true);
});
