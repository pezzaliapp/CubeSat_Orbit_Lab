/* CubeSat Orbit Lab — Three.js full build (Kepler + Drag RK2)
   Compatibile con: index.html (id: view root "three-root", HUD "hud", mini "miniMap")
   UI: perigee, apogee, incl, raan, argp, m0, timescale, trail, scenario, drag, cda
   Controls: btnPlay, btnPause, btnStep, btnReset, btnExport, btnCamOrbit
*/
(function () {
  'use strict';

  /* ============ Costanti fisiche e util ============ */
  const R_EARTH = 6371e3;
  const MU = 3.986004418e14;  // μ = GM

  // Atmosfera (modello esponenziale molto semplice)
  const RHO0 = 1.225;     // kg/m^3 @ sea level
  const Hs   = 8500.0;    // scala di altezza (m)

  // vector helpers
  const v3 = (x, y, z) => ({ x, y, z });
  const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a) => Math.sqrt(dot(a, a));
  const nrm = (a) => { const L = len(a); return L > 0 ? mul(a, 1 / L) : v3(0, 0, 0); };

  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ============ DOM refs ============ */
  const $ = id => document.getElementById(id);

  const hud = $('hud');     const HUD = s => hud.textContent = s;
  const mini = $('miniMap'); const mctx = mini.getContext('2d');

  const elPer = $('perigee'), elApo = $('apogee'), elIncl = $('incl'),
        elRAAN = $('raan'),   elArgp = $('argp'),  elM0 = $('m0'),
        elTS = $('timescale'), elTrail = $('trail'), elScenario = $('scenario'),
        elDrag = $('drag'), elCdA = $('cda');

  const elPerV=$('perigeeVal'), elApoV=$('apogeeVal'), elInclV=$('inclVal'),
        elRAANV=$('raanVal'), elArgpV=$('argpVal'), elM0V=$('m0Val'),
        elTSV=$('timescaleVal'), elTrailV=$('trailVal'), elCdAV=$('cdaVal');

  const btnPlay=$('btnPlay'), btnPause=$('btnPause'), btnReset=$('btnReset'),
        btnExport=$('btnExport'), btnStep=$('btnStep'), btnCamOrbit=$('btnCamOrbit');

  /* ============ Stato simulazione ============ */
  let perigeeAlt = 400e3;
  let apogeeAlt  = 400e3;
  let inclDeg = 51, raanDeg = 0, argpDeg = 0, m0Deg = 0;

  let timescale = 5;
  let trailMax = 1200;
  let running  = true;

  let useDrag = false;
  let CdA_over_m = 0.02; // m^2/kg

  let trail = [];
  let logSamples = [];

  /* ============ Three.js ============ */
  let renderer, scene, camera, controls;
  let sun, hemi, earth, cubeSat, orbitLine, stars;
  let cameraOrbit = true;

  const EARTH_ROT_SPEED = (2 * Math.PI) / 60; // 1 giro / 60 s simulati

  function safeOrbitControls() {
    const C = THREE.OrbitControls || (window.OrbitControls && window.OrbitControls.default) || window.OrbitControls;
    if (!C) throw new Error('OrbitControls non disponibile');
    return C;
  }

  function initThree() {
    const root = document.getElementById('three-root');

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(root.clientWidth, root.clientHeight);
    root.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(55, root.clientWidth / root.clientHeight, 1, 1e9);
    camera.position.set(0, R_EARTH * 4, R_EARTH * 4);

    const OC = safeOrbitControls();
    controls = new OC(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.minDistance = R_EARTH * 1.2; controls.maxDistance = R_EARTH * 20;

    // luci
    sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(1, 0.2, 0).multiplyScalar(R_EARTH * 10);
    scene.add(sun);

    hemi = new THREE.AmbientLight(0x223355, 0.6);
    scene.add(hemi);

    // terra immediata (senza blocchi)
    const earthMat = new THREE.MeshPhongMaterial({ color: 0x12306a, specular: 0x111111, shininess: 8 });
    earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 64, 64), earthMat);
    scene.add(earth);

    // prova a caricare una texture se c'è
    const TL = new THREE.TextureLoader();
    const tryLoad = (url) => new Promise(res => TL.load(url, t => res(t), () => res(null)));
    (async () => {
      const day = (await tryLoad('assets/earth_day.jpg')) || (await tryLoad('assets/earth_day.png'));
      if (day) {
        day.colorSpace = THREE.SRGBColorSpace ?? day.colorSpace;
        earth.material.map = day; earth.material.needsUpdate = true;
      }
    })();

    // equatore + asse
    const eq = new THREE.Mesh(
      new THREE.RingGeometry(R_EARTH * 1.01, R_EARTH * 1.012, 128),
      new THREE.MeshBasicMaterial({ color: 0x2a6fdb, side: THREE.DoubleSide })
    ); eq.rotation.x = Math.PI / 2; earth.add(eq);

    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(R_EARTH * 0.01, R_EARTH * 0.01, R_EARTH * 2.2, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fb0d8 })
    ); earth.add(axis);

    // stelle procedurali
    {
      const N = 6000, R = R_EARTH * 80;
      const arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const u = Math.random(), v = Math.random();
        const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        arr[i * 3 + 0] = R * Math.sin(ph) * Math.cos(th);
        arr[i * 3 + 1] = R * Math.cos(ph);
        arr[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({ size: R_EARTH * 0.01, color: 0xffffff });
      stars = new THREE.Points(geo, mat); scene.add(stars);
    }

    // CubeSat + pannelli
    {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(R_EARTH * 0.03, R_EARTH * 0.03, R_EARTH * 0.03),
        new THREE.MeshStandardMaterial({ color: 0xeaf1ff, roughness: 0.6, metalness: 0.1 })
      );
      const pmat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
      const pGeo = new THREE.BoxGeometry(R_EARTH * 0.02, R_EARTH * 0.005, R_EARTH * 0.06);
      const p1 = new THREE.Mesh(pGeo, pmat); p1.position.x = -R_EARTH * 0.04; body.add(p1);
      const p2 = new THREE.Mesh(pGeo, pmat); p2.position.x =  R_EARTH * 0.04; body.add(p2);
      cubeSat = body; scene.add(cubeSat);
    }

    // trail
    orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x60a5fa }));
    scene.add(orbitLine);

    // resize
    window.addEventListener('resize', onResize); onResize();
  }

  function onResize() {
    const root = document.getElementById('three-root');
    renderer.setSize(root.clientWidth, root.clientHeight);
    camera.aspect = root.clientWidth / root.clientHeight; camera.updateProjectionMatrix();
  }

  /* ============ Keplero: elementi -> stato ============ */
  function elementsToState(a, e, i, raan, argp, M0, t) {
    const n = Math.sqrt(MU / Math.pow(a, 3));
    const M = (M0 + n * t) % (2 * Math.PI);
    // solve E
    let E = M;
    for (let k = 0; k < 12; k++) {
      const f = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      E -= f / fp;
    }
    const cE = Math.cos(E), sE = Math.sin(E), fac = Math.sqrt(1 - e * e);
    const nu = Math.atan2(fac * sE, cE - e);
    const r  = a * (1 - e * cE);

    const x = r * Math.cos(nu);
    const y = r * Math.sin(nu);

    const cO = Math.cos(raan), sO = Math.sin(raan);
    const ci = Math.cos(i),    si = Math.sin(i);
    const co = Math.cos(argp), so = Math.sin(argp);

    const R11 = cO * co - sO * so * ci, R12 = -cO * so - sO * co * ci;
    const R21 = sO * co + cO * so * ci, R22 = -sO * so + cO * co * ci;
    const R31 = so * si,                R32 =  co * si;

    return v3(
      R11 * x + R12 * y,
      R21 * x + R22 * y,
      R31 * x + R32 * y
    );
  }

  function elementsToStateVel(a, e, i, raan, argp, M0, t) {
    const n = Math.sqrt(MU / Math.pow(a, 3));
    const M = (M0 + n * t) % (2 * Math.PI);
    let E = M;
    for (let k = 0; k < 12; k++) {
      const f = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      E -= f / fp;
    }
    const cE = Math.cos(E), sE = Math.sin(E), fac = Math.sqrt(1 - e * e);
    const nu = Math.atan2(fac * sE, cE - e);
    const r  = a * (1 - e * cE);

    const x_pf = r * Math.cos(nu);
    const y_pf = r * Math.sin(nu);
    const vx_pf = -Math.sqrt(MU * a) / r * sE;
    const vy_pf =  Math.sqrt(MU * a) / r * fac * cE;

    const cO = Math.cos(raan), sO = Math.sin(raan);
    const ci = Math.cos(i),    si = Math.sin(i);
    const co = Math.cos(argp), so = Math.sin(argp);

    const R11 = cO * co - sO * so * ci, R12 = -cO * so - sO * co * ci;
    const R21 = sO * co + cO * so * ci, R22 = -sO * so + cO * co * ci;
    const R31 = so * si,                R32 =  co * si;

    const x = R11 * x_pf + R12 * y_pf;
    const y = R21 * x_pf + R22 * y_pf;
    const z = R31 * x_pf + R32 * y_pf;

    const vx = R11 * vx_pf + R12 * vy_pf;
    const vy = R21 * vx_pf + R22 * vy_pf;
    const vz = R31 * vx_pf + R32 * vy_pf;

    return { r: v3(x, y, z), v: v3(vx, vy, vz) };
  }

  function deriveElements() {
    const rp = R_EARTH + perigeeAlt;
    const ra = R_EARTH + apogeeAlt;
    const a = 0.5 * (rp + ra);
    const e = (ra - rp) / (ra + rp);
    return { a, e, i: rad(inclDeg), raan: rad(raanDeg), argp: rad(argpDeg), M0: rad(m0Deg) };
  }

  /* ============ Integrazione numerica (drag) ============ */
  const dyn = { r: v3(R_EARTH + 400e3, 0, 0), v: v3(0, 0, 0) };

  function accel(r, v) {
    const rmag = len(r);
    const aG = mul(r, -MU / (rmag * rmag * rmag));
    if (!useDrag) return aG;
    const h = Math.max(0, rmag - R_EARTH);
    const rho = RHO0 * Math.exp(-h / Hs); // molto grezzo, ma ok per LEO
    const vmag = Math.max(1e-3, len(v));
    const aD = mul(nrm(v), -0.5 * CdA_over_m * rho * vmag * vmag);
    return add(aG, aD);
  }

  /* ============ Mini ground-track ============ */
  function eciToLatLon(p) {
    const r = len(p);
    return { lat: deg(Math.asin(p.y / r)), lon: deg(Math.atan2(p.z, p.x)) };
  }
  function drawMini(p) {
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = "#071022"; mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.strokeStyle = "#12306a"; mctx.strokeRect(0, 0, mini.width, mini.height);
    const { lat, lon } = eciToLatLon(p);
    const x = (lon + 180) / 360 * mini.width;
    const y = (90 - lat) / 180 * mini.height;
    mctx.fillStyle = "#60a5fa"; mctx.fillRect(x - 2, y - 2, 4, 4);
  }

  /* ============ UI ============ */
  function syncUI() {
    perigeeAlt = parseFloat(elPer.value) * 1000;
    apogeeAlt  = parseFloat(elApo.value) * 1000;
    inclDeg = parseFloat(elIncl.value);
    raanDeg = parseFloat(elRAAN.value);
    argpDeg = parseFloat(elArgp.value);
    m0Deg   = parseFloat(elM0.value);
    timescale = parseFloat(elTS.value);
    trailMax  = parseInt(elTrail.value, 10);
    useDrag = !!elDrag?.checked;
    CdA_over_m = parseFloat(elCdA.value);

    elPerV.textContent   = (perigeeAlt / 1000).toFixed(0);
    elApoV.textContent   = (apogeeAlt  / 1000).toFixed(0);
    elInclV.textContent  = inclDeg.toFixed(0);
    elRAANV.textContent  = raanDeg.toFixed(0);
    elArgpV.textContent  = argpDeg.toFixed(0);
    elM0V.textContent    = m0Deg.toFixed(0);
    elTSV.textContent    = timescale.toFixed(1) + '×';
    elTrailV.textContent = trailMax.toFixed(0);
    elCdAV.textContent   = CdA_over_m.toFixed(3);

    trail = []; logSamples = [];

    // riallinea stato dinamico quando attivo il drag
    if (useDrag) {
      const E = deriveElements();
      const sv = elementsToStateVel(E.a, E.e, E.i, E.raan, E.argp, E.M0, 0);
      dyn.r = sv.r; dyn.v = sv.v;
    }
  }

  ['input','change'].forEach(evt=>{
    [elPer, elApo, elIncl, elRAAN, elArgp, elM0, elTS, elTrail, elCdA].forEach(n=>n.addEventListener(evt, syncUI));
    elDrag && elDrag.addEventListener('change', syncUI);
  });

  elScenario.addEventListener('change', () => {
    const v = elScenario.value;
    if (v === 'launch')  { elPer.value=200; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0; elTS.value=3;  elTrail.value=600;  }
    if (v === 'leo')     { elPer.value=400; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0; elTS.value=5;  elTrail.value=1200; }
    if (v === 'ellipse') { elPer.value=300; elApo.value=800; elIncl.value=63; elRAAN.value=90; elArgp.value=30; elM0.value=0; elTS.value=6;  elTrail.value=1600; }
    if (v === 'gto')     { elPer.value=250; elApo.value=35786; elIncl.value=27; elRAAN.value=20; elArgp.value=180; elM0.value=0; elTS.value=60; elTrail.value=4000; }
    syncUI();
  });

  // bottoni
  btnPlay.onclick  = () => { running = true;  btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); };
  btnPause.onclick = () => { running = false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
  btnReset.onclick = () => { running = false; t = 0; trail = []; logSamples = []; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
  btnStep.onclick  = () => { if (!running) t += 1 * timescale; };
  btnCamOrbit.onclick = () => { cameraOrbit = !cameraOrbit; btnCamOrbit.classList.toggle('primary', cameraOrbit); };
  btnExport.onclick = () => {
    if (!logSamples.length) { alert('Nessun dato da esportare. Premi PLAY.'); return; }
    const header = 't_s,x_m,y_m,z_m,alt_km,speed_mps';
    const lines = [header, ...logSamples.map(r=>r.join(','))];
    const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'cubesat_telemetry.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1200);
  };

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      running = !running;
      if (running) { btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); }
      else         { btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); }
    }
  });

  /* ============ Main loop ============ */
  let t = 0;
  let last = performance.now();

  function loop() {
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);

    // sole “ruota” lentamente attorno
    const sunTh = 0.1 * t / 60 * 2 * Math.PI;
    sun.position.set(Math.cos(sunTh), 0.2, Math.sin(sunTh)).multiplyScalar(R_EARTH * 10);

    // avanzamento tempo
    if (running) {
      t += dt * timescale;
      if (earth) earth.rotation.y += EARTH_ROT_SPEED * dt * (timescale / 5);
    }

    // stato orbitale
    const E = deriveElements();
    let pos, vel, spd;

    if (elScenario.value === 'launch' && !useDrag) {
      // transizione “lancio” (Keplero) — aumenta gradualmente i parametri
      if (running) {
        const k = clamp(t / 120, 0, 1);
        const sv = elementsToStateVel(E.a, E.e * k, E.i * k, E.raan * k, E.argp * k, E.M0 * k, t);
        pos = sv.r; vel = sv.v; spd = len(vel);
      }
    }

    if (!pos) {
      if (!useDrag) {
        // Keplero puro
        const sv = elementsToStateVel(E.a, E.e, E.i, E.raan, E.argp, E.M0, t);
        pos = sv.r; vel = sv.v; spd = len(vel);
      } else {
        // Integrazione numerica RK2 con drag
        const substeps = Math.max(1, Math.floor(timescale));
        const h = (dt * timescale) / substeps;
        if (running) {
          for (let s = 0; s < substeps; s++) {
            const a1 = accel(dyn.r, dyn.v);
            const rv = add(dyn.r, mul(dyn.v, h * 0.5));
            const vv = add(dyn.v, mul(a1, h * 0.5));
            const a2 = accel(rv, vv);
            dyn.r = add(dyn.r, mul(vv, h));
            dyn.v = add(dyn.v, mul(a2, h));
          }
        }
        pos = dyn.r; vel = dyn.v; spd = len(vel);
      }
    }

    // aggiorna 3D
    cubeSat.position.set(pos.x, pos.y, pos.z);

    // trail e logging
    if (running) {
      trail.push(pos);
      if (trail.length > trailMax) trail.shift();
      const alt = len(pos) - R_EARTH;
      logSamples.push([t.toFixed(2), pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2), (alt/1000).toFixed(2), spd.toFixed(2)]);
      if (logSamples.length > 60000) logSamples.shift();
    }

    if (trail.length > 1) {
      const N = trail.length;
      const arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const p = trail[i]; arr[i*3] = p.x; arr[i*3+1] = p.y; arr[i*3+2] = p.z;
      }
      orbitLine.geometry.dispose();
      orbitLine.geometry = new THREE.BufferGeometry();
      orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    }

    // camera orbit automatica
    if (cameraOrbit && running) {
      const ang = 0.15 * dt, x = camera.position.x, z = camera.position.z;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      camera.position.x = x * ca - z * sa;
      camera.position.z = x * sa + z * ca;
      camera.lookAt(0, 0, 0);
    }

    // HUD + mini
    const rmag = len(pos), alt = rmag - R_EARTH;
    HUD(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}° | v=${spd.toFixed(0)} m/s`);
    drawMini(pos);

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  /* ============ Boot ============ */
  function boot() {
    initThree();
    syncUI();
    requestAnimationFrame(loop);
    setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 900);
  }
  boot();

})();
