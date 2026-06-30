const CACHE_NAME = 'showanswer-hub-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/generator.html',
  '/ocr_sheet.html',
  '/style.css',
  '/icon-192.png',
  '/icon-512.png',
  '/class_hub.js',
  '/generator.js',
  '/login.js',
  '/cv.js',
  '/aruco.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Could not cache some assets on install:", err);
      });
    })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).catch(() => {
      return caches.match(e.request);
    })
  );
});
