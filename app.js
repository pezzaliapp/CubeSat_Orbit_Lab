/* CubeSat Orbit Lab — v3 (Keplero + Drag) */
(function(){
  'use strict';
  window.requestAnimFrame = window.requestAnimationFrame || function(cb){ return setTimeout(cb,16); };

  // Costanti fisiche
  var R_EARTH = 6371e3;
  var MU = 3.986004418e14;
  // Atmosfera esponenziale semplice
  var RHO0 = 1.225;   // kg/m^3 al livello del mare
  var Hs   = 8500.0;  // scala di altezza [m]

  // Stato simulazione
  var canvas = document.getElementById('view');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var cx = W/2, cy = H/2;

  var running = false;
  var t = 0;
  var timescale = 5;
  var trailMax = 800;
  var trail = [];
  var logSamples = []; // per export

  // Orbitali
  var perigeeAlt = 400e3;
  var apogeeAlt  = 400e3;
  var inclDeg = 51;
  var raanDeg = 0;
  var argpDeg = 0;
  var m0Deg = 0;

  // Drag params
  var useDrag = false;
  var CdA_over_m = 0.02; // m^2/kg

  // Flags
  var showAxes = true, showOrbit = true, showAtmo = true, showShadow = true;

  // Camera
  var cam = { r: 2.8*R_EARTH, theta:-0.8, phi:0.9, fov:900, target:{x:0,y:0,z:0} };

  // Sole (direzione luce)
  var sunTheta = 0; // ruota lentamente
  function sunDirVec(){
    // direzione dal centro Terra verso il Sole
    var th = sunTheta;
    var phi = 0.2;
    var x = Math.cos(phi)*Math.cos(th);
    var z = Math.cos(phi)*Math.sin(th);
    var y = Math.sin(phi);
    var n = Math.sqrt(x*x+y*y+z*z);
    return {x:x/n, y:y/n, z:z/n};
  }

  // Utils
  function clamp(v,min,max){ return v<min?min:(v>max?max:v); }
  function toRad(d){ return d*Math.PI/180; }
  function vec3(x,y,z){ return {x:x,y:y,z:z}; }
  function add(a,b){ return vec3(a.x+b.x,a.y+b.y,a.z+b.z); }
  function sub(a,b){ return vec3(a.x-b.x,a.y-b.y,a.z-b.z); }
  function dot(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
  function mul(a,s){ return vec3(a.x*s, a.y*s, a.z*s); }
  function norm(a){ var n=Math.sqrt(dot(a,a)); return n>0?mul(a,1/n):vec3(0,0,0); }
  function cross(a,b){ return vec3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x); }
  function len(a){ return Math.sqrt(dot(a,a)); }
  function sph2cart(r,theta,phi){
    var x = r * Math.cos(phi) * Math.cos(theta);
    var z = r * Math.cos(phi) * Math.sin(theta);
    var y = r * Math.sin(phi);
    return vec3(x,y,z);
  }

  // Proiezione camera
  function worldToScreen(p){
    var camPos = sph2cart(cam.r, cam.theta, cam.phi);
    var forward = norm(sub(cam.target, camPos));
    var right = norm(cross(forward, vec3(0,1,0)));
    var up = norm(cross(right, forward));
    var rel = sub(p, camPos);
    var x = dot(rel, right);
    var y = dot(rel, up);
    var z = dot(rel, forward);
    var eps = 1e-6;
    var s = cam.fov / Math.max(eps, (cam.fov + z));
    return { x: cx + x * s, y: cy - y * s, z: z };
  }

  // Keplero: elementi -> stato (pos, vel)
  function elementsToStateVel(a,e,i,raan,argp,M0,t){
    var n = Math.sqrt(MU / Math.pow(a,3));
    var M = (M0 + n*t) % (2*Math.PI);
    var E = M;
    for(var k=0;k<10;k++){
      var f = E - e*Math.sin(E) - M;
      var fp = 1 - e*Math.cos(E);
      E = E - f/fp;
    }
    var cosE = Math.cos(E), sinE = Math.sin(E);
    var fac = Math.sqrt(1 - e*e);
    var nu = Math.atan2(fac*sinE, cosE - e);
    var r = a*(1 - e*cosE);

    // pos/vel nel piano orbitale (PQW)
    var x_pf = r*Math.cos(nu);
    var y_pf = r*Math.sin(nu);
    var vx_pf = -Math.sqrt(MU*a)/r * sinE;
    var vy_pf =  Math.sqrt(MU*a)/r * fac * cosE;

    // Rotazioni
    var cO=Math.cos(raan), sO=Math.sin(raan);
    var ci=Math.cos(i), si=Math.sin(i);
    var co=Math.cos(argp), so=Math.sin(argp);

    var R11 =  cO*co - sO*so*ci, R12 = -cO*so - sO*co*ci, R13 = sO*si;
    var R21 =  sO*co + cO*so*ci, R22 = -sO*so + cO*co*ci, R23 = -cO*si;
    var R31 =  so*si,               R32 =  co*si,              R33 =  ci;

    var x = R11*x_pf + R12*y_pf;
    var y = R21*x_pf + R22*y_pf;
    var z = R31*x_pf + R32*y_pf;

    var vx = R11*vx_pf + R12*vy_pf;
    var vy = R21*vx_pf + R22*vy_pf;
    var vz = R31*vx_pf + R32*vy_pf;

    return {r:vec3(x,y,z), v:vec3(vx,vy,vz)};
  }
  function elementsToState(a,e,i,raan,argp,M0,t){
    var s = elementsToStateVel(a,e,i,raan,argp,M0,t);
    return s.r;
  }

  // Terminatore / ombra migliorata
  function drawEarthWithShadow(){
    var p = worldToScreen(vec3(0,0,0));
    var Rpx = projectRadius(R_EARTH);
    // disco
    ctx.fillStyle = "#13306d";
    ctx.beginPath(); ctx.arc(p.x,p.y,Rpx,0,Math.PI*2); ctx.fill();

    // illuminazione: gradient lineare orientato con direzione Sole
    var sd = sunDirVec(); // verso il Sole
    var dir = worldToScreen(sd); // proiezione direzione per orientamento
    var dx = dir.x - cx, dy = dir.y - cy;
    var L = Math.sqrt(dx*dx+dy*dy) || 1;
    dx/=L; dy/=L;
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x,p.y,Rpx,0,Math.PI*2); ctx.clip();
    var gx = p.x - dx*Rpx, gy = p.y - dy*Rpx;
    var ex = p.x + dx*Rpx, ey = p.y + dy*Rpx;
    var grd = ctx.createLinearGradient(gx, gy, ex, ey);
    grd.addColorStop(0, "#2a6fdb");
    grd.addColorStop(0.52, "#12306a");
    grd.addColorStop(0.54, "#081733");
    grd.addColorStop(1, "#040a1a");
    ctx.fillStyle = grd;
    ctx.fillRect(p.x-Rpx, p.y-Rpx, Rpx*2, Rpx*2);
    ctx.restore();

    // Atmosfera
    if (showAtmo){
      var Ra = Rpx*1.05;
      var g2 = ctx.createRadialGradient(p.x, p.y, Rpx*0.95, p.x, p.y, Ra);
      g2.addColorStop(0, "rgba(120,200,255,0.05)");
      g2.addColorStop(1, "rgba(120,200,255,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,Math.PI*2); ctx.fill();
    }

    // Assi
    if (showAxes){
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      var axes = [vec3(R_EARTH*1.3,0,0), vec3(-R_EARTH*1.3,0,0),
                  vec3(0,R_EARTH*1.3,0), vec3(0,-R_EARTH*1.3,0),
                  vec3(0,0,R_EARTH*1.3), vec3(0,0,-R_EARTH*1.3)];
      ctx.beginPath();
      for(var i=0;i<axes.length;i+=2){
        var a = worldToScreen(axes[i]);
        var b = worldToScreen(axes[i+1]);
        ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      }
      ctx.stroke();
    }
  }
  function projectRadius(r){
    var p = worldToScreen(vec3(r,0,0));
    var c = worldToScreen(vec3(0,0,0));
    var dx = p.x - c.x, dy = p.y - c.y;
    return Math.sqrt(dx*dx+dy*dy);
  }

  function drawOrbitPath(points){
    if (!showOrbit || points.length<2) return;
    ctx.strokeStyle = "rgba(96,165,250,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var s = worldToScreen(points[0]);
    ctx.moveTo(s.x, s.y);
    for (var i=1;i<points.length;i++){
      s = worldToScreen(points[i]);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }

  function drawCubeSat(p, v){
    var s = worldToScreen(p);
    var size = clamp(8 + 1200/(1 + s.z + 1e-6), 2, 14);
    // Ombra su CubeSat se in notte (opposto al Sole)
    var sd = sunDirVec();
    var lit = dot(norm(p), sd) > 0; // grossolana: se lato illuminato
    ctx.fillStyle = lit ? "#eaf1ff" : "#9aa6bf";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(s.x - size/2, s.y - size/2, size, size);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = lit ? "#60a5fa" : "#4e6da3";
    ctx.fillRect(s.x - size*1.2 - size*0.7, s.y - size*0.3, size*0.7, size*0.6);
    ctx.fillRect(s.x + size*1.2,           s.y - size*0.3, size*0.7, size*0.6);
  }

  // HUD
  var hud = document.getElementById('hud');
  function updateHUD(info){ hud.textContent = info; }

  // UI refs
  var elPer = document.getElementById('perigee');
  var elApo = document.getElementById('apogee');
  var elIncl= document.getElementById('incl');
  var elRAAN= document.getElementById('raan');
  var elArgp= document.getElementById('argp');
  var elM0  = document.getElementById('m0');
  var elTS  = document.getElementById('timescale');
  var elTrail=document.getElementById('trail');
  var elPerV= document.getElementById('perigeeVal');
  var elApoV= document.getElementById('apogeeVal');
  var elInclV=document.getElementById('inclVal');
  var elRAANV=document.getElementById('raanVal');
  var elArgpV=document.getElementById('argpVal');
  var elM0V  =document.getElementById('m0Val');
  var elTSV  = document.getElementById('timescaleVal');
  var elTrailV=document.getElementById('trailVal');
  var elScenario=document.getElementById('scenario');
  var elDrag = document.getElementById('drag');
  var elCdA  = document.getElementById('cda');
  var elCdAV = document.getElementById('cdaVal');
  var btnExport = document.getElementById('btnExport');

  showAxes   = document.getElementById('showAxes').checked;
  showOrbit  = document.getElementById('showOrbit').checked;
  showAtmo   = document.getElementById('atmo').checked;
  showShadow = document.getElementById('shadow').checked;

  function syncUI(){
    perigeeAlt = parseFloat(elPer.value)*1000;
    apogeeAlt  = parseFloat(elApo.value)*1000;
    inclDeg    = parseFloat(elIncl.value);
    raanDeg    = parseFloat(elRAAN.value);
    argpDeg    = parseFloat(elArgp.value);
    m0Deg      = parseFloat(elM0.value);
    timescale  = parseFloat(elTS.value);
    trailMax   = parseInt(elTrail.value,10);
    useDrag    = elDrag.checked;
    CdA_over_m = parseFloat(elCdA.value);
    elPerV.textContent = (perigeeAlt/1000).toFixed(0);
    elApoV.textContent = (apogeeAlt/1000).toFixed(0);
    elInclV.textContent= inclDeg.toFixed(0);
    elRAANV.textContent= raanDeg.toFixed(0);
    elArgpV.textContent= argpDeg.toFixed(0);
    elM0V.textContent  = m0Deg.toFixed(0);
    elTSV.textContent  = timescale.toFixed(1)+"×";
    elTrailV.textContent = trailMax.toFixed(0);
    elCdAV.textContent = CdA_over_m.toFixed(3);
    trail = [];
    logSamples = [];
    // quando attivo drag, inizializzo stato dinamico da elementi attuali
    if (useDrag){
      var elems = deriveElements();
      var sv = elementsToStateVel(elems.a, elems.e, elems.i, elems.raan, elems.argp, elems.M0, t);
      dyn.r = sv.r; dyn.v = sv.v;
    }
  }
  elPer.oninput = elApo.oninput = elIncl.oninput = elRAAN.oninput = elArgp.oninput = elM0.oninput = elTS.oninput = elTrail.oninput = elCdA.oninput = function(){ syncUI(); };
  elDrag.onchange = function(){ syncUI(); };
  document.getElementById('showAxes').onchange = function(e){ showAxes = e.target.checked; };
  document.getElementById('showOrbit').onchange= function(e){ showOrbit= e.target.checked; };
  document.getElementById('atmo').onchange     = function(e){ showAtmo = e.target.checked; };
  document.getElementById('shadow').onchange   = function(e){ showShadow = e.target.checked; };

  elScenario.onchange = function(){
    var v = elScenario.value;
    if (v==='launch'){
      elPer.value=200; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0;
      elTS.value=3; elTrail.value=600;
    }else if(v==='leo'){
      elPer.value=400; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0;
      elTS.value=5; elTrail.value=1200;
    }else if(v==='ellipse'){
      elPer.value=300; elApo.value=800; elIncl.value=63; elRAAN.value=90; elArgp.value=30; elM0.value=0;
      elTS.value=6; elTrail.value=1600;
    }else if(v==='gto'){
      elPer.value=250; elApo.value=35786; elIncl.value=27; elRAAN.value=20; elArgp.value=180; elM0.value=0;
      elTS.value=60; elTrail.value=4000;
    }
    syncUI();
  };

  document.getElementById('btnPlay').onclick = function(){ running = true; this.classList.add('primary'); document.getElementById('btnPause').classList.remove('primary'); };
  document.getElementById('btnPause').onclick= function(){ running = false; this.classList.add('primary'); document.getElementById('btnPlay').classList.remove('primary'); };
  document.getElementById('btnReset').onclick= function(){ t=0; trail=[]; logSamples=[]; };
  btnExport.onclick = function(){ exportCSV(); };

  var deferredPrompt=null, installBtn=document.getElementById('btnInstall');
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault(); deferredPrompt=e; installBtn.hidden=false;
  });
  
  window.addEventListener('keydown', function(e){
    if (e.code === 'Space'){ e.preventDefault(); running = !running;
      if (running){ document.getElementById('btnPlay').classList.add('primary'); document.getElementById('btnPause').classList.remove('primary'); }
      else { document.getElementById('btnPause').classList.add('primary'); document.getElementById('btnPlay').classList.remove('primary'); }
    }
  });
installBtn.onclick = function(){ if (deferredPrompt){ deferredPrompt.prompt(); } };

  function onResize(){
    var r = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio||1;
    canvas.width = Math.max(640, Math.floor(r.width*dpr));
    canvas.height= Math.floor(canvas.width*9/16);
    W = canvas.width; H = canvas.height; cx=W/2; cy=H/2;
  }
  window.addEventListener('resize', onResize);
  onResize();
  syncUI();

  function deriveElements(){
    var rp = R_EARTH + perigeeAlt;
    var ra = R_EARTH + apogeeAlt;
    var a = 0.5*(rp+ra);
    var e = (ra - rp) / (ra + rp);
    var i = toRad(inclDeg);
    var raan = toRad(raanDeg);
    var argp = toRad(argpDeg);
    var M0 = toRad(m0Deg);
    return {a:a,e:e,i:i,raan:raan,argp:argp,M0:M0};
  }

  // Dinamica numerica con drag (stato)
  var dyn = { r: vec3(R_EARTH+perigeeAlt,0,0), v: vec3(0,0,0) };
  function accel(r,v){
    var rmag = len(r);
    var aG = mul(r, -MU/(rmag*rmag*rmag));
    // drag
    var h = rmag - R_EARTH;
    var rho = RHO0 * Math.exp(-clamp(h,0,1e6)/Hs);
    var vmag = Math.max(1e-3, len(v));
    var aD = mul(norm(v), -0.5 * CdA_over_m * rho * vmag*vmag);
    return add(aG, aD);
  }

  // Loop
  var lastTS = performance.now();
  function loop(now){
    requestAnimFrame(loop);
    var dt = (now - lastTS)/1000; lastTS = now;
    dt = Math.min(dt, 0.05);
    sunTheta += dt*0.05; // Sole lento

    var elems = deriveElements();
    var pos, vel, spd;

    if (document.getElementById('scenario').value==='launch' && !useDrag){
      // Lancio semplificato in Keplero (transizione)
      if (running) { t += dt*timescale; }
      var k = clamp(t/120, 0, 1);
      var a = elems.a;
      var e = elems.e * k;
      var i = elems.i * k;
      var raan= elems.raan * k;
      var argp= elems.argp * k;
      var M0  = elems.M0 * k;
      var sv = elementsToStateVel(a,e,i,raan,argp,M0,t);
      pos = sv.r; vel = sv.v; spd = len(vel);
    } else if (!useDrag){
      // Keplero puro
      if (running) { t += dt*timescale; }
      var sv2 = elementsToStateVel(elems.a, elems.e, elems.i, elems.raan, elems.argp, elems.M0, t);
      pos = sv2.r; vel = sv2.v; spd = len(vel);
    } else {
      // Integrazione numerica con drag (RK2 semplice)
      var substeps = Math.max(1, Math.floor(timescale)); // più veloce → più substeps
      var hdt = (dt*timescale)/substeps;
      if (running) {
      for (var s=0; s<substeps; s++){
        var a1 = accel(dyn.r, dyn.v);
        var rv = add(dyn.r, mul(dyn.v, hdt*0.5));
        var vv = add(dyn.v, mul(a1, hdt*0.5));
        var a2 = accel(rv, vv);
        dyn.r = add(dyn.r, mul(vv, hdt));
        dyn.v = add(dyn.v, mul(a2, hdt));
        t += hdt;
      }
      } // end running guard
      pos = dyn.r; vel = dyn.v; spd = len(vel);
    }

    if (running){
      trail.push(pos);
      if (trail.length>trailMax) trail.shift();
      // Log per export
      var alt = len(pos) - R_EARTH;
      logSamples.push([t, pos.x, pos.y, pos.z, alt/1000.0, spd]);
      if (logSamples.length>50000) logSamples.shift();
    }

    cam.theta += 0.03*dt;
    cam.phi = 0.9 + 0.15*Math.sin(now*0.0005);

    ctx.clearRect(0,0,W,H);
    drawStars(now);
    if (showShadow) drawEarthWithShadow(); else drawEarthPlain();
    elseDrawEarthFallback(); // if needed, keep earth even when shadow disabled
    drawOrbitPath(trail);
    drawCubeSat(pos, vel);

    var rmag = len(pos);
    var alt = rmag - R_EARTH;
    var a_km = (elems.a/1000).toFixed(0);
    var e_str = elems.e.toFixed(3);
    updateHUD("t="+t.toFixed(1)+"s | alt="+(alt/1000).toFixed(0)+"km | a="+a_km+"km | e="+e_str+
      " | i="+inclDeg.toFixed(1)+"° | Ω="+raanDeg.toFixed(0)+"° | ω="+argpDeg.toFixed(0)+"° | M₀="+m0Deg.toFixed(0)+"° | v="+spd.toFixed(0)+" m/s");
  }
  requestAnimFrame(loop);

  function drawEarthPlain(){
    var p = worldToScreen(vec3(0,0,0));
    var Rpx = projectRadius(R_EARTH);
    ctx.fillStyle = "#0a1d47";
    ctx.beginPath(); ctx.arc(p.x,p.y,Rpx,0,Math.PI*2); ctx.fill();
    if (showAtmo){
      var Ra = Rpx*1.05;
      var g2 = ctx.createRadialGradient(p.x, p.y, Rpx*0.95, p.x, p.y, Ra);
      g2.addColorStop(0, "rgba(120,200,255,0.05)");
      g2.addColorStop(1, "rgba(120,200,255,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,Math.PI*2); ctx.fill();
    }
  }
  function elseDrawEarthFallback(){
    if (showShadow) return;
    // axes if requested
    if (showAxes){
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      var axes = [vec3(R_EARTH*1.3,0,0), vec3(-R_EARTH*1.3,0,0),
                  vec3(0,R_EARTH*1.3,0), vec3(0,-R_EARTH*1.3,0),
                  vec3(0,0,R_EARTH*1.3), vec3(0,0,-R_EARTH*1.3)];
      ctx.beginPath();
      for(var i=0;i<axes.length;i+=2){
        var a = worldToScreen(axes[i]);
        var b = worldToScreen(axes[i+1]);
        ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      }
      ctx.stroke();
    }
  }

  function drawStars(now){
    var n = 160;
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (var i=0;i<n;i++){
      var x = (i*97 % W);
      var y = (i*233 % H);
      var tw = (Math.sin(now*0.001 + i)*0.5+0.5)*0.7 + 0.3;
      ctx.fillStyle = "rgba(255,255,255,"+tw.toFixed(3)+")";
      ctx.fillRect(x,y,1,1);
    }
    ctx.restore();
  }

  // Export CSV
  function exportCSV(){
    if (logSamples.length===0){ alert("Nessun dato da esportare. Premi PLAY per generare telemetria."); return; }
    var header = "t_s,x_m,y_m,z_m,alt_km,speed_mps\n";
    var lines = [header];
    for (var i=0;i<logSamples.length;i++){
      lines.push(logSamples[i].join(",")+"\n");
    }
    var blob = new Blob(lines, {type:"text/csv"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = "cubesat_telemetry.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }

})();