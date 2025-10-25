(function(){
'use strict';
const R_EARTH=6371e3, MU=3.986004418e14;
const v3=(x,y,z)=>({x,y,z}), add=(a,b)=>v3(a.x+b.x,a.y+b.y,a.z+b.z), sub=(a,b)=>v3(a.x-b.x,a.y-b.y,a.z-b.z), mul=(a,s)=>v3(a.x*s,a.y*s,a.z*s), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z, len=a=>Math.sqrt(dot(a,a)), nrm=a=>{const L=len(a); return L>0?mul(a,1/L):v3(0,0,0)};
const rad=d=>d*Math.PI/180, clamp=(v,a,b)=>v<a?a:(v>b?b:v);

const hud=document.getElementById('hud'); const HUD=s=>hud.textContent=s;
const mini=document.getElementById('miniMap'); const mctx=mini.getContext('2d');
const elPer=perigee, elApo=apogee, elIncl=incl, elRAAN=raan, elArgp=argp, elM0=m0, elTS=timescale, elTrail=trail, elPerV=perigeeVal, elApoV=apogeeVal, elInclV=inclVal, elRAANV=raanVal, elArgpV=argpVal, elM0V=m0Val, elTSV=timescaleVal, elTrailV=trailVal, elScenario=scenario, elDrag=drag, elCdA=cda, elCdAV=cdaVal;
const btnPlay=btnPlay, btnPause=btnPause, btnReset=btnReset, btnExport=btnExport, btnStep=btnStep, btnCamOrbit=btnCamOrbit;

let perigeeAlt=400e3, apogeeAlt=400e3, inclDeg=51, raanDeg=0, argpDeg=0, m0Deg=0;
let timescale=5, trailMax=1200, running=true, useDrag=false, CdA_over_m=0.02;
let trail=[], logSamples=[];

let renderer, scene, camera, controls, sun, hemi, earth, starfield, cubeSat, orbitLine;
let cameraOrbit=true;
let earthRotationSpeed = (2*Math.PI)/60;

function initThree(){
  const root=document.getElementById('three-root');
  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio||1);
  renderer.setSize(root.clientWidth,root.clientHeight);
  root.appendChild(renderer.domElement);

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(55, root.clientWidth/root.clientHeight, 1, 1e9);
  camera.position.set(0, R_EARTH*4, R_EARTH*4);
  controls=new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.05;
  controls.minDistance=R_EARTH*1.2; controls.maxDistance=R_EARTH*20;

  sun=new THREE.DirectionalLight(0xffffff,1.1); sun.position.set(1,0.2,0).multiplyScalar(R_EARTH*10); scene.add(sun);
  hemi=new THREE.AmbientLight(0x223355,0.6); scene.add(hemi);

  const tl=new THREE.TextureLoader();
  const day=tl.load('assets/earth_day.png'); day.wrapS=day.wrapT=THREE.RepeatWrapping;
  const earthMat=new THREE.MeshPhongMaterial({map:day, specular:0x111111, shininess:8});
  earth=new THREE.Mesh(new THREE.SphereGeometry(R_EARTH,64,64), earthMat); scene.add(earth);

  // Equator & axis
  const eqGeo=new THREE.RingGeometry(R_EARTH*1.01, R_EARTH*1.012, 128);
  const eqMat=new THREE.MeshBasicMaterial({color:0x2a6fdb, side:THREE.DoubleSide});
  const eq=new THREE.Mesh(eqGeo, eqMat); eq.rotation.x=Math.PI/2; earth.add(eq);
  const axis=new THREE.Mesh(new THREE.CylinderGeometry(R_EARTH*0.01,R_EARTH*0.01,R_EARTH*2.2,12), new THREE.MeshBasicMaterial({color:0x9fb0d8}));
  earth.add(axis);

  const stars=tl.load('assets/starfield.jpg');
  starfield=new THREE.Mesh(new THREE.SphereGeometry(R_EARTH*100,32,32), new THREE.MeshBasicMaterial({map:stars, side:THREE.BackSide}));
  scene.add(starfield);

  const cGeo=new THREE.BoxGeometry(R_EARTH*0.03,R_EARTH*0.03,R_EARTH*0.03);
  const cMat=new THREE.MeshStandardMaterial({color:0xeaf1ff, roughness:0.6, metalness:0.1});
  cubeSat=new THREE.Mesh(cGeo,cMat); scene.add(cubeSat);
  const panelMat=new THREE.MeshBasicMaterial({color:0x60a5fa});
  const pGeo=new THREE.BoxGeometry(R_EARTH*0.02,R_EARTH*0.005,R_EARTH*0.06);
  const p1=new THREE.Mesh(pGeo,panelMat); p1.position.x=-R_EARTH*0.04; cubeSat.add(p1);
  const p2=new THREE.Mesh(pGeo,panelMat); p2.position.x= R_EARTH*0.04; cubeSat.add(p2);

  orbitLine=new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0x60a5fa}));
  scene.add(orbitLine);

  window.addEventListener('resize', onResize); onResize();
}

