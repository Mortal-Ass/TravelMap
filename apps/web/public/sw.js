/* global self, caches, URL, location, fetch */
const cacheName='travelmap-offline-v1';
const assets=['/offline.html','/offline.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(cacheName);
 await cache.addAll(assets);
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('travelmap-offline-')&&key!==cacheName)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 if(assets.includes(url.pathname)){
  event.respondWith(caches.open(cacheName).then(async c=>(await c.match(url.pathname))||fetch(event.request)));return;
 }
 if(event.request.mode==='navigate'&&url.pathname==='/'){
  event.respondWith(fetch(event.request).catch(()=>caches.open(cacheName).then(c=>c.match('/offline.html'))));
 }
});
