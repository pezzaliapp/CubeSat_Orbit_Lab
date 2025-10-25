/* CubeSat Orbit Lab — Golden Build (Three.js)
   by pezzaliAPP — Keplero + Drag opzionale + Rotazione terrestre
   Compatibile con index.html “Golden” 25/10/2025
*/

(() => {
  'use strict';

  // === costanti fisiche ===
  const R_EARTH = 6371e3;
  const MU = 3.986004418e14;
  const RHO0 = 1.225, Hs = 8500;
  const DEG = Math.PI / 180;

  // === utility vettoriali ===
  const v3 = (x, y, z) => ({ x, y, z });
  const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a) => Math.sqrt(dot(a, a));
  const nrm = (a) => { const L = len(a); return L > 0 ? mul(a, 1 / L) : v3(0, 0, 0); };
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  // === riferimenti DOM ===
  const $ = id => document.getElementById(id);
  const hud = $('hud');
  const mini = $('miniMap');
  const mctx = mini.getContext('2d');

  // controlli UI
  const elPer = $('perigee'), elApo = $('apogee'), elIncl = $('incl'),
        elRAAN = $('raan'), elArgp = $('argp'), elM0 = $('m0'),
        elTS = $('timescale'), elTrail = $('trail'), elScenario = $('scenario'),
        elDrag = $('drag'), elCdA = $('cda');
  const elPerV = $('perigeeVal'), elApoV = $('apogeeVal'), elInclV = $('inclVal'),
        elRAANV = $('raanVal'), elArgpV = $('argpVal'), elM0V = $('m0Val'),
        elTSV = $('timescaleVal'), elTrailV = $('trailVal'), elCdAV = $('cdaVal');

  const btnPlay = $('btnPlay'), btnPause = $('btnPause'), btnReset = $('btnReset'),
        btnExport = $('btnExport'), btnStep = $('btnStep'), btnCamOrbit = $('btnCamOrbit');

  // === stato simulazione ===
  let perigeeAlt = 400e3, apogeeAlt = 400e3;
  let inclDeg = 51, raanDeg = 0, argpDeg = 0, m0Deg = 0;
  let timescale = 5, trailMax = 1200;
  let useDrag = false, CdA_over_m = 0.02;
  let running = false;
  let trail = [], logSamples = [];
  let cameraOrbit = true;

  // === scena Three.js ===
  let scene, camera, renderer, earth, cubeSat, orbitLine, sun, hemi;
  const root = document.getElementById('three-root');
  let t = 0, last = performance.now();

  function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, root.clientWidth / root.clientHeight, 1, 1e9);
    camera.position.set(0, R_EARTH * 4, R_EARTH * 4);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(root.clientWidth, root.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    root.appendChild(renderer.domElement);

    // luci
    sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(R_EARTH * 10, R_EARTH * 3, R_EARTH * 5);
    hemi = new THREE.AmbientLight(0x223355, 0.6);
    scene.add(sun, hemi);

    // terra
    const texLoader = new THREE.TextureLoader();
    const mat = new THREE.MeshPhongMaterial({ color: 0x12306a, shininess: 8 });
    texLoader.load('assets/earth_day.jpg', tex => { mat.map = tex; mat.needsUpdate = true; });
    earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 64, 64), mat);
    scene.add(earth);

    // equatore
    const eq = new THREE.Mesh(
      new THREE.RingGeometry(R_EARTH * 1.01, R_EARTH * 1.012, 128),
      new THREE.MeshBasicMaterial({ color: 0x2a6fdb, side: THREE.DoubleSide })
    );
    eq.rotation.x = Math.PI / 2;
    earth.add(eq);

    // satellite
    const satMat = new THREE.MeshStandardMaterial({ color: 0xeaf1ff, roughness: 0.6 });
    cubeSat = new THREE.Mesh(new THREE.BoxGeometry(R_EARTH * 0.03, R_EARTH * 0.03, R_EARTH * 0.03), satMat);
    const pMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
    const pGeo = new THREE.BoxGeometry(R_EARTH * 0.02, R_EARTH * 0.005, R_EARTH * 0.06);
    const p1 = new THREE.Mesh(pGeo, pMat), p2 = new THREE.Mesh(pGeo, pMat);
    p1.position.x = -R_EARTH * 0.04; p2.position.x = R_EARTH * 0.04;
    cubeSat.add(p1, p2);
    scene.add(cubeSat);

    // orbita
    orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x60a5fa }));
    scene.add(orbitLine);

    // stelle
    const starGeo = new THREE.BufferGeometry();
    const N = 4000, R = R_EARTH * 80;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * 2 * Math.PI;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i*3] = R * Math.sin(ph) * Math.cos(th);
      pos[i*3+1] = R * Math.cos(ph);
      pos[i*3+2] = R * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: R_EARTH * 0.008 }));
    scene.add(stars);

    window.addEventListener('resize', () => {
      camera.aspect = root.clientWidth / root.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(root.clientWidth, root.clientHeight);
    });
  }

  function elementsToState(a,e,i,raan,argp,M0,t){
    const n = Math.sqrt(MU / Math.pow(a,3));
    const M = (M0 + n * t) % (2 * Math.PI);
    let E = M;
    for(let k=0;k<10;k++){ const f=E - e*Math.sin(E) - M; E -= f / (1 - e*Math.cos(E)); }
    const cE=Math.cos(E), sE=Math.sin(E);
    const fac=Math.sqrt(1-e*e);
    const nu=Math.atan2(fac*sE, cE - e);
    const r=a*(1-e*cE);
    const x=r*Math.cos(nu), y=r*Math.sin(nu);
    const cO=Math.cos(raan), sO=Math.sin(raan);
    const ci=Math.cos(i), si=Math.sin(i);
    const co=Math.cos(argp), so=Math.sin(argp);
    const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci;
    const R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci;
    const R31=so*si, R32=co*si;
    return v3(R11*x+R12*y, R21*x+R22*y, R31*x+R32*y);
  }

  function derive() {
    const rp=R_EARTH+perigeeAlt, ra=R_EARTH+apogeeAlt;
    const a=0.5*(rp+ra), e=(ra-rp)/(ra+rp);
    return { a, e, i:inclDeg*DEG, raan:raanDeg*DEG, argp:argpDeg*DEG, M0:m0Deg*DEG };
  }

  function eciToLatLon(p) {
    const r = len(p);
    return { lat: Math.asin(p.y / r) / DEG, lon: Math.atan2(p.z, p.x) / DEG };
  }
  function drawMini(p) {
    mctx.fillStyle="#020611"; mctx.fillRect(0,0,mini.width,mini.height);
    mctx.strokeStyle="#12306a"; mctx.strokeRect(0,0,mini.width,mini.height);
    const {lat,lon}=eciToLatLon(p);
    const x=(lon+180)/360*mini.width, y=(90-lat)/180*mini.height;
    mctx.fillStyle="#60a5fa"; mctx.fillRect(x-2,y-2,4,4);
  }

  function syncUI() {
    perigeeAlt=parseFloat(elPer.value)*1000; apogeeAlt=parseFloat(elApo.value)*1000;
    inclDeg=parseFloat(elIncl.value); raanDeg=parseFloat(elRAAN.value);
    argpDeg=parseFloat(elArgp.value); m0Deg=parseFloat(elM0.value);
    timescale=parseFloat(elTS.value); trailMax=parseInt(elTrail.value);
    useDrag=elDrag.checked; CdA_over_m=parseFloat(elCdA.value);
    elPerV.textContent=(perigeeAlt/1000).toFixed(0);
    elApoV.textContent=(apogeeAlt/1000).toFixed(0);
    elInclV.textContent=inclDeg.toFixed(0);
    elRAANV.textContent=raanDeg.toFixed(0);
    elArgpV.textContent=argpDeg.toFixed(0);
    elM0V.textContent=m0Deg.toFixed(0);
    elTSV.textContent=timescale.toFixed(1)+'×';
    elTrailV.textContent=trailMax.toFixed(0);
    elCdAV.textContent=CdA_over_m.toFixed(3);
    trail=[]; logSamples=[];
  }
  ['input','change'].forEach(evt=>[elPer,elApo,elIncl,elRAAN,elArgp,elM0,elTS,elTrail,elCdA].forEach(n=>n.addEventListener(evt,syncUI)));
  elDrag.addEventListener('change',syncUI);
  elScenario.addEventListener('change',()=>{
    const v=elScenario.value;
    if(v==='launch'){elPer.value=200;elApo.value=400;elIncl.value=51;}
    if(v==='leo'){elPer.value=400;elApo.value=400;elIncl.value=51;}
    if(v==='ellipse'){elPer.value=300;elApo.value=800;elIncl.value=63;}
    if(v==='gto'){elPer.value=250;elApo.value=35786;elIncl.value=27;}
    syncUI();
  });

  btnPlay.onclick=()=>{running=true};
  btnPause.onclick=()=>{running=false};
  btnReset.onclick=()=>{t=0;trail=[];running=false};
  btnStep.onclick=()=>{if(!running)t+=1*timescale};
  btnCamOrbit.onclick=()=>{cameraOrbit=!cameraOrbit};
  btnExport.onclick=()=>{
    if(!logSamples.length){alert("Nessun dato da esportare.");return;}
    const header="t_s,x_m,y_m,z_m,alt_km";
    const lines=[header,...logSamples.map(r=>r.join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv"});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='cubesat_telemetry.csv';a.click();
  };

  // === loop ===
  function loop() {
    const now=performance.now(); const dt=Math.min((now-last)/1000,0.05); last=now;
    if(running)t+=dt*timescale;

    earth.rotation.y += 0.05 * dt * (timescale / 5);

    const E=derive(); const p=elementsToState(E.a,E.e,E.i,E.raan,E.argp,E.M0,t);
    cubeSat.position.set(p.x,p.y,p.z);

    if(running){
      trail.push(p); if(trail.length>trailMax)trail.shift();
      const alt=len(p)-R_EARTH;
      logSamples.push([t.toFixed(2),p.x.toFixed(1),p.y.toFixed(1),p.z.toFixed(1),(alt/1000).toFixed(2)]);
    }

    if(trail.length>1){
      const N=trail.length, arr=new Float32Array(N*3);
      for(let i=0;i<N;i++){const tp=trail[i];arr[i*3]=tp.x;arr[i*3+1]=tp.y;arr[i*3+2]=tp.z;}
      orbitLine.geometry.dispose(); orbitLine.geometry=new THREE.BufferGeometry();
      orbitLine.geometry.setAttribute('position',new THREE.BufferAttribute(arr,3));
    }

    if(cameraOrbit&&running){
      const ang=0.1*dt; const x=camera.position.x, z=camera.position.z;
      camera.position.x=x*Math.cos(ang)-z*Math.sin(ang);
      camera.position.z=x*Math.sin(ang)+z*Math.cos(ang);
      camera.lookAt(0,0,0);
    }

    const alt=len(p)-R_EARTH;
    hud.textContent=`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}°`;
    drawMini(p);

    renderer.render(scene,camera);
    requestAnimationFrame(loop);
  }

  // === boot ===
  function boot() {
    initThree();
    syncUI();
    requestAnimationFrame(loop);
    setTimeout(()=>document.getElementById('splash').classList.add('hide'),1000);
  }

  boot();
})();
