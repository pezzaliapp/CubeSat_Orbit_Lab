/* CubeSat Orbit Lab — v3.2 SAFE
   Canvas 2D simulatore divulgativo di orbita CubeSat
   Compatibile con index.html 3.2 SAFE (no Three.js)
   © 2025 pezzaliAPP — MIT License
*/

(function(){
'use strict';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const mini = document.getElementById('miniMap');
const mctx = mini.getContext('2d');

const R_EARTH = 6371e3;
const MU = 3.986004418e14;
const DEG = Math.PI/180;

let t = 0, running = false;
let perigeeAlt = 400e3, apogeeAlt = 400e3;
let inclDeg = 51, raanDeg = 0, argpDeg = 0, m0Deg = 0;
let timescale = 5, trailMax = 1200, useDrag = false, CdA_over_m = 0.02;
let trail = [], logSamples = [];

function v3(x,y,z){return{x:x,y:y,z:z}}
function add(a,b){return v3(a.x+b.x,a.y+b.y,a.z+b.z)}
function sub(a,b){return v3(a.x-b.x,a.y-b.y,a.z-b.z)}
function mul(a,s){return v3(a.x*s,a.y*s,a.z*s)}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}
function len(a){return Math.sqrt(dot(a,a))}
function nrm(a){const L=len(a);return L>0?mul(a,1/L):v3(0,0,0)}

function elementsToState(a,e,i,raan,argp,M0,t){
  const n=Math.sqrt(MU/Math.pow(a,3));
  const M=(M0+n*t)%(2*Math.PI);
  let E=M;
  for(let k=0;k<10;k++){
    const f=E-e*Math.sin(E)-M;
    const fp=1-e*Math.cos(E);
    E-=f/fp;
  }
  const cE=Math.cos(E), sE=Math.sin(E);
  const fac=Math.sqrt(1-e*e);
  const nu=Math.atan2(fac*sE,cE-e);
  const r=a*(1-e*cE);
  const x=r*Math.cos(nu), y=r*Math.sin(nu);

  const cO=Math.cos(raan), sO=Math.sin(raan);
  const ci=Math.cos(i), si=Math.sin(i);
  const co=Math.cos(argp), so=Math.sin(argp);

  const R11=cO*co-sO*so*ci, R12=-cO*so-sO*co*ci;
  const R21=sO*co+cO*so*ci, R22=-sO*so+cO*co*ci;
  const R31=so*si, R32=co*si;

  return v3(R11*x+R12*y, R21*x+R22*y, R31*x+R32*y);
}

function derive(){
  const rp=R_EARTH+perigeeAlt;
  const ra=R_EARTH+apogeeAlt;
  const a=0.5*(rp+ra);
  const e=(ra-rp)/(ra+rp);
  return {a,e,i:inclDeg*DEG,raan:raanDeg*DEG,argp:argpDeg*DEG,M0:m0Deg*DEG};
}

function eciToLatLon(p){
  const r=len(p);
  return {lat:Math.asin(p.y/r)/DEG, lon:Math.atan2(p.z,p.x)/DEG};
}

function drawMini(p){
  mctx.fillStyle="#071022";
  mctx.fillRect(0,0,mini.width,mini.height);
  mctx.strokeStyle="#12306a";
  mctx.strokeRect(0,0,mini.width,mini.height);
  const {lat,lon}=eciToLatLon(p);
  const x=(lon+180)/360*mini.width;
  const y=(90-lat)/180*mini.height;
  mctx.fillStyle="#60a5fa";
  mctx.fillRect(x-2,y-2,4,4);
}

function drawScene(p){
  const cx=canvas.width/2, cy=canvas.height/2;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // sfondo
  const grd=ctx.createRadialGradient(cx,cy,0,cx,cy,900);
  grd.addColorStop(0,"#0b1022");
  grd.addColorStop(1,"#050918");
  ctx.fillStyle=grd;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // Terra
  ctx.fillStyle="#0a1d47";
  ctx.beginPath();
  ctx.arc(cx,cy,120,0,2*Math.PI);
  ctx.fill();
  // orbita
  ctx.strokeStyle="#2dd4bf";
  ctx.beginPath();
  trail.forEach((tp,i)=>{
    const x=cx+tp.x/1e5;
    const y=cy+tp.z/1e5;
    if(i===0)ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // satellite
  ctx.fillStyle="#eaf1ff";
  const sx=cx+p.x/1e5, sy=cy+p.z/1e5;
  ctx.fillRect(sx-4,sy-4,8,8);
}

function HUDmsg(s){hud.textContent=s;}

function syncUI(){
  perigeeAlt=parseFloat(perigee.value)*1000;
  apogeeAlt=parseFloat(apogee.value)*1000;
  inclDeg=parseFloat(incl.value);
  raanDeg=parseFloat(raan.value);
  argpDeg=parseFloat(argp.value);
  m0Deg=parseFloat(m0.value);
  timescale=parseFloat(timescaleEl.value);
  trailMax=parseInt(trailEl.value,10);
  CdA_over_m=parseFloat(cda.value);
  useDrag=drag.checked;

  perigeeVal.textContent=(perigeeAlt/1000).toFixed(0);
  apogeeVal.textContent=(apogeeAlt/1000).toFixed(0);
  inclVal.textContent=inclDeg.toFixed(0);
  raanVal.textContent=raanDeg.toFixed(0);
  argpVal.textContent=argpDeg.toFixed(0);
  m0Val.textContent=m0Deg.toFixed(0);
  timescaleVal.textContent=timescale.toFixed(1)+"×";
  trailVal.textContent=trailMax;
  cdaVal.textContent=CdA_over_m.toFixed(3);
  trail=[];
  logSamples=[];
}

const perigee=document.getElementById('perigee');
const apogee=document.getElementById('apogee');
const incl=document.getElementById('incl');
const raan=document.getElementById('raan');
const argp=document.getElementById('argp');
const m0=document.getElementById('m0');
const timescaleEl=document.getElementById('timescale');
const trailEl=document.getElementById('trail');
const drag=document.getElementById('drag');
const cda=document.getElementById('cda');
const perigeeVal=document.getElementById('perigeeVal');
const apogeeVal=document.getElementById('apogeeVal');
const inclVal=document.getElementById('inclVal');
const raanVal=document.getElementById('raanVal');
const argpVal=document.getElementById('argpVal');
const m0Val=document.getElementById('m0Val');
const timescaleVal=document.getElementById('timescaleVal');
const trailVal=document.getElementById('trailVal');
const cdaVal=document.getElementById('cdaVal');
const scenario=document.getElementById('scenario');

['input','change'].forEach(evt=>{
  [perigee,apogee,incl,raan,argp,m0,timescaleEl,trailEl,cda].forEach(n=>n.addEventListener(evt,syncUI));
});
drag.addEventListener('change',syncUI);
scenario.addEventListener('change',()=>{
  const v=scenario.value;
  if(v==='launch'){perigee.value=200;apogee.value=400;incl.value=51;}
  if(v==='leo'){perigee.value=400;apogee.value=400;incl.value=51;}
  if(v==='ellipse'){perigee.value=300;apogee.value=800;incl.value=63;}
  if(v==='gto'){perigee.value=250;apogee.value=35786;incl.value=27;}
  syncUI();
});

document.getElementById('btnPlay').onclick=()=>{running=true};
document.getElementById('btnPause').onclick=()=>{running=false};
document.getElementById('btnReset').onclick=()=>{t=0;trail=[];logSamples=[];running=false};

document.getElementById('btnExport').onclick=()=>{
  if(!logSamples.length){alert("Nessun dato da esportare.");return;}
  const header="t_s,x_m,y_m,z_m,alt_km";
  const csv=[header,...logSamples.map(r=>r.join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='cubesat_data.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};

window.addEventListener('keydown',e=>{
  if(e.code==='Space'){running=!running;e.preventDefault();}
});

let last=performance.now();
function loop(){
  const now=performance.now();
  const dt=Math.min((now-last)/1000,0.05);
  last=now;
  if(running)t+=dt*timescale;

  const E=derive();
  const p=elementsToState(E.a,E.e,E.i,E.raan,E.argp,E.M0,t);
  if(running){
    trail.push(p);
    if(trail.length>trailMax)trail.shift();
    const alt=len(p)-R_EARTH;
    logSamples.push([t.toFixed(2),p.x.toFixed(1),p.y.toFixed(1),p.z.toFixed(1),(alt/1000).toFixed(2)]);
    if(logSamples.length>30000)logSamples.shift();
  }
  drawScene(p);
  drawMini(p);
  const alt=len(p)-R_EARTH;
  HUDmsg(`t=${t.toFixed(1)}s | alt=${(alt/1000).toFixed(0)}km | a=${(E.a/1000).toFixed(0)}km | e=${E.e.toFixed(3)} | i=${inclDeg.toFixed(1)}°`);
  requestAnimationFrame(loop);
}

syncUI();
loop();
})();