function onResize(){
  const root=document.getElementById('three-root');
  renderer.setSize(root.clientWidth, root.clientHeight);
  camera.aspect=root.clientWidth/root.clientHeight; camera.updateProjectionMatrix();
}

function elementsToState(a,e,i,raan,argp,M0,t){
  const n=Math.sqrt(MU/Math.pow(a,3));
  const M=(M0+n*t)%(2*Math.PI);
  let E=M; for(let k=0;k<10;k++){ const f=E - e*Math.sin(E) - M; const fp=1 - e*Math.cos(E); E -= f/fp; }
  const cE=Math.cos(E), sE=Math.sin(E), fac=Math.sqrt(1-e*e), nu=Math.atan2(fac*sE,cE-e), r=a*(1-e*cE);
  const x=r*Math.cos(nu), y=r*Math.sin(nu);
  const cO=Math.cos(raan), sO=Math.sin(raan), ci=Math.cos(i), si=Math.sin(i), co=Math.cos(argp), so=Math.sin(argp);
  const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R13=sO*si;
  const R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R23=-cO*si;
  const R31=so*si,            R32= co*si,            R33= ci;
  return v3(R11*x+R12*y, R21*x+R22*y, R31*x+R32*y);
}

function derive(){ const rp=R_EARTH+perigeeAlt, ra=R_EARTH+apogeeAlt; return {a:.5*(rp+ra), e:(ra-rp)/(ra+rp), i:rad(inclDeg), raan:rad(raanDeg), argp:rad(argpDeg), M0:rad(m0Deg)} }

function eciToLatLon(p){ const r=len(p); return {lat:Math.asin(p.y/r)*180/Math.PI, lon:Math.atan2(p.z,p.x)*180/Math.PI} }
function drawMini(p){ mctx.clearRect(0,0,mini.width,mini.height); mctx.fillStyle="#071022"; mctx.fillRect(0,0,mini.width,mini.height); mctx.strokeStyle="#12306a"; mctx.strokeRect(0,0,mini.width,mini.height); const {lat,lon}=eciToLatLon(p); const x=(lon+180)/360*mini.width, y=(90-lat)/180*mini.height; mctx.fillStyle="#60a5fa"; mctx.fillRect(x-2,y-2,4,4) }

function syncUI(){
  perigeeAlt=parseFloat(elPer.value)*1000; apogeeAlt=parseFloat(elApo.value)*1000; inclDeg=parseFloat(elIncl.value); raanDeg=parseFloat(elRAAN.value); argpDeg=parseFloat(elArgp.value); m0Deg=parseFloat(elM0.value); timescale=parseFloat(elTS.value); trailMax=parseInt(elTrail.value,10); useDrag=elDrag.checked; CdA_over_m=parseFloat(elCdA.value);
  elPerV.textContent=(perigeeAlt/1000).toFixed(0); elApoV.textContent=(apogeeAlt/1000).toFixed(0); elInclV.textContent=inclDeg.toFixed(0); elRAANV.textContent=raanDeg.toFixed(0); elArgpV.textContent=argpDeg.toFixed(0); elM0V.textContent=m0Deg.toFixed(0); elTSV.textContent=timescale.toFixed(1)+'×'; elTrailV.textContent=trailMax.toFixed(0); elCdAV.textContent=CdA_over_m.toFixed(3);
  trail=[]; logSamples=[];
}
['input','change'].forEach(evt=>[elPer,elApo,elIncl,elRAAN,elArgp,elM0,elTS,elTrail,elCdA].forEach(n=>n.addEventListener(evt,syncUI))); elDrag.addEventListener('change',syncUI);

