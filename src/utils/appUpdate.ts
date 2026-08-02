import { useAppStore } from '../store/useAppStore';

// vite-plugin-pwa builds the service worker with skipWaiting + clientsClaim, so
// a new deploy takes control of already-open pages as soon as it installs — but
// the page it claims keeps running the JavaScript it loaded with. Nothing swaps
// the new build in until the user reloads by hand, which is how a shipped fix
// can stay invisible for a whole session: the History screen went on showing
// cancelled rides billed at the full fare long after the deploy that stopped
// doing that.
//
// So reload the page ourselves once a newer worker is in charge — but not at any
// cost. Mid-ride the screen is a live map with a driver moving on it, and a
// half-typed address is work the passenger would have to do over, so hold the
// reload until it costs nothing.

const BUSY_RECHECK_MS = 5000;

// The browser only re-fetches sw.js on navigation, so an installed PWA that is
// left open for days would never learn about a deploy. Ask again whenever the
// app comes back to the foreground, at most this often.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

function isBusy(): boolean {
  if (useAppStore.getState().currentRide) return true;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}

// Returns a function that stops watching. The app itself watches for as long as
// it is open and never calls it; tests do, so one case cannot leave a listener
// behind that answers the next one's events.
export function watchForNewVersion(): () => void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return () => {};

  // A page that loaded without a controller is a first visit: the worker about
  // to claim it is the initial install, not an update. Reloading for that would
  // restart the app in front of every new user.
  let claimIsFirstInstall = !navigator.serviceWorker.controller;
  let timer: ReturnType<typeof setInterval> | undefined;
  let reloading = false;

  const reloadWhenFree = () => {
    if (reloading) return;
    if (isBusy()) {
      timer ??= setInterval(reloadWhenFree, BUSY_RECHECK_MS);
      return;
    }
    reloading = true;
    if (timer) clearInterval(timer);
    window.location.reload();
  };

  const onControllerChange = () => {
    if (claimIsFirstInstall) {
      claimIsFirstInstall = false;
      return;
    }
    reloadWhenFree();
  };

  let lastCheck = Date.now();
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    // A failed check means offline or an unreachable host — the next return to
    // the foreground tries again.
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {});
  };

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (timer) clearInterval(timer);
  };
}
