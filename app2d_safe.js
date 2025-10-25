(function(){
'use strict';
var canvas=document.getElementById('view2d'), ctx=canvas.getContext('2d');
var W=canvas.width,H=canvas.height,cx=W/2,cy=H/2;
var running=false,t=0,timescale=5,trailMax=800,trail=[],logSamples=[];
var R_EARTH=6371e3,MU=3.986004418e14;
var perigeeAlt=400e3,apogeeAlt=400e3,inclDeg=51,raanDeg=0,argpDeg=0,m0Deg=0;
function clamp(v,a,b){return v<a?a:(v>b?b:v)} function toRad(d){return d*Math.PI/180}
function v3(x,y,z){return {x:x,y:y,z:z}} function add(a,b){return v3(a.x+b.x,a.y+b.y,a.z+b.z)}
function sub(a,b){return v3(a.x-b.x,a.y-b.y,a.z-b.z)} function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}
function mul(a,s){return v3(a.x*s,a.y*s,a.z*s)} function nrm(a){var n=Math.sqrt(dot(a,a));return n>0?mul(a,1/n):v3(0,0,0)}
function cr(a,b){return v3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x)} function len(a){return Math.sqrt(dot(a,a))}
function sph(r,th,ph){return v3(r*Math.cos(ph)*Math.cos(th), r*Math.sin(ph), r*Math.cos(ph)*Math.sin(th))}
function w2s(p){var cp=sph(2.8*R_EARTH,-0.8,0.9),f=nrm(sub(v3(0,0,0),cp)),r=nrm(cr(f,v3(0,1,0))),u=nrm(cr(r,f));var rel=sub(p,cp);
 var x=dot(rel,r),y=dot(rel,u),z=dot(rel,f),s=900/Math.max(1e-6,(900+z));return {x:cx+x*s,y:cy-y*s,z:z}}
function el2sv(a,e,i,raan,argp,M0,t){var n=Math.sqrt(MU/Math.pow(a,3)),M=(M0+n*t)%(2*Math.PI),E=M;for(var k=0;k<10;k++){var f=E-e*Math.sin(E)-M,fp=1-e*Math.cos(E);E=E-f/fp}
 var cE=Math.cos(E),sE=Math.sin(E),fac=Math.sqrt(1-e*e),nu=Math.atan2(fac*sE, cE-e),r=a*(1-e*cE),x=r*Math.cos(nu),y=r*Math.sin(nu);
 var cO=Math.cos(raan),sO=Math.sin(raan),ci=Math.cos(i),si=Math.sin(i),co=Math.cos(argp),so=Math.sin(argp);
 var R11=cO*co - sO*so*ci, R12=-cO*so - sO*co*ci, R21=sO*co + cO*so*ci, R22=-sO*so + cO*co*ci, R31=so*si, R32=co*si;
 var X=R11*x+R12*y,Y=R21*x+R22*y,Z=R31*x+R32*y; return {r:v3(X,Y,Z)}}
function derive(){var rp=R_EARTH+perigeeAlt,ra=R_EARTH+apogeeAlt,a=.5*(rp+ra),e=(ra-rp)/(ra+rp);return {a:a,e:e,i:toRad(inclDeg),raan:toRad(raanDeg),argp:toRad(argpDeg),M0:toRad(m0Deg)}}
function projR(r){var p=w2s(v3(r,0,0)),c=w2s(v3(0,0,0)),dx=p.x-c.x,dy=p.y-c.y;return Math.sqrt(dx*dx+dy*dy)}
function drawEarth(){var p=w2s(v3(0,0,0)),R=projR(R_EARTH);ctx.fillStyle="#0a1d47";ctx.beginPath();ctx.arc(p.x,p.y,R,0,6.283);ctx.fill();
 var Ra=R*1.05;var g2=ctx.createRadialGradient(p.x,p.y,R*.95,p.x,p.y,Ra);g2.addColorStop(0,"rgba(120,200,255,.05)");g2.addColorStop(1,"rgba(120,200,255,0)");
 ctx.fillStyle=g2;ctx.beginPath();ctx.arc(p.x,p.y,Ra,0,6.283);ctx.fill()}
function drawStars(now){var n=140;ctx.save();ctx.globalAlpha=.85;for(var i=0;i<n;i++){var x=(i*97%W),y=(i*233%H),tw=(Math.sin(now*.001+i)*.5+.5)*.7+.3;
 ctx.fillStyle="rgba(255,255,255,"+tw.toFixed(3)+")";ctx.fillRect(x,y,1,1)}ctx.restore()}
