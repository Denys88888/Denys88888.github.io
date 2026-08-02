import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineKm } from '../utils/helpers';
import type { GeoPoint } from '../types';

interface GeoState {
  position: GeoPoint | null;
  // Ground speed in metres per second: what the device reports, or what the
  // last two fixes imply when it reports nothing (desktops and emulators).
  speed: number | null;
  error: string | null;
  // Set when the browser reported PERMISSION_DENIED specifically, so callers
  // can point the user at their device/app settings rather than a generic
  // "something went wrong" message.
  permissionDenied: boolean;
  loading: boolean;
}

// Speed in m/s for a fix. Phones with a GPS chip report it directly; when they
// don't (desktop, emulator, coarse network location), derive it from the
// previous fix. Jumps shorter than 5 m are GPS noise, not motion, and gaps
// outside 1–30 s say nothing useful about the speed right now.
const MIN_MOVE_M = 5;
export function fixSpeed(
  pos: GeolocationPosition,
  prev: { lat: number; lng: number; at: number } | null
): number | null {
  const reported = pos.coords.speed;
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) return reported;
  if (!prev) return null;
  const seconds = ((pos.timestamp || Date.now()) - prev.at) / 1000;
  if (seconds < 1 || seconds > 30) return null;
  const metres =
    haversineKm(prev.lat, prev.lng, pos.coords.latitude, pos.coords.longitude) * 1000;
  return metres < MIN_MOVE_M ? 0 : metres / seconds;
}

// Wraps the browser Geolocation API with continuous tracking via watchPosition.
// The blue dot updates in real time as the device moves.
export function useGeolocation(auto = true) {
  const [state, setState] = useState<GeoState>({
    position: null,
    speed: null,
    error: null,
    permissionDenied: false,
    loading: false,
  });
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation unsupported', permissionDenied: false }));
      return;
    }
    stop();
    setState((s) => ({ ...s, loading: true }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const speed = fixSpeed(pos, lastFix.current);
        lastFix.current = { lat, lng, at: pos.timestamp || Date.now() };
        setState((s) => {
          const samePlace = s.position?.lat === lat && s.position?.lng === lng;
          // Ignore sub-km/h wobble so a parked car doesn't re-render forever.
          const sameSpeed = Math.round((s.speed ?? -1) * 3.6) === Math.round((speed ?? -1) * 3.6);
          if (samePlace && sameSpeed && !s.error && !s.loading) return s;
          return {
            // Keep the same object when the device hasn't moved so downstream
            // effects keyed on `position` don't re-fire on every GPS tick.
            position: samePlace && s.position ? s.position : { lat, lng },
            speed,
            error: null,
            permissionDenied: false,
            loading: false,
          };
        });
      },
      (err) =>
        setState((s) => ({
          ...s,
          error: err.message,
          permissionDenied: err.code === err.PERMISSION_DENIED,
          loading: false,
        })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [stop]);

  useEffect(() => {
    if (auto) request();
    return stop;
  }, [auto, request, stop]);

  return { ...state, request };
}
