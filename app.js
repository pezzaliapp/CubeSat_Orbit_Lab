/* CubeSat Orbit Lab — GOLDEN (Three.js, no-Controls, Kepler + Drag RK2) */
(function(){
'use strict';

/* ==== Fisica/Math ==== */
const R_EARTH=6371e3, MU=3.986004418e14;
const RHO0=1.225, Hs=8500.0;
const v3=(x,y,z)=>({x,y,z}), add=(a,b)=>v3(a.x+b.x,a.y+b.y,a.z+b.z), sub=(a,b)=>v3(a.x-b.x,a.y-b.y,a.z-b.z),
      mul=(a,s)=>v3(a.x*s,a.y*s,a.z*s), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z, len=a=>Math.sqrt(dot(a,a)),
      nrm=a=>{const L=len(a); return L>0?mul(a,1/L):v3(0,0,0)};
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI, clamp=(v,a,b)=>v<a?a:(v>b?b:v);

/* ==== DOM ==== */
const $=id=>document.getElementById(id);
const hud=$('hud'), HUD=s=>hud.textContent=s, mini=$('miniMap'), mctx=mini.getContext('2d');
const elPer=$('perigee'), elApo=$('apogee'), elIncl=$('incl'), elRAAN=$('raan'), elArgp=$('argp'), elM0=$('m0'),
      elTS=$('timescale'), elTrail=$('trail'), elScenario=$('scenario'), elDrag=$('drag'), elCdA=$('cda');
const elPerV=$('perigeeVal'), elApoV=$('apogeeVal'), elInclV=$('inclVal'), elRAANV=$('raanVal'), elArgpV=$('argpVal'), elM0V=$('m0Val'),
      elTSV=$('timescaleVal'), elTrailV=$('trailVal'), elCdAV=$('cdaVal');
const btnPlay=$('btnPlay'), btnPause=$('btnPause'), btnReset=$('btnReset'), btnExport=$('btnExport'), btnStep=$('btnStep'), btnCam=$('btnCamOrbit');

/* ==== Stato ==== */
let perigeeAlt=400e3, apogeeAlt=400e3, inclDeg=51, raanDeg=0, argpDeg=0, m0Deg=0;
let timescale=5, trailMax=1200, running=true, useDrag=false, CdA_over_m=0.02;
let trail=[], logSamples=[];

/* ==== Three minimal senza OrbitControls ==== */
let renderer, scene, camera, sun, hemi, earth, starPts, cubeSat, orbitLine;
let cameraOrbit=true, camR=R_EARTH*6, camTheta=0.9, camPhi=0.7; // sferiche

function camFromSpherical(){
  const x=camR*Math.cos(camPhi)*Math.cos(camTheta);
  const y=camR*Math.sin(camPhi);
  const z=camR*Math.cos(camPhi)*Math.sin(camTheta);
  camera.position.set(x,y,z);
  camera.lookAt(0,0,0);
}

function initThree(){
  const root=document.getElementById('three-root');
  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio||1);
  renderer.setSize(root.clientWidth, root.clientHeight);
  root.appendChild(renderer.domElement);

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(55, root.clientWidth/root.clientHeight, 1, 1e9);
  camFromSpherical(); scene.add(camera);

  sun=new THREE.DirectionalLight(0xffffff,1.1);
  sun.position.set(1,0.2,0).multiplyScalar(R_EARTH*10); scene.add(sun);
  hemi=new THREE.AmbientLight(0x223355,0.6); scene.add(hemi);

  earth=new THREE.Mesh(new THREE.SphereGeometry(R_EARTH,64,64),
                       new THREE.MeshPhongMaterial({color:0x12306a,specular:0x111111,shininess:8}));
  scene.add(earth);
  const eq=new THREE.Mesh(new THREE.RingGeometry(R_EARTH*1.01,R_EARTH*1.012,128),
                          new THREE.MeshBasicMaterial({color:0x2a6fdb, side:THREE.DoubleSide}));
  eq.rotation.x=Math.PI/2; earth.add(eq);
  const axis=new THREE.Mesh(new THREE.CylinderGeometry(R_EARTH*0.01,R_EARTH*0.01,R_EARTH*2.2,12),
                            new THREE.MeshBasicMaterial({color:0x9fb0d8}));
  earth.add(axis);

  // stelle procedurali
  {
    const N=4000, R=R_EARTH*80, arr=new Float32Array(N*3);
    for(let i=0;i<N;i++){ const u=Math.random(), v=Math.random(), th=2*Math.PI*u, ph=Math.acos(2*v-1);
      arr[i*3]=R*Math.sin(ph)*Math.cos(th);
      arr[i*3+1]=R*Math.cos(ph);
      arr[i*3+2]=R*Math.sin(ph)*Math.sin(th);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr,3));
    starPts=new THREE.Points(g, new THREE.PointsMaterial({size:R_EARTH*0.01,color:0xffffff}));
    scene.add(starPts);
  }

  // cubesat
  const body=new THREE.Mesh(new THREE.BoxGeometry(R_EARTH*0.03,R_EARTH*0.03,R_EARTH*0.03),
                            new THREE.MeshStandardMaterial({color:0xeaf1ff,roughness:0.6,metalness:0.1}));
  const pMat=new THREE.MeshBasicMaterial({color:0x60a5fa});
  const pGeo=new THREE.BoxGeometry(R_EARTH*0.02,R_EARTH*0.005,R_EARTH*0.06);
  const p1=new THREE.Mesh(pGeo,pMat); p1.position.x=-R_EARTH*0.04; body.add(p1);
  const p2=new THREE.Mesh(pGeo,pMat); p2.position.x= R_EARTH*0.04; body.add(p2);
  cubeSat=body; scene.add(cubeSat);

  orbitLine=new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0x60a5fa}));
  scene.add(orbitLine);

  window.addEventListener('resize', onResize);
  onResize();
}

