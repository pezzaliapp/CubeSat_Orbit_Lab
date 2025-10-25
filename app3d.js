/* Three.js 3D mode (with 2D fallback) */
const badge = document.getElementById('modeBadge');
const view3d = document.getElementById('view3d');
const view2d = document.getElementById('view2d');
const toggle3d = document.getElementById('toggle3d');

async function start(){
  if (!toggle3d.checked) { activate2D(); return; }
  try{
    const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
    await init3D(THREE);
  }catch(e){
    console.warn('3D import failed, falling back to 2D', e);
    activate2D();
  }
}
toggle3d.addEventListener('change', ()=>{
  if (toggle3d.checked){ location.reload(); } else { activate2D(); }
});

function activate2D(){
  badge.textContent = '2D';
  view2d.hidden = false;
  view3d.hidden = true;
  const s = document.createElement('script');
  s.src = 'app2d.js'; document.body.appendChild(s);
}

async function init3D(THREE){
  badge.textContent = '3D';
  view3d.hidden = false;
  view2d.hidden = true;

  // Renderer
  const renderer = new THREE.WebGLRenderer({canvas:view3d, antialias:true});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  resize();
  window.addEventListener('resize', resize);
  function resize(){
    const r = view3d.getBoundingClientRect();
    const dpr = window.devicePixelRatio||1;
    renderer.setSize(r.width*dpr, r.width*dpr*9/16, false);
  }

  // Scene & camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1022);
  const camera = new THREE.PerspectiveCamera(50, 16/9, 1, 1e9);
  camera.position.set(0, 2.8*R_EARTH, 2.8*R_EARTH);
  camera.lookAt(0,0,0);

  // Lights (sun + fill)
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(1,0.2,0.5).normalize();
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x405070, 0.5));

  // Earth
  const texLoader = new THREE.TextureLoader();
  const dayTex = texLoader.load('textures/earth_day.png');
  const earthMat = new THREE.MeshPhongMaterial({map: dayTex, shininess: 5});
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 64, 64), earthMat);
  scene.add(earth);

  // Atmosphere (thin)
  const atmoMat = new THREE.MeshPhongMaterial({ color:0x6eb7ff, transparent:true, opacity:0.08, side:THREE.BackSide });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH*1.03, 48, 48), atmoMat);
  scene.add(atmo);

  // Orbit line
  const orbitGeom = new THREE.BufferGeometry();
  const orbitLine = new THREE.Line(orbitGeom, new THREE.LineBasicMaterial({color:0x60a5fa}));
  scene.add(orbitLine);

  // CubeSat mesh
  const satGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(700000,700000,700000), new THREE.MeshPhongMaterial({color:0xeaf1ff}));
  const panelMat = new THREE.MeshPhongMaterial({color:0x60a5fa});
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(500000,200000,200000), panelMat); p1.position.x = -900000;
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(500000,200000,200000), panelMat); p2.position.x =  900000;
  satGroup.add(body,p1,p2);
  scene.add(satGroup);

  // Physics (Kepler + params) — mirror of 2D
  const R_EARTH = 6371e3, MU = 3.986004418e14, RHO0=1.225, Hs=8500;
  let t=0, running=false, timescale=5, trailMax=800, useDrag=false, CdA_over_m=0.02;
  let perigeeAlt=400e3, apogeeAlt=400e3, inclDeg=51, raanDeg=0, argpDeg=0, m0Deg=0;
  const hud = document.getElementById('hud');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause= document.getElementById('btnPause');
  const btnReset= document.getElementById('btnReset');
  const btnExport= document.getElementById('btnExport');
  const el = {
    per: document.getElementById('perigee'), apo: document.getElementById('apogee'),
    incl: document.getElementById('incl'), raan: document.getElementById('raan'),
    argp: document.getElementById('argp'), m0: document.getElementById('m0'),
    ts: document.getElementById('timescale'), trail: document.getElementById('trail'),
    perV: document.getElementById('perigeeVal'), apoV: document.getElementById('apogeeVal'),
    inclV: document.getElementById('inclVal'), raanV: document.getElementById('raanVal'),
    argpV: document.getElementById('argpVal'), m0V: document.getElementById('m0Val'),
    tsV: document.getElementById('timescaleVal'), trailV: document.getElementById('trailVal'),
    scenario: document.getElementById('scenario'), drag: document.getElementById('drag'),
    cda: document.getElementById('cda'), cdaV: document.getElementById('cdaVal'),
    showAxes: document.getElementById('showAxes'), showOrbit: document.getElementById('showOrbit'),
    atmo: document.getElementById('atmo'), shadow: document.getElementById('shadow')
  };
  let trail = []; let logSamples=[];
  function clamp(v,a,b){return v<a?a:(v>b?b:v)} function toRad(d){return d*Math.PI/180}
  function vec3(x,y,z){return new THREE.Vector3(x,y,z)}
  function derive(){
    const rp=R_EARTH+perigeeAlt, ra=R_EARTH+apogeeAlt;
    const a=.5*(rp+ra), e=(ra-rp)/(ra+rp);
    return {a:a,e:e,i:toRad(inclDeg),raan:toRad(raanDeg),argp:toRad(argpDeg),M0:toRad(m0Deg)};
  }
  function keplerState(a,e,i,raan,argp,M0,t){
    const n=Math.sqrt(MU/Math.pow(a,3)); let M=(M0+n*t)%(2*Math.PI); let E=M;
    for(let k=0;k<10;k++){const f=E-e*Math.sin(E)-M,fp=1-e*Math.cos(E);E-=f/fp}
    const cE=Math.cos(E), sE=Math.sin(E), fac=Math.sqrt(1-e*e), nu=Math.atan2(fac*sE, cE-e), r=a*(1-e*cE);
    const x=r*Math.cos(nu), y=r*Math.sin(nu);
    const cO=Math.cos(raan), sO=Math.sin(raan), ci=Math.cos(i), si=Math.sin(i), co=Math.cos(argp), so=Math.sin(argp);
    const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R31=so*si, R32=co*si, R33=ci;
    const X=R11*x+R12*y, Y=R21*x+R22*y, Z=R31*x+R32*y;
    return new THREE.Vector3(X,Y,Z);
  }
  function sync(){
    perigeeAlt=parseFloat(el.per.value)*1000;
    apogeeAlt =parseFloat(el.apo.value)*1000;
    inclDeg   =parseFloat(el.incl.value);
    raanDeg   =parseFloat(el.raan.value);
    argpDeg   =parseFloat(el.argp.value);
    m0Deg     =parseFloat(el.m0.value);
    timescale =parseFloat(el.ts.value);
    trailMax  =parseInt(el.trail.value,10);
    useDrag   =el.drag.checked;
    CdA_over_m=parseFloat(el.cda.value);
    el.perV.textContent=(perigeeAlt/1000).toFixed(0);
    el.apoV.textContent=(apogeeAlt/1000).toFixed(0);
    el.inclV.textContent=inclDeg.toFixed(0);
    el.raanV.textContent=raanDeg.toFixed(0);
    el.argpV.textContent=argpDeg.toFixed(0);
    el.m0V.textContent=m0Deg.toFixed(0);
    el.tsV.textContent=timescale.toFixed(1)+'×';
    el.trailV.textContent=trailMax.toFixed(0);
    el.cdaV.textContent=CdA_over_m.toFixed(3);
    trail=[]; logSamples=[];
  }
  ['input','change'].forEach(evt=>{
    ['per','apo','incl','raan','argp','m0','ts','trail','cda'].forEach(k=>el[k].addEventListener(evt, sync));
    el.drag.addEventListener(evt, sync);
  });
  el.scenario.addEventListener('change', ()=>{
    const v = el.scenario.value;
    if (v==='launch'){ el.per.value=200; el.apo.value=400; el.incl.value=51; el.raan.value=0; el.argp.value=0; el.m0.value=0; el.ts.value=3; el.trail.value=600; }
    else if (v==='leo'){ el.per.value=400; el.apo.value=400; el.incl.value=51; el.raan.value=0; el.argp.value=0; el.m0.value=0; el.ts.value=5; el.trail.value=1200; }
    else if (v==='ellipse'){ el.per.value=300; el.apo.value=800; el.incl.value=63; el.raan.value=90; el.argp.value=30; el.m0.value=0; el.ts.value=6; el.trail.value=1600; }
    else if (v==='gto'){ el.per.value=250; el.apo.value=35786; el.incl.value=27; el.raan.value=20; el.argp.value=180; el.m0.value=0; el.ts.value=60; el.trail.value=4000; }
    sync();
  });
  btnPlay.onclick=()=>{ running=true; btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); };
