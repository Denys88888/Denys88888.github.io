import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed, Circle, X, Calendar, Coins, Zap, Home, Briefcase, Users } from 'lucide-react';
import { MapView } from '../components/map/MapContainer';
import { AddressSearch } from '../components/map/AddressSearch';
import { VehicleTypeSelector } from '../components/ride/VehicleTypeSelector';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useGeolocation } from '../hooks/useGeolocation';
import { useToast } from '../hooks/useToast';
import { useAppStore } from '../store/useAppStore';
import { useRouter } from '../store/useRouter';
import { api } from '../services/api';
import { reverseGeocode, countryCodeAt, fetchRoute } from '../services/mapService';
import { loadSavedAddresses, saveAddress } from '../services/savedAddresses';
import { formatPi, formatDistance, formatDuration } from '../utils/formatters';
import { isValidCoord } from '../utils/validators';
import { cn, routeDistanceKm } from '../utils/helpers';
import type { GeoPoint, VehicleType, SavedAddress, SurgeInfo } from '../types';

const DEFAULT_CENTER: GeoPoint = { lat: 52.2297, lng: 21.0122 }; // Warsaw fallback

// Fixed quick-address slots (one-tap destinations).
const QUICK_SLOTS = [
  { label: 'home', icon: Home },
  { label: 'work', icon: Briefcase },
  { label: 'parents', icon: Users },
] as const;

