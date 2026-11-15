import test from "node:test";
import assert from "node:assert/strict";
import { parseHash, buildHash, legacyRedirect, resolveRoute, bordoURL, BORDO_SECTIONS } from "../ds/router.js";

test("parseHash handles root, nested paths, trailing slashes and the site query", () => {
  assert.deepEqual(parseHash(""), { path: "/", parts: [], query: {} });
  assert.deepEqual(parseHash("#/"), { path: "/", parts: [], query: {} });
  const r = parseHash("#/comparar/tecnico/?site=connecting-ridge&x=1");
  assert.equal(r.path, "/comparar/tecnico");
  assert.deepEqual(r.parts, ["comparar", "tecnico"]);
  assert.deepEqual(r.query, { site: "connecting-ridge", x: "1" });
});

test("buildHash keeps the site, drops empty values and sorts keys for stable links", () => {
  assert.equal(buildHash("/explorar", { site: "malapert-massif", empty: "" }), "#/explorar?site=malapert-massif");
  assert.equal(buildHash("/", {}), "#/");
  assert.equal(buildHash("bordo/energia", { z: "1", a: "2" }), "#/bordo/energia?a=2&z=1");
});

test("old links redirect to v3 routes; v3 hashes are left alone", () => {
  assert.equal(legacyRedirect("#explore"), "#/explorar");
  assert.equal(legacyRedirect("#compare"), "#/comparar");
  assert.equal(legacyRedirect("#energia"), "#/bordo/energia");
  assert.equal(legacyRedirect("#entrada"), "#/bordo/parametros");
  assert.equal(legacyRedirect("#/comparar"), null);
  assert.equal(legacyRedirect("#unknown"), null);
});

test("route resolution: exact first, then longest prefix, else not-found", () => {
  const routes = [{ path: "/" }, { path: "/comparar" }, { path: "/comparar/tecnico" }, { path: "/bordo", prefix: true }, { path: "*", notFound: true }];
  assert.equal(resolveRoute(routes, "/comparar/tecnico").route.path, "/comparar/tecnico");
  const b = resolveRoute(routes, "/bordo/energia");
  assert.equal(b.route.path, "/bordo"); assert.deepEqual(b.rest, ["energia"]);
  assert.equal(resolveRoute(routes, "/nope").route.path, "*");
});

test("board routes map to cockpit tabs (Entrada renamed Parâmetros) and keep the site", () => {
  assert.equal(BORDO_SECTIONS.parametros, "entrada");
  assert.equal(bordoURL("onboard/cockpit.html", ["bordo", "energia"], { site: "x" }), "onboard/cockpit.html#/bordo/energia?site=x");
  assert.equal(bordoURL("onboard/cockpit.html", ["bordo", "bogus"], {}), "onboard/cockpit.html#/bordo");
});

test("navigation is a deep-linkable cockpit section",()=>{
 assert.equal(BORDO_SECTIONS.navegacao,"navegacao");
 assert.equal(bordoURL("onboard/cockpit.html",["bordo","navegacao"],{site:"connecting-ridge"}),"onboard/cockpit.html#/bordo/navegacao?site=connecting-ridge");
 assert.equal(legacyRedirect("#navegacao"),"#/bordo/navegacao");
});