elScenario.addEventListener('change',()=>{ const v=elScenario.value; if(v==='launch'){elPer.value=200;elApo.value=400;elIncl.value=51;elRAAN.value=0;elArgp.value=0;elM0.value=0;elTS.value=3;elTrail.value=600} else if(v==='leo'){elPer.value=400;elApo.value=400;elIncl.value=51;elRAAN.value=0;elArgp.value=0;elM0.value=0;elTS.value=5;elTrail.value=1200} else if(v==='ellipse'){elPer.value=300;elApo.value=800;elIncl.value=63;elRAAN.value=90;elArgp.value=30;elM0.value=0;elTS.value=6;elTrail.value=1600} else if(v==='gto'){elPer.value=250;elApo.value=35786;elIncl.value=27;elRAAN.value=20;elArgp.value=180;elM0.value=0;elTS.value=60;elTrail.value=4000} syncUI() });

btnPlay.onclick=()=>{running=TrueFix=1; running=true; btnPlay.classList.add('primary'); btnPause.classList.remove('primary')}
btnPause.onclick=()=>{running=false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary')}
btnReset.onclick=()=>{running=false; t=0; trail=[]; logSamples=[]; btnPause.classList.add('primary'); btnPlay.classList.remove('primary')}
btnStep.onclick=()=>{ if(!running){ t+=1*timescale } }
btnCamOrbit.onclick=()=>{ cameraOrbit=!cameraOrbit; btnCamOrbit.classList.toggle('primary', cameraOrbit) }

btnExport.onclick=()=>{ if(!logSamples.length){ alert("Nessun dato da esportare. Premi PLAY."); return; }
  const header="t_s,x_m,y_m,z_m,alt_km"; const lines=[header, ...logSamples.map(r=>r.join(","))]; const csvText=lines.join("\n"); const blob=new Blob([csvText],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download="cubesat_telemetry.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500)
};

let last=performance.now();
function loop(){
  const now=performance.now(); let dt=(now-last)/1000; last=now; dt=Math.min(dt,0.05);
  if(running){ t += dt*timescale; earth.rotation.y += (2*Math.PI/60) * dt * (timescale/5) }
  const theta=0.1*t/60*2*Math.PI; if(sun) sun.position.set(Math.cos(theta),0.2,Math.sin(theta)).multiplyScalar(R_EARTH*10);

  const E=derive(); let pos;
  if (elScenario.value==='launch'){ const k=clamp(t/120,0,1); pos=elementsToState(E.a,E.e*k,E.i*k,E.raan*k,E.argp*k,E.M0*k,t) }
  else { pos=elementsToState(E.a,E.e,E.i,E.raan,E.argp,E.M0,t) }

  cubeSat.position.set(pos.x,pos.y,pos.z);
  if(running){ trail.push(pos); if(trail.length>trailMax) trail.shift(); const alt=len(pos)-R_EARTH; logSamples.push([t.toFixed(2),pos.x.toFixed(1),pos.y.toFixed(1),pos.z.toFixed(1),(alt/1000).toFixed(2)]); if(logSamples.length>50000) logSamples.shift() }

  if(trail.length>1){
    const N=trail.length; const arr=new Float32Array(N*3); for(let i=0;i<N;i++){ const p=trail[i]; arr[i*3]=p.x; arr[i*3+1]=p.y; arr[i*3+2]=p.z }
    orbitLine.geometry.dispose(); orbitLine.geometry=new THREE.BufferGeometry(); orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr,3));
  }

  if(cameraOrbit&&running){ const ang=0.15*dt, x=camera.position.x, z=camera.position.z, ca=Math.cos(ang), sa=Math.sin(ang); camera.position.x=x*ca - z*sa; camera.position.z=x*sa + z*ca; camera.lookAt(0,0,0) }

  const alt=len(pos)-R_EARTH; HUD(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}°`);
  const {lat,lon}=eciToLatLon(pos); drawMini(pos);

  controls.update(); renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

function boot(){
  initThree(); syncUI(); requestAnimationFrame(loop);
  setTimeout(()=>document.getElementById('splash').classList.add('hide'), 1200);
}

boot();
})();