// Funziona offline: tiene in memoria i file della pagina.
// Quando modifichi data.js o index.html, cambia la versione qui sotto e in index.html (2.0 -> 2.1) per forzare l'aggiornamento.
const CACHE = 'cumana-2.0';   // stessa versione di index.html
const FILES = ['./', './index.html', './data.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Prima la copia salvata (velocissima), intanto aggiorna in sottofondo se c'è rete
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, {ignoreSearch:true});
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
