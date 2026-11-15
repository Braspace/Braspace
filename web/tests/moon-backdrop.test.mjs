import {readFileSync} from "node:fs";
// Moon HD page backdrop: public API, pure decisions (assets, WebGL fallback, clock), page wiring and asset registry.
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "../dev-server.mjs";
import * as backdrop from "../moon-hd/backdrop.js";

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFile(path.join(web,name),"utf8");
const {mountMoonBackdrop,pickAssets,probeWebGL,backdropTime,shouldAnimate,normalizeOptions,cameraPosition,MAX_PIXEL_RATIO,FRAME_MS,isSoftwareRenderer,slowStreak,SLOW_FRAME_MS,SLOW_FRAMES_TO_STOP}=backdrop;

// Pages whose background is decorative get the Moon; pages whose LOLA relief is the functional map never do.
const WITH={"index.html":"./moon-hd/backdrop.js","onboard/cockpit.html":"../moon-hd/backdrop.js","moonproof/index.html":"../moon-hd/backdrop.js",
 "moonproof/rules.html":"../moon-hd/backdrop.js","moonproof/evidence.html":"../moon-hd/backdrop.js","moonproof/debrief.html":"../moon-hd/backdrop.js","classic.html":"./moon-hd/backdrop.js"};
const WITHOUT=["moonproof/mission.html","moonproof/explore.html","moonproof/compare.html","moonproof/recover.html","moonproof/cockpit.html","moonproof/landing.html",
 "moonproof/plan.html","moonproof/present.html","moonproof/activity.html","studio/index.html","onboard/index.html","moon-hd.html","lab.html"];

test("backdrop.js exports the documented API and does nothing without a document",async()=>{
 assert.equal(typeof mountMoonBackdrop,"function");
 assert.deepEqual(normalizeOptions(),{view:"pole",interactive:false});
 assert.deepEqual(normalizeOptions({view:"globe",interactive:true}),{view:"globe",interactive:false},"a backdrop is never interactive");
 assert.equal(normalizeOptions({view:"anything"}).view,"pole");
 assert.equal(MAX_PIXEL_RATIO,1.5);
 assert.ok(Math.abs(FRAME_MS-1000/30)<1e-9,"30 fps target");
 assert.equal(await mountMoonBackdrop({view:"pole"}),null,"node has no document: resolves to null, does not throw");
});

test("texture and data choice by viewport width and maxTextureSize",()=>{
 const phone=pickAssets({width:390,maxTextureSize:16384});
 assert.equal(phone.color,"color_4k.jpg","never 8k on a phone");
 assert.equal(phone.cap,false);assert.equal(phone.stars,false);
 assert.deepEqual([phone.lon,phone.lat],[384,192]);
 assert.equal(pickAssets({width:719,maxTextureSize:16384}).cap,false);
 const laptop=pickAssets({width:1440,maxTextureSize:16384});
 assert.equal(laptop.color,"color_4k.jpg","4k by default");
 assert.equal(laptop.cap,true);assert.equal(laptop.stars,true);
 assert.equal(pickAssets({width:720,maxTextureSize:4096}).cap,true);
 assert.equal(pickAssets({width:1599,maxTextureSize:16384}).color,"color_4k.jpg");
 assert.equal(pickAssets({width:1600,maxTextureSize:8192}).color,"color_8k.jpg");
 assert.equal(pickAssets({width:2560,maxTextureSize:8191}).color,"color_4k.jpg","8k needs maxTextureSize >= 8192");
 assert.equal(pickAssets({width:2560,maxTextureSize:undefined}).color,"color_4k.jpg");
 for(const width of [undefined,NaN,0])assert.equal(pickAssets({width,maxTextureSize:16384}).cap,false,"unknown width is treated as a phone");
 // The backdrop marches fewer shadow samples than the viewer's desktop setting (48 / 144).
 assert.ok(laptop.globeSteps<=24&&laptop.capSteps<=72&&laptop.capSegments<=448);
});

