// Perf/a11y head hygiene: meta description, modulepreload targets exist, _headers rules are valid.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pages=readdirSync(path.join(web,"moonproof")).filter(f=>f.endsWith(".html"));

test("every moonproof page has a meaningful meta description and lang",()=>{
  assert.ok(pages.length>=13);
  for(const p of pages){
    const html=readFileSync(path.join(web,"moonproof",p),"utf8");
    const m=html.match(/<meta name="description" content="([^"]+)">/);
    assert.ok(m,p+": meta description");
    assert.ok(m[1].length>=50&&m[1].length<=200,p+": description length "+m[1].length);
    assert.match(html,/<html[^>]* lang="[a-z-]+"/i,p);
  }
});

test("no preload hints (measured: FCP +0.2s on slow 4G, LCP unchanged)",()=>{
  for(const p of pages) assert.doesNotMatch(readFileSync(path.join(web,"moonproof",p),"utf8"),/rel="(?:module)?preload"/,p);
});

test("_headers is valid Workers Assets syntax: <=100 rules, short lines, no fragile caching of code",()=>{
  const txt=readFileSync(path.join(web,"_headers"),"utf8");
  const lines=txt.split("\n");
  assert.ok(lines.every(l=>l.length<=2000));
  const rules=lines.filter(l=>/^\//.test(l));
  assert.ok(rules.length>0&&rules.length<=100);
  assert.equal(rules.filter(r=>(r.match(/\*/g)||[]).length>1).length,0,"single splat per rule");
  for(const r of rules){ assert.ok(!/\.(js|css|html|json)$/.test(r)||r.includes("pole-preview"),"no long cache for "+r); }
  assert.ok(!rules.some(r=>/^\/(moonproof|moon-hd|vendor|lab)\/\*$/.test(r)),"code directories keep revalidation");
  assert.match(txt,/\/moonproof\/fonts\/\*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable/);
});

test("mission tabs use aria-selected only (aria-pressed is invalid on role=tab)",()=>{
  const s=readFileSync(path.join(web,"moonproof/screens/mission.tsx"),"utf8");
  const line=s.split("\n").find(l=>l.includes('role="tab"'));
  assert.ok(line&&!line.includes("aria-pressed"));
});
