// Every MoonProof screen at desktop and phone width must load without a JS exception.
// Unit tests did not catch a TDZ ReferenceError in core/terrain.js that broke Explore and Compare (15/11, #413);
// this sweep did. Usage:
//   node web/browser/pages-js-errors.mjs [BASE]        BASE defaults to $BRASPACE_PAGES_URL or http://127.0.0.1:5173
//   CHROME_PATH=/usr/bin/google-chrome node web/browser/pages-js-errors.mjs https://braspace-moonproof.almeida-me.workers.dev
// Exit 1 if any page throws (pageerror). Console errors are reported but only 5xx/JS exceptions fail.
import {chromium} from "playwright";

export const PAGES = ["", "mission", "explore", "compare", "plan", "recover", "cockpit", "evidence", "rules", "debrief", "present", "landing", "activity"];
export const SIZES = [[1440, 900, false], [390, 844, true]];
// Reused navigation must not overwrite the Class Kit and Rules document titles.
const EXPECTED_TITLES = {
  activity: /^MoonProof · (?:Class Kit|Kit Aula)$/,
  rules: /^MoonProof · (?:Rules|Regras)$/,
};

const base = (process.argv[2] || process.env.BRASPACE_PAGES_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || undefined});
let failed = 0, loads = 0;
try {
  for (const [width, height, mobile] of SIZES) for (const page of PAGES) {
    const p = await browser.newPage({viewport: {width, height}, isMobile: mobile, hasTouch: mobile});
    const errors = [], server = [];
    p.on("pageerror", e => errors.push(String(e).slice(0, 160)));
    p.on("response", r => { if (r.status() >= 500) server.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    const resp = await p.goto(`${base}/moonproof/${page}`, {waitUntil: "load", timeout: 45000});
    // A 404 page has no JS to throw: count it as a failure, or the sweep would pass without testing the screen.
    if (!resp || resp.status() !== 200) server.push(`${resp ? resp.status() : "no response"} /moonproof/${page} (document)`);
    await p.waitForTimeout(3000);
    const expectedTitle = EXPECTED_TITLES[page];
    if (expectedTitle && !expectedTitle.test(await p.title()))
      errors.push(`Unexpected document title on ${page}: ${await p.title()}`);
    loads++;
    if (errors.length || server.length) { failed++; console.log(`FAIL ${width}px /moonproof/${page}`, JSON.stringify({errors, server})); }
    await p.close();
  }
} finally { await browser.close(); }
console.log(failed ? `FAIL: ${failed} of ${loads} loads with JS exceptions or 5xx` : `OK: ${loads} loads, 0 JS exceptions, 0 5xx`);
process.exit(failed ? 1 : 0);
