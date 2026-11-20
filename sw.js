// Service worker de SmartWardrobe: la aplicación funciona sin conexión.
// - Recursos propios: caché versionada por build (se renueva en cada despliegue).
// - Open-Meteo: siempre red (nunca se sirve un clima viejo desde aquí; la app tiene su propia caché con caducidad).
const VERSION = 'bc9c11804a';
const CACHE = `sw-shell-${VERSION}`;
const SHELL = ['./', './index.html', `./app.js?v=${VERSION}`, `./app.css?v=${VERSION}`, './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sw-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // APIs externas: red directa
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
