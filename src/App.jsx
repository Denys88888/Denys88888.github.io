import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from './store.js';
import Home from './screens/Home.jsx';
import DriverHome from './screens/DriverHome.jsx';
import RatingScreen from './screens/RatingScreen.jsx';
import History from './screens/History.jsx';
import Profile from './screens/Profile.jsx';
import Earnings from './screens/Earnings.jsx';
import { initSdk, authenticate } from './lib/pi.js';
import { initFCM } from './lib/firebase.js';
import api, { setToken } from './lib/api.js';
import ws from './lib/ws.js';

// Keep-alive: ping Render every 14 min so free tier doesn't sleep
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
setInterval(() => fetch(`${API_URL}/health`).catch(() => {}), 14 * 60 * 1000);

const NAV_PASSENGER = [
  { id: 'home',    icon: '🗺',  label: 'Map'     },
  { id: 'history', icon: '📋', label: 'History'  },
  { id: 'profile', icon: '👤', label: 'Profile'  },
];

const NAV_DRIVER = [
  { id: 'driver-home', icon: '🚗', label: 'Drive'    },
  { id: 'history',     icon: '📋', label: 'History'  },
  { id: 'earnings',    icon: '💰', label: 'Earnings' },
  { id: 'profile',     icon: '👤', label: 'Profile'  },
];

export default function App() {
  const { user, setUser, setToken: storeSetToken, authLoading, setAuthLoading, mode, screen, setScreen } = useStore();
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (user) { setAuthLoading(false); return; } // HMR guard

    // Dev mode: Pi SDK only works inside Pi Browser — inject a mock user immediately
    if (import.meta.env.DEV) {
      setUser({ piUserId: 'dev_001', piUsername: 'devuser', name: 'Dev User', rating: 4.9, totalRides: 42, role: 'passenger' });
      setAuthLoading(false);
      ws.connect(null);
      return;
    }

    initSdk(false).then(doAuth);
  }, []); // eslint-disable-line

  async function doAuth() {
    setAuthLoading(true);
    try {
      const auth = await authenticate();
      const { token, user: profile } = await api.verify(auth.accessToken);
      setToken(token);
      storeSetToken(token);
      setUser({ ...auth.user, ...profile });

      ws.connect(token);

      const fcmToken = await initFCM(profile.piUserId, payload => {
        console.log('[FCM] Foreground notification:', payload.notification?.title);
      });
      if (fcmToken) {
        api.registerPushToken(profile.piUserId, fcmToken).catch(() => {});
      }

    } catch (err) {
      if (err.message === 'incomplete_payment') {
        setTimeout(doAuth, 2000);
        return;
      }
      // Dev mode: Pi SDK only works inside Pi Browser — mock auth for local development
      if (import.meta.env.DEV) {
        const mockUser = {
          piUserId: 'dev_user_001',
          piUsername: 'devuser',
          name: 'Dev User',
          rating: 4.9,
          totalRides: 42,
          role: 'passenger',
        };
        setUser(mockUser);
        ws.connect(null);
        setAuthLoading(false);
        return;
      }
      console.error('[Auth]', err.message);
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  const navItems = mode === 'driver' ? NAV_DRIVER : NAV_PASSENGER;

  // Show loading
  if (authLoading) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          style={{ textAlign: 'center' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        >
          <div style={{ fontSize: 64, marginBottom: 16 }}>🚕</div>
          <div style={{ fontWeight: 700, fontSize: 22 }}>Taxi Pro</div>
          <div className="muted" style={{ marginTop: 8 }}>Connecting to Pi Network...</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 24 }}>
            {[0, 1, 2].map(i => (
              <motion.div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }}
                animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, delay: i * 0.4, repeat: Infinity }} />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // Auth error
  if (authError && !user) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2>Authentication Failed</h2>
          <div className="muted" style={{ marginTop: 8, marginBottom: 24 }}>
            Please open this app inside the Pi Browser.
          </div>
          <button className="btn btn-primary" style={{ maxWidth: 280, width: '100%' }} onClick={doAuth}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Special full-screen screens
  if (screen === 'rating') {
    return (
      <div className="app">
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setScreen(mode === 'driver' ? 'driver-home' : 'home')}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', marginRight: 12 }}>←</button>
          <h2>Rate Your Ride</h2>
        </div>
        <RatingScreen />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Main content */}
      <div className="screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'visible', minHeight: 0 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {screen === 'home' && <Home />}
            {screen === 'driver-home' && <DriverHome />}
            {screen === 'history' && <History />}
            {screen === 'profile' && <Profile />}
            {screen === 'earnings' && <Earnings />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <nav className="nav-bar">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item${screen === item.id ? ' active' : ''}`}
            onClick={() => setScreen(item.id)}
          >
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
