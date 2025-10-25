(function(){
'use strict';
var canvas=document.getElementById('view'),ctx=canvas.getContext('2d');
var W=canvas.width,H=canvas.height,cx=W/2,cy=H/2;
var running=false,t=0,starT=0;
var R_EARTH=6371e3,MU=3.986e14;
var trail=[],trailMax=800;
var sunTheta=0,cam={r:2.8*R_EARTH,theta:-0.8,phi:0.9,fov:900,target:{x:0,y:0,z:0}};
function vec3(x,y,z){return{x:x,y:y,z:z}}function add(a,b){return vec3(a.x+b.x,a.y+b.y,a.z+b.z)}
function sub(a,b){return vec3(a.x-b.x,a.y-b.y,a.z-b.z)}function mul(a,s){return vec3(a.x*s,a.y*s,a.z*s)}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}function len(a){return Math.sqrt(dot(a,a))}
function norm(a){var n=len(a);return n>0?mul(a,1/n):vec3(0,0,0)}
function cross(a,b){return vec3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x)}
function sph2cart(r,theta,phi){return vec3(r*Math.cos(phi)*Math.cos(theta),r*Math.sin(phi),r*Math.cos(phi)*Math.sin(theta))}
function worldToScreen(p){var camPos=sph2cart(cam.r,cam.theta,cam.phi);var f=norm(sub(cam.target,camPos));
var rgt=norm(cross(f,vec3(0,1,0)));var up=norm(cross(rgt,f));var rel=sub(p,camPos);var x=dot(rel,rgt),y=dot(rel,up),z=dot(rel,f);
var s=cam.fov/(cam.fov+z+1e-6);return{x:cx+x*s,y:cy-y*s,z:z}}
function drawEarth(){var p=worldToScreen(vec3(0,0,0));ctx.fillStyle="#0a1d47";ctx.beginPath();ctx.arc(p.x,p.y,120,0,6.28);ctx.fill()}
function drawStars(st){ctx.save();for(var i=0;i<150;i++){var tw=(Math.sin(st+i*0.1)*0.5+0.5)*0.8+0.2;ctx.fillStyle="rgba(255,255,255,"+tw+")";ctx.fillRect((i*97)%W,(i*233)%H,1,1)}ctx.restore()}
function drawCubeSat(p){var s=worldToScreen(p);ctx.fillStyle="#eaf1ff";ctx.fillRect(s.x-4,s.y-4,8,8)}
var btnPlay=document.getElementById('btnPlay'),btnPause=document.getElementById('btnPause'),btnReset=document.getElementById('btnReset');
btnPlay.onclick=function(){running=true;btnPlay.classList.add('primary');btnPause.classList.remove('primary')}
btnPause.onclick=function(){running=false;btnPause.classList.add('primary');btnPlay.classList.remove('primary')}
btnReset.onclick=function(){running=false;t=0;starT=0;trail=[];btnPause.classList.add('primary');btnPlay.classList.remove('primary')}
window.addEventListener('keydown',function(e){if(e.code==='Space'){e.preventDefault();running=!running;if(running){btnPlay.classList.add('primary');btnPause.classList.remove('primary')}else{btnPause.classList.add('primary');btnPlay.classList.remove('primary')}}});
var last=performance.now();
function loop(now){requestAnimationFrame(loop);var dt=(now-last)/1000;last=now;dt=Math.min(dt,0.05);
if(running){t+=dt*5;sunTheta+=dt*0.05;starT+=dt;}
if(running){cam.theta+=0.03*dt;cam.phi=0.9+0.15*Math.sin(t*0.0005);}
ctx.clearRect(0,0,W,H);drawStars(starT);drawEarth();var p=sph2cart(7000e3,0.5*t,0.3);drawCubeSat(p);
document.getElementById('hud').textContent="t="+t.toFixed(1)+"s | running="+running;}
requestAnimationFrame(loop);
})();