import './e2eInit';
import './debugOverlay';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import './i18n';
import App from './App';
import { PI_SANDBOX } from './utils/constants';
import { watchForNewVersion } from './utils/appUpdate';

// Call Pi.init as early as possible so the SDK is ready before any component
// mounts and before the user can trigger authentication or payments.
// window.Pi is injected by the deferred sdk.minepi.com script; it will be
// defined by the time React mount effects run, but we init here to let the SDK
// warm up (prefetch incomplete-payment state, check network, etc.).
(function initPiEarly() {
  if (typeof window === 'undefined') return;
  const tryInit = () => {
    if (!window.Pi) return;
    try {
      window.Pi.init({ version: '2.0', sandbox: PI_SANDBOX });
      // Log available native features for debugging (non-blocking).
      if (typeof window.Pi.nativeFeaturesList === 'function') {
        window.Pi.nativeFeaturesList().then((features: string[]) => {
          console.info('[Pi] nativeFeatures:', features);
        }).catch(() => {});
      }
    } catch {
      // SDK init must never crash the app.
    }
  };
  // Try immediately (SDK may already be loaded), then on DOMContentLoaded.
  tryInit();
  document.addEventListener('DOMContentLoaded', tryInit, { once: true });
})();

// ?clearcache=1 wipes all local session state (auth token, cached user, theme,
// language) and reloads clean — a manual escape hatch for stale local data
// (e.g. a role change made server-side that the cached user object won't
// reflect until the next fresh login).
if (new URLSearchParams(window.location.search).get('clearcache') === '1') {
  localStorage.clear();
  sessionStorage.clear();
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('clearcache');
  window.location.replace(url.toString());
}

// Optional Sentry error monitoring: enabled only when the build defines
// VITE_SENTRY_DSN; loaded lazily so it costs nothing otherwise.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  import('@sentry/react')
    .then((Sentry) => Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 }))
    .catch(() => {
      /* monitoring must never break the app */
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The service worker is generated and auto-registered by vite-plugin-pwa
// (registerType: 'autoUpdate'), so no manual registration is needed here — but
// registration alone leaves an open page running the build it loaded with, so
// watch for a newer worker and reload once doing so costs the user nothing.
watchForNewVersion();
