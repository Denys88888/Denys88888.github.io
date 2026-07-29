import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Strategy 1: Screen Wake Lock API (Chrome 84+, NOT available in Android WebView)
// Strategy 2: Canvas-stream video fallback (works in Android WebView).
//   IMPORTANT: video.play() requires a user gesture. Call primeWakeLock()
//   directly inside a click handler BEFORE setting state. The useEffect-based
//   hook then re-uses the already-playing video element.
// ---------------------------------------------------------------------------

let fallbackVideo: HTMLVideoElement | null = null;
let fallbackRefCount = 0;

function buildFallbackVideo(): HTMLVideoElement | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
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
    video.style.cssText =
      'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0';
    document.body.appendChild(video);
    return video;
  } catch {
    return null;
  }
}

// Call this synchronously inside a click handler so the browser grants
// autoplay permission. Safe to call multiple times.
export function primeWakeLock(): void {
  if ('wakeLock' in navigator) return; // native API will handle it
  if (fallbackVideo && !fallbackVideo.paused) return; // already playing
  if (!fallbackVideo) {
    fallbackVideo = buildFallbackVideo();
    if (!fallbackVideo) return;
  }
  fallbackVideo.play().then(() => {
    logger.info('[WakeLock] fallback video primed by user gesture');
  }).catch((err) => {
    logger.warn('[WakeLock] fallback prime failed', (err as Error).message);
  });
}

function startFallbackVideo(): void {
  fallbackRefCount++;
  if (fallbackVideo && !fallbackVideo.paused) return; // primeWakeLock() already started it

  if (!fallbackVideo) {
    fallbackVideo = buildFallbackVideo();
    if (!fallbackVideo) return;
  }

  fallbackVideo.play().then(() => {
    logger.info('[WakeLock] fallback video started');
  }).catch((err) => {
    logger.warn('[WakeLock] fallback video autoplay blocked — call primeWakeLock() in click handler', (err as Error).message);
  });
}

function stopFallbackVideo(): void {
  fallbackRefCount = Math.max(0, fallbackRefCount - 1);
  if (fallbackRefCount > 0) return;
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

  useEffect(() => {
    if (!active) return;

    if ('wakeLock' in navigator) {
      // ── Native Wake Lock API ─────────────────────────────────────────────
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
          logger.warn('[WakeLock] native failed, trying video fallback', (err as Error).message);
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
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (lockRef.current) {
          lockRef.current.release().catch(() => {});
          lockRef.current = null;
        } else {
          stopFallbackVideo();
        }
      };
    } else {
      // ── Video fallback (Android WebView) ─────────────────────────────────
      startFallbackVideo();
      return () => stopFallbackVideo();
    }
  }, [active]);
}