// Passenger home: 60% map + a booking sheet supporting tap-to-select destination,
// local address search, multi-stop, scheduled rides, and price negotiation.
export function PassengerHomeScreen() {
  const { t } = useTranslation();
  const { position, request } = useGeolocation();
  const { addToast } = useToast();
  const setCurrentRide = useAppStore((s) => s.setCurrentRide);
  const params = useRouter((s) => s.params);
  const navigate = useRouter((s) => s.navigate);

  const [pickup, setPickup] = useState<GeoPoint | null>(() => {
    try { return params.repeatPickup ? JSON.parse(params.repeatPickup) : null; } catch { return null; }
  });
  const [destination, setDestination] = useState<GeoPoint | null>(() => {
    try { return params.repeatDest ? JSON.parse(params.repeatDest) : null; } catch { return null; }
  });
  const [stops, setStops] = useState<GeoPoint[]>([]);
  const [vehicle, setVehicle] = useState<VehicleType>('economy');
  const [ordering, setOrdering] = useState(false);
  const [country, setCountry] = useState<string | undefined>();

  // Scheduling + negotiation state.
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [negotiate, setNegotiate] = useState(false);
  const [offeredFare, setOfferedFare] = useState('');

  // Dynamic pricing: multiplier shown to the passenger before ordering.
  const [surge, setSurge] = useState<SurgeInfo | null>(null);
  useEffect(() => {
    const point = pickup ?? position ?? undefined;
    const fetchSurge = () =>
      api.getSurge(point ? { lat: point.lat, lng: point.lng } : undefined).then(setSurge).catch((err) => console.error('[passenger] surge:', err));
    fetchSurge();
    const id = setInterval(fetchSurge, 5 * 60 * 1000);
    return () => clearInterval(id);
    // Only re-check when pickup changes (not on every GPS tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng]);

  // Saved quick addresses (Home / Work / Parents).
  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  useEffect(() => {
    loadSavedAddresses().then(setSavedAddrs);
  }, []);

  const quickTap = async (label: string): Promise<void> => {
    const saved = savedAddrs.find((a) => a.label === label);
    if (saved) {
      setDestination({ lat: saved.lat, lng: saved.lng, address: saved.address });
      return;
    }
    if (destination) {
      const list = await saveAddress({
        label,
        lat: destination.lat,
        lng: destination.lng,
        address: destination.address,
      });
      setSavedAddrs(list);
      addToast('success', t('home.addressSaved', { label: t(`home.${label}`) }));
    } else {
      addToast('info', t('home.addressSaveHint'));
    }
  };

  // "My location" button: recenter the map on the GPS position.
  const [focusNonce, setFocusNonce] = useState(0);

  // Tap-to-select confirmation. The tapped point becomes the destination
  // immediately (so the marker is visible under the dialog); prevDestination
  // holds whatever was selected before, to restore on cancel.
  const [pendingTap, setPendingTap] = useState<GeoPoint | null>(null);
  const [prevDestination, setPrevDestination] = useState<GeoPoint | null>(null);

  // Prefill pickup from GPS + reverse-geocoded address, and detect country.
  useEffect(() => {
    if (position && !pickup) {
      setPickup(position);
      reverseGeocode(position).then((address) =>
        setPickup((p) => (p ? { ...p, address } : { ...position, address }))
      );
      countryCodeAt(position).then(setCountry);
    }
  }, [position, pickup]);

  const center = pickup ?? position ?? DEFAULT_CENTER;

  const straightKm = useMemo(() => {
    if (!pickup || !destination) return 0;
    return routeDistanceKm([pickup, ...stops, destination]);
  }, [pickup, destination, stops]);

  // Real road distance/duration from OSRM (shared cache with the map's route
  // line); the straight-line numbers only bridge the gap while it loads.
  const [road, setRoad] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  useEffect(() => {
    let stale = false;
    setRoad(null);
    if (pickup && destination) {
      fetchRoute([pickup, ...stops, destination]).then((r) => {
        if (!stale && r) setRoad({ distanceKm: r.distanceKm, durationMin: r.durationMin });
      });
    }
    return () => {
      stale = true;
    };
  }, [pickup, destination, stops]);

  const distanceKm = road?.distanceKm ?? straightKm;
  const durationMin = road
    ? Math.max(1, Math.round(road.durationMin))
    : Math.max(1, Math.round((distanceKm / 30) * 60));
  const surgeX = surge && surge.multiplier > 1 ? surge.multiplier : 1;
  const fareEstimate = (distanceKm * (vehicle === 'business' ? 1.4 : 1) + 1.5) * surgeX;

  const canOrder =
    isValidCoord(pickup) &&
    isValidCoord(destination) &&
    !ordering &&
    (!schedule || !!scheduledAt) &&
    (!negotiate || Number(offeredFare) > 0);

  // Map tap → red marker appears right away → reverse geocode → "Go here?"
  // confirmation. Cancel restores the previous destination.
  const onMapTap = (p: GeoPoint) => {
    setPrevDestination(destination);
    setPendingTap(p);
    setDestination(p);
    reverseGeocode(p).then((address) => {
      // Only attach the address if the tapped point is still the active one.
      const withAddress = (cur: GeoPoint | null) =>
        cur && cur.lat === p.lat && cur.lng === p.lng ? { ...cur, address } : cur;
      setPendingTap(withAddress);
      setDestination(withAddress);
    });
  };
  const confirmTap = () => {
    // Destination is already set from onMapTap; just dismiss the dialog.
    setPendingTap(null);
    setPrevDestination(null);
  };
  const cancelTap = () => {
    setDestination(prevDestination);
    setPrevDestination(null);
    setPendingTap(null);
  };

  // Dragging the destination pin adjusts the drop-off and re-resolves its address.
  const onDestinationDrag = (p: GeoPoint) => {
    setDestination(p);
    reverseGeocode(p).then((address) => setDestination((cur) => (cur ? { ...cur, address } : cur)));
  };

  const order = async (): Promise<void> => {
    if (!isValidCoord(pickup) || !isValidCoord(destination)) return;
    setOrdering(true);
    try {
      const ride = await api.createRide({
        pickup,
        destination,
        vehicleType: vehicle,
        stops: stops.length ? stops : undefined,
        scheduledAt: schedule && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        negotiable: negotiate || undefined,
        offeredFare: negotiate ? Number(offeredFare) : undefined,
      });
      setCurrentRide(ride);
      addToast('success', schedule ? t('home.scheduleRide') : t('home.searching'));
      navigate('ride', { id: ride.id });
    } catch {
      addToast('error', t('common.error'));
    } finally {
      setOrdering(false);
    }
  };

  const orderLabel = negotiate
    ? t('home.findOffers')
    : schedule
      ? t('home.scheduleRide')
      : t('home.order');

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[52%]">
        <MapView
          center={center}
          pickup={pickup}
          destination={destination}
          stops={stops}
          me={position}
          focus={focusNonce > 0 ? position : undefined}
          focusNonce={focusNonce}
          onMapClick={onMapTap}
          onDestinationDrag={onDestinationDrag}
          className="h-full w-full"
        />
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center">
          <span className="pointer-events-none rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {t('home.tapMapHint')}
          </span>
        </div>
        <button
          onClick={() => {
            request();
            setFocusNonce((n) => n + 1);
          }}
          className="absolute bottom-20 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-fab active:scale-95"
          aria-label={t('home.useMyLocation')}
        >
          <LocateFixed size={22} />
        </button>
      </div>

      <div className="-mt-4 flex-1 overflow-y-auto rounded-t-2xl surface p-4 shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15 dark:bg-white/20" />
        <div className="space-y-3">
          <AddressSearch
            label={t('home.from')}
            placeholder={t('home.fromPlaceholder')}
            value={pickup?.address ?? ''}
            icon={<Circle size={12} className="fill-success text-success" />}
            near={position}
            countryCodes={country}
            onSelect={setPickup}
          />

          {/* Intermediate stops (multi-stop). */}
          {stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <AddressSearch
                  label={`${t('home.stop')} ${i + 1}`}
                  placeholder={t('home.stop')}
                  value={s.address ?? ''}
                  icon={<Circle size={12} className="fill-warning text-warning" />}
                  near={position}
                  countryCodes={country}
                  onSelect={(p) => setStops((prev) => prev.map((x, xi) => (xi === i ? p : x)))}
                />
              </div>
              <button
                onClick={() => setStops((prev) => prev.filter((_, xi) => xi !== i))}
                className="mt-6 flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10 text-danger"
                aria-label={t('home.removeStop')}
              >
                <X size={16} />
              </button>
            </div>
          ))}

          <AddressSearch
            label={t('home.to')}
            placeholder={t('home.toPlaceholder')}
            value={destination?.address ?? ''}
            icon={<Circle size={12} className="fill-danger text-danger" />}
            near={position}
            countryCodes={country}
            onSelect={setDestination}
          />

          {/* Saved quick addresses: one tap to set the destination; tapping an
              empty slot saves the currently selected destination. */}
          <div className="flex gap-2">
            {QUICK_SLOTS.map(({ label, icon: Icon }) => {
              const saved = savedAddrs.find((a) => a.label === label);
              return (
                <button
                  key={label}
                  onClick={() => quickTap(label)}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium',
                    saved
                      ? 'bg-primary/10 text-primary'
                      : 'bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50'
                  )}
                  title={saved?.address}
                >
                  <Icon size={14} /> {t(`home.${label}`)}
                </button>
              );
            })}
          </div>

          {stops.length < 5 && (
            <button
              onClick={() => setStops((prev) => [...prev, { lat: center.lat, lng: center.lng }])}
              className="inline-flex min-h-[40px] items-center px-1 text-sm font-medium text-primary"
            >
              ＋ {t('home.addStop')}
            </button>
          )}

          {/* Now vs Schedule. */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/10 p-1">
              <button
                onClick={() => setSchedule(false)}
                className={cn('rounded-lg px-4 py-1.5 text-sm font-medium', !schedule && 'bg-surface-light dark:bg-surface-dark text-primary shadow-sm')}
              >
                {t('home.now')}
              </button>
              <button
                onClick={() => setSchedule(true)}
                className={cn('inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium', schedule && 'bg-surface-light dark:bg-surface-dark text-primary shadow-sm')}
              >
                <Calendar size={15} /> {t('home.schedule')}
              </button>
            </div>
            {schedule && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="flex-1 rounded-lg border border-[#E0E0E0] dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium opacity-70">{t('home.chooseVehicle')}</p>
            <VehicleTypeSelector value={vehicle} onChange={setVehicle} distanceKm={distanceKm} />
          </div>

          {/* Price negotiation (inDriver-style). */}
          <label className="flex items-center justify-between rounded-card bg-black/5 dark:bg-white/5 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Coins size={16} /> {t('home.setYourPrice')}
            </span>
            <input
              type="checkbox"
              checked={negotiate}
              onChange={(e) => setNegotiate(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>
          {negotiate && (
            <div>
              <div className="flex items-center gap-2 rounded-card border-2 border-primary/40 px-4 py-2">
                <span className="text-lg font-bold text-primary">π</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={offeredFare}
                  onChange={(e) => setOfferedFare(e.target.value)}
                  placeholder={fareEstimate.toFixed(1)}
                  className="w-full bg-transparent text-lg font-bold outline-none"
                />
                <span className="text-sm opacity-60">{t('home.yourPrice')}</span>
              </div>
              <p className="mt-1 text-xs opacity-50">{t('home.yourPriceHint')}</p>
            </div>
          )}

          {/* Surge banner: visible whenever dynamic pricing is active. */}
          {surgeX > 1 && (
            <div className="flex items-center gap-2 rounded-card bg-warning/15 px-4 py-2.5 text-sm font-medium text-warning">
              <Zap size={16} className="fill-warning" />
              {t(`home.surge_${surge!.reason}`, { x: surgeX })}
            </div>
          )}

          {distanceKm > 0 && (
            <div className="flex items-center justify-between rounded-card bg-black/5 dark:bg-white/5 px-4 py-3">
              <div>
                <p className="text-xs opacity-60">
                  {t('home.estimatedFare')}
                  {surgeX > 1 && <span className="ml-1 font-semibold text-warning">×{surgeX}</span>}
                </p>
                <p className="text-xl font-bold">{formatPi(fareEstimate)}</p>
              </div>
              <div className="text-right text-xs opacity-70">
                <p>{formatDistance(distanceKm)}</p>
                <p>{formatDuration(durationMin)}</p>
              </div>
            </div>
          )}

          <Button fullWidth loading={ordering} disabled={!canOrder} onClick={order} className="h-14">
            {orderLabel}
          </Button>
        </div>
      </div>

      {/* Tap-to-select "Go here?" confirmation. */}
      <Modal
        open={!!pendingTap}
        title={t('home.goHere')}
        onClose={cancelTap}
        onConfirm={confirmTap}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
      >
        {pendingTap?.address ?? `${pendingTap?.lat.toFixed(4)}, ${pendingTap?.lng.toFixed(4)}`}
      </Modal>
    </div>
  );
}
