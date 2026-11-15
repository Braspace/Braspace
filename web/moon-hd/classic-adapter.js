// Classic uses the same Joel Moon HD meshes, assets and light frame as the viewer.
// Camera orbit (never rotate the terrain), on-demand rendering, one GPU context.
import * as E from "./ephemeris.js";
import {probeWebGL,pickAssets} from "./backdrop.js";
const BASE = new URL("../data/moonhd/",import.meta.url).href;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const cameraDirection=(lat,lon,distance)=>E.toGlobeScene(E.bodyDirection(clamp(lat,-89.8,89.8),lon)).map(x=>x*distance);
export function sceneEpoch(eph,date) {
 const parsed=Date.parse(date);
 const index=E.indexAt(eph,Number.isFinite(parsed)?parsed:Date.now());
 return {index,iso:new Date(E.timeAt(eph,index)).toISOString()};
}
export async function createMoon(stage,status,{date,onUnavailable=()=>{},signal}={}) {
 if(signal?.aborted)throw new Error("Moon HD startup cancelled");
 const probe=probeWebGL(()=>document.createElement("canvas"));
 if(!probe)throw new Error("Hardware WebGL 2 unavailable");
 const {canvas,gl}=probe;
 canvas.className="moon-hd-classic";canvas.hidden=true;canvas.setAttribute("aria-hidden","true");
 stage.prepend(canvas);
 let renderer,scene,camera,moon,cap,eph,markers,observer,dead=false;
 let lat=-84,lon=0,distance=2.65,drag=null;
 const cleanups=[],textures=new Set();
 const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);cleanups.push(()=>target.removeEventListener(type,fn,options))};
 const disposeMaterial=m=>{if(m){for(const u of Object.values(m.uniforms||{}))if(u.value?.isTexture)textures.add(u.value);m.dispose()}};
 function dispose() {
  if(dead)return;dead=true;clearTimeout(timer);observer?.disconnect();cleanups.forEach(fn=>fn());
  scene?.traverse(o=>{o.geometry?.dispose();if(o.material)disposeMaterial(o.material)});
  textures.forEach(t=>t.dispose());renderer?.dispose();canvas.remove();
 }
 const unavailable=()=>{dispose();onUnavailable()};
 const timer=setTimeout(unavailable,30000);
 if(signal)on(signal,"abort",dispose,{once:true});
 on(canvas,"webglcontextlost",e=>{e.preventDefault();unavailable()});
 const alive=()=>{if(dead)throw Error("Moon HD startup ended")};
 function draw(){
  if(dead||!camera||!cap)return;
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  camera.position.set(...cameraDirection(lat,lon,distance));camera.lookAt(0,0,0);
  S.setPolarFrame(cap,moon.lightDir,camera);renderer.render(scene,camera);
 }
 function focus(a,b){if(Number.isFinite(a)&&Number.isFinite(b)){lat=clamp(a,-89.8,89.8);lon=b;draw()}}
 function reset(){lat=-84;lon=0;distance=2.65;draw()}
 function zoom(factor){if(Number.isFinite(factor)&&factor>0){distance=clamp(distance*factor,1.35,5);draw()}}
 function setTime(value){
  if(dead||!eph)return;
  const {index,iso}=sceneEpoch(eph,value),{sun,earth}=E.pointsAt(eph,index);
  moon.lightDir.set(...E.toGlobeScene(E.bodyDirection(sun.lat,sun.lon)));
  moon.earthDir.set(...E.toGlobeScene(E.bodyDirection(earth.lat,earth.lon)));
  status.textContent="Moon HD · visual epoch "+iso.slice(0,16).replace("T"," ")+" UTC";
  draw();
 }
 function setSites(sites){
  if(dead||!markers)return;
  for(const item of [...markers.children]){markers.remove(item);item.geometry.dispose();item.material.dispose()}
  for(const site of sites||[]){
   if(!site.coordinate)continue;
   const a=Number(site.coordinate.latitude_deg),b=Number(site.coordinate.longitude_deg);
   if(site.coordinate.latitude_deg==null||site.coordinate.longitude_deg==null||!Number.isFinite(a)||!Number.isFinite(b))continue;
   const pin=new S.THREE.Mesh(new S.THREE.SphereGeometry(.006,8,8),new S.THREE.MeshBasicMaterial({color:0x2ec4a0}));
   pin.position.set(...E.toGlobeScene(E.bodyDirection(a,b)).map(x=>x*1.015));markers.add(pin);
  }draw();
 }
 let S;
 try{
  S=await import("./scene.js");alive();const {THREE}=S;
  renderer=new THREE.WebGLRenderer({canvas,context:gl});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const want=pickAssets({width:stage.clientWidth,maxTextureSize:renderer.capabilities.maxTextureSize});
  const manifest=await S.fetchJSON(BASE+"manifest.json");alive();
  const load=S.textureLoader(renderer,BASE);
  const tex=async(name,srgb)=>{const t=await load(name,srgb);if(dead){t.dispose();throw Error("Moon HD startup ended")}textures.add(t);return t};
  const [buffer,colorTex,normalTex,heightTex]=await Promise.all([
   S.fetchBinary(BASE+manifest.ephemeris.file,manifest.ephemeris.count*8),
   tex(want.color,true),tex("normal_4k.jpg",false),tex("height_4k.jpg",false)]);
  alive();eph=E.decodeEphemeris(buffer,manifest.ephemeris);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.01,100);
  moon=S.createMoon({manifest,colorTex,normalTex,heightTex,lon:want.lon,lat:want.lat,steps:want.globeSteps});scene.add(moon.mesh);
  cap=await S.createCap({renderer,base:BASE,manifest,moon,segments:stage.clientWidth<720?160:256,steps:48,wideOnly:stage.clientWidth<720});
  if(dead){cap.mesh.geometry.dispose();disposeMaterial(cap.mesh.material);textures.forEach(t=>t.dispose());throw Error("Moon HD startup ended")}
  scene.add(cap.mesh);moon.uniforms.capReady.value=1;
  markers=new THREE.Group();scene.add(markers);
  setTime(date);canvas.hidden=false;draw();clearTimeout(timer);
  observer=new ResizeObserver(draw);observer.observe(stage);
  on(canvas,"pointerdown",e=>{drag=[e.pointerId,e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});
  on(canvas,"pointermove",e=>{if(drag?.[0]!==e.pointerId)return;lon-=(e.clientX-drag[1])*.35;lat=clamp(lat+(e.clientY-drag[2])*.35,-89.8,89.8);drag=[e.pointerId,e.clientX,e.clientY];draw()});
  for(const type of ["pointerup","pointercancel","lostpointercapture"])on(canvas,type,()=>drag=null);
  on(canvas,"wheel",e=>{e.preventDefault();distance=clamp(distance+e.deltaY*.002,1.35,5);draw()},{passive:false});
  on(stage,"keydown",e=>{if(e.target!==stage)return;const moves={ArrowUp:[3,0],ArrowDown:[-3,0],ArrowLeft:[0,-3],ArrowRight:[0,3]};if(moves[e.key]){e.preventDefault();focus(lat+moves[e.key][0],lon+moves[e.key][1])}});
  return {focus,reset,zoom,setSites,setTime,dispose};
 }catch(err){dispose();throw err}
}
