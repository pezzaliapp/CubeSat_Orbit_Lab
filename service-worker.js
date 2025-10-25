/* CubeSat Orbit Lab — Service Worker (v4) */
const CACHE = 'cubesat-orbit-lab-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app3d.js',
  './app2d.js',
  './manifest.json',
  './textures/earth_day.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null))));
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request).catch(()=>caches.match('./index.html'))));
});
