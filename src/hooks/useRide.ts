import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useRideContext } from '../context/RideContext';
import { api } from '../services/api';

// Active-ride hook: the current ride from the store plus common actions. Real-time
// updates are wired by RideProvider; this exposes read + imperative helpers.
export function useRide() {
  const currentRide = useAppStore((s) => s.currentRide);
  const setCurrentRide = useAppStore((s) => s.setCurrentRide);
  const { refresh } = useRideContext();

  const load = useCallback(
    async (id: string) => {
      const ride = await api.getRide(id);
      setCurrentRide(ride);
      return ride;
    },
    [setCurrentRide]
  );

  const cancel = useCallback(
    async (id: string, reason: string) => {
      const ride = await api.cancelRide(id, reason);
      setCurrentRide(ride);
      return ride;
    },
    [setCurrentRide]
  );

  return { currentRide, setCurrentRide, load, cancel, refresh };
}
