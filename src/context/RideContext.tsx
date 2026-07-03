import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { wsService } from '../services/wsService';
import type { Ride } from '../types';

interface RideCtx {
  /* Subscriptions are wired in the provider; consumers read store.currentRide. */
  refresh: () => void;
}

const Ctx = createContext<RideCtx | null>(null);

// Keeps the active ride in sync with real-time WebSocket events.
export function RideProvider({ children }: { children: ReactNode }) {
  const token = useAppStore((s) => s.token);
  const setCurrentRide = useAppStore((s) => s.setCurrentRide);
  const addToast = useAppStore((s) => s.addToast);

  useEffect(() => {
    if (!token) return;

    const offAssigned = wsService.on('ride_assigned', (msg) => {
      addToast('success', 'Driver found!');
      setCurrentRide(useAppStore.getState().currentRide
        ? { ...(useAppStore.getState().currentRide as Ride), status: 'assigned', driverId: String(msg.driverId) }
        : null);
    });

    const offStatus = wsService.on('ride_status_update', (msg) => {
      const cur = useAppStore.getState().currentRide;
      const rideId = String(msg.rideId ?? '');
      if (cur && cur.id === rideId && msg.status) {
        setCurrentRide({ ...cur, status: msg.status as Ride['status'] });
      }
    });

    return () => {
      offAssigned();
      offStatus();
    };
  }, [token, setCurrentRide, addToast]);

  const refresh = (): void => {
    /* Placeholder for manual refresh; ride state is push-driven via WS. */
  };

  return <Ctx.Provider value={{ refresh }}>{children}</Ctx.Provider>;
}

export function useRideContext(): RideCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRideContext must be used within RideProvider');
  return ctx;
}
