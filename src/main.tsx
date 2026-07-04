import './e2eInit';
import './debugOverlay';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import './i18n';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The service worker is generated and auto-registered by vite-plugin-pwa
// (registerType: 'autoUpdate'), so no manual registration is needed here.
