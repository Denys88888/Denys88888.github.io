import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import TrackView from './screens/TrackView.jsx';
import './styles/globals.css';

// Lightweight routing: a /track/{token} (or #/track/{token}) link opens the
// read-only tracking page; everything else is the normal app. Done here (not
// inside App) to keep App's hook order clean.
function getTrackToken() {
  const fromPath = window.location.pathname.match(/\/track\/([^/?#]+)/);
  if (fromPath) return decodeURIComponent(fromPath[1]);
  const fromHash = window.location.hash.match(/#\/track\/([^/?#]+)/);
  if (fromHash) return decodeURIComponent(fromHash[1]);
  return null;
}

const trackToken = getTrackToken();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {trackToken ? <TrackView token={trackToken} /> : <App />}
  </React.StrictMode>
);
