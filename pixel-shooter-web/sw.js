// Network-first service worker: always tries for fresh files, falls back to the cache when offline.
var CACHE='pixel-shooter-v2';
var ASSETS=['./','index.html','css/style.css','js/storage.js','js/audio.js','js/game.js','js/upgrades.js','js/ui.js','js/input.js','js/main.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS);}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(function(r){var copy=r.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);});return r;})
    .catch(function(){return caches.match(e.request).then(function(r){return r||caches.match('index.html');});}));
});
