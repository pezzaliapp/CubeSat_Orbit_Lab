(function(){
'use strict';
const R_EARTH=6371e3, MU=3.986004418e14, RHO0=1.225, Hs=8500;
const v3=(x,y,z)=>({x,y,z}), add=(a,b)=>v3(a.x+b.x,a.y+b.y,a.z+b.z), sub=(a,b)=>v3(a.x-b.x,a.y-b.y,a.z-b.z), mul=(a,s)=>v3(a.x*s,a.y*s,a.z*s), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z, len=a=>Math.sqrt(dot(a,a)), nrm=a=>{const L=len(a); return L>0?mul(a,1/L):v3(0,0,0)}, cr=(a,b)=>v3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const rad=d=>d*Math.PI/180, clamp=(v,a,b)=>v<a?a:(v>b?b:v);

const canvas=document.getElementById('view'), ctx=canvas.getContext('2d');
const mini=document.getElementById('miniMap'), mctx=mini.getContext('2d');
let W=canvas.width,H=canvas.height,cx=W/2,cy=H/2;

let running=false,t=0,starT=0,timescale=5,trailMax=1200,trail=[],logSamples=[];
let perigeeAlt=400e3, apogeeAlt=400e3, inclDeg=51, raanDeg=0, argpDeg=0, m0Deg=0;
let useDrag=false, CdA_over_m=0.02;
let showAxes=true, showOrbit=true, showAtmo=true, showShadow=true, showLegend=true;
let cam={ r:2.8*R_EARTH, theta:-0.8, phi:0.9, fov:900, target:{x:0,y:0,z:0} };
let sunTheta=0;

function sph(r,th,ph){return v3(r*Math.cos(ph)*Math.cos(th), r*Math.sin(ph), r*Math.cos(ph)*Math.sin(th))}
function w2s(p){const cp=sph(cam.r,cam.theta,cam.phi), f=nrm(sub(cam.target,cp)), r=nrm(cr(f,v3(0,1,0))), u=nrm(cr(r,f)); const rel=sub(p,cp); const x=dot(rel,r), y=dot(rel,u), z=dot(rel,f); const s=cam.fov/Math.max(1e-6,(cam.fov+z)); return {x:cx+x*s,y:cy-y*s,z}}
function projR(r){const p=w2s(v3(r,0,0)), c=w2s(v3(0,0,0)); return Math.hypot(p.x-c.x, p.y-c.y)}
function sunDir(){const th=sunTheta, ph=0.2; const x=Math.cos(ph)*Math.cos(th), z=Math.cos(ph)*Math.sin(th), y=Math.sin(ph); const n=Math.sqrt(x*x+y*y+z*z)||1; return {x:x/n,y:y/n,z:z/n}}

function el2sv(a,e,i,raan,argp,M0,t){const n=Math.sqrt(MU/Math.pow(a,3)),M=(M0+n*t)%(2*Math.PI); let E=M; for(let k=0;k<10;k++){const f=E-e*Math.sin(E)-M,fp=1-e*Math.cos(E);E-=f/fp}
 const cE=Math.cos(E), sE=Math.sin(E), fac=Math.sqrt(1-e*e), nu=Math.atan2(fac*sE,cE-e), r=a*(1-e*cE);
 const x=r*Math.cos(nu), y=r*Math.sin(nu);
 const cO=Math.cos(raan), sO=Math.sin(raan), ci=Math.cos(i), si=Math.sin(i), co=Math.cos(argp), so=Math.sin(argp);
 const R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R31=so*si, R32=co*si;
 return {r:v3(R11*x+R12*y, R21*x+R22*y, R31*x+R32*y)}}

function derive(){const rp=R_EARTH+perigeeAlt, ra=R_EARTH+apogeeAlt; return {a:.5*(rp+ra), e:(ra-rp)/(ra+rp), i:rad(inclDeg), raan:rad(raanDeg), argp:rad(argpDeg), M0:rad(m0Deg)}}
function accel(r,v){const rmag=len(r), aG=mul(r,-MU/(rmag*rmag*rmag)), h=rmag-R_EARTH, rho=RHO0*Math.exp(-Math.max(0,Math.min(h,1e6))/Hs), vmag=Math.max(1e-3,len(v)), aD=mul(nrm(v), -0.5*CdA_over_m*rho*vmag*vmag); return add(aG,aD)}

function drawEarthShadow(){const p=w2s(v3(0,0,0)), R=projR(R_EARTH); ctx.fillStyle="#13306d"; ctx.beginPath(); ctx.arc(p.x,p.y,R,0,6.283); ctx.fill();
 const sd=sunDir(), d=w2s(sd); let dx=d.x-cx, dy=d.y-cy; const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L; ctx.save(); ctx.beginPath(); ctx.arc(p.x,p.y,R,0,6.283); ctx.clip();
 const gx=p.x-dx*R, gy=p.y-dy*R, ex=p.x+dx*R, ey=p.y+dy*R; const g=ctx.createLinearGradient(gx,gy,ex,ey); g.addColorStop(0,"#2a6fdb"); g.addColorStop(.52,"#12306a"); g.addColorStop(.54,"#081733"); g.addColorStop(1,"#040a1a"); ctx.fillStyle=g; ctx.fillRect(p.x-R,p.y-R,2*R,2*R); ctx.restore();
 if(showAtmo){const Ra=R*1.05; const g2=ctx.createRadialGradient(p.x,p.y,R*.95,p.x,p.y,Ra); g2.addColorStop(0,"rgba(120,200,255,.05)"); g2.addColorStop(1,"rgba(120,200,255,0)"); ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,6.283); ctx.fill()}
 if(showAxes){ctx.strokeStyle="rgba(255,255,255,.2)"; ctx.lineWidth=1; const a=[v3(R_EARTH*1.3,0,0),v3(-R_EARTH*1.3,0,0),v3(0,R_EARTH*1.3,0),v3(0,-R_EARTH*1.3,0),v3(0,0,R_EARTH*1.3),v3(0,0,-R_EARTH*1.3)]; ctx.beginPath(); for(let i=0;i<a.length;i+=2){const A=w2s(a[i]),B=w2s(a[i+1]); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y)} ctx.stroke()}}
