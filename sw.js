// Memoria offline dell'app.
// A ogni modifica aumenta la versione qui sotto E in app.js (VERSIONE), es. 2.1 -> 2.2.
const CACHE = 'cumana-2.9';
const FILES = ['./', './index.html', './data.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const ATTESA_RETE = 3000;   // ms: se internet non risponde entro 3 secondi uso la copia salvata

// Installazione: scarico i file SEMPRE freschi (cache:'reload' salta la memoria di Chrome)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache:'reload'})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Prima internet (così vedi sempre l'ultima versione), la copia salvata solo se sei offline o la rete è lentissima
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const rete = fetch(e.request, {cache:'no-store'}).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    const salvata = c.match(e.request, {ignoreSearch:true});
    try {
      return await Promise.race([rete, new Promise((_, no) => setTimeout(no, ATTESA_RETE))]);
    } catch(err){
      return (await salvata) || rete;
    }
  })());
});
