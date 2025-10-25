/* CubeSat Orbit Lab — Three.js stable build */
(function () {
  'use strict';

  /* ========= Math/physics utils ========= */
  const R_EARTH = 6371e3;
  const MU = 3.986004418e14;

  const v3 = (x, y, z) => ({ x, y, z });
  const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a) => Math.sqrt(dot(a, a));
  const rad = (d) => d * Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

  /* ========= DOM refs ========= */
  const hud = document.getElementById('hud');
  const HUD = (s) => hud.textContent = s;
  const mini = document.getElementById('miniMap');
  const mctx = mini.getContext('2d');

  const elPer   = document.getElementById('perigee');
  const elApo   = document.getElementById('apogee');
  const elIncl  = document.getElementById('incl');
  const elRAAN  = document.getElementById('raan');
  const elArgp  = document.getElementById('argp');
  const elM0    = document.getElementById('m0');
  const elTS    = document.getElementById('timescale');
  const elTrail = document.getElementById('trail');
  const elScenario = document.getElementById('scenario');
  const elDrag  = document.getElementById('drag');       // (attualmente non usato nella fisica)
  const elCdA   = document.getElementById('cda');        // (attualmente non usato nella fisica)

  const elPerV   = document.getElementById('perigeeVal');
  const elApoV   = document.getElementById('apogeeVal');
  const elInclV  = document.getElementById('inclVal');
  const elRAANV  = document.getElementById('raanVal');
  const elArgpV  = document.getElementById('argpVal');
  const elM0V    = document.getElementById('m0Val');
  const elTSV    = document.getElementById('timescaleVal');
  const elTrailV = document.getElementById('trailVal');
  const elCdAV   = document.getElementById('cdaVal');

  const btnPlay     = document.getElementById('btnPlay');
  const btnPause    = document.getElementById('btnPause');
  const btnReset    = document.getElementById('btnReset');
  const btnExport   = document.getElementById('btnExport');
  const btnStep     = document.getElementById('btnStep');
  const btnCamOrbit = document.getElementById('btnCamOrbit');

  /* ========= Sim state ========= */
  let perigeeAlt = 400e3;
  let apogeeAlt  = 400e3;
  let inclDeg = 51, raanDeg = 0, argpDeg = 0, m0Deg = 0;

  let timescale = 5;
  let trailMax = 1200;
  let running = true;

  let trail = [];
  let logSamples = [];

  /* ========= Three.js ========= */
  let renderer, scene, camera, controls;
  let sun, hemi, earth, cubeSat, orbitLine, starPoints;
  let cameraOrbit = true;

  const EARTH_ROT_SPEED = (2 * Math.PI) / 60; // ~1 giro ogni 60 s simulati

  function initThree() {
    const root = document.getElementById('three-root');

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(root.clientWidth, root.clientHeight);
    root.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(55, root.clientWidth / root.clientHeight, 1, 1e9);
    camera.position.set(0, R_EARTH * 4, R_EARTH * 4);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = R_EARTH * 1.2;
    controls.maxDistance = R_EARTH * 20;

    // Luci
    sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(1, 0.2, 0).multiplyScalar(R_EARTH * 10);
    scene.add(sun);

    hemi = new THREE.AmbientLight(0x223355, 0.6);
    scene.add(hemi);

    // Terra (usa assets/earth_day.(png|jpg) se c'è, altrimenti un colore solido)
    const tl = new THREE.TextureLoader();
    let earthMat;
    const tryLoad = (url) => new Promise((res) => tl.load(url, (tex) => res(tex), () => res(null)));
    Promise.race([
      tryLoad('assets/earth_day.jpg'),
      tryLoad('assets/earth_day.png'),
    ]).then((dayTex) => {
      if (dayTex) {
        dayTex.colorSpace = THREE.SRGBColorSpace || THREE.LinearSRGBColorSpace;
        earthMat = new THREE.MeshPhongMaterial({ map: dayTex, specular: 0x111111, shininess: 8 });
      } else {
        earthMat = new THREE.MeshPhongMaterial({ color: 0x12306a, specular: 0x111111, shininess: 8 });
      }
      const g = new THREE.SphereGeometry(R_EARTH, 64, 64);
      earth = new THREE.Mesh(g, earthMat);
      scene.add(earth);

      // Equatore + Asse
      const eq = new THREE.Mesh(
        new THREE.RingGeometry(R_EARTH * 1.01, R_EARTH * 1.012, 128),
        new THREE.MeshBasicMaterial({ color: 0x2a6fdb, side: THREE.DoubleSide })
      );
      eq.rotation.x = Math.PI / 2;
      earth.add(eq);

      const axis = new THREE.Mesh(
        new THREE.CylinderGeometry(R_EARTH * 0.01, R_EARTH * 0.01, R_EARTH * 2.2, 12),
        new THREE.MeshBasicMaterial({ color: 0x9fb0d8 })
      );
      earth.add(axis);
    });

    // Campo stellare procedurale (senza texture)
    {
      const N = 4000;
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        // punti su sfera
        const u = Math.random();
        const v = Math.random();
        const th = 2 * Math.PI * u;
        const ph = Math.acos(2 * v - 1);
        const r = R_EARTH * 80;
        arr[i * 3 + 0] = r * Math.sin(ph) * Math.cos(th);
        arr[i * 3 + 1] = r * Math.cos(ph);
        arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({ size: R_EARTH * 0.01, color: 0xffffff });
      starPoints = new THREE.Points(geo, mat);
      scene.add(starPoints);
    }

    // CubeSat
    {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(R_EARTH * 0.03, R_EARTH * 0.03, R_EARTH * 0.03),
        new THREE.MeshStandardMaterial({ color: 0xeaf1ff, roughness: 0.6, metalness: 0.1 })
      );
      const panelMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
      const pGeo = new THREE.BoxGeometry(R_EARTH * 0.02, R_EARTH * 0.005, R_EARTH * 0.06);
      const p1 = new THREE.Mesh(pGeo, panelMat); p1.position.x = -R_EARTH * 0.04;
      const p2 = new THREE.Mesh(pGeo, panelMat); p2.position.x =  R_EARTH * 0.04;
      body.add(p1); body.add(p2);
      cubeSat = body;
      scene.add(cubeSat);
    }

    // Linea orbitale
    orbitLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x60a5fa })
    );
    scene.add(orbitLine);

    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize() {
    const root = document.getElementById('three-root');
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ========= Orbital mechanics ========= */
  function elementsToState(a, e, i, raan, argp, M0, t) {
    const n = Math.sqrt(MU / Math.pow(a, 3));
    const M = (M0 + n * t) % (2 * Math.PI);

    // Kepler (solve E)
    let E = M;
    for (let k = 0; k < 10; k++) {
      const f = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      E -= f / fp;
    }

    const cE = Math.cos(E), sE = Math.sin(E), fac = Math.sqrt(1 - e * e);
    const nu = Math.atan2(fac * sE, cE - e);
    const r = a * (1 - e * cE);

    // in-plane coords
    const x = r * Math.cos(nu);
    const y = r * Math.sin(nu);

    // rotation matrix
    const cO = Math.cos(raan), sO = Math.sin(raan);
    const ci = Math.cos(i), si = Math.sin(i);
    const co = Math.cos(argp), so = Math.sin(argp);

    const R11 = cO * co - sO * so * ci, R12 = -cO * so - sO * co * ci, R13 = sO * si;
    const R21 = sO * co + cO * so * ci, R22 = -sO * so + cO * co * ci, R23 = -cO * si;
    const R31 = so * si,               R32 = co * si,                R33 = ci;

    return v3(
      R11 * x + R12 * y,
      R21 * x + R22 * y,
      R31 * x + R32 * y
    );
  }

  function deriveElements() {
    const rp = R_EARTH + perigeeAlt;
    const ra = R_EARTH + apogeeAlt;
    const a = 0.5 * (rp + ra);
    const e = (ra - rp) / (ra + rp);
    return { a, e, i: rad(inclDeg), raan: rad(raanDeg), argp: rad(argpDeg), M0: rad(m0Deg) };
  }

  /* ========= Mini ground-track (approx) ========= */
  function eciToLatLon(p) {
    const r = len(p);
    const lat = Math.asin(p.y / r) * 180 / Math.PI;
    const lon = Math.atan2(p.z, p.x) * 180 / Math.PI;
    return { lat, lon };
  }

  function drawMini(p) {
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = "#071022";
    mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.strokeStyle = "#12306a";
    mctx.strokeRect(0, 0, mini.width, mini.height);

    const { lat, lon } = eciToLatLon(p);
    const x = (lon + 180) / 360 * mini.width;
    const y = (90 - lat) / 180 * mini.height;
    mctx.fillStyle = "#60a5fa";
    mctx.fillRect(x - 2, y - 2, 4, 4);
  }

  /* ========= UI sync ========= */
  function syncUI() {
    perigeeAlt = parseFloat(elPer.value) * 1000;
    apogeeAlt  = parseFloat(elApo.value) * 1000;
    inclDeg    = parseFloat(elIncl.value);
    raanDeg    = parseFloat(elRAAN.value);
    argpDeg    = parseFloat(elArgp.value);
    m0Deg      = parseFloat(elM0.value);
    timescale  = parseFloat(elTS.value);
    trailMax   = parseInt(elTrail.value, 10);

    elPerV.textContent   = (perigeeAlt / 1000).toFixed(0);
    elApoV.textContent   = (apogeeAlt  / 1000).toFixed(0);
    elInclV.textContent  = inclDeg.toFixed(0);
    elRAANV.textContent  = raanDeg.toFixed(0);
    elArgpV.textContent  = argpDeg.toFixed(0);
    elM0V.textContent    = m0Deg.toFixed(0);
    elTSV.textContent    = timescale.toFixed(1) + "×";
    elTrailV.textContent = trailMax.toFixed(0);
    elCdAV.textContent   = parseFloat(elCdA.value).toFixed(3);

    trail = [];
    logSamples = [];
  }

  ['input', 'change'].forEach(evt =>
    [elPer, elApo, elIncl, elRAAN, elArgp, elM0, elTS, elTrail, elCdA]
      .forEach(n => n.addEventListener(evt, syncUI))
  );

  elScenario.addEventListener('change', () => {
    const v = elScenario.value;
    if (v === 'launch')  { elPer.value = 200;  elApo.value = 400;   elIncl.value = 51; elRAAN.value = 0;  elArgp.value = 0;   elM0.value = 0;   elTS.value = 3;  elTrail.value = 600;  }
    if (v === 'leo')     { elPer.value = 400;  elApo.value = 400;   elIncl.value = 51; elRAAN.value = 0;  elArgp.value = 0;   elM0.value = 0;   elTS.value = 5;  elTrail.value = 1200; }
    if (v === 'ellipse') { elPer.value = 300;  elApo.value = 800;   elIncl.value = 63; elRAAN.value = 90; elArgp.value = 30;  elM0.value = 0;   elTS.value = 6;  elTrail.value = 1600; }
    if (v === 'gto')     { elPer.value = 250;  elApo.value = 35786; elIncl.value = 27; elRAAN.value = 20; elArgp.value = 180; elM0.value = 0;   elTS.value = 60; elTrail.value = 4000; }
    syncUI();
  });

  /* ========= Buttons ========= */
  btnPlay.onclick = () => {
    running = true;
    btnPlay.classList.add('primary');
    btnPause.classList.remove('primary');
  };
  btnPause.onclick = () => {
    running = false;
    btnPause.classList.add('primary');
    btnPlay.classList.remove('primary');
  };
  btnReset.onclick = () => {
    running = false;
    t = 0;
    trail = [];
    logSamples = [];
    btnPause.classList.add('primary');
    btnPlay.classList.remove('primary');
  };
  btnStep.onclick = () => {
    if (!running) t += 1 * timescale;
  };
  btnCamOrbit.onclick = () => {
    cameraOrbit = !cameraOrbit;
    btnCamOrbit.classList.toggle('primary', cameraOrbit);
  };
  btnExport.onclick = () => {
    if (!logSamples.length) {
      alert("Nessun dato da esportare. Premi PLAY.");
      return;
    }
    const header = "t_s,x_m,y_m,z_m,alt_km";
    const lines = [header, ...logSamples.map(r => r.join(","))];
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "cubesat_telemetry.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      running = !running;
      if (running) { btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); }
      else         { btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); }
    }
  });

  /* ========= Main loop ========= */
  let t = 0;
  let last = performance.now();

  function frame() {
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);

    if (running) {
      t += dt * timescale;
      if (earth) earth.rotation.y += EARTH_ROT_SPEED * dt * (timescale / 5);
    }

    // direzione luce “solare”
    const theta = 0.1 * t / 60 * 2 * Math.PI;
    if (sun) sun.position.set(Math.cos(theta), 0.2, Math.sin(theta)).multiplyScalar(R_EARTH * 10);

    // stato orbitale
    const E = deriveElements();

    let pos;
    if (elScenario.value === 'launch') {
      const k = clamp(t / 120, 0, 1);
      pos = elementsToState(E.a, E.e * k, E.i * k, E.raan * k, E.argp * k, E.M0 * k, t);
    } else {
      pos = elementsToState(E.a, E.e, E.i, E.raan, E.argp, E.M0, t);
    }

    if (cubeSat) cubeSat.position.set(pos.x, pos.y, pos.z);

    if (running) {
      trail.push(pos);
      if (trail.length > trailMax) trail.shift();
      const alt = len(pos) - R_EARTH;
      logSamples.push([t.toFixed(2), pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1), (alt / 1000).toFixed(2)]);
      if (logSamples.length > 50000) logSamples.shift();
    }

    if (trail.length > 1) {
      const N = trail.length;
      const arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const p = trail[i];
        arr[i * 3 + 0] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      }
      if (orbitLine) {
        orbitLine.geometry.dispose();
        orbitLine.geometry = new THREE.BufferGeometry();
        orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      }
    }

    if (cameraOrbit && running) {
      const ang = 0.15 * dt;
      const x = camera.position.x, z = camera.position.z;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      camera.position.x = x * ca - z * sa;
      camera.position.z = x * sa + z * ca;
      camera.lookAt(0, 0, 0);
    }

    const alt = len(pos) - R_EARTH;
    HUD(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}°`);
    drawMini(pos);

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ========= Boot ========= */
  function boot() {
    initThree();
    syncUI();
    requestAnimationFrame(frame);
    setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 1000);
  }
  boot();

})();