function drawEarthPlain(){const p=w2s(v3(0,0,0)), R=projR(R_EARTH); ctx.fillStyle="#0a1d47"; ctx.beginPath(); ctx.arc(p.x,p.y,R,0,6.283); ctx.fill(); if(showAtmo){const Ra=R*1.05; const g2=ctx.createRadialGradient(p.x,p.y,R*.95,p.x,p.y,Ra); g2.addColorStop(0,"rgba(120,200,255,.05)"); g2.addColorStop(1,"rgba(120,200,255,0)"); ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(p.x,p.y,Ra,0,6.283); ctx.fill()}}
function drawStars(sT){ctx.save(); ctx.globalAlpha=.85; for(let i=0;i<160;i++){const x=(i*97)%W,y=(i*233)%H,tw=(Math.sin(sT+i)*.5+.5)*.7+.3; ctx.fillStyle=`rgba(255,255,255,${tw.toFixed(3)})`; ctx.fillRect(x,y,1,1)} ctx.restore()}
function drawOrbitPath(P){if(!showOrbit||P.length<2)return; ctx.strokeStyle="rgba(96,165,250,.85)"; ctx.lineWidth=1.5; ctx.beginPath(); let s=w2s(P[0]); ctx.moveTo(s.x,s.y); for(let i=1;i<P.length;i++){s=w2s(P[i]); ctx.lineTo(s.x,s.y)} ctx.stroke()}
function drawCubeSat(p){const s=w2s(p), size=Math.min(14,Math.max(2,8+1200/(1+s.z+1e-6))); const lit=dot(nrm(p),sunDir())>0; ctx.fillStyle=lit?"#eaf1ff":"#9aa6bf"; ctx.strokeStyle="rgba(0,0,0,.25)"; ctx.lineWidth=1; ctx.beginPath(); ctx.rect(s.x-size/2,s.y-size/2,size,size); ctx.fill(); ctx.stroke(); ctx.fillStyle=lit?"#60a5fa":"#4e6da3"; ctx.fillRect(s.x-size*1.2-size*0.7,s.y-size*0.3,size*0.7,size*0.6); ctx.fillRect(s.x+size*1.2,s.y-size*0.3,size*0.7,size*0.6)}

const hud=document.getElementById('hud'); const HUD=s=>hud.textContent=s;

