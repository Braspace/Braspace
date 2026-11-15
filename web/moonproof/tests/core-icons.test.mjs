import test from "node:test";
import assert from "node:assert/strict";
import { icon, ICON_NAMES } from "../core/icons.js";

const REQUIRED = ["explore","compare","replan","cockpit","evidence","lab","logo","sun","earth","lander","compass","antenna","sunset","pause","restart","help","close","arrow-left","arrow-right","plus","minus","download","check","fail"];

test("required icons exist", () => { for (const n of REQUIRED) assert.ok(ICON_NAMES.includes(n), n); });

test("every icon is valid, script-free, colour-free SVG", () => {
  for (const n of ICON_NAMES) {
    const s = icon(n);
    assert.match(s, /^<svg [^>]*viewBox="0 0 24 24"[^>]*stroke="currentColor"[^>]*stroke-width="1.5"[^>]*>.*<\/svg>$/s, n);
    assert.ok(!/<script|\son\w+=|javascript:|<style|<image|href=/i.test(s), `${n} unsafe`);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(s), `${n} fixed colour`);
    const colours = [...s.matchAll(/\b(?:fill|stroke|color)="([^"]*)"/g)].map(m => m[1]);
    for (const c of colours) assert.ok(c === "none" || c === "currentColor" || c.startsWith("var(--"), `${n} colour ${c}`);
    // tag balance + attribute quoting
    const open = (s.match(/<(svg|path|circle|ellipse|rect)\b/g) || []).length;
    const closed = (s.match(/\/>|<\/svg>/g) || []).length;
    assert.equal(open, closed, `${n} tags`);
    assert.equal((s.match(/"/g).length) % 2, 0, `${n} quotes`);
  }
});

test("unknown name throws", () => { assert.throws(() => icon("nope")); });
