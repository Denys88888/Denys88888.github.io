import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Car, MapPin, Star, AlertCircle } from 'lucide-react';
import { MapView } from '../components/map/MapContainer';
import { api } from '../services/api';
import { formatDistance, formatDuration } from '../utils/formatters';
import type { SharedRide } from '../types';

// The other end of the "share ride" button: someone the passenger sent the link
// to, who almost certainly does not have this app. So this screen renders
// before any auth check and asks for nothing — the token in the URL is the
// whole credential.
//
// It is a safety feature, not a novelty. Somebody is watching because they want
// to know a person got where they were going, which is why it shows the car and
// where it is and nothing about money.

const REFRESH_MS = 10_000;

const STATUS_KEY: Record<string, string> = {
  scheduled: 'ride.statusScheduled',
  searching: 'ride.statusSearching',
  assigned: 'ride.statusAssigned',
  arrived: 'ride.statusArrived',
  in_progress: 'ride.statusInProgress',
  completed: 'ride.statusCompleted',
  cancelled: 'ride.statusCancelled',
};

export function SharedRideScreen({ token }: { token: string }) {
  const { t } = useTranslation();
  const [ride, setRide] = useState<SharedRide | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.sharedRide(token);
        if (!alive) return;
        setRide(data);
        setExpired(false);
      } catch {
        // Any failure here reads the same to the viewer: the link does not work.
        // Distinguishing "expired" from "revoked" would only tell someone who
        // should not have the link which of the two it was.
        if (alive) setExpired(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    // Stop polling once the trip is over — there is nothing left to update, and
    // a forwarded link should not keep a timer running in someone's browser.
    const timer = setInterval(() => {
      if (!ride?.finished) void load();
    }, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ride?.finished]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (expired || !ride) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle size={40} className="opacity-40" />
        <p className="text-lg font-semibold">{t('share.expiredTitle')}</p>
        <p className="text-sm opacity-60">{t('share.expiredHint')}</p>
      </div>
    );
  }

  const car = [ride.driver?.color, ride.driver?.brand, ride.driver?.model]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-50">{t('share.watchingLabel')}</p>
          <p className="font-semibold">{t(STATUS_KEY[ride.status] ?? 'ride.statusSearching')}</p>
        </div>
        {!ride.finished && (
          <span className="flex items-center gap-1.5 text-xs opacity-60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            {t('share.live')}
          </span>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <MapView
          center={ride.driverLocation ?? ride.destination}
          pickup={ride.pickup}
          destination={ride.destination}
          driver={ride.driverLocation}
          className="h-full w-full"
        />
      </div>

      <div className="space-y-3 p-4">
        {ride.driver && (
          <div className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Car size={20} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{ride.driver.name}</p>
              <p className="truncate text-sm opacity-60">{car || t('share.noCarDetails')}</p>
            </div>
            <div className="text-right">
              {ride.driver.number && (
                <p className="font-mono text-sm font-semibold">{ride.driver.number}</p>
              )}
              <p className="flex items-center justify-end gap-1 text-xs opacity-60">
                <Star size={12} className="fill-current" />
                {ride.driver.rating.toFixed(1)}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-sm">
          <MapPin size={16} className="mt-0.5 shrink-0 opacity-50" />
          <span className="min-w-0 flex-1 truncate opacity-80">
            {ride.destination.address ?? t('share.destination')}
          </span>
          <span className="shrink-0 opacity-50">
            {formatDistance(ride.distanceKm)} · {formatDuration(ride.estimatedDurationMin)}
          </span>
        </div>

        {ride.finished && (
          <p className="rounded-card bg-surface p-3 text-center text-sm opacity-70">
            {t('share.finished')}
          </p>
        )}
      </div>
    </div>
  );
}
