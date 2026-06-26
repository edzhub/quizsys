const CACHE_NAME = 'showanswer-hub-cache-v1';
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
    e.respondWith(fetch(e.request));
  } else {
    e.respondWith(
      fetch(e.request).catch(() => {
        return caches.match(e.request);
      })
    );
  }
});