function onResize(){
  const root=document.getElementById('three-root');
  renderer.setSize(root.clientWidth, root.clientHeight);
  camera.aspect=root.clientWidth/root.clientHeight; camera.updateProjectionMatrix();
}

/* ==== Orbite ==== */
function elementsToState(a,e,i,raan,argp,M0,t){
  const n=Math.sqrt(MU/Math.pow(a,3)), M=(M0+n*t)%(2*Math.PI);
  let E=M; for(let k=0;k<12;k++){ const f=E-e*Math.sin(E)-M, fp=1-e*Math.cos(E); E-=f/fp; }
  const cE=Math.cos(E), sE=Math.sin(E), fac=Math.sqrt(1-e*e), nu=Math.atan2(fac*sE, cE-e), r=a*(1-e*cE);
  const x=r*Math.cos(nu), y=r*Math.sin(nu);
  const cO=Math.cos(raan), sO=Math.sin(raan), ci=Math.cos(i), si=Math.sin(i), co=Math.cos(argp), so=Math.sin(argp);
  const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R31=so*si, R32=co*si;
  return v3(R11*x+R12*y, R21*x+R22*y, R31*x+R32*y);
}
function elementsToStateVel(a,e,i,raan,argp,M0,t){
  const n=Math.sqrt(MU/Math.pow(a,3)), M=(M0+n*t)%(2*Math.PI);
  let E=M; for(let k=0;k<12;k++){ const f=E-e*Math.sin(E)-M, fp=1-e*Math.cos(E); E-=f/fp; }
  const cE=Math.cos(E), sE=Math.sin(E), fac=Math.sqrt(1-e*e), nu=Math.atan2(fac*sE, cE-e), r=a*(1-e*cE);
  const x=r*Math.cos(nu), y=r*Math.sin(nu); const xpf=x, ypf=y;
  const vxpf = -Math.sqrt(MU*a)/r * sE; const vypf =  Math.sqrt(MU*a)/r * fac * cE;
  const cO=Math.cos(raan), sO=Math.sin(raan), ci=Math.cos(i), si=Math.sin(i), co=Math.cos(argp), so=Math.sin(argp);
  const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R31=so*si, R32=co*si;
  return { r:v3(R11*xpf+R12*ypf, R21*xpf+R22*ypf, R31*xpf+R32*ypf),
           v:v3(R11*vxpf+R12*vypf, R21*vxpf+R22*vypf, R31*vxpf+R32*vypf) };
}
function derive(){ const rp=R_EARTH+perigeeAlt, ra=R_EARTH+apogeeAlt; return {a:0.5*(rp+ra), e:(ra-rp)/(ra+rp), i:rad(inclDeg), raan:rad(raanDeg), argp:rad(argpDeg), M0:rad(m0Deg)} }

