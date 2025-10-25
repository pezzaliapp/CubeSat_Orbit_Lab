/* CubeSat Orbit Lab — Canvas + Proiezione 3D (ES5) — v2 */
(function(){
  'use strict';
  window.requestAnimFrame = window.requestAnimationFrame || function(cb){ return setTimeout(cb,16); };

  // Costanti fisiche (semplificate)
  var R_EARTH = 6371e3;
  var MU = 3.986004418e14;

  // Stato simulazione
  var canvas = document.getElementById('view');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var cx = W/2, cy = H/2;

  var running = false;
  var t = 0;
  var timescale = 5;
  var trailMax = 600;
  var trail = [];

  // Orbitali
  var perigeeAlt = 400e3;
  var apogeeAlt  = 400e3;
  var inclDeg = 51;
  var raanDeg = 0;
  var argpDeg = 0;
  var m0Deg = 0;

  // Flags
  var showAxes = true, showOrbit = true, showAtmo = true, showShadow = true;

  // Camera
  var cam = {
    r: 2.8 * R_EARTH,
    theta: -0.8,
    phi: 0.9,
    fov: 900,
    target: {x:0,y:0,z:0}
  };

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

  // Keplero: elementi -> stato (posizione)
  function elementsToState(a,e,i,raan,argp,M0,t){
    var n = Math.sqrt(MU / Math.pow(a,3));
    var M = (M0 + n*t) % (2*Math.PI);
    var E = M;
    for(var k=0;k<8;k++){
      var f = E - e*Math.sin(E) - M;
      var fp = 1 - e*Math.cos(E);
      E = E - f/fp;
    }
    var cosE = Math.cos(E), sinE = Math.sin(E);
    var nu = Math.atan2(Math.sqrt(1-e*e)*sinE, cosE - e);
    var r = a*(1 - e*cosE);
    var x_pf = r*Math.cos(nu);
    var y_pf = r*Math.sin(nu);
    var cO=Math.cos(raan), sO=Math.sin(raan);
    var ci=Math.cos(i), si=Math.sin(i);
    var co=Math.cos(argp), so=Math.sin(argp);
    var x = (cO*co - sO*so*ci)*x_pf + (-cO*so - sO*co*ci)*y_pf;
    var y = (so*si)*x_pf + (co*si)*y_pf;
    var z = (sO*co + cO*so*ci)*x_pf + (-sO*so + cO*co*ci)*y_pf;
    return vec3(x,y,z);
  }

  // Terra
  function drawEarth(){
    var p = worldToScreen(vec3(0,0,0));
    var R = projectRadius(R_EARTH);
    if (showShadow){
      var grdS = ctx.createRadialGradient(cx-0.2*R, cy-0.1*R, R*0.2, cx, cy, R*1.3);
      grdS.addColorStop(0, "rgba(0,0,0,0.0)");
      grdS.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = grdS;
      ctx.beginPath(); ctx.arc(p.x,p.y,R,0,Math.PI*2); ctx.fill();
    }
    var grd = ctx.createRadialGradient(p.x-0.3*R, p.y-0.35*R, R*0.2, p.x, p.y, R*1.1);
    grd.addColorStop(0, "#2a6fdb");
    grd.addColorStop(1, "#0a1d47");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x,p.y,R,0,Math.PI*2); ctx.fill();
    if (showAtmo){
      var Ra = R*1.04;
      var g2 = ctx.createRadialGradient(p.x, p.y, R*0.95, p.x, p.y, Ra);
      g2.addColorStop(0, "rgba(120,200,255,0.05)");
      g2.addColorStop(1, "rgba(120,200,255,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,Math.PI*2); ctx.fill();
    }
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
    ctx.strokeStyle = "rgba(96,165,250,0.8)";
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

  function drawCubeSat(p){
    var s = worldToScreen(p);
    var size = clamp(8 + 1200/(1 + s.z + 1e-6), 2, 14);
    ctx.fillStyle = "#eaf1ff";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(s.x - size/2, s.y - size/2, size, size);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#60a5fa";
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
    elPerV.textContent = (perigeeAlt/1000).toFixed(0);
    elApoV.textContent = (apogeeAlt/1000).toFixed(0);
    elInclV.textContent= inclDeg.toFixed(0);
    elRAANV.textContent= raanDeg.toFixed(0);
    elArgpV.textContent= argpDeg.toFixed(0);
    elM0V.textContent  = m0Deg.toFixed(0);
    elTSV.textContent  = timescale.toFixed(1)+"×";
    elTrailV.textContent = trailMax.toFixed(0);
    trail = [];
  }
  elPer.oninput = elApo.oninput = elIncl.oninput = elRAAN.oninput = elArgp.oninput = elM0.oninput = elTS.oninput = elTrail.oninput = syncUI;
  document.getElementById('showAxes').onchange = function(e){ showAxes = e.target.checked; };
  document.getElementById('showOrbit').onchange= function(e){ showOrbit= e.target.checked; };
  document.getElementById('atmo').onchange     = function(e){ showAtmo = e.target.checked; };
  document.getElementById('shadow').onchange   = function(e){ showShadow = e.target.checked; };

  elScenario.onchange = function(){
    var v = elScenario.value;
    if (v==='launch'){
      elPer.value=200; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0;
      elTS.value=3; elTrail.value=400;
    }else if(v==='leo'){
      elPer.value=400; elApo.value=400; elIncl.value=51; elRAAN.value=0; elArgp.value=0; elM0.value=0;
      elTS.value=5; elTrail.value=800;
    }else if(v==='ellipse'){
      elPer.value=300; elApo.value=800; elIncl.value=63; elRAAN.value=90; elArgp.value=30; elM0.value=0;
      elTS.value=6; elTrail.value=1000;
    }else if(v==='gto'){
      elPer.value=250; elApo.value=35786; elIncl.value=27; elRAAN.value=20; elArgp.value=180; elM0.value=0;
      elTS.value=30; elTrail.value=2000;
    }
    syncUI();
  };

  document.getElementById('btnPlay').onclick = function(){ running = true; };
  document.getElementById('btnPause').onclick= function(){ running = false; };
  document.getElementById('btnReset').onclick= function(){ t=0; trail=[]; };

  var deferredPrompt=null, installBtn=document.getElementById('btnInstall');
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault(); deferredPrompt=e; installBtn.hidden=false;
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

  function simulateLaunch(dt, elems){
    t += dt;
    var k = clamp(t/120, 0, 1);
    var a = elems.a;
    var e = elems.e * k;
    var i = elems.i * k;
    var raan= elems.raan * k;
    var argp= elems.argp * k;
    var M0  = elems.M0 * k;
    return elementsToState(a,e,i,raan,argp,M0,t);
  }

  var lastTS = performance.now();
  function loop(now){
    requestAnimFrame(loop);
    var dt = (now - lastTS)/1000; lastTS = now;
    dt = Math.min(dt, 0.05);

    var elems = deriveElements();
    var pos;
    if (document.getElementById('scenario').value==='launch'){
      pos = simulateLaunch(dt*timescale, elems);
    }else{
      t += dt*timescale;
      pos = elementsToState(elems.a, elems.e, elems.i, elems.raan, elems.argp, elems.M0, t);
    }

    if (running){
      trail.push(pos);
      if (trail.length>trailMax) trail.shift();
    }

    cam.theta += 0.03*dt;
    cam.phi = 0.9 + 0.15*Math.sin(now*0.0005);

    ctx.clearRect(0,0,W,H);
    drawStars(now);
    drawEarth();
    drawOrbitPath(trail);
    drawCubeSat(pos);

    var rmag = Math.sqrt(dot(pos,pos));
    var alt = rmag - R_EARTH;
    updateHUD(
      "t=" + t.toFixed(1) + "s | alt=" + (alt/1000).toFixed(0) + "km | a=" + (elems.a/1000).toFixed(0) + "km | e=" + elems.e.toFixed(3) +
      " | i=" + inclDeg.toFixed(1) + "° | Ω=" + raanDeg.toFixed(0) + "° | ω=" + argpDeg.toFixed(0) + "° | M₀=" + m0Deg.toFixed(0) + "°"
    );
  }
  requestAnimFrame(loop);

  function drawStars(now){
    var n = 140;
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
})();