const elPer=perigee, elApo=apogee, elIncl=incl, elRAAN=raan, elArgp=argp, elM0=m0, elTS=timescale, elTrail=trail, elPerV=perigeeVal, elApoV=apogeeVal, elInclV=inclVal, elRAANV=raanVal, elArgpV=argpVal, elM0V=m0Val, elTSV=timescaleVal, elTrailV=trailVal, elScenario=scenario, elDrag=drag, elCdA=cda, elCdAV=cdaVal;
const btnPlay=btnPause.previousElementSibling, btnPause=btnPause, btnReset=btnReset, btnExport=btnExport, btnStep=btnStep;

showAxes=showAxes.checked; showOrbit=showOrbit.checked; showAtmo=atmo.checked; showShadow=shadow.checked; showLegend=legend.checked;

function sync(){perigeeAlt=parseFloat(elPer.value)*1000; apogeeAlt=parseFloat(elApo.value)*1000; inclDeg=parseFloat(elIncl.value); raanDeg=parseFloat(elRAAN.value); argpDeg=parseFloat(elArgp.value); m0Deg=parseFloat(elM0.value); timescale=parseFloat(elTS.value); trailMax=parseInt(elTrail.value,10); useDrag=elDrag.checked; CdA_over_m=parseFloat(elCdA.value);
 elPerV.textContent=(perigeeAlt/1000).toFixed(0); elApoV.textContent=(apogeeAlt/1000).toFixed(0); elInclV.textContent=inclDeg.toFixed(0); elRAANV.textContent=raanDeg.toFixed(0); elArgpV.textContent=argpDeg.toFixed(0); elM0V.textContent=m0Deg.toFixed(0); elTSV.textContent=timescale.toFixed(1)+'×'; elTrailV.textContent=trailMax.toFixed(0); elCdAV.textContent=CdA_over_m.toFixed(3);
 trail=[]; logSamples=[]; if(useDrag){const E=derive(); const sv=el2sv(E.a,E.e,E.i,E.raan,E.argp,E.M0,t); dyn.r=sv.r; dyn.v=v3(0,0,0);}}
['input','change'].forEach(evt=>[elPer,elApo,elIncl,elRAAN,elArgp,elM0,elTS,elTrail,elCdA].forEach(n=>n.addEventListener(evt,sync)));
elDrag.addEventListener('change',sync);
showAxesEl.onchange=e=>showAxes=e.target.checked; showOrbitEl.onchange=e=>showOrbit=e.target.checked; atmo.onchange=e=>showAtmo=e.target.checked; shadow.onchange=e=>showShadow=e.target.checked; legend.onchange=e=>showLegend=e.target.checked;

elScenario.onchange=()=>{const v=elScenario.value; if(v==='launch'){elPer.value=200;elApo.value=400;elIncl.value=51;elRAAN.value=0;elArgp.value=0;elM0.value=0;elTS.value=3;elTrail.value=600}
else if(v==='leo'){elPer.value=400;elApo.value=400;elIncl.value=51;elRAAN.value=0;elArgp.value=0;elM0.value=0;elTS.value=5;elTrail.value=1200}
else if(v==='ellipse'){elPer.value=300;elApo.value=800;elIncl.value=63;elRAAN.value=90;elArgp.value=30;elM0.value=0;elTS.value=6;elTrail.value=1600}
else if(v==='gto'){elPer.value=250;elApo.value=35786;elIncl.value=27;elRAAN.value=20;elArgp.value=180;elM0.value=0;elTS.value=60;elTrail.value=4000} sync()}

