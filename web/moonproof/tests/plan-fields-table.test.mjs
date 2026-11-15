// K1 · Planejamento: pill fields, solid table, A/B/C headers and the reproducible link (rules= + version). No browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PLAN_DEFAULTS, RULE_KEYS, parseRules, shareUrl, shortVersion } from "../screens/plan-model.js";

const root = path.resolve(import.meta.dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const css = read("screens/plan.css"), js = read("screens/plan.tsx"), html = read("plan.html");
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rule = sel => { const m = css.match(new RegExp(esc(sel) + "\\s*\\{([^}]*)\\}")); assert.ok(m, `rule ${sel}`); return m[1].replace(/\s+/g, " "); };

test("rule fields are 70x40 pills (design box, 52 px pitch) with the design border and fill", () => {
  const r = rule(".mp-rule-row input");
  assert.match(r, /box-sizing: border-box/); assert.match(r, /width: 70px/); assert.match(r, /height: 40px/);
  assert.match(r, /border-radius: 999px/); assert.match(r, /border: 1px solid #5E6C7D/); assert.match(r, /background: rgba\(255,255,255,\.06\)/);
  assert.match(rule(".mp-rule-row"), /grid-template-columns: 1fr 70px 22px/);
  assert.match(rule(".mp-rule-row"), /min-height: 48px/); // 48 + 4 px column gap = the board's 52 px pitch
  assert.match(rule(".mp-plan-rules"), /gap: 5px/);
  assert.doesNotMatch(css, /width: 64px|height: 36px|grid-template-columns: 1fr 64px/);
});

test("the two choices are plain text + chevron (no pill box), still >= 24 px tall, 44 px on mobile", () => {
  const r = rule(".mp-rule-select select");
  assert.match(r, /border: 0/); assert.match(r, /background: transparent/); assert.match(r, /height: 27px/);
  assert.match(css, /\.mp-plan-sep/); assert.match(js, /class="mp-plan-sep"/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.mp-rule-select select \{ height: 44px; \}/);
});

test("desktop geometry: rules card 382 wide from y=150, export card 368x260, table anchored bottom 415 min", () => {
  const l = rule(".mp-plan-layout");
  assert.match(l, /inset: 150px 28px 28px 28px/); assert.match(l, /grid-template-columns: 382px 1fr 368px/); assert.match(l, /grid-template-rows: 260px 1fr/);
  assert.match(rule(".mp-plan-rules"), /padding: 21px/);
  assert.match(css, /@media \(min-height: 900px\) and \(min-width: 901px\) \{\s*\.mp-plan-table \{ min-height: 415px; \}/);
  assert.match(css, /\n\.mp-plan-table \{[^}]*padding: 8px 8px 5px/);
  assert.match(rule(".mp-btn-jade"), /height: 48px/);
  assert.match(js, /class="mp-plan-head"><h2>\$\{t\("plan\.exportTitle"\)\}<\/h2><p class="mp-note mp-version"/); // version sits in the head so the card stays 260 tall
});

test("rules panel and table are solid black cards with the design shadow and border", () => {
  assert.match(html, /class="mp-card mp-plan-rules"/); assert.match(html, /class="mp-card mp-plan-table"/);
  const r = rule(".mp-plan-rules, .mp-plan-table");
  assert.match(r, /box-shadow: 0 18px 40px rgba\(0,0,0,\.45\)/); assert.match(r, /border: 1px solid rgba\(255,255,255,\.06\)/);
  assert.match(r, /background: var\(--card, #050607\)/);
});

test("table: right-aligned numbers, A/B/C headers, violation in #FF7A80 with fallback, no bare undefined var", () => {
  assert.match(rule(".mp-metrics-table th, .mp-metrics-table td"), /text-align: right/);
  assert.match(rule(".mp-val-bad"), /var\(--bad, #FF7A80\)/);
  assert.match(js, /String\.fromCharCode\(65 \+ i\)/);
  assert.doesNotMatch(css, /var\(--(?:bad|text-dim|pill-white|jade-ink)\)/);
});

test("export buttons are white 38 px pills; version row falls back to N/D", () => {
  const r = rule(".mp-btn-white");
  assert.match(r, /height: 38px/); assert.match(r, /border-radius: var\(--r-pill\)/); assert.match(r, /var\(--pill-white, var\(--pill\)\)/);
  assert.match(js, /plan\.version/); assert.match(js, /sealEl\("N\/D"\)/);
});

test("share link: rules= in fixed order, v= only when a version exists, round-trips through parseRules", () => {
  const rules = { ...PLAN_DEFAULTS, night: 50, slope: 6, sunMode: "limb", step: 3 };
  const href = "http://127.0.0.1:5173/moonproof/plan.html?site=a&start=2027-03-14T06:00:00Z";
  const u = new URL(shareUrl(href, rules, "0123456789abcdef0123456789abcdef01234567"));
  assert.equal(u.searchParams.get("rules"), RULE_KEYS.map(k => rules[k]).join(","));
  assert.ok(u.search.includes("rules=" + RULE_KEYS.map(k => rules[k]).join(",")), "commas stay readable");
  assert.equal(u.searchParams.get("v"), "0123456");
  assert.equal(u.searchParams.get("site"), "a");
  assert.deepEqual(parseRules(u.search), rules);
  const noV = new URL(shareUrl(u.toString(), PLAN_DEFAULTS, null));
  assert.equal(noV.searchParams.has("v"), false); assert.equal(noV.searchParams.has("sunMode"), false); assert.equal(noV.searchParams.has("step"), false);
  assert.deepEqual(parseRules(noV.search), PLAN_DEFAULTS);
});

test("parseRules rejects a malformed rules= and keeps single params / defaults", () => {
  assert.deepEqual(parseRules("?rules=1,2,3"), PLAN_DEFAULTS);
  assert.deepEqual(parseRules("?rules=a,b,c,d,e"), PLAN_DEFAULTS);
  assert.equal(parseRules("?night=40&slope=5").night, 40);
  assert.equal(parseRules("?sunMode=bad&step=2").sunMode, PLAN_DEFAULTS.sunMode);
  assert.equal(parseRules("?step=2").step, PLAN_DEFAULTS.step);
  assert.equal(shortVersion(null), null); assert.equal(shortVersion("v1.2"), "v1.2");
});
