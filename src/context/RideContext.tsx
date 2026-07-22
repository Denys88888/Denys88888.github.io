import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { wsService } from '../services/wsService';
import { api } from '../services/api';
import type { Ride } from '../types';

interface RideCtx {
  refresh: () => void;
}

const Ctx = createContext<RideCtx | null>(null);

export function RideProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const token = useAppStore((s) => s.token);
  const uid = useAppStore((s) => s.user?.uid ?? '');
  const setCurrentRide = useAppStore((s) => s.setCurrentRide);
  const addToast = useAppStore((s) => s.addToast);

  useEffect(() => {
    if (!token) return;

    const offAssigned = wsService.on('ride_assigned', (msg) => {
      // This event fires on both sides of an assignment: the passenger whose
      // ride just got a driver, and — for a negotiated ride — the driver whose
      // offer was just accepted. Same payload, opposite meaning; pick the
      // toast that matches which one this client is.
      const iAmTheDriver = String(msg.driverId ?? '') === uid;
      addToast('success', t(iAmTheDriver ? 'driver.offerAccepted' : 'home.driverFound'));
      const rideId = String(msg.rideId ?? '');
      if (rideId) {
        api.getRide(rideId).then(setCurrentRide).catch((err) => console.error('[RideContext] getRide:', err));
      }
    });

    const offStatus = wsService.on('ride_status_update', (msg) => {
      if (msg.status === 'driver_approved' && msg.token) {
        const { setAuth } = useAppStore.getState();
        setAuth(msg.user as unknown as import('../types').User, String(msg.token));
        addToast('success', t('notify.driverApproved'));
        return;
      }
      if (msg.status === 'driver_rejected') {
        addToast('error', t('notify.driverRejected'));
        return;
      }
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
  }, [token, uid, setCurrentRide, addToast, t]);

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
