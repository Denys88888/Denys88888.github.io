/**
 * Taxi Pro — Progressive Web App Service Worker
 * ----------------------------------------------
 * Handles static asset caching and offline support.
 *
 * This SW is responsible for:
 * - Caching core static assets (shell) at install time
 * - Cleaning up old caches on activation
 * - Serving cached assets with network fallback
 * - Offline page fallback for navigation requests
 *
 * NOTE: Firebase Messaging uses a SEPARATE service worker
 * (firebase-messaging-sw.js) to handle push notifications.
 */

// Increment this version to force cache refresh for all users
const CACHE_VERSION = 2;
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
];

/**
 * INSTALL — Cache static assets (app shell)
 */
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

/**
 * ACTIVATE — Clean up old caches, claim clients
 */
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

/**
 * FETCH — Serve from cache, fallback to network
 *
 * Strategy:
 * - GET requests only (skip POST/PUT/DELETE)
 * - Skip API calls (network only)
 * - Skip WebSocket connections
 * - Skip external/CDN resources (no CORS caching issues)
 * - Cache-first for static assets
 * - Runtime cache for successfully fetched assets
 */
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls — always go to network
  if (url.pathname.startsWith('/api/')) return;

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Skip Firebase / Google APIs (FCM has its own SW)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google-analytics')
  )
    return;

  // Skip external CDN resources (fonts, maps SDK, Pi SDK)
  if (
    url.hostname !== self.location.hostname &&
    !url.hostname.includes('unpkg.com') &&
    !url.hostname.includes('cdn')
  )
    return;

  // For index.html — always use network-first to get latest version
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
      // Return cached response if found
      if (cached) return cached;

      // Otherwise fetch from network
      return fetch(event.request)
        .then((response) => {
          // Cache successful same-origin GET responses for runtime caching
          if (
            response.ok &&
            response.type === 'basic' &&
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
          // Offline fallback — serve index.html for navigation
          if (event.request.mode === 'navigate') {
            console.log('[PWA SW] Offline: serving index.html fallback');
            return caches.match('/index.html');
          }
          // For non-navigation requests, we can't do much
          console.log('[PWA SW] Offline: resource unavailable', event.request.url);
        });
    })
  );
});

/**
 * MESSAGE — Handle messages from the main app
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
