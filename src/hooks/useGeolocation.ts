import { useCallback, useEffect, useState } from 'react';
import type { GeoPoint } from '../types';

interface GeoState {
  position: GeoPoint | null;
  error: string | null;
  loading: boolean;
}

// Wraps the browser Geolocation API with a manual `request` trigger and a
// sensible default (attempts once on mount). Falls back gracefully when denied.
export function useGeolocation(auto = true) {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
    loading: false,
  });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation unsupported' }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          error: null,
          loading: false,
        });
      },
      (err) => setState({ position: null, error: err.message, loading: false }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (auto) request();
  }, [auto, request]);

  return { ...state, request };
}