/* ==== Drag numerico ==== */
const dyn={r:v3(R_EARTH+400e3,0,0), v:v3(0,0,0)};
function accel(r,v){
  const rmag=len(r), aG=mul(r, -MU/(rmag*rmag*rmag));
  if(!useDrag) return aG;
  const h=Math.max(0, rmag-R_EARTH), rho=RHO0*Math.exp(-h/Hs);
  const vmag=Math.max(1e-3, len(v)), aD=mul(nrm(v), -0.5 * CdA_over_m * rho * vmag*vmag);
  return add(aG, aD);
}

/* ==== Mini ground-track ==== */
function eciToLatLon(p){ const r=len(p); return {lat:deg(Math.asin(p.y/r)), lon:deg(Math.atan2(p.z,p.x))}; }
function drawMini(p){
  mctx.clearRect(0,0,mini.width,mini.height);
  mctx.fillStyle="#071022"; mctx.fillRect(0,0,mini.width,mini.height);
  mctx.strokeStyle="#12306a"; mctx.strokeRect(0,0,mini.width,mini.height);
  const {lat,lon}=eciToLatLon(p); const x=(lon+180)/360*mini.width, y=(90-lat)/180*mini.height;
  mctx.fillStyle="#60a5fa"; mctx.fillRect(x-2,y-2,4,4);
}

/* ==== UI ==== */
function syncUI(){
  perigeeAlt=+elPer.value*1000; apogeeAlt=+elApo.value*1000;
  inclDeg=+elIncl.value; raanDeg=+elRAAN.value; argpDeg=+elArgp.value; m0Deg=+elM0.value;
  timescale=+elTS.value; trailMax=parseInt(elTrail.value,10);
  useDrag=!!elDrag.checked; CdA_over_m=+elCdA.value;
  elPerV.textContent=(perigeeAlt/1000).toFixed(0); elApoV.textContent=(apogeeAlt/1000).toFixed(0);
  elInclV.textContent=inclDeg.toFixed(0); elRAANV.textContent=raanDeg.toFixed(0);
  elArgpV.textContent=argpDeg.toFixed(0); elM0V.textContent=m0Deg.toFixed(0);
  elTSV.textContent=timescale.toFixed(1)+'×'; elTrailV.textContent=trailMax.toFixed(0); elCdAV.textContent=CdA_over_m.toFixed(3);
  trail=[]; logSamples=[];
  if(useDrag){ const E=derive(); const sv=elementsToStateVel(E.a,E.e,E.i,E.raan,E.argp,E.M0,0); dyn.r=sv.r; dyn.v=sv.v; }
}
['input','change'].forEach(evt=>[elPer,elApo,elIncl,elRAAN,elArgp,elM0,elTS,elTrail,elCdA].forEach(n=>n.addEventListener(evt,syncUI)));
elDrag.addEventListener('change',syncUI);
elScenario.addEventListener('change',()=>{
  const v=elScenario.value;
  if(v==='launch'){ elPer.value=200; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0; elTS.value=3;  elTrail.value=600;  }
  if(v==='leo'){    elPer.value=400; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0; elTS.value=5;  elTrail.value=1200; }
  if(v==='ellipse'){elPer.value=300; elApo.value=800; elIncl.value=63; elRAAN.value=90; elArgp.value=30; elM0.value=0; elTS.value=6;  elTrail.value=1600; }
  if(v==='gto'){    elPer.value=250; elApo.value=35786; elIncl.value=27; elRAAN.value=20; elArgp.value=180; elM0.value=0; elTS.value=60; elTrail.value=4000; }
  syncUI();
});

