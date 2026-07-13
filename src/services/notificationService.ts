import i18n from '../i18n';
import { wsService } from './wsService';
import { api } from './api';
import { useAppStore } from '../store/useAppStore';
import { useRouter } from '../store/useRouter';
import { formatPi } from '../utils/formatters';
import type { Ride } from '../types';

// In-app notification layer. The Pi Browser is an Android WebView without the
// Web Push API, and the Pi SDK offers no push mechanism — so notifications are
// delivered over the already-open WebSocket: a toast (+ vibration) in the
// foreground, and a system notification via the Notification API where the
// runtime supports it (installed PWA / desktop browser; silently skipped in
// the Pi Browser).

let initialized = false;

export function systemNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function systemNotificationsEnabled(): boolean {
  return systemNotificationsSupported() && Notification.permission === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!systemNotificationsSupported()) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

function notify(message: string): void {
  // Background tab / minimized PWA → system notification when available.
  if (document.hidden && systemNotificationsEnabled()) {
    try {
      new Notification('Taxi Pro', { body: message, icon: '/icons/icon-192.png' });
      return;
    } catch {
      /* fall through to the in-app toast */
    }
  }
  useAppStore.getState().addToast('info', message);
  try {
    navigator.vibrate?.(200);
  } catch {
    /* not supported */
  }
}

// Subscribe once to the WS events worth interrupting the user for.
export function initNotifications(): void {
  if (initialized) return;
  initialized = true;

  // Drivers: a new ride request is available.
  wsService.on('ride_available', (msg) => {
    if (useAppStore.getState().user?.role !== 'driver') return;
    const ride = msg.ride as Ride | undefined;
    if (!ride) return;
    notify(i18n.t('notify.newRide', { fare: formatPi(ride.fare) }));
  });

  // Passengers: a driver took the ride.
  wsService.on('ride_assigned', () => {
    if (useAppStore.getState().user?.role === 'driver') return;
    notify(i18n.t('home.driverFound'));
  });

  // Chat: message from the counterpart while the chat screen is closed.
  wsService.on('new_message', (msg) => {
    const me = useAppStore.getState().user?.uid;
    const m = msg.message as { senderId?: string; text?: string } | undefined;
    if (!m || m.senderId === me) return;
    if (useRouter.getState().screen === 'chat') return; // already looking at it
    notify(i18n.t('notify.newMessage', { text: (m.text ?? '').slice(0, 60) }));
  });

  // Tips land asynchronously after the ride — tell the driver.
  // Driver application verdicts arrive on the same channel: refresh the profile
  // from the server so the role flips to 'driver' (and the driver home screen
  // appears) without a re-login.
  wsService.on('ride_status_update', (msg) => {
    if (msg.status === 'tip_received') {
      const data = msg.data as { tipAmount?: number } | undefined;
      notify(i18n.t('notify.tip', { amount: formatPi(data?.tipAmount ?? 0) }));
      return;
    }
    if (msg.status === 'driver_approved' || msg.status === 'driver_rejected') {
      notify(
        i18n.t(msg.status === 'driver_approved' ? 'notify.driverApproved' : 'notify.driverRejected')
      );
      // The server sends a fresh JWT with the new role. Save it and reconnect
      // the WebSocket so ws.role becomes 'driver' immediately (without re-login).
      if (msg.status === 'driver_approved' && msg.token && typeof msg.token === 'string') {
        useAppStore.getState().setAuth(
          (msg.user as import('../types').User) ?? useAppStore.getState().user!,
          msg.token
        );
        wsService.connect(msg.token);
      } else {
        api
          .getMe()
          .then((me) => useAppStore.getState().updateUser(me))
          .catch((err) => console.error('[notify] getMe after role change:', err));
      }
      return;
    }
    const isPassenger = useAppStore.getState().user?.role !== 'driver';
    if (isPassenger && msg.status === 'arrived') {
      notify(i18n.t('notify.driverArrived', 'Your driver has arrived!'));
    } else if (isPassenger && msg.status === 'in_progress') {
      notify(i18n.t('notify.rideStarted', 'Your ride has started'));
    } else if (msg.status === 'completed') {
      notify(i18n.t('notify.rideCompleted', 'Ride completed'));
    } else if (isPassenger && msg.status === 'cancelled') {
      notify(i18n.t('notify.rideCancelled', 'Your ride was cancelled'));
    }
  });
}
