import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../types';

interface GeoState {
  position: GeoPoint | null;
  error: string | null;
  loading: boolean;
}

// Wraps the browser Geolocation API with continuous tracking via watchPosition.
// The blue dot updates in real time as the device moves.
export function useGeolocation(auto = true) {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
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
      setState((s) => ({ ...s, error: 'Geolocation unsupported' }));
      return;
    }
    stop();
    setState((s) => ({ ...s, loading: true }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          error: null,
          loading: false,
        });
      },
      (err) => setState((s) => ({ ...s, error: err.message, loading: false })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [stop]);

  useEffect(() => {
    if (auto) request();
    return stop;
  }, [auto, request, stop]);

  return { ...state, request };
}
