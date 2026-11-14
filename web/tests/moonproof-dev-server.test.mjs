import test from "node:test";
import assert from "node:assert/strict";
import {moonproofFile} from "../dev-server.mjs";
test("dev server serves only MoonProof pages, core and screens", () => {
 for (const p of ["/moonproof/","/moonproof/index.html","/moonproof/mission.html","/moonproof/core/data.js","/moonproof/core/tokens.css","/moonproof/screens/entry.js"]) assert.ok(moonproofFile(p), p);
 for (const p of ["/moonproof/assets/terrain-shade-87s.webp","/moonproof/assets/terrain-shade-87s.json","/moonproof/data/features.json"]) assert.ok(moonproofFile(p), p);
 assert.equal(moonproofFile("/moonproof/assets/terrain-shade-87s.webp").type, "image/webp");
 for (const p of ["/moonproof/assets/x.png","/moonproof/assets/../dev-server.mjs","/moonproof/data/other.json","/moonproof/assets/sub/terrain-a.webp"]) assert.equal(moonproofFile(p), null, p);
 for (const p of ["/moonproof/core/README.md","/moonproof/tests/core-seal.test.mjs","/moonproof/designer/S.designer.mds","/moonproof/core/x.html","/moonproof/x.js","/moonproof/../dev-server.mjs","/moonproof/core/../../app.js"]) assert.equal(moonproofFile(p), null, p);
});