test("WebGL probe never throws: missing, refusing and throwing canvases all mean no backdrop",()=>{
 assert.equal(probeWebGL(()=>{throw new Error("no DOM");}),null);
 assert.equal(probeWebGL(()=>null),null);
 assert.equal(probeWebGL(()=>({})),null);
 assert.equal(probeWebGL(()=>({getContext:()=>null})),null);
 assert.equal(probeWebGL(()=>({getContext(){throw new Error("blocked");}})),null);
 const asked=[],gl={},canvas={getContext(kind){asked.push(kind);return kind==="webgl2"?gl:null;}};
 assert.deepEqual(probeWebGL(()=>canvas),{canvas,gl});
 assert.deepEqual(asked,["webgl2"],"three.js r181 needs WebGL 2; WebGL 1 is not tried");
});

// Measured on main before this guard: with SwiftShader (the renderer of the Chromium e2e) one backdrop frame
// took about 500 ms and starved the page, so the browser gate timed out.
test("software WebGL gets no backdrop: the context is asked with failIfMajorPerformanceCaveat and the renderer name is read",()=>{
 for(const name of ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)","llvmpipe (LLVM 15.0.7, 256 bits)","softpipe","Microsoft Basic Render Driver","Google SwiftShader"])
  assert.equal(isSoftwareRenderer(name),true,name);
 for(const name of ["ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)","ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)","Mali-G78","Adreno (TM) 740","Intel(R) Iris(R) Xe Graphics",null,undefined,""])
  assert.equal(isSoftwareRenderer(name),false,String(name));
 const make=(renderer,{debugInfo=true}={})=>{
  const state={attributes:null,lost:false};
  const gl={RENDERER:0x1F01,
   getExtension:kind=>kind==="WEBGL_debug_renderer_info"?(debugInfo?{UNMASKED_RENDERER_WEBGL:0x9246}:null):kind==="WEBGL_lose_context"?{loseContext(){state.lost=true;}}:null,
   getParameter:p=>(p===0x9246||p===0x1F01)?renderer:null};
  return {state,gl,canvas:{getContext(kind,attributes){state.attributes=attributes;return kind==="webgl2"?gl:null;}}};
 };
 const soft=make("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)");
 assert.equal(probeWebGL(()=>soft.canvas),null);
 assert.equal(soft.state.attributes.failIfMajorPerformanceCaveat,true);
 assert.equal(soft.state.lost,true,"the refused software context is released");
 const softNoExtension=make("llvmpipe (LLVM 15.0.7, 256 bits)",{debugInfo:false});
 assert.equal(probeWebGL(()=>softNoExtension.canvas),null,"falls back to gl.RENDERER when the debug extension is unavailable");
 const hard=make("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)");
 assert.deepEqual(probeWebGL(()=>hard.canvas),{canvas:hard.canvas,gl:hard.gl});
 assert.equal(hard.state.lost,false);
});

test("slow frames end the animation: four in a row over 120 ms, and a fast frame resets the count",()=>{
 assert.equal(SLOW_FRAME_MS,120);assert.equal(SLOW_FRAMES_TO_STOP,4);
 let streak=0;
 for(const gap of [500,500,500])streak=slowStreak(streak,gap);
 assert.equal(streak,3);assert.ok(streak<SLOW_FRAMES_TO_STOP);
 assert.equal(slowStreak(streak,33),0,"one frame on time clears the streak");
 assert.equal(slowStreak(streak,500),4);
 assert.equal(slowStreak(0,120),0,"exactly at the limit is not slow");
 const source=readFileSync(new URL("../moon-hd/backdrop.js",import.meta.url),"utf8");
 assert.match(source,/streak >= SLOW_FRAMES_TO_STOP\) \{ still = true;/,"the loop stops for good");
 assert.match(source,/if \(!raf && !dead && !still\)/,"and is not restarted by resize, visibility or motion changes");
});

test("clock: the scenario's ?start= when the page has one, else now",()=>{
 const now=Date.parse("2026-11-14T12:00:00Z"),start=Date.parse("2026-12-01T00:00:00Z");
 assert.equal(backdropTime("","",now),now);
 assert.equal(backdropTime("?site=a&start=2026-12-01T00:00:00Z","",now),start);
 assert.equal(backdropTime("","#/comparar?site=a&start=2026-12-01T00%3A00%3A00Z",now),start,"v3 shell keeps its query in the hash");
 assert.equal(backdropTime("?start=not-a-date","#/explorar",now),now);
 assert.equal(backdropTime(undefined,undefined,now),now);
});