var hud=document.getElementById('hud'); function updHUD(s){hud.textContent=s}
var elPer=perigee,elApo=apogee,elIncl=incl,elRAAN=raan,elArgp=argp,elM0=m0,elTS=timescale,elTrail=trail,elPerV=perigeeVal,elApoV=apogeeVal,elInclV=inclVal,elRAANV=raanVal,elArgpV=argpVal,elM0V=m0Val,elTSV=timescaleVal,elTrailV=trailVal,elScenario=scenario,btnExport=btnExport;
function sync(){perigeeAlt=parseFloat(elPer.value)*1000;apogeeAlt=parseFloat(elApo.value)*1000;inclDeg=parseFloat(elIncl.value);raanDeg=parseFloat(elRAAN.value);argpDeg=parseFloat(elArgp.value);m0Deg=parseFloat(elM0.value);timescale=parseFloat(elTS.value);trailMax=parseInt(elTrail.value,10);
 elPerV.textContent=(perigeeAlt/1000).toFixed(0);elApoV.textContent=(apogeeAlt/1000).toFixed(0);elInclV.textContent=inclDeg.toFixed(0);elRAANV.textContent=raanDeg.toFixed(0);elArgpV.textContent=argpDeg.toFixed(0);elM0V.textContent=m0Deg.toFixed(0);elTSV.textContent=timescale.toFixed(1)+"×";elTrailV.textContent=trailMax.toFixed(0);trail=[];logSamples=[]}
elPer.oninput=elApo.oninput=elIncl.oninput=elRAAN.oninput=elArgp.oninput=elM0.oninput=elTS.oninput=elTrail.oninput=sync; 
elScenario.onchange=function(){var v=elScenario.value; if(v==='launch'){elPer.value=200;elApo.value=400;elIncl.value=51;elRAAN.value=0;elArgp.value=0;elM0.value=0;elTS.value=3;elTrail.value=600}
 else if(v==='leo'){elPer.value=400;elApo.value=400;elIncl.value=51;elRAAN.value=0;elArgp.value=0;elM0.value=0;elTS.value=5;elTrail.value=1200}
 else if(v==='ellipse'){elPer.value=300;elApo.value=800;elIncl.value=63;elRAAN.value=90;elArgp.value=30;elM0.value=0;elTS.value=6;elTrail.value=1600}
 else if(v==='gto'){elPer.value=250;elApo.value=35786;elIncl.value=27;elRAAN.value=20;elArgp.value=180;elM0.value=0;elTS.value=60;elTrail.value=4000} sync()}
var btnPlay=document.getElementById('btnPlay'),btnPause=document.getElementById('btnPause'),btnReset=document.getElementById('btnReset');
btnPlay.onclick=function(){running=true; btnPlay.classList.add('primary'); btnPause.classList.remove('primary')};
btnPause.onclick=function(){running=false; btnPause.classList.add('primary'); btnPlay.classList.remove('primary')};
btnReset.onclick=function(){running=false; t=0; trail=[]; btnPause.classList.add('primary'); btnPlay.classList.remove('primary')};
window.addEventListener('keydown',function(e){if(e.code==='Space'){e.preventDefault();running=!running;if(running){btnPlay.classList.add('primary');btnPause.classList.remove('primary')}else{btnPause.classList.add('primary');btnPlay.classList.remove('primary')}}});
var last=performance.now(); function resize(){var r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(640,Math.floor((r.width||960)*dpr));canvas.height=Math.floor(canvas.width*9/16);W=canvas.width;H=canvas.height;cx=W/2;cy=H/2}
window.addEventListener('resize',resize); resize(); sync();
function loop(nowMs){requestAnimationFrame(loop); var now=nowMs/1000, dt=Math.min(.05,(now-last/1000)); last=nowMs;
 if(running){t+=dt*timescale} var e=derive(); var pos=el2sv(e.a,e.e,e.i,e.raan,e.argp,e.M0,t).r;
 if(running){trail.push(pos); if(trail.length>trailMax) trail.shift()}
 ctx.clearRect(0,0,W,H); drawStars(nowMs); drawEarth();
 if(trail.length>1){ctx.strokeStyle="rgba(96,165,250,.85)";ctx.lineWidth=1.5;ctx.beginPath();var s=w2s(trail[0]);ctx.moveTo(s.x,s.y);for(var i=1;i<trail.length;i++){s=w2s(trail[i]);ctx.lineTo(s.x,s.y)}ctx.stroke()}
 var sp=w2s(pos),R=5; ctx.fillStyle="#eaf1ff"; ctx.fillRect(sp.x-R,sp.y-R,2*R,2*R);
 var alt=len(pos)-R_EARTH; updHUD("t="+t.toFixed(1)+"s | alt="+(alt/1000).toFixed(0)+"km | a="+(e.a/1000).toFixed(0)+"km | e="+e.e.toFixed(3)+" | i="+inclDeg.toFixed(1)+"°")}
requestAnimationFrame(loop);
document.getElementById('btnExport').onclick=function(){if(logSamples.length===0){alert("Premi PLAY per generare telemetria.");return}var header="t_s,x_m,y_m,z_m,alt_km\n";var lines=[header];for(var i=0;i<logSamples.length;i++){lines.push(logSamples[i].join(",")+"\n")}var blob=new Blob(lines,{type:"text/csv"});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download="cubesat_telemetry.csv";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1500)};
})();