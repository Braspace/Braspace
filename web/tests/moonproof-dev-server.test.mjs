import test from "node:test";
import assert from "node:assert/strict";
import {moonproofFile} from "../dev-server.mjs";
test("dev server serves only MoonProof pages, core and screens", () => {
 for (const p of ["/moonproof/","/moonproof/index.html","/moonproof/mission.html","/moonproof/core/data.js","/moonproof/core/tokens.css","/moonproof/screens/entry.js","/moonproof/data/features.json"]) assert.ok(moonproofFile(p), p);
 assert.equal(moonproofFile("/moonproof/data/features.json").type, "application/json; charset=utf-8");
 for (const p of ["/moonproof/data/other.json","/moonproof/data/","/moonproof/data/features.json/x","/moonproof/data/../dev-server.mjs","/moonproof/data/sub/features.json","/moonproof/features.json"]) assert.equal(moonproofFile(p), null, p);
 for (const p of ["/moonproof/core/README.md","/moonproof/tests/core-seal.test.mjs","/moonproof/designer/S.designer.mds","/moonproof/core/x.html","/moonproof/x.js","/moonproof/../dev-server.mjs","/moonproof/core/../../app.js"]) assert.equal(moonproofFile(p), null, p);
});
