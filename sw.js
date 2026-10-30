// Service Worker: App-Dateien für den Offline-Betrieb zwischenspeichern.
// Eigene Dateien: erst Netz (am Server nachfragen statt 10 Min. Browser-Cache), sonst Cache. Firebase-Bibliothek: erst Cache.
// Die Firestore-Daten selbst puffert Firebase eigenständig (IndexedDB).
const CACHE = 'fairplan-v22';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.json', 'config.js',
  'js/app.js', 'js/logic.js', 'js/store.js', 'js/template.js', 'js/qrcode.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
