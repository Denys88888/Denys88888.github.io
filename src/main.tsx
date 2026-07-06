import './e2eInit';
import './debugOverlay';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import './i18n';
import App from './App';

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
