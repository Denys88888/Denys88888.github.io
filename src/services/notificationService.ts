import i18n from '../i18n';
import { logger } from '../utils/logger';
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

// Short two-tone "ding", embedded as a WAV data URI (no network fetch to
// fail). Uses a plain <audio> element as the primary path — more reliably
// audible than a Web Audio oscillator inside Android WebViews (which the Pi
// Browser is built on: some builds route AudioContext output through a
// different/muted audio focus channel while <audio> playback works normally)
// — with the oscillator kept as a fallback for browsers where <audio> fails.
//
// Autoplay policy still applies: playback must be started from, or soon
// after, a user gesture, or the browser blocks it. The 'arrived' event
// arrives over the WebSocket with no gesture attached, so we "unlock" the
// <audio> element eagerly on the very first tap anywhere in the app (a
// muted zero-volume play+pause), which satisfies the policy for later,
// gesture-less playback attempts.
const CHIME_DATA_URI = 'data:audio/wav;base64,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';
let chimeEl: HTMLAudioElement | null = null;
function getChimeEl(): HTMLAudioElement {
  if (!chimeEl) {
    chimeEl = new Audio(CHIME_DATA_URI);
    chimeEl.preload = 'auto';
  }
  return chimeEl;
}

let audioCtx: AudioContext | null = null;
function getAudioCtxCtor(): typeof AudioContext | undefined {
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

// Muted play+pause to satisfy the browser's "played from a user gesture"
// requirement. Safe to call repeatedly/redundantly — re-priming from a
// reliable, recent gesture (e.g. right before "Go online", when the driver
// is about to sit and wait for offers with no further taps) costs nothing
// and only ever helps if the very first page-load unlock somehow didn't
// stick.
export function primeChime(): void {
  if (typeof window === 'undefined') return;
  const el = getChimeEl();
  el.volume = 0;
  el.play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.volume = 1;
    })
    .catch(() => {
      el.volume = 1;
    });
  const Ctx = getAudioCtxCtor();
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
}

export function unlockAudioOnFirstGesture(): void {
  if (typeof window === 'undefined') return;
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const unlock = (): void => {
    events.forEach((ev) => window.removeEventListener(ev, unlock));
    primeChime();
  };
  events.forEach((ev) => window.addEventListener(ev, unlock, { once: true, passive: true }));
}

function playChimeOscillatorFallback(): void {
  try {
    const Ctx = getAudioCtxCtor();
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const now = audioCtx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    /* Web Audio unsupported / blocked — the vibration + toast still fire */
  }
}

function playChime(): void {
  const el = getChimeEl();
  // Defensive: always force full volume right before playing, regardless of
  // whatever state the unlock flow left it in — a chime that plays silently
  // (volume stuck at 0) is worse than one that's a beat late.
  el.volume = 1;
  try {
    el.currentTime = 0;
  } catch {
    /* not seekable yet on some engines — play() below still starts from 0 */
  }
  el.play().catch((err) => {
    logger.warn('[Chime] <audio> play failed, falling back to oscillator', err);
    playChimeOscillatorFallback();
  });
}

function notify(message: string, opts?: { sound?: boolean }): void {
  if (opts?.sound) playChime();
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
  unlockAudioOnFirstGesture();

  // Drivers: a new ride request is available.
  wsService.on('ride_available', (msg) => {
    if (useAppStore.getState().user?.role !== 'driver') return;
    const ride = msg.ride as Ride | undefined;
    if (!ride) return;
    notify(i18n.t('notify.newRide', { fare: formatPi(ride.fare) }), { sound: true });
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
    if (msg.status === 'payment_received') {
      const data = msg.data as { amount?: number } | undefined;
      notify(i18n.t('notify.paymentReceived', { amount: formatPi(data?.amount ?? 0) }), { sound: true });
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
      notify(i18n.t('notify.driverArrived', 'Your driver has arrived!'), { sound: true });
    } else if (isPassenger && msg.status === 'in_progress') {
      notify(i18n.t('notify.rideStarted', 'Your ride has started'));
    } else if (msg.status === 'completed') {
      notify(i18n.t('notify.rideCompleted', 'Ride completed'));
    } else if (isPassenger && msg.status === 'cancelled') {
      notify(i18n.t('notify.rideCancelled', 'Your ride was cancelled'));
    }
  });
}
