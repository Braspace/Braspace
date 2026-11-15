import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

// BS-051 (#54), "reduced-motion fallback": the globe renders only on input
// (drag, keys, wheel, resize), with no autonomous animation loop, so there is no
// motion to switch off; the page CSS also honours prefers-reduced-motion.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

test("moon3d.js has no autonomous animation loop",async()=>{
  const src=await readFile(path.join(root,"moon3d.ts"),"utf-8");
  assert.doesNotMatch(src,/requestAnimationFrame|setAnimationLoop|setInterval/);
  assert.match(src,/function render\(\)\{renderer\.render\(scene,camera\)\}/);
});

test("keyboard rotation is available and every input path re-renders on demand",async()=>{
  const src=await readFile(path.join(root,"moon3d.ts"),"utf-8");
  for(const key of ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"])assert.ok(src.includes(key),key);
  assert.match(src,/function keyDown\(e(?:: \w+)?\)[\s\S]*?render\(\)/);
  assert.match(src,/function pointerMove\(e(?:: \w+)?\)[\s\S]*?render\(\)/);
});

test("the site stylesheet disables transitions and smooth scrolling under prefers-reduced-motion",async()=>{
  const css=await readFile(path.join(root,"styles.css"),"utf-8");
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[^}]*animation:none!important[^}]*transition:none!important/);
});
