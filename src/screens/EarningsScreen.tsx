import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { api } from '../services/api';
import { formatPi, formatDate } from '../utils/formatters';
import { isToday, isThisWeek, isThisMonth } from 'date-fns';
import type { Ride, SurgeInfo } from '../types';

// What the driver actually pockets from a ride: earnings after fee + full tip.
function earned(r: Ride): number {
  return (r.driverEarnings || 0) + (r.tipAmount || 0);
}

// Rough productivity coefficient by time of day: evenings and mornings are
// busier than the small hours.
function dayPartCoefficient(hour: number): number {
  if (hour >= 17 && hour < 22) return 1.2;
  if (hour >= 7 && hour < 10) return 1.1;
  if (hour >= 22 || hour < 6) return 0.8;
  return 1.0;
}

// Driver earnings dashboard: today / week / month totals, an income forecast,
// and a simple bar chart.
export function EarningsScreen() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [surge, setSurge] = useState<SurgeInfo | null>(null);

  useEffect(() => {
    api
      .listRides({ status: 'completed', limit: 50 })
      .then((r) => setRides(r.rides))
      .catch(() => setRides([]));
    api.getSurge().then(setSurge).catch(() => {});
  }, []);

  const totals = useMemo(() => {
    const sum = (pred: (d: Date) => boolean) =>
      rides.filter((r) => pred(new Date(r.createdAt))).reduce((acc, r) => acc + earned(r), 0);
    return {
      today: sum((d) => isToday(d)),
      week: sum((d) => isThisWeek(d)),
      month: sum((d) => isThisMonth(d)),
    };
  }, [rides]);

  const tipsTotal = useMemo(
    () => rides.reduce((acc, r) => acc + (r.tipAmount || 0), 0),
    [rides]
  );

  // Forecast: 7-day average daily income × current surge × time-of-day factor.
  const forecast = useMemo(() => {
    const DAY = 24 * 60 * 60 * 1000;
    const weekAgo = Date.now() - 7 * DAY;
    const recent = rides.filter((r) => new Date(r.createdAt).getTime() >= weekAgo);
    if (recent.length === 0) return null;
    const activeDays = new Set(recent.map((r) => r.createdAt.slice(0, 10))).size || 1;
    const avgPerDay = recent.reduce((acc, r) => acc + earned(r), 0) / activeDays;
    const value =
      avgPerDay * (surge?.multiplier ?? 1) * dayPartCoefficient(new Date().getHours());
    return Math.round(value * 10) / 10;
  }, [rides, surge]);

  const maxEarn = Math.max(1, ...rides.map((r) => earned(r)));

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

        {/* Income forecast for today. */}
        {forecast !== null && (
          <Card className="flex items-center gap-3 !bg-primary/10">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <TrendingUp size={22} />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {t('earnings.forecastToday', { amount: formatPi(forecast) })}
              </p>
              <p className="text-xs opacity-60">
                {t('earnings.forecastHint', { amount: formatPi(forecast) })}
                {surge && surge.multiplier > 1 ? ` · ⚡×${surge.multiplier}` : ''}
              </p>
            </div>
          </Card>
        )}

        <Card>
          <p className="mb-3 text-sm font-medium opacity-70">{t('earnings.afterFee')}</p>
          <div className="flex h-32 items-end gap-1">
            {rides.slice(0, 14).reverse().map((r) => (
              <div
                key={r.id}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${(earned(r) / maxEarn) * 100}%` }}
                title={formatPi(earned(r))}
              />
            ))}
          </div>
          {tipsTotal > 0 && (
            <p className="mt-2 text-xs opacity-60">
              {t('earnings.tipsTotal')}: <b>{formatPi(tipsTotal)}</b>
            </p>
          )}
        </Card>

        <div className="space-y-2">
          {rides.map((r) => (
            <Card key={r.id} className="flex items-center justify-between py-3">
              <div className="text-sm">
                <p className="font-medium">
                  {formatPi(earned(r))}
                  {!!r.tipAmount && (
                    <span className="ml-1.5 text-xs font-semibold text-success">
                      +{formatPi(r.tipAmount)} {t('earnings.tip')}
                    </span>
                  )}
                </p>
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
