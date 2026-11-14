// Original BRASPACE visualization; no NASA terrain/ephemeris calculations.
// NASA SVS imagery is for aesthetics. Scientific horizon MUST use NASA LOLA DEM.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js";

const textureURL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg";
const radians = d => d * Math.PI / 180;
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));

function proceduralFallback() {
  // Deterministic training-only gray texture. Never present as lunar terrain data.
  const canvas=document.createElement("canvas");
  canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext("2d");
  const fill=ctx.createLinearGradient(0,0,0,canvas.height);
  fill.addColorStop(0,"#77808d");fill.addColorStop(.5,"#9da7af");fill.addColorStop(1,"#687384");
  ctx.fillStyle=fill;ctx.fillRect(0,0,canvas.width,canvas.height);
  let seed=2026;
  function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<600;i++){
    const x=rand()*1024,y=rand()*512,r=2+rand()*22;
    ctx.beginPath();ctx.ellipse(x,y,r,r*.67,0,0,Math.PI*2);
    ctx.fillStyle="rgba(35,45,60,"+(0.03+rand()*.10)+")";ctx.fill();
    ctx.beginPath();ctx.ellipse(x-1,y-1,r*.87,r*.6,0,0,Math.PI*2);
    ctx.strokeStyle="rgba(235,239,245,"+(0.03+rand()*.12)+")";
    ctx.lineWidth=2;ctx.stroke();
  }
  const t=new THREE.CanvasTexture(canvas);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

export async function createMoon(stage,status) {
  if(!THREE.WebGLRenderer)throw new Error("WebGL unavailable");
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.55;
  renderer.setClearColor(0x000000,0);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(43,1,.1,100);
  camera.position.set(0,-1.35,5.4);camera.lookAt(0,0,0);
  const globe=new THREE.Group();scene.add(globe);
  const surface=new THREE.Mesh(
    new THREE.SphereGeometry(1.65,96,64),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,map:proceduralFallback()})
  );
  globe.add(surface);
  const ambient=new THREE.HemisphereLight(0xcee7ff,0x101c2b,1.75);scene.add(ambient);
  const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(-3.5,2.5,5);scene.add(light);
  const rim=new THREE.PointLight(0x2b9ab6,40,22);rim.position.set(3,-2,-3);scene.add(rim);
  const markers=new THREE.Group();globe.add(markers);
  globe.rotation.set(.32,.5,0);
  function showTexture(){
    const loader=new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(textureURL,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
      const prev=surface.material.map;surface.material.map=texture;surface.material.needsUpdate=true;
      if(prev&&prev!==texture)prev.dispose();
      status.textContent="NASA SVS LROC visual texture · not terrain science";
      render();
    },undefined,()=>{
      status.textContent="Illustrative texture fallback · NASA image unavailable";
    });
  }
  const lonLat=(lat,lon)=>{
    // Approximate visual pin placement on a rendered sphere (NOT precision
    // geodesy): coordinate frames and pole orientation await science review.
    const theta=radians(90-lat),phi=radians(lon+180);
    return new THREE.Vector3(-1.68*Math.sin(theta)*Math.cos(phi),
      1.68*Math.cos(theta),1.68*Math.sin(theta)*Math.sin(phi));
  };
  function setSites(sites){
    while(markers.children.length){
      const o=markers.children[0];markers.remove(o);o.geometry?.dispose();o.material?.dispose();
    }
    for(const site of (sites||[]).slice(0,25)){
      const lat=Number(site.coordinate?.latitude_deg),lon=Number(site.coordinate?.longitude_deg);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90)continue;
      const pin=new THREE.Mesh(new THREE.SphereGeometry(.027,12,8),new THREE.MeshBasicMaterial({color:0x72edff}));
      pin.position.copy(lonLat(lat,lon));pin.userData={id:site.id,name:site.name};
      markers.add(pin);
    }
    render();
  }
  function render(){renderer.render(scene,camera)}
  function resize(){
    const box=stage.getBoundingClientRect();
    const w=Math.max(200,box.width),h=Math.max(220,box.height);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();render();
  }
  let dragging=false,lastX=0,lastY=0;
  function pointerDown(e){if(e.target.closest("button"))return;dragging=true;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture?.(e.pointerId);}
  function pointerMove(e){
    if(!dragging)return;
    const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
    globe.rotation.y+=dx*.005;
    globe.rotation.x=clamp(globe.rotation.x+dy*.004,-Math.PI,Math.PI);
    render();
  }
  function pointerUp(){dragging=false}
  function wheel(e){e.preventDefault();camera.position.multiplyScalar(e.deltaY>0?1.07:.93);const distance=camera.position.length();camera.position.multiplyScalar(clamp(distance,2.75,9)/distance);render();}
  function keyDown(e){
    const step=.09;
    if(e.key==="ArrowLeft")globe.rotation.y-=step;
    else if(e.key==="ArrowRight")globe.rotation.y+=step;
    else if(e.key==="ArrowUp")globe.rotation.x-=step;
    else if(e.key==="ArrowDown")globe.rotation.x+=step;
    else return;
    e.preventDefault();render();
  }
  const reset=()=>{
    camera.position.set(0,-1.35,5.4);camera.lookAt(0,0,0);
    globe.rotation.set(.32,.5,0);render();
  };
  function focus(latitude,longitude){
    // Navigation aid only; position remains unverified against UV orientation.
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
    globe.rotation.y= -radians(longitude)/1.3 + .2;
    globe.rotation.x=clamp(-radians(latitude)*.42,-1.2,1.2);
    render();
  }
  stage.addEventListener("pointerdown",pointerDown);
  stage.addEventListener("pointermove",pointerMove);
  stage.addEventListener("pointerup",pointerUp);
  stage.addEventListener("pointercancel",pointerUp);
  stage.addEventListener("wheel",wheel,{passive:false});
  stage.addEventListener("keydown",keyDown);
  stage.insertBefore(renderer.domElement,stage.firstChild);
  const observer=new ResizeObserver(resize);observer.observe(stage);
  resize();showTexture();
  return {reset,focus,setSites,dispose(){
    observer.disconnect();stage.removeEventListener("pointerdown",pointerDown);
    stage.removeEventListener("pointermove",pointerMove);stage.removeEventListener("pointerup",pointerUp);
    stage.removeEventListener("pointercancel",pointerUp);stage.removeEventListener("wheel",wheel);
    stage.removeEventListener("keydown",keyDown);
    surface.geometry.dispose();surface.material.map?.dispose();surface.material.dispose();
    renderer.dispose();renderer.domElement.remove();
  }};
}
