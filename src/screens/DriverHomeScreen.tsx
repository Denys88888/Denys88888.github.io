import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { Circle, Check, LocateFixed, Navigation, TrendingUp, Route } from 'lucide-react';
import { MapView } from '../components/map/MapContainer';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useGeolocation } from '../hooks/useGeolocation';
import { useToast } from '../hooks/useToast';
import { useRouter } from '../store/useRouter';
import { wsService } from '../services/wsService';
import { api } from '../services/api';
import { formatPi, formatDistance, formatDuration } from '../utils/formatters';
import { haversineKm, cn } from '../utils/helpers';
import { isToday } from 'date-fns';
import type { GeoPoint, Ride, HeatmapPoint } from '../types';

// Driver home: online toggle, live map, and the queue of available ride requests.
export function DriverHomeScreen() {
  const { t } = useTranslation();
  const { position, error: geoError, request } = useGeolocation();
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
  const [previewRideId, setPreviewRideId] = useState<string | null>(null);

  const [todayRides, setTodayRides] = useState<Ride[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.listRides({ status: 'completed', limit: 50 })
      .then((r) => { if (!cancelled) setTodayRides(r.rides.filter((x) => isToday(new Date(x.createdAt)))); })
      .catch((err) => console.error('[driver] today rides:', err))
      .finally(() => { if (!cancelled) setTodayLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const todayEarnings = useMemo(
    () => todayRides.reduce((s, r) => s + (r.driverEarnings || 0) + (r.tipAmount || 0), 0),
    [todayRides]
  );

  const center: GeoPoint = position ?? { lat: 52.2297, lng: 21.0122 };

  // Surface GPS failures (denied permission, timeout, unsupported) instead of
  // silently leaving the map centered on the default fallback with no marker.
  useEffect(() => {
    if (geoError) addToast('error', t('home.locationError'));
  }, [geoError, addToast, t]);

  // Demand heatmap: refresh every minute while online.
  useEffect(() => {
    if (!online) {
      setHeatmap([]);
      return;
    }
    const load = () => api.getHeatmap().then(setHeatmap).catch((err) => console.error('[driver] heatmap:', err));
    load();
    const id = setInterval(load, 60 * 1000);
    return () => clearInterval(id);
  }, [online]);

  // Push live location to backend every 30 s while online so nearby-drivers stays fresh.
  useEffect(() => {
    if (!online || !position) return;
    const id = setInterval(() => {
      if (position) api.updateDriverLocation(position.lat, position.lng).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [online, position?.lat, position?.lng]);

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
        .catch((err) => console.error('[driver] open rides:', err));
    load();
    const id = setInterval(load, 15 * 1000);
    return () => clearInterval(id);
  }, [online]);

  // An in-progress ride (page reload, back navigation) → offer the Navigation
  // shortcut back into the ride screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const status of ['in_progress', 'arrived', 'assigned'] as const) {
        if (cancelled) return;
        try {
          const { rides } = await api.listRides({ status, limit: 1 });
          if (cancelled) return;
          const mine = rides.find((r) => r.driverId);
          if (mine) {
            setActiveRide(mine);
            return;
          }
        } catch {
          return;
        }
      }
      if (!cancelled) setActiveRide(null);
    })();
    return () => { cancelled = true; };
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
    } catch (err) {
      // 403 = not a verified driver (no vehicle on file or application still
      // pending) — the registration wizard is the actionable next step.
      if (isAxiosError(err) && err.response?.status === 403) {
        navigate('register');
      } else {
        addToast('error', t('common.error'));
      }
    }
  };

  const accept = (ride: Ride): void => {
    wsService.send('ride_accept', { rideId: ride.id });
    setRequests((prev) => prev.filter((r) => r.id !== ride.id));
    navigate('ride', { id: ride.id });
  };

  const previewRide = requests.find((r) => r.id === previewRideId) ?? null;
  const togglePreview = (ride: Ride): void => {
    setPreviewRideId((cur) => (cur === ride.id ? null : ride.id));
    setFocusNonce((n) => n + 1);
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
          driver={position}
          pickup={previewRide ? position ?? undefined : undefined}
          destination={previewRide?.pickup}
          heatmap={heatmap}
          focus={previewRide ? previewRide.pickup : focusNonce > 0 ? position : undefined}
          focusNonce={focusNonce}
          className="h-full w-full"
        />
        <button
          onClick={toggleOnline}
          className={cn(
            'absolute left-4 top-4 z-[1000] inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-fab',
            online ? 'bg-success' : 'bg-danger'
          )}
        >
          <Circle size={10} className="fill-white text-white" />
          {online ? t('driver.online') : t('driver.offline')}
        </button>
        <button
          onClick={() => {
            if (!position && geoError) {
              // Permission was already denied — request() below will fail the
              // same way again, so the error-driven toast (keyed on the
              // message) won't re-fire on its own. Tell the user now.
              addToast('error', t('home.locationError'));
            }
            request();
            setFocusNonce((n) => n + 1);
          }}
          className="absolute bottom-20 right-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-fab active:scale-95"
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
        {online && todayLoading && (
          <div className="flex justify-center py-3 opacity-40">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {online && !todayLoading && (todayRides.length > 0 || todayEarnings > 0) && (
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
                <span className="block text-[10px] opacity-60">{ride.vehicleType}</span>
                {ride.negotiable && <span className="text-[10px] text-primary">{t('driver.negotiable')}</span>}
              </span>
            </div>
            <button
              onClick={() => togglePreview(ride)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition',
                previewRideId === ride.id
                  ? 'bg-primary text-white'
                  : 'bg-primary/10 text-primary'
              )}
            >
              <Route size={15} className="shrink-0" />
              {formatDistance(haversineKm(center.lat, center.lng, ride.pickup.lat, ride.pickup.lng))}
              <span className="opacity-50">·</span>
              {formatDuration(
                (haversineKm(center.lat, center.lng, ride.pickup.lat, ride.pickup.lng) / 30) * 60
              )}
              <span className="opacity-60">{t('driver.toPickup')}</span>
              <span className="ml-auto text-xs font-normal opacity-60">
                {previewRideId === ride.id ? t('driver.hideRoute') : t('driver.showRoute')}
              </span>
            </button>

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
