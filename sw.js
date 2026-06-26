/**
 * Taxi Pro — Progressive Web App Service Worker
 */

const CACHE_VERSION = 4;
const CACHE_NAME = `taxipro-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/icon-192x192.png',
  '/icon-384x384.png',
  '/icon-512x512.png',
  '/assets/index-q4127-AR.js',
  '/assets/index-Ci97Pa9n.css',
  '/assets/chunk-map-D9JDX3-_.js',
  '/assets/chunk-map-Dgihpmma.css',
  '/assets/chunk-payment-BKWWnxRb.js',
  '/assets/chunk-driver-DE5a40Jr.js',
  '/assets/vendor-react-CKjCVW_e.js',
  '/assets/vendor-framer-DbdDR1Q2.js',
  '/assets/vendor-ui-Bpfh32vx.js',
  '/assets/vendor-pi-C4ubRgoM.js',
  '/assets/index.esm-q7Ix4rY8.js',
  '/assets/index.esm-DxRxORx3.js',
  '/assets/index.esm-Bsr7HeQO.js',
];

self.addEventListener('install', (event) => {
  console.log('[PWA SW] Installing...');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => {
        console.log('[PWA SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[PWA SW] Cache install failed:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[PWA SW] Activating...');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[PWA SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        console.log('[PWA SW] Activated and controlling clients');
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google-analytics')
  )
    return;
  if (
    url.hostname !== self.location.hostname &&
    !url.hostname.includes('unpkg.com') &&
    !url.hostname.includes('cdn')
  )
    return;

  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (
            response.ok &&
            (response.type === 'basic' || response.type === 'cors') &&
            url.hostname === self.location.hostname
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            console.log('[PWA SW] Offline: serving index.html fallback');
            return caches.match('/index.html');
          }
          console.log('[PWA SW] Offline: resource unavailable', event.request.url);
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
