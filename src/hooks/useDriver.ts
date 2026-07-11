import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { wsService } from '../services/wsService';
import type { VehicleType } from '../types';

// Driver actions hook: online/offline toggling and GPS updates, kept in sync
// across REST (persistence) and WebSocket (real-time availability).
export function useDriver() {
  const [isOnline, setIsOnline] = useState(false);

  const goOnline = useCallback(
    async (lat?: number, lng?: number, vehicleType: VehicleType = 'economy') => {
      await api.goOnline(lat, lng);
      if (lat !== undefined && lng !== undefined) {
        wsService.send('driver_online', { lat, lng, vehicleType });
      }
      setIsOnline(true);
    },
    []
  );

  const goOffline = useCallback(async () => {
    await api.goOffline();
    wsService.send('driver_offline', {});
    setIsOnline(false);
  }, []);

  const updateLocation = useCallback((lat: number, lng: number, rideId?: string) => {
    api.updateDriverLocation(lat, lng).catch((err) => console.error('[driver] location:', err));
    wsService.send('driver_location', { lat, lng, rideId });
  }, []);

  return { isOnline, goOnline, goOffline, updateLocation };
}
