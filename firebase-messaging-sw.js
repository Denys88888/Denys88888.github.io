/**
 * Firebase Cloud Messaging Service Worker for Taxi Pro
 * ------------------------------------------------------
 * Handles BACKGROUND push notifications from FCM.
 * Foreground messages are handled in src/lib/notifications.ts (initFCM).
 *
 * NOTE: This file uses the Firebase compat CDN build (vanilla JS) because
 * Service Workers cannot use ES module imports directly.
 *
 * TODO: Replace FIREBASE_CONFIG below with your actual Firebase web app config
 * from Firebase Console > Project Settings > General > Your Apps > Web App
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// ============================================================================
// TODO: REPLACE WITH YOUR ACTUAL FIREBASE CONFIG
// ============================================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDummy-REPLACE-WITH-REAL",
  authDomain: "taxi-pro-pi.firebaseapp.com",
  projectId: "taxi-pro-pi",
  storageBucket: "taxi-pro-pi.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
// ============================================================================

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

/**
 * Handle background push messages from FCM.
 * Called when a push is received while the app is NOT focused.
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'Taxi Pro';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: payload.data?.tag || payload.data?.type || 'taxipro-general',
    data: payload.data || {},
    requireInteraction: payload.data?.requireInteraction === 'true',
    actions: buildActions(payload.data?.type),
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Build notification actions based on message type
 */
function buildActions(type) {
  switch (type) {
    case 'driver-found':
      return [
        { action: 'open', title: 'View Driver' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'driver-arriving':
      return [
        { action: 'open', title: 'I\'m Coming' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'payment':
      return [
        { action: 'open', title: 'Pay Now' },
        { action: 'dismiss', title: 'Later' },
      ];
    case 'chat':
      return [
        { action: 'open', title: 'Reply' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    default:
      return [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
  }
}

/**
 * Handle notification click — focus existing tab or open new window
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Dismiss action: just close
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const targetUrl = data?.url || data?.click_action || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing tab if already open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              payload: data,
            });
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
      .catch((err) => {
        console.error('[FCM SW] Notification click handling failed:', err);
      })
  );
});

/**
 * Handle push subscription changes — re-register token
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[FCM SW] Push subscription changed');
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) {
        clients[0].postMessage({ type: 'FCM_TOKEN_REFRESH_NEEDED' });
      }
    })
  );
});
