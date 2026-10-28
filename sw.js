// Service worker : l'application fonctionne sans réseau (cache de l'application).
const V = 'ceni-hl-v9';
const FILES = ['./', './index.html', './app.js', './kv.js', './jszip.min.js', './tadidy.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'ceni-hl-data').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)).catch(() => {}); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
