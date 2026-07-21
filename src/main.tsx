import './e2eInit';
import './debugOverlay';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import './i18n';
import App from './App';

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
// (registerType: 'autoUpdate'), so no manual registration is needed here.
