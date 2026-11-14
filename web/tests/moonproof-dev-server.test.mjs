import test from "node:test";
import assert from "node:assert/strict";
import {moonproofFile} from "../dev-server.mjs";
test("dev server serves only MoonProof pages, core and screens", () => {
 for (const p of ["/moonproof/","/moonproof/index.html","/moonproof/mission.html","/moonproof/explore.html","/moonproof/compare.html","/moonproof/recover.html","/moonproof/cockpit.html","/moonproof/evidence.html","/moonproof/landing.html","/moonproof/debrief.html","/moonproof/learn.html","/moonproof/plan.html","/moonproof/screens/workflow.js","/moonproof/screens/workflow.css","/moonproof/core/data.js","/moonproof/core/tokens.css","/moonproof/screens/entry.js"]) assert.ok(moonproofFile(p), p);
 for (const p of ["/moonproof/core/README.md","/moonproof/tests/core-seal.test.mjs","/moonproof/designer/S.designer.mds","/moonproof/core/x.html","/moonproof/x.js","/moonproof/../dev-server.mjs","/moonproof/core/../../app.js"]) assert.equal(moonproofFile(p), null, p);
});
