import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui/Card';
import { api } from '../services/api';
import { formatPi, formatDate } from '../utils/formatters';
import { isToday, isThisWeek, isThisMonth } from 'date-fns';
import type { Ride } from '../types';

// Driver earnings dashboard: today / week / month totals + a simple bar chart.
export function EarningsScreen() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);

  useEffect(() => {
    api
      .listRides({ status: 'completed', limit: 50 })
      .then((r) => setRides(r.rides))
      .catch(() => setRides([]));
  }, []);

  const totals = useMemo(() => {
    const sum = (pred: (d: Date) => boolean) =>
      rides
        .filter((r) => pred(new Date(r.createdAt)))
        .reduce((acc, r) => acc + (r.driverEarnings || 0), 0);
    return {
      today: sum((d) => isToday(d)),
      week: sum((d) => isThisWeek(d)),
      month: sum((d) => isThisMonth(d)),
    };
  }, [rides]);

  const maxEarn = Math.max(1, ...rides.map((r) => r.driverEarnings || 0));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="surface p-4">
        <h2>{t('earnings.title')}</h2>
      </header>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3">
          {(['today', 'week', 'month'] as const).map((k) => (
            <Card key={k} className="text-center">
              <p className="text-xs opacity-60">{t(`earnings.${k}`)}</p>
              <p className="mt-1 text-lg font-bold">{formatPi(totals[k])}</p>
            </Card>
          ))}
        </div>

        <Card>
          <p className="mb-3 text-sm font-medium opacity-70">{t('earnings.afterFee')}</p>
          <div className="flex h-32 items-end gap-1">
            {rides.slice(0, 14).reverse().map((r) => (
              <div
                key={r.id}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${((r.driverEarnings || 0) / maxEarn) * 100}%` }}
                title={formatPi(r.driverEarnings || 0)}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-2">
          {rides.map((r) => (
            <Card key={r.id} className="flex items-center justify-between py-3">
              <div className="text-sm">
                <p className="font-medium">{formatPi(r.driverEarnings || 0)}</p>
                <p className="text-xs opacity-50">{formatDate(r.createdAt)}</p>
              </div>
              <span className="text-xs opacity-50">
                {t('ride.platformFee')}: {formatPi(r.platformFee || 0)}
              </span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
