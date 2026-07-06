import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Check, LocateFixed, Navigation, TrendingUp } from 'lucide-react';
import { MapView } from '../components/map/MapContainer';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useGeolocation } from '../hooks/useGeolocation';
import { useToast } from '../hooks/useToast';
import { useRouter } from '../store/useRouter';
import { wsService } from '../services/wsService';
import { api } from '../services/api';
import { formatPi, formatDistance } from '../utils/formatters';
import { haversineKm, cn } from '../utils/helpers';
import { isToday } from 'date-fns';
import type { GeoPoint, Ride, HeatmapPoint } from '../types';

// Driver home: online toggle, live map, and the queue of available ride requests.
export function DriverHomeScreen() {
  const { t } = useTranslation();
  const { position } = useGeolocation();
  const { addToast } = useToast();
  const navigate = useRouter((s) => s.navigate);

  const [online, setOnline] = useState(false);
  const [requests, setRequests] = useState<Ride[]>([]);
  const [sortByPrice, setSortByPrice] = useState(false);
  const [offerInputs, setOfferInputs] = useState<Record<string, string>>({});
  const [offered, setOffered] = useState<Record<string, boolean>>({});
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const [todayRides, setTodayRides] = useState<Ride[]>([]);

  useEffect(() => {
    api.listRides({ status: 'completed', limit: 50 })
      .then((r) => setTodayRides(r.rides.filter((x) => isToday(new Date(x.createdAt)))))
      .catch(() => {});
  }, []);

  const todayEarnings = useMemo(
    () => todayRides.reduce((s, r) => s + (r.driverEarnings || 0) + (r.tipAmount || 0), 0),
    [todayRides]
  );

  const center: GeoPoint = position ?? { lat: 52.2297, lng: 21.0122 };

  // Demand heatmap: refresh every minute while online.
  useEffect(() => {
    if (!online) {
      setHeatmap([]);
      return;
    }
    const load = () => api.getHeatmap().then(setHeatmap).catch(() => {});
    load();
    const id = setInterval(load, 60 * 1000);
    return () => clearInterval(id);
  }, [online]);

  // Backfill open requests while online: rides created before this driver
  // connected never got a live 'ride_available' event, so poll /rides/open
  // (every 15 s) and merge into the queue.
  useEffect(() => {
    if (!online) return;
    const load = () =>
      api
        .listOpenRides()
        .then((open) =>
          setRequests((prev) => {
            const seen = new Set(prev.map((r) => r.id));
            const fresh = open.filter((r) => !seen.has(r.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          })
        )
        .catch(() => {});
    load();
    const id = setInterval(load, 15 * 1000);
    return () => clearInterval(id);
  }, [online]);

  // An in-progress ride (page reload, back navigation) → offer the Navigation
  // shortcut back into the ride screen.
  useEffect(() => {
    (async () => {
      for (const status of ['in_progress', 'arrived', 'assigned'] as const) {
        try {
          const { rides } = await api.listRides({ status, limit: 1 });
          const mine = rides.find((r) => r.driverId);
          if (mine) {
            setActiveRide(mine);
            return;
          }
        } catch {
          return;
        }
      }
      setActiveRide(null);
    })();
  }, []);

  useEffect(() => {
    const offAvail = wsService.on('ride_available', (msg) => {
      const ride = msg.ride as Ride;
      setRequests((prev) => (prev.some((r) => r.id === ride.id) ? prev : [ride, ...prev]));
    });
    const offTaken = wsService.on('ride_status_update', (msg) => {
      if (msg.status && msg.status !== 'searching') {
        setRequests((prev) => prev.filter((r) => r.id !== String(msg.rideId)));
      }
    });
    return () => {
      offAvail();
      offTaken();
    };
  }, []);

  const toggleOnline = async (): Promise<void> => {
    try {
      if (!online) {
        await api.goOnline(position?.lat, position?.lng);
        wsService.send('driver_online', {
          lat: center.lat,
          lng: center.lng,
          vehicleType: 'economy',
        });
        setOnline(true);
        addToast('success', t('driver.online'));
      } else {
        await api.goOffline();
        wsService.send('driver_offline', {});
        setOnline(false);
        setRequests([]);
      }
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const accept = (ride: Ride): void => {
    wsService.send('ride_accept', { rideId: ride.id });
    setRequests((prev) => prev.filter((r) => r.id !== ride.id));
    navigate('ride', { id: ride.id });
  };

  // Bid on a negotiable ride (counter-offer with the driver's own price).
  const sendOffer = async (ride: Ride): Promise<void> => {
    const amount = Number(offerInputs[ride.id]);
    if (!amount || amount <= 0) return;
    const etaMin = Math.round(
      (haversineKm(center.lat, center.lng, ride.pickup.lat, ride.pickup.lng) / 30) * 60
    );
    try {
      await api.submitOffer(ride.id, amount, etaMin);
      setOffered((prev) => ({ ...prev, [ride.id]: true }));
      addToast('success', t('driver.offerSent'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const sorted = [...requests].sort((a, b) =>
    sortByPrice
      ? b.fare - a.fare
      : haversineKm(center.lat, center.lng, a.pickup.lat, a.pickup.lng) -
        haversineKm(center.lat, center.lng, b.pickup.lat, b.pickup.lng)
  );

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[40%]">
        <MapView
          center={center}
          me={position}
          heatmap={heatmap}
          focus={focusNonce > 0 ? position : undefined}
          focusNonce={focusNonce}
          className="h-full w-full"
        />
        <button
          onClick={toggleOnline}
          className={cn(
            'absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-fab',
            online ? 'bg-success' : 'bg-danger'
          )}
        >
          <Circle size={10} className="fill-white text-white" />
          {online ? t('driver.online') : t('driver.offline')}
        </button>
        <button
          onClick={() => setFocusNonce((n) => n + 1)}
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-fab active:scale-95"
          aria-label={t('home.useMyLocation')}
        >
          <LocateFixed size={20} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {/* Ongoing ride shortcut with turn-by-turn navigation. */}
        {activeRide && (
          <Button
            fullWidth
            onClick={() => navigate('ride', { id: activeRide.id, nav: '1' })}
            className="!bg-success"
          >
            <Navigation size={16} /> {t('driver.navigation')}
          </Button>
        )}
        {online && (todayRides.length > 0 || todayEarnings > 0) && (
          <Card className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-success" />
              <div>
                <p className="text-xs opacity-60">{t('driver.today')}</p>
                <p className="font-bold">{formatPi(todayEarnings)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-60">{t('driver.ridesCount')}</p>
              <p className="font-bold">{todayRides.length}</p>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <h3>{t('driver.availableRides')}</h3>
          <button
            onClick={() => setSortByPrice((v) => !v)}
            className="rounded-full bg-black/5 dark:bg-white/10 px-3 py-1 text-xs"
          >
            {sortByPrice ? t('driver.sortByPrice') : t('driver.sortByDistance')}
          </button>
        </div>

        {!online && (
          <p className="pt-6 text-center text-sm opacity-50">{t('driver.goOnline')}</p>
        )}
        {online && sorted.length === 0 && (
          <p className="pt-6 text-center text-sm opacity-50">{t('driver.noRides')}</p>
        )}

        {sorted.map((ride) => (
          <Card key={ride.id} className="space-y-2">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-1.5 truncate">
                  <Circle size={10} className="shrink-0 fill-success text-success" />
                  {ride.pickup.address ?? 'Pickup'}
                </p>
                {ride.stops?.map((s, i) => (
                  <p key={i} className="flex items-center gap-1.5 truncate opacity-70">
                    <Circle size={10} className="shrink-0 fill-warning text-warning" />
                    {s.address ?? `Stop ${i + 1}`}
                  </p>
                ))}
                <p className="flex items-center gap-1.5 truncate opacity-70">
                  <Circle size={10} className="shrink-0 fill-danger text-danger" />
                  {ride.destination.address ?? 'Destination'}
                </p>
              </div>
              <span className="ml-2 text-right">
                <span className="block font-bold">{formatPi(ride.fare)}</span>
                {ride.negotiable && <span className="text-[10px] text-primary">{t('driver.negotiable')}</span>}
              </span>
            </div>
            <div className="text-xs opacity-60">
              {formatDistance(haversineKm(center.lat, center.lng, ride.pickup.lat, ride.pickup.lng))} · {ride.vehicleType}
            </div>

            {ride.negotiable ? (
              offered[ride.id] ? (
                <p className="flex items-center justify-center gap-1 text-center text-sm text-success">
                  <Check size={15} /> {t('driver.offerSent')}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1 rounded-lg border border-[#E0E0E0] dark:border-white/15 px-3 py-2">
                    <span className="font-bold text-primary">π</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={offerInputs[ride.id] ?? ''}
                      placeholder={String(ride.offeredFare ?? ride.fare)}
                      onChange={(e) =>
                        setOfferInputs((prev) => ({ ...prev, [ride.id]: e.target.value }))
                      }
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  <Button variant="primary" onClick={() => sendOffer(ride)} className="px-4 py-2">
                    {t('driver.submitOffer')}
                  </Button>
                </div>
              )
            ) : (
              <div className="flex justify-end">
                <Button variant="success" onClick={() => accept(ride)} className="px-5 py-2">
                  {t('driver.accept')}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
