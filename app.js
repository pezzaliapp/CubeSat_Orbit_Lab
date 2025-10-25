/* CubeSat Orbit Lab — v3.1 (Canvas 2D completo) */
(function(){
  'use strict';
  const R_EARTH = 6371e3;
  const MU      = 3.986004418e14;
  const RHO0    = 1.225;
  const Hs      = 8500.0;

  const canvas = document.getElementById('view');
  const ctx    = canvas.getContext('2d');
  let W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;

  let running = false;
  let t = 0;
  let starT = 0;
  let timescale = 5;
  let trailMax = 800;
  let trail = [];
  let logSamples = [];

  let perigeeAlt = 400e3, apogeeAlt = 400e3;
  let inclDeg = 51, raanDeg = 0, argpDeg = 0, m0Deg = 0;

  let useDrag = false;
  let CdA_over_m = 0.02;

  let showAxes=true, showOrbit=true, showAtmo=true, showShadow=true;

  let cam = { r: 2.8*R_EARTH, theta:-0.8, phi:0.9, fov:900, target:{x:0,y:0,z:0} };
  let sunTheta = 0;

  const v3   = (x,y,z)=>({x,y,z});
  const add  = (a,b)=>v3(a.x+b.x,a.y+b.y,a.z+b.z);
  const sub  = (a,b)=>v3(a.x-b.x,a.y-b.y,a.z-b.z);
  const mul  = (a,s)=>v3(a.x*s,a.y*s,a.z*s);
  const dot  = (a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const len  = (a)=>Math.sqrt(dot(a,a));
  const nrm  = (a)=>{const n=len(a); return n>0?mul(a,1/n):v3(0,0,0);};
  const cr   = (a,b)=>v3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x);
  const rad  = d=>d*Math.PI/180;
  const clamp=(v,a,b)=>v<a?a:(v>b?b:v);

  function sph(r,th,ph){ return v3(r*Math.cos(ph)*Math.cos(th), r*Math.sin(ph), r*Math.cos(ph)*Math.sin(th)); }
  function worldToScreen(p){
    const camPos = sph(cam.r,cam.theta,cam.phi);
    const f = nrm(sub(cam.target, camPos));
    const r = nrm(cr(f, v3(0,1,0)));
    const u = nrm(cr(r, f));
    const rel = sub(p, camPos);
    const x=dot(rel,r), y=dot(rel,u), z=dot(rel,f);
    const s = cam.fov/Math.max(1e-6,(cam.fov+z));
    return { x: cx + x*s, y: cy - y*s, z };
  }
  function projectRadius(r){
    const p = worldToScreen(v3(r,0,0));
    const c = worldToScreen(v3(0,0,0));
    const dx=p.x-c.x, dy=p.y-c.y; return Math.hypot(dx,dy);
  }
  function sunDir(){
    const th=sunTheta, ph=0.2;
    const x=Math.cos(ph)*Math.cos(th), z=Math.cos(ph)*Math.sin(th), y=Math.sin(ph);
    const n=Math.sqrt(x*x+y*y+z*z)||1; return {x:x/n,y:y/n,z:z/n};
  }

  function elementsToStateVel(a,e,i,raan,argp,M0,tsec){
    const n = Math.sqrt(MU/Math.pow(a,3));
    const M = (M0 + n*tsec)%(2*Math.PI);
    let E = M;
    for(let k=0;k<10;k++){
      const f  = E - e*Math.sin(E) - M;
      const fp = 1 - e*Math.cos(E);
      E -= f/fp;
    }
    const cE=Math.cos(E), sE=Math.sin(E), fac=Math.sqrt(1-e*e);
    const nu=Math.atan2(fac*sE, cE-e);
    const r = a*(1-e*cE);
    const x_pf=r*Math.cos(nu), y_pf=r*Math.sin(nu);
    const vx_pf=-Math.sqrt(MU*a)/r * sE;
    const vy_pf= Math.sqrt(MU*a)/r * fac * cE;

    const cO=Math.cos(raan), sO=Math.sin(raan);
    const ci=Math.cos(i),    si=Math.sin(i);
    const co=Math.cos(argp), so=Math.sin(argp);

    const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R13=sO*si;
    const R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R23=-cO*si;
    const R31=so*si,            R32= co*si,            R33= ci;

    const X = R11*x_pf + R12*y_pf;
    const Y = R21*x_pf + R22*y_pf;
    const Z = R31*x_pf + R32*y_pf;

    const VX= R11*vx_pf + R12*vy_pf;
    const VY= R21*vx_pf + R22*vy_pf;
    const VZ= R31*vx_pf + R32*vy_pf;

    return { r:v3(X,Y,Z), v:v3(VX,VY,VZ) };
  }
  function deriveElements(){
    const rp = R_EARTH + perigeeAlt;
    const ra = R_EARTH + apogeeAlt;
    const a  = 0.5*(rp+ra);
    const e  = (ra - rp) / (ra + rp);
    return { a, e, i:rad(inclDeg), raan:rad(raanDeg), argp:rad(argpDeg), M0:rad(m0Deg) };
  }

  let dyn = { r:v3(R_EARTH+perigeeAlt,0,0), v:v3(0,0,0) };
  function accel(r,v){
    const rmag=len(r);
    const aG = mul(r, -MU/(rmag*rmag*rmag));
    const h  = rmag - R_EARTH;
    const rho= RHO0 * Math.exp(-clamp(h,0,1e6)/Hs);
    const vmag=Math.max(1e-3, len(v));
    const aD = mul(nrm(v), -0.5 * CdA_over_m * rho * vmag*vmag);
    return add(aG, aD);
  }

  function drawEarthWithShadow(){
    const p = worldToScreen(v3(0,0,0));
    const Rpx = projectRadius(R_EARTH);
    ctx.fillStyle = "#13306d";
    ctx.beginPath(); ctx.arc(p.x,p.y,Rpx,0,Math.PI*2); ctx.fill();

    const sd = sunDir();
    const d2d = worldToScreen(sd);
    let dx=d2d.x-cx, dy=d2d.y-cy; const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;

    ctx.save();
    ctx.beginPath(); ctx.arc(p.x,p.y,Rpx,0,Math.PI*2); ctx.clip();
    const gx = p.x - dx*Rpx, gy = p.y - dy*Rpx;
    const ex = p.x + dx*Rpx, ey = p.y + dy*Rpx;
    const grd = ctx.createLinearGradient(gx, gy, ex, ey);
    grd.addColorStop(0.00, "#2a6fdb");
    grd.addColorStop(0.52, "#12306a");
    grd.addColorStop(0.54, "#081733");
    grd.addColorStop(1.00, "#040a1a");
    ctx.fillStyle = grd;
    ctx.fillRect(p.x-Rpx, p.y-Rpx, Rpx*2, Rpx*2);
    ctx.restore();

    if (showAtmo){
      const Ra = Rpx*1.05;
      const g2 = ctx.createRadialGradient(p.x, p.y, Rpx*0.95, p.x, p.y, Ra);
      g2.addColorStop(0, "rgba(120,200,255,0.05)");
      g2.addColorStop(1, "rgba(120,200,255,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,Math.PI*2); ctx.fill();
    }

    if (showAxes){
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      const axes = [v3(R_EARTH*1.3,0,0), v3(-R_EARTH*1.3,0,0),
                    v3(0,R_EARTH*1.3,0), v3(0,-R_EARTH*1.3,0),
                    v3(0,0,R_EARTH*1.3), v3(0,0,-R_EARTH*1.3)];
      ctx.beginPath();
      for (let i=0;i<axes.length;i+=2){
        const a=worldToScreen(axes[i]), b=worldToScreen(axes[i+1]);
        ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      }
      ctx.stroke();
    }
  }
  function drawEarthPlain(){
    const p = worldToScreen(v3(0,0,0));
    const Rpx = projectRadius(R_EARTH);
    ctx.fillStyle="#0a1d47"; ctx.beginPath(); ctx.arc(p.x,p.y,Rpx,0,Math.PI*2); ctx.fill();
    if (showAtmo){
      const Ra = Rpx*1.05;
      const g2 = ctx.createRadialGradient(p.x, p.y, Rpx*0.95, p.x, p.y, Ra);
      g2.addColorStop(0, "rgba(120,200,255,0.05)");
      g2.addColorStop(1, "rgba(120,200,255,0.0)");
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,Math.PI*2); ctx.fill();
    }
  }

  function drawStars(twinkleT){
    ctx.save(); ctx.globalAlpha = 0.85;
    for (let i=0;i<160;i++){
      const x=(i*97)%W, y=(i*233)%H;
      const tw=(Math.sin(twinkleT + i)*0.5+0.5)*0.7+0.3;
      ctx.fillStyle=`rgba(255,255,255,${tw.toFixed(3)})`;
      ctx.fillRect(x,y,1,1);
    }
    ctx.restore();
  }
  function drawOrbitPath(points){
    if (!showOrbit || points.length<2) return;
    ctx.strokeStyle="rgba(96,165,250,0.85)"; ctx.lineWidth=1.5;
    ctx.beginPath();
    let s=worldToScreen(points[0]); ctx.moveTo(s.x,s.y);
    for (let i=1;i<points.length;i++){
      s=worldToScreen(points[i]); ctx.lineTo(s.x,s.y);
    }
    ctx.stroke();
  }
  function drawCubeSat(p){
    const s = worldToScreen(p);
    const size = Math.min(14, Math.max(2, 8 + 1200/(1 + s.z + 1e-6)));
    const lit = dot(nrm(p), sunDir()) > 0;
    ctx.fillStyle = lit ? "#eaf1ff" : "#9aa6bf";
    ctx.strokeStyle="rgba(0,0,0,0.25)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.rect(s.x-size/2, s.y-size/2, size, size); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lit ? "#60a5fa" : "#4e6da3";
    ctx.fillRect(s.x - size*1.2 - size*0.7, s.y - size*0.3, size*0.7, size*0.6);
    ctx.fillRect(s.x + size*1.2,             s.y - size*0.3, size*0.7, size*0.6);
  }

  const hud = document.getElementById('hud');
  const HUD = s => hud.textContent = s;

  const elPer   = document.getElementById('perigee');
  const elApo   = document.getElementById('apogee');
  const elIncl  = document.getElementById('incl');
  const elRAAN  = document.getElementById('raan');
  const elArgp  = document.getElementById('argp');
  const elM0    = document.getElementById('m0');
  const elTS    = document.getElementById('timescale');
  const elTrail = document.getElementById('trail');
  const elPerV  = document.getElementById('perigeeVal');
  const elApoV  = document.getElementById('apogeeVal');
  const elInclV = document.getElementById('inclVal');
  const elRAANV = document.getElementById('raanVal');
  const elArgpV = document.getElementById('argpVal');
  const elM0V   = document.getElementById('m0Val');
  const elTSV   = document.getElementById('timescaleVal');
  const elTrailV= document.getElementById('trailVal');
  const elScenario = document.getElementById('scenario');
  const elDrag  = document.getElementById('drag');
  const elCdA   = document.getElementById('cda');
  const elCdAV  = document.getElementById('cdaVal');

  const btnPlay   = document.getElementById('btnPlay');
  const btnPause  = document.getElementById('btnPause');
  const btnReset  = document.getElementById('btnReset');
  const btnExport = document.getElementById('btnExport');

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

    elPerV.textContent  = (perigeeAlt/1000).toFixed(0);
    elApoV.textContent  = (apogeeAlt/1000).toFixed(0);
    elInclV.textContent = inclDeg.toFixed(0);
    elRAANV.textContent = raanDeg.toFixed(0);
    elArgpV.textContent = argpDeg.toFixed(0);
    elM0V.textContent   = m0Deg.toFixed(0);
    elTSV.textContent   = timescale.toFixed(1) + "×";
    elTrailV.textContent= trailMax.toFixed(0);
    elCdAV.textContent  = CdA_over_m.toFixed(3);

    trail = [];
    logSamples = [];

    if (useDrag){
      const E = deriveElements();
      const sv = elementsToStateVel(E.a,E.e,E.i,E.raan,E.argp,E.M0,t);
      dyn.r = sv.r; dyn.v = sv.v;
    }
  }
  [elPer,elApo,elIncl,elRAAN,elArgp,elM0,elTS,elTrail,elCdA].forEach(n=>{
    n.addEventListener('input', syncUI);
    n.addEventListener('change', syncUI);
  });
  elDrag.addEventListener('change', syncUI);
  document.getElementById('showAxes').onchange   = e=>{showAxes=e.target.checked;};
  document.getElementById('showOrbit').onchange  = e=>{showOrbit=e.target.checked;};
  document.getElementById('atmo').onchange       = e=>{showAtmo=e.target.checked;};
  document.getElementById('shadow').onchange     = e=>{showShadow=e.target.checked;};

  elScenario.onchange = ()=>{
    const v = elScenario.value;
    if (v==='launch'){  elPer.value=200; elApo.value=400; elIncl.value=51; elRAAN.value=0;  elArgp.value=0;   elM0.value=0;   elTS.value=3;  elTrail.value=600; }
    else if (v==='leo'){elPer.value=400; elApo.value=400; elIncl.value=51; elRAAN.value=0;  elArgp.value=0;   elM0.value=0;   elTS.value=5;  elTrail.value=1200; }
    else if (v==='ellipse'){elPer.value=300; elApo.value=800; elIncl.value=63; elRAAN.value=90; elArgp.value=30; elM0.value=0;  elTS.value=6;  elTrail.value=1600; }
    else if (v==='gto'){ elPer.value=250; elApo.value=35786; elIncl.value=27; elRAAN.value=20; elArgp.value=180; elM0.value=0; elTS.value=60; elTrail.value=4000; }
    syncUI();
  };

  btnPlay.onclick  = ()=>{ running=true;  btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); };
  btnPause.onclick = ()=>{ running=false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); };
  btnReset.onclick = ()=>{
    running=false; t=0; starT=0; trail=[]; logSamples=[];
    btnPause.classList.add('primary'); btnPlay.classList.remove('primary');
    if (useDrag){ const E=deriveElements(); const sv=elementsToStateVel(E.a,E.e,E.i,E.raan,E.argp,E.M0,t); dyn.r=sv.r; dyn.v=sv.v; }
  };
  btnExport.onclick= ()=>{
    if (!logSamples.length){ alert("Nessun dato da esportare. Premi PLAY."); return; }
    const header="t_s,x_m,y_m,z_m,alt_km,speed_mps\\n";
    const lines=[header, ...logSamples.map(r=>r.join(",")+"\\n")];
    const blob = new Blob(lines, {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download="cubesat_telemetry.csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  window.addEventListener('keydown', e=>{
    if (e.code==='Space'){ e.preventDefault(); running=!running;
      if (running){ btnPlay.classList.add('primary'); btnPause.classList.remove('primary'); }
      else         { btnPause.classList.add('primary'); btnPlay.classList.remove('primary'); }
    }
  });

  function onResize(){
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio||1;
    canvas.width  = Math.max(640, Math.floor((r.width||960)*dpr));
    canvas.height = Math.floor(canvas.width*9/16);
    W=canvas.width; H=canvas.height; cx=W/2; cy=H/2;
  }
  window.addEventListener('resize', onResize);
  onResize(); syncUI();

  let lastTS = performance.now();
  function loop(now){
    requestAnimationFrame(loop);
    let dt = (now - lastTS)/1000; lastTS = now;
    dt = Math.min(dt, 0.05);

    if (running){ t += dt*timescale; sunTheta += dt*0.05; starT += dt; }

    const E = deriveElements();
    let pos, vel, spd;

    if (elScenario.value==='launch' && !useDrag){
      const k = Math.max(0, Math.min(1, t/120));
      const a=E.a, e=E.e*k, i=E.i*k, raan=E.raan*k, argp=E.argp*k, M0=E.M0*k;
      const sv = elementsToStateVel(a,e,i,raan,argp,M0,t);
      pos=sv.r; vel=sv.v; spd=len(vel);
    } else if (!useDrag){
      const sv = elementsToStateVel(E.a,E.e,E.i,E.raan,E.argp,E.M0,t);
      pos=sv.r; vel=sv.v; spd=len(vel);
    } else {
      if (running){
        const substeps = Math.max(1, Math.floor(timescale));
        const hdt = (dt*timescale)/substeps;
        for (let s=0;s<substeps;s++){
          const a1 = accel(dyn.r, dyn.v);
          const rv = add(dyn.r, mul(dyn.v, hdt*0.5));
          const vv = add(dyn.v, mul(a1,   hdt*0.5));
          const a2 = accel(rv, vv);
          dyn.r = add(dyn.r, mul(vv, hdt));
          dyn.v = add(dyn.v, mul(a2, hdt));
        }
      }
      pos=dyn.r; vel=dyn.v; spd=len(vel);
    }

    if (running){
      trail.push(pos); if (trail.length>trailMax) trail.shift();
      const alt = len(pos) - R_EARTH;
      logSamples.push([t.toFixed(2), pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1), (alt/1000).toFixed(2), spd.toFixed(2)]);
      if (logSamples.length>50000) logSamples.shift();
      cam.theta += 0.03*dt;
      cam.phi = 0.9 + 0.15*Math.sin(t*0.0005);
    }

    ctx.clearRect(0,0,W,H);
    drawStars(starT);
    if (showShadow) drawEarthWithShadow(); else drawEarthPlain();
    drawOrbitPath(trail);
    drawCubeSat(pos);

    const alt = len(pos)-R_EARTH;
    HUD(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}°${spd?` | v=${spd.toFixed(0)} m/s`:''}`);
  }
  requestAnimationFrame(loop);
})();