btnPause.onclick=()=>{ running=false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
btnReset.onclick=()=>{ running=false; t=0; trail=[]; logSamples=[]; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
window.addEventListener('keydown',(e)=>{ if(e.code==='Space'){ e.preventDefault(); running=!running; if(running){btnPlay.classList.add('primary'); btnPause.classList.remove('primary');} else {btnPause.classList.add('primary'); btnPlay.classList.remove('primary');} } });
  btnExport.onclick=()=>{
    if (logSamples.length===0){ alert('Nessun dato da esportare. Premi PLAY.'); return; }
    const header='t_s,x_m,y_m,z_m,alt_km\n'; const lines=[header, ...logSamples.map(r=>r.join(','))];
    const blob=new Blob(lines,{type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='cubesat_telemetry.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  sync();

  // Animation state
  let last=performance.now()/1000;
  function animate(){
    requestAnimationFrame(animate);
    const now=performance.now()/1000, dt=Math.min(0.05, now-last); last=now;
    if (running) { t += dt*timescale; }

    // Sun rotation & lighting
    sunLight.position.set(Math.cos(now*0.05), 0.2, Math.sin(now*0.05)).normalize();

    const e = derive();
    const pos = keplerState(e.a,e.e,e.i,e.raan,e.argp,e.M0,t);
    earth.rotation.y += 0.0002;

    if (running){
      trail.push(pos.clone());
      if (trail.length>trailMax) trail.shift();
      const alt = pos.length() - R_EARTH;
      logSamples.push([t.toFixed(2), pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1), (alt/1000).toFixed(2)]);
      if (logSamples.length>50000) logSamples.shift();
    }

    // Update orbit line
    if (trail.length>1){
      const arr = new Float32Array(trail.length*3);
      for (let i=0;i<trail.length;i++){ const p=trail[i]; arr[i*3]=p.x; arr[i*3+1]=p.y; arr[i*3+2]=p.z; }
      orbitGeom.setAttribute('position', new THREE.BufferAttribute(arr,3));
      orbitGeom.computeBoundingSphere();
      orbitLine.visible = el.showOrbit.checked;
    }else{
      orbitLine.visible = false;
    }

    // Update satellite mesh
    satGroup.position.copy(pos);

    // HUD
    const altkm = ((pos.length()-R_EARTH)/1000).toFixed(0);
    const a_km = (e.a/1000).toFixed(0);
    const estr = e.e.toFixed(3);
    hud.textContent = `3D | t=${t.toFixed(1)}s | alt=${altkm}km | a=${a_km}km | e=${estr} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}°`;

    renderer.render(scene, camera);
  }
  animate();
}

const R_EARTH = 6371e3; // for camera init before module loaded
start();