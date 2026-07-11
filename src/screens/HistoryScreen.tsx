import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { RideStatusBadge } from '../components/ride/RideStatusBadge';
import { SkeletonCard } from '../components/ui/SkeletonCard';
import { useRouter } from '../store/useRouter';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { formatPi, formatDate } from '../utils/formatters';
import { cn } from '../utils/helpers';
import type { Ride, RideStatus } from '../types';

type Tab = 'all' | 'completed' | 'cancelled';

// Ride history with All / Completed / Cancelled tabs.
export function HistoryScreen() {
  const { t } = useTranslation();
  const navigate = useRouter((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('all');
  const [rides, setRides] = useState<Ride[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRides(null);
    const status = tab === 'all' ? undefined : (tab as RideStatus);
    api
      .listRides({ status, limit: 50 })
      .then((r) => { if (!cancelled) setRides(r.rides); })
      .catch((err) => { console.error('[history] listRides:', err); if (!cancelled) setRides([]); });
    return () => { cancelled = true; };
  }, [tab]);

  const tabs: Tab[] = ['all', 'completed', 'cancelled'];

  return (
    <div className="flex h-full flex-col">
      <header className="surface p-4">
        <h2 className="mb-3">{t('history.title')}</h2>
        <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/10 p-1">
          {tabs.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition',
                tab === tb ? 'bg-surface-light dark:bg-surface-dark text-primary shadow-sm' : 'opacity-60'
              )}
            >
              {t(`history.${tb}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {rides === null && [1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        {rides?.length === 0 && (
          <p className="pt-10 text-center text-sm opacity-50">{t('history.empty')}</p>
        )}
        {rides?.map((ride) => (
          <Card
            key={ride.id}
            className="cursor-pointer"
            onClick={() => navigate('ride', { id: ride.id })}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {ride.pickup.address ?? `${ride.pickup.lat.toFixed(3)}, ${ride.pickup.lng.toFixed(3)}`}
                </p>
                <p className="truncate text-sm opacity-60">
                  → {ride.destination.address ?? `${ride.destination.lat.toFixed(3)}, ${ride.destination.lng.toFixed(3)}`}
                </p>
                <p className="mt-1 text-xs opacity-40">{formatDate(ride.createdAt)}</p>
              </div>
              <div className="ml-3 flex flex-col items-end gap-1">
                <p className="font-bold">{formatPi(ride.fare)}</p>
                <RideStatusBadge status={ride.status} />
                {ride.status === 'completed' && user?.role === 'passenger' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('home', {
                        repeatPickup: JSON.stringify(ride.pickup),
                        repeatDest: JSON.stringify(ride.destination),
                      });
                    }}
                    className="mt-1 flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                  >
                    <RotateCcw size={12} /> {t('history.repeat')}
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
