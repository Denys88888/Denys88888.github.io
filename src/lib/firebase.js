import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let messaging = null;

function getApp() {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export async function initFCM(userId, onForegroundMessage) {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    console.log('[FCM] No config, notifications disabled');
    return null;
  }

  try {
    messaging = getMessaging(getApp());

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, vapidKey ? { vapidKey } : {});

    if (onForegroundMessage) {
      onMessage(messaging, payload => {
        console.log('[FCM] Foreground:', payload);
        onForegroundMessage(payload);
      });
    }

    return token;
  } catch (err) {
    console.warn('[FCM] init failed:', err.message);
    return null;
  }
}