test("the loop runs only when visible, on screen and with motion allowed",()=>{
 assert.equal(shouldAnimate({hidden:false,onScreen:true,reducedMotion:false}),true);
 assert.equal(shouldAnimate({hidden:true,onScreen:true,reducedMotion:false}),false);
 assert.equal(shouldAnimate({hidden:false,onScreen:false,reducedMotion:false}),false);
 assert.equal(shouldAnimate({hidden:false,onScreen:true,reducedMotion:true}),false,"prefers-reduced-motion: one frame, no loop");
});

test("camera stays outside the Moon and south of the equator in both views",()=>{
 for(const view of ["pole","globe"])for(const angle of [0,1,2.5,4,6]){
  const [x,y,z]=cameraPosition(view,angle),r=Math.hypot(x,y,z);
  assert.ok(r>2&&r<6,view+" distance "+r);assert.ok(y<0,"looks from the south");
 }
 assert.ok(cameraPosition("pole",0)[1]/Math.hypot(...cameraPosition("pole",0))<-0.85,"pole view sits over the south polar region");
});

test("backdrop source: three.js only on demand, same pinned version as the viewer and the lab, silent fallback",async()=>{
 const src=await read("moon-hd/backdrop.js"),scene=await read("moon-hd/scene.js"),app=await read("moon-hd/app.js"),lab=await read("lab/scene.js");
 assert.doesNotMatch(src,/^\s*import\s.*from\s/m,"no static import: nothing is fetched before the page content");
 assert.match(src,/import\("\.\/scene\.js"\)/);
 const version=s=>[...s.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/three@([0-9.]+)\//g)].map(m=>m[1]);
 assert.deepEqual([...new Set([...version(scene),...version(app),...version(lab)])],["0.181.0"]);
 assert.ok(version(scene).length>=1);
 assert.doesNotMatch(src+scene,/https?:\/\/(?!cdn\.jsdelivr\.net\/npm\/three@0\.181\.0\/)[a-z]/,"no other remote origin");
 assert.doesNotMatch(src,/console\.|alert\(|throw /,"fails silently");
 assert.match(src,/webglcontextlost/);assert.match(src,/prefers-reduced-motion/);assert.match(src,/visibilitychange/);assert.match(src,/IntersectionObserver/);
 assert.match(src,/aria-hidden/);
 assert.doesNotMatch(src,/\.style\b|cssText|style=/,"all styling lives in backdrop.css (CSP style-src 'self')");
 assert.doesNotMatch(src,/holdReady|markReady|ready\.js/,"never touches the first-paint gate");
 const css=await read("moon-hd/backdrop.css");
 assert.match(css,/\.moon-backdrop\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*z-index:\s*-1[^}]*pointer-events:\s*none/);
 assert.match(css,/\.moon-backdrop::after\s*\{[^}]*rgba\(5, 6, 8, \.72\)/,"veil between the Moon and the text");
 // The viewer keeps drawing the scene it shares with the backdrop.
 for(const name of ["createMoon","createCap","setPolarFrame","createStars","textureLoader"]){assert.match(scene,new RegExp("export (async )?function "+name+"\\b"));assert.match(app,new RegExp("\\b"+name+"\\("));}
 assert.doesNotMatch(app,/GLOBE_FRAGMENT|CAP_FRAGMENT/,"shaders are not duplicated in the viewer");
});

test("pages with a decorative background mount the backdrop; functional-map screens never do",async()=>{
 for(const [page,src] of Object.entries(WITH)){
  const html=await read(page),tags=html.match(/<script[^>]*backdrop\.js[^>]*>/g)||[];
  assert.equal(tags.length,1,page);
  assert.ok(tags[0].includes(`type="module"`)&&tags[0].includes(`src="${src}"`),page+": "+tags[0]);
  assert.match(tags[0],/data-moon-backdrop="(pole|globe)"/,page);
  assert.ok(!/style=/.test(html),page+": no inline style attribute");
  assert.ok(!/<script(?![^>]*src=)/.test(html),page+": no inline script");
 }
 for(const page of WITHOUT)assert.ok(!(await read(page)).includes("backdrop.js"),page+" must keep its own background");
 for(const name of await readdir(path.join(web,"moonproof","screens")))if(name.endsWith(".js"))assert.ok(!(await read("moonproof/screens/"+name)).includes("backdrop.js"),name);
});

test("links to the full viewer and credits without endorsement",async()=>{
 const escolha=await read("shell/views/escolha.js"),home=await read("index.html"),cockpit=await read("onboard/cockpit.html"),classic=await read("classic.html");
 assert.match(escolha,/href: "\.\/moon-hd\.html\?view=pole&lang=pt"/);
 assert.match(cockpit,/href="\.\.\/moon-hd\.html\?view=pole&amp;lang=pt"/);
 for(const text of [home,cockpit]){assert.match(text,/NASA LRO\/LOLA/);assert.match(text,/NAIF SPICE/);assert.match(text,/CGI Moon Kit/);assert.match(text,/não é um produto da NASA/);}
 assert.match(home,/IAU\/USGS/);assert.match(home,/Blue Marble/);
 assert.match(classic,/not a NASA product/);
 // MoonProof screens: the help popover of the shared shell carries the link and the credit, in both languages.
 const shell=await read("moonproof/core/shell.js"),{t,setLang}=await import("../moonproof/core/i18n.js");
 assert.match(shell,/\.\.\/moon-hd\.html/);assert.match(shell,/nav\.moon3d\.credit/);
 for(const [lang,phrase] of [["en","not a NASA product"],["pt-BR","não é um produto da NASA"]]){
  setLang(lang);
  assert.ok(t("nav.moon3d.credit").includes(phrase),lang);
  for(const credit of ["CGI Moon Kit","LRO/LOLA","NAIF SPICE","IAU/USGS","Blue Marble"])assert.ok(t("nav.moon3d.credit").includes(credit),lang+" "+credit);
  assert.doesNotMatch(t("nav.moon3d.credit"),/endorsed by NASA(?! )|certified|validated by NASA/i);
 }
 assert.match(await read("moonproof/index.html"),/data-i18n="nav\.moon3d\.credit"/);
 // The viewer keeps its own seal; the backdrop adds none.
 assert.match(await read("moon-hd/app.js"),/NOT VALIDATED/);
 assert.doesNotMatch(await read("moon-hd/backdrop.js"),/NOT VALIDATED|NÃO VALIDADO/);
});

test("every published Moon HD file is in the asset registry and the licence matrix with its real SHA-256",async()=>{
 const registry=JSON.parse(await readFile(path.join(web,"..","data","ASSET_REGISTRY.json"),"utf8")).assets;
 const matrix=await readFile(path.join(web,"..","docs","ASSET_LICENSE_MATRIX.md"),"utf8");
 const names=(await readdir(path.join(web,"data","moonhd"))).filter(n=>!n.startsWith("."));
 assert.equal(names.length,12);
 for(const name of names){
  const bytes=await readFile(path.join(web,"data","moonhd",name)),sha=createHash("sha256").update(bytes).digest("hex");
  const entry=registry.find(a=>a.file_url==="web/data/moonhd/"+name);
  assert.ok(entry,name+" is registered");
  assert.equal(entry.sha256,sha,name);assert.equal(entry.bytes,bytes.length,name);
  assert.match(entry.asset_id,/^braspace-moonhd-/);
  assert.ok(entry.author_credit&&entry.source_page&&entry.redistribution_status&&entry.scientific_role,name);
  assert.ok(matrix.includes(sha)&&matrix.includes(entry.asset_id)&&matrix.includes("`"+entry.redistribution_status+"`"),name+" has a matrix row");
 }
});

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("local preview serves the backdrop module, its stylesheet and the shared scene",async()=>{
 for(const [route,type] of [["/moon-hd/backdrop.js","text/javascript"],["/moon-hd/backdrop.css","text/css"],["/moon-hd/scene.js","text/javascript"],
  ["/data/moonhd/south_pole_320m.bin","application/octet-stream"],["/data/moonhd/stars_4k.jpg","image/jpeg"],["/data/moonhd/ephemeris.bin","application/octet-stream"]]){
  const res=await fetch(base+route,{method:"HEAD"});
  assert.equal(res.status,200,route);assert.ok(res.headers.get("content-type").startsWith(type),route);
 }
 // Pages keep the strict style policy except the cockpit, which already allowed inline CSS before the backdrop.
 for(const page of ["/","/moonproof/","/moonproof/evidence.html","/classic.html"])
  assert.match((await fetch(base+page,{method:"HEAD"})).headers.get("content-security-policy"),/style-src 'self'(;|$)/,page);
});
