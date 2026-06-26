const CACHE_NAME = 'showanswer-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/ocr_setup.html',
  '/ocr_scanner.html',
  '/question.html',
  '/scanner.html',
  '/report.html',
  '/style.css',
  '/ocr_style.css',
  '/icon-192.png',
  '/icon-512.png',
  '/ocr_scanner.js',
  '/question.js',
  '/scanner.js',
  '/report.js',
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
  // Network-First with Cache Fallback for dynamic server API syncing
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