/* ==== Bottoni ==== */
btnPlay.onclick=()=>{ running=true;  btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); };
btnPause.onclick=()=>{ running=false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
btnReset.onclick=()=>{ running=false; t=0; trail=[]; logSamples=[]; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
btnStep.onclick =()=>{ if(!running) t+=1*timescale; };
btnCam.onclick  =()=>{ cameraOrbit=!cameraOrbit; btnCam.classList.toggle('primary',cameraOrbit); };
btnExport.onclick=()=>{
  if(!logSamples.length){ alert('Nessun dato da esportare. Premi PLAY.'); return; }
  const header='t_s,x_m,y_m,z_m,alt_km,speed_mps';
  const lines=[header, ...logSamples.map(r=>r.join(','))];
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download='cubesat_telemetry.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
};
window.addEventListener('keydown',e=>{
  if(e.code==='Space'){ e.preventDefault(); running=!running;
    if(running){ btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); }
    else      { btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); }
  }
});

/* ==== Loop ==== */
let t=0, last=performance.now();
function loop(){
  const now=performance.now(); let dt=(now-last)/1000; last=now; dt=Math.min(dt,0.05);

  // luce solare e rotazione Terra
  const th=0.1*t/60*2*Math.PI; sun.position.set(Math.cos(th),0.2,Math.sin(th)).multiplyScalar(R_EARTH*10);
  if(running){ t+=dt*timescale; earth.rotation.y += (2*Math.PI/60) * dt * (timescale/5); }

  // stato orbita
  const E=derive(); let pos, vel, spd;
  if(elScenario.value==='launch' && !useDrag){
    const k=clamp(t/120,0,1); const sv=elementsToStateVel(E.a,E.e*k,E.i*k,E.raan*k,E.argp*k,E.M0*k,t); pos=sv.r; vel=sv.v; spd=len(vel);
  } else if(!useDrag){
    const sv=elementsToStateVel(E.a,E.e,E.i,E.raan,E.argp,E.M0,t); pos=sv.r; vel=sv.v; spd=len(vel);
  } else {
    const substeps=Math.max(1, Math.floor(timescale)); const h=(dt*timescale)/substeps;
    if(running){ for(let s=0;s<substeps;s++){ const a1=accel(dyn.r,dyn.v); const rv=add(dyn.r,mul(dyn.v,h*0.5)); const vv=add(dyn.v,mul(a1,h*0.5)); const a2=accel(rv,vv); dyn.r=add(dyn.r,mul(vv,h)); dyn.v=add(dyn.v,mul(a2,h)); } }
    pos=dyn.r; vel=dyn.v; spd=len(vel);
  }

  cubeSat.position.set(pos.x,pos.y,pos.z);

  if(running){
    trail.push(pos); if(trail.length>trailMax) trail.shift();
    const alt=len(pos)-R_EARTH;
    logSamples.push([t.toFixed(2),pos.x.toFixed(2),pos.y.toFixed(2),pos.z.toFixed(2),(alt/1000).toFixed(2),spd.toFixed(2)]);
    if(logSamples.length>60000) logSamples.shift();
  }
  if(trail.length>1){
    const N=trail.length, arr=new Float32Array(N*3);
    for(let i=0;i<N;i++){ const p=trail[i]; arr[i*3]=p.x; arr[i*3+1]=p.y; arr[i*3+2]=p.z; }
    orbitLine.geometry.dispose(); orbitLine.geometry=new THREE.BufferGeometry();
    orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr,3));
  }

  // camera orbit autonoma (niente OrbitControls)
  if(cameraOrbit && running){ camTheta += 0.15*dt; camFromSpherical(); }

  // HUD + mini
  const alt=len(pos)-R_EARTH;
  HUD(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}° | v=${spd.toFixed(0)} m/s`);
  drawMini(pos);

  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

/* ==== Boot ==== */
function boot(){ initThree(); syncUI(); requestAnimationFrame(loop); setTimeout(()=>document.getElementById('splash')?.classList.add('hide'),700); }
boot();
})();
