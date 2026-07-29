import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

// Keeps the screen on while `active` is true using the Screen Wake Lock API.
// Silently no-ops in browsers that don't support it (e.g. older Android WebViews).
// Re-acquires the lock automatically after the page becomes visible again —
// the browser always releases the lock when the tab is hidden or screen sleeps.
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async (): Promise<void> => {
      // Don't stack a second lock if one is still held.
      if (lockRef.current && !lockRef.current.released) return;
      try {
        lockRef.current = await (navigator as Navigator & {
          wakeLock: { request(type: string): Promise<WakeLockSentinel> };
        }).wakeLock.request('screen');
        lockRef.current.addEventListener('release', () => {
          if (!cancelled) logger.warn('[WakeLock] released by browser');
        });
        logger.info('[WakeLock] acquired');
      } catch (err) {
        logger.warn('[WakeLock] acquire failed', (err as Error).message);
      }
    };

    // The browser releases the lock whenever the page is hidden (screen off,
    // tab switch, app background). Re-acquire as soon as it's visible again.
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
