import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Strategy 1: Screen Wake Lock API (Chrome 84+, NOT available in Android WebView)
// Strategy 2: Canvas-stream video fallback (works in any WebView that supports
//   canvas.captureStream — which is virtually all modern Android WebViews).
//   Playing an active video prevents the OS from sleeping the screen.
// ---------------------------------------------------------------------------

let fallbackVideo: HTMLVideoElement | null = null;
let fallbackRefCount = 0;

function startFallbackVideo(): void {
  fallbackRefCount++;
  if (fallbackVideo) return; // already running

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillRect(0, 0, 1, 1);

    const stream = (canvas as HTMLCanvasElement & {
      captureStream(fps?: number): MediaStream;
    }).captureStream(1);

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0';
    document.body.appendChild(video);

    video.play().then(() => {
      logger.info('[WakeLock] fallback video started');
    }).catch((err) => {
      logger.warn('[WakeLock] fallback video failed', (err as Error).message);
      video.remove();
      fallbackVideo = null;
    });

    fallbackVideo = video;
  } catch (err) {
    logger.warn('[WakeLock] fallback setup failed', (err as Error).message);
  }
}

function stopFallbackVideo(): void {
  fallbackRefCount = Math.max(0, fallbackRefCount - 1);
  if (fallbackRefCount > 0) return; // other callers still need it
  if (!fallbackVideo) return;
  fallbackVideo.pause();
  fallbackVideo.srcObject = null;
  fallbackVideo.remove();
  fallbackVideo = null;
  logger.info('[WakeLock] fallback video stopped');
}

// ---------------------------------------------------------------------------

export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const usingNative = useRef(false);

  useEffect(() => {
    if (!active) return;

    const hasNativeApi = 'wakeLock' in navigator;

    if (hasNativeApi) {
      // ── Native Wake Lock API path ──────────────────────────────────────
      usingNative.current = true;
      let cancelled = false;

      const acquire = async (): Promise<void> => {
        if (lockRef.current && !lockRef.current.released) return;
        try {
          lockRef.current = await (navigator as Navigator & {
            wakeLock: { request(type: string): Promise<WakeLockSentinel> };
          }).wakeLock.request('screen');
          lockRef.current.addEventListener('release', () => {
            if (!cancelled) logger.warn('[WakeLock] released by browser');
          });
          logger.info('[WakeLock] acquired (native)');
        } catch (err) {
          // Native API exists but denied (e.g. battery saver) — fall through
          // to the video fallback so we still try to keep the screen on.
          logger.warn('[WakeLock] native acquire failed, using video fallback', (err as Error).message);
          startFallbackVideo();
        }
      };

      const onVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') void acquire();
      };

      void acquire();
      document.addEventListener('visibilitychange', onVisibilityChange);

      return () => {
        cancelled = true;
        usingNative.current = false;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (lockRef.current) {
          lockRef.current.release().catch(() => {});
          lockRef.current = null;
        } else {
          // Was using fallback after native denied
          stopFallbackVideo();
        }
      };
    } else {
      // ── Video fallback path (Android WebView, older browsers) ──────────
      usingNative.current = false;
      startFallbackVideo();
      return () => {
        stopFallbackVideo();
      };
    }
  }, [active]);
}