btnPlay.onclick=()=>{running=true; btnPlay.classList.add('primary'); btnPause.classList.remove('primary')}
btnPause.onclick=()=>{running=false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary')}
btnReset.onclick=()=>{running=false; t=0; starT=0; trail=[]; logSamples=[]; btnPause.classList.add('primary'); btnPlay.classList.remove('primary')}
btnStep.onclick=()=>{ if(!running){ t+=1*timescale; } } // un passo di Δt in pausa
window.addEventListener('keydown',e=>{ if(e.code==='Space'){e.preventDefault(); running=!running; if(running){btnPlay.classList.add('primary'); btnPause.classList.remove('primary')}else{btnPause.classList.add('primary'); btnPlay.classList.remove('primary')}} if(e.key==='+'){elTS.value=Math.min(240,parseFloat(elTS.value)+1); sync()} if(e.key==='-'){elTS.value=Math.max(0.1,parseFloat(elTS.value)-1); sync()} if(e.key==='0'){cam.theta=-0.8; cam.phi=0.9} });

function onResize(){const r=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1; canvas.width=Math.max(800,Math.floor((r.width||1200)*dpr)); canvas.height=Math.floor(canvas.width*9/16); W=canvas.width; H=canvas.height; cx=W/2; cy=H/2}
window.addEventListener('resize',onResize); onResize(); sync();

function groundTrack(p){ // naive: lat,lon from ECI assuming J2000 rotation ~0 (demo)
 const lat=Math.asin(p.y/len(p))*180/Math.PI; const lon=Math.atan2(p.z,p.x)*180/Math.PI; return {lat,lon}}
function drawMini(p){mctx.clearRect(0,0,mini.width,mini.height); mctx.fillStyle="#071022"; mctx.fillRect(0,0,mini.width,mini.height); mctx.strokeStyle="#12306a"; mctx.strokeRect(0,0,mini.width,mini.height); const {lat,lon}=groundTrack(p); const x=(lon+180)/360*mini.width, y=(90-lat)/180*mini.height; mctx.fillStyle="#60a5fa"; mctx.fillRect(x-2,y-2,4,4)}

function exportCSV(){ if(logSamples.length===0){alert("Nessun dato da esportare. Premi PLAY per generare telemetria."); return;}
 const header="t_s,x_m,y_m,z_m,alt_km,speed_mps"; const lines=[header]; for(let i=0;i<logSamples.length;i++){lines.push(logSamples[i].join(","))}
 const csvText=lines.join("\n"); const blob=new Blob([csvText],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download="cubesat_telemetry.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500) }
btnExport.onclick=exportCSV;

let dyn={ r:v3(R_EARTH+perigeeAlt,0,0), v:v3(0,0,0) };
let last=performance.now();
function loop(now){requestAnimationFrame(loop); let dt=(now-last)/1000; last=now; dt=Math.min(dt,0.05);
 if(running){ t+=dt*timescale; sunTheta+=dt*0.05; starT+=dt }
 const E=derive(); let pos,spd;
 if(elScenario.value==='launch'&&!useDrag){ const k=clamp(t/120,0,1); const sv=el2sv(E.a,E.e*k,E.i*k,E.raan*k,E.argp*k,E.M0*k,t); pos=sv.r; }
 else if(!useDrag){ pos=el2sv(E.a,E.e,E.i,E.raan,E.argp,E.M0,t).r; }
 else { if(running){ const substeps=Math.max(1,Math.floor(timescale)), hdt=(dt*timescale)/substeps; for(let s=0;s<substeps;s++){ const a1=accel(dyn.r,dyn.v), rv=add(dyn.r,mul(dyn.v,hdt*.5)), vv=add(dyn.v,mul(a1,hdt*.5)), a2=accel(rv,vv); dyn.r=add(dyn.r,mul(vv,hdt)); dyn.v=add(dyn.v,mul(a2,hdt)) } } pos=dyn.r }
 spd = 0; // velocità opzionale (non mostrata nel SAFE)
 if(running){ trail.push(pos); if(trail.length>trailMax) trail.shift(); const alt=len(pos)-R_EARTH; logSamples.push([t.toFixed(2),pos.x.toFixed(1),pos.y.toFixed(1),pos.z.toFixed(1),(alt/1000).toFixed(2),spd.toFixed(2)]); if(logSamples.length>50000) logSamples.shift(); cam.theta+=0.03*dt; cam.phi=0.9+0.15*Math.sin(t*0.0005) }
 ctx.clearRect(0,0,W,H); drawStars(starT); if(showShadow) drawEarthShadow(); else drawEarthPlain(); drawOrbitPath(trail); drawCubeSat(pos); drawMini(pos);
 const alt=len(pos)-R_EARTH; HUD(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}° | Ω=${raanDeg.toFixed(0)}° | ω=${argpDeg.toFixed(0)}° | M₀=${m0Deg.toFixed(0)}°`)
}
requestAnimationFrame(loop);
})();