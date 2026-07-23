import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../types';

interface GeoState {
  position: GeoPoint | null;
  error: string | null;
  // Set when the browser reported PERMISSION_DENIED specifically, so callers
  // can point the user at their device/app settings rather than a generic
  // "something went wrong" message.
  permissionDenied: boolean;
  loading: boolean;
}

// Wraps the browser Geolocation API with continuous tracking via watchPosition.
// The blue dot updates in real time as the device moves.
export function useGeolocation(auto = true) {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
    permissionDenied: false,
    loading: false,
  });
  const watchId = useRef<number | null>(null);

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
        // Keep the same object when the device hasn't moved so downstream
        // effects keyed on `position` don't re-fire on every GPS tick.
        setState((s) =>
          s.position && s.position.lat === lat && s.position.lng === lng && !s.error && !s.loading
            ? s
            : { position: { lat, lng }, error: null, permissionDenied: false, loading: false }
        );
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
