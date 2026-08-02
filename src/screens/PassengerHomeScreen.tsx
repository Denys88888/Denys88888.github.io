import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
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
import { loadSavedAddresses, saveAddress, removeAddress } from '../services/savedAddresses';
import { payCancellationFee } from '../services/cancellationFeePayment';
import { formatPi, formatDistance, formatDuration, localDateTimeValue, formatDate } from '../utils/formatters';
import { isValidCoord } from '../utils/validators';
import { cn, estimateFare, routeDistanceKm } from '../utils/helpers';
import { haptic } from '../utils/haptic';
import type { GeoPoint, VehicleType, SavedAddress, SurgeInfo } from '../types';

const DEFAULT_CENTER: GeoPoint = { lat: 52.2297, lng: 21.0122 }; // Warsaw fallback

// Statuses that block a new order (the server allows one ride *under way* per
// passenger). 'scheduled' is deliberately absent, mirroring the server: a
// booking for later is not a ride in progress, and counting it as one took over
// this screen and hid the order form from anyone who had planned a trip.
const LIVE_STATUSES = ['searching', 'assigned', 'arrived', 'in_progress'] as const;

async function findActiveRide() {
  for (const status of LIVE_STATUSES) {
    try {
      const { rides } = await api.listRides({ status, limit: 1 });
      if (rides.length) return rides[0];
    } catch (err) {
      console.error('[home] findActiveRide:', err);
      return null;
    }
  }
  return null;
}

// The soonest booking still waiting for its time to come. Purely a reminder —
// it never blocks ordering, so it is fetched separately from the active ride.
async function findNextScheduled(uid?: string) {
  try {
    const { rides } = await api.listRides({ status: 'scheduled', limit: 50 });
    // listRides matches passenger *or* driver; only the passenger's own
    // bookings belong on the passenger's home screen.
    const mine = rides.filter((r) => r.scheduledAt && (!uid || r.passengerId === uid));
    mine.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
    return mine[0] ?? null;
  } catch (err) {
    console.error('[home] findNextScheduled:', err);
    return null;
  }
}

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
  const { position, error: geoError, permissionDenied: geoPermissionDenied, request } = useGeolocation();
  const { addToast } = useToast();
  const setCurrentRide = useAppStore((s) => s.setCurrentRide);
  const user = useAppStore((s) => s.user);
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
  const [note, setNote] = useState('');

  // Nearby available drivers shown on map before booking.
  const [nearbyDrivers, setNearbyDrivers] = useState<Array<{ uid: string; location: GeoPoint }>>([]);
  useEffect(() => {
    const pos = position;
    if (!pos) return;
    let cancelled = false;
    const fetch = () =>
      api.nearbyDrivers({ lat: pos.lat, lng: pos.lng, radius: 5 })
        .then((drivers) => { if (!cancelled) setNearbyDrivers(drivers.filter((d) => d.location).map((d) => ({ uid: d.uid, location: d.location! }))); })
        .catch(() => {});
    fetch();
    const id = setInterval(fetch, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [position?.lat, position?.lng]);

  // Dynamic pricing: multiplier shown to the passenger before ordering. It is
  // quoted for the moment the ride will actually run — the server prices a
  // booking by its own clock, so asking about "now" while the passenger has a
  // time picked would show them a night ×2 on a trip booked for the afternoon.
  const [surge, setSurge] = useState<SurgeInfo | null>(null);
  const surgeAt =
    schedule && scheduledAt && new Date(scheduledAt).getTime() > Date.now()
      ? new Date(scheduledAt).toISOString()
      : undefined;
  useEffect(() => {
    const point = pickup ?? position ?? undefined;
    const fetchSurge = () =>
      api
        .getSurge(point ? { lat: point.lat, lng: point.lng } : undefined, surgeAt)
        .then(setSurge)
        .catch((err) => console.error('[passenger] surge:', err));
    fetchSurge();
    const id = setInterval(fetchSurge, 5 * 60 * 1000);
    return () => clearInterval(id);
    // Only re-check when pickup or the booked time changes (not on every GPS tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, surgeAt]);

  // An unfinished ride (page reload, back navigation) — surface it so the
  // passenger can return to it or cancel it; new orders are blocked meanwhile.
  const [activeRide, setActiveRide] = useState<import('../types').Ride | null>(null);
  useEffect(() => {
    let cancelled = false;
    findActiveRide().then((r) => { if (!cancelled) setActiveRide(r); });
    return () => { cancelled = true; };
  }, []);

  // A trip booked for later. Shown alongside the order form, not instead of it.
  const [nextScheduled, setNextScheduled] = useState<import('../types').Ride | null>(null);
  useEffect(() => {
    let cancelled = false;
    findNextScheduled(user?.uid).then((r) => { if (!cancelled) setNextScheduled(r); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  // An unpaid late-cancellation fee. It blocks ordering, so it is asked for up
  // front rather than letting someone fill in a whole trip and be turned away
  // at the last step. Pi cannot charge without the passenger's approval in
  // their wallet, so the only way this clears is them tapping Pay.
  const [owedFee, setOwedFee] = useState<{ rideId: string; amount: number } | null>(null);
  const [payingFee, setPayingFee] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .outstandingFee()
      .then((r) => { if (!cancelled) setOwedFee(r); })
      .catch((err) => console.error('[home] outstandingFee:', err));
    return () => { cancelled = true; };
  }, [user?.uid]);

  const settleFee = async (): Promise<void> => {
    if (!owedFee) return;
    setPayingFee(true);
    try {
      await payCancellationFee(owedFee.rideId);
      setOwedFee(null);
      addToast('success', t('ride.feePaid'));
    } catch (err) {
      // Includes backing out of the Pi sheet, which is a choice rather than a
      // fault — the debt simply stands and ordering stays blocked.
      console.error('[home] settleFee:', err);
      // ...but it also includes the case where an earlier attempt did go
      // through and the server only just reconciled it with Pi. Ask before
      // telling them they still owe money they have in fact already paid.
      const still = await api.outstandingFee().catch(() => owedFee);
      setOwedFee(still);
      addToast(still ? 'info' : 'success', t(still ? 'ride.feeOutstanding' : 'ride.feePaid'));
    } finally {
      setPayingFee(false);
    }
  };

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

  // Long-press on a SAVED chip opens an update/delete menu instead of
  // navigating to it — there was previously no way to change or clear a
  // slot once set. A plain click still short-circuits to "set destination".
  const [addressMenuLabel, setAddressMenuLabel] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startLongPress = (label: string): void => {
    if (!savedAddrs.find((a) => a.label === label)) return; // nothing to manage yet
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setAddressMenuLabel(label);
    }, 500);
  };
  const cancelLongPress = (): void => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const menuAddress = addressMenuLabel ? savedAddrs.find((a) => a.label === addressMenuLabel) : undefined;
  const updateAddressToCurrent = async (): Promise<void> => {
    if (!addressMenuLabel || !destination) return;
    const list = await saveAddress({
      label: addressMenuLabel,
      lat: destination.lat,
      lng: destination.lng,
      address: destination.address,
    });
    setSavedAddrs(list);
    addToast('success', t('home.addressSaved', { label: t(`home.${addressMenuLabel}`) }));
    setAddressMenuLabel(null);
  };
  const deleteAddress = async (): Promise<void> => {
    if (!addressMenuLabel) return;
    const list = await removeAddress(addressMenuLabel);
    setSavedAddrs(list);
    setAddressMenuLabel(null);
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

  // Surface GPS failures (denied permission, timeout, unsupported) instead of
  // silently leaving the map centered on the default fallback with no marker.
  // A denied permission needs a different message — telling the user to check
  // their connection won't help when the fix is in the phone's app settings.
  useEffect(() => {
    if (geoError) {
      addToast('error', t(geoPermissionDenied ? 'home.locationPermissionDenied' : 'home.locationError'));
    }
  }, [geoError, geoPermissionDenied, addToast, t]);

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
  const fareEstimate = estimateFare(vehicle, distanceKm, durationMin, surgeX);

  const canOrder =
    isValidCoord(pickup) &&
    isValidCoord(destination) &&
    !ordering &&
    // The server refuses the booking anyway; greying the button out is what
    // makes the reason visible next to the card that explains it.
    !owedFee &&
    // A scheduled time in the past is silently treated as "right now" by the
    // server, which is not what someone picking a date means to order.
    (!schedule || (!!scheduledAt && new Date(scheduledAt).getTime() > Date.now())) &&
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
        note: note.trim() || undefined,
      });
      setCurrentRide(ride);
      haptic.medium();
      addToast('success', schedule ? t('home.scheduleRide') : t('home.searching'));
      navigate('ride', { id: ride.id });
    } catch (err) {
      // 409 = a previous ride is still active; take the passenger to it so
      // they can track or cancel it instead of failing with a generic error.
      const code = isAxiosError(err) ? err.response?.data?.code : undefined;
      if (code === 'ACTIVE_RIDE_EXISTS') {
        addToast('error', t('home.activeRideExists'));
        const active = await findActiveRide();
        if (active) {
          setCurrentRide(active);
          navigate('ride', { id: active.id });
        }
      } else if (code === 'TOO_MANY_SCHEDULED') {
        // The cap and the spacing rule are both about bookings, so say which
        // one was hit — "error" alone leaves no way to fix it.
        addToast('error', t('home.tooManyScheduled'));
      } else if (code === 'SCHEDULED_CONFLICT') {
        addToast('error', t('home.scheduledConflict'));
      } else if (code === 'CANCELLATION_FEE_DUE') {
        // A fee raised after this screen loaded — on another device, or on a
        // scheduled ride the dispatcher promoted and the driver cancelled.
        // Show the card so there is something to pay, not just a refusal.
        const data = isAxiosError(err) ? err.response?.data : undefined;
        if (data?.rideId) setOwedFee({ rideId: data.rideId, amount: data.amount });
        addToast('error', t('home.feeDueTitle'));
      } else {
        addToast('error', t('common.error'));
      }
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
          nearbyDrivers={nearbyDrivers}
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
            if (position) {
              setPickup({ ...position });
              reverseGeocode(position).then((address) =>
                setPickup((cur) => (cur ? { ...cur, address } : { ...position, address }))
              );
            } else if (geoError) {
              // Permission was already denied — request() will fail the same way
              // again, so the error-driven toast (keyed on the message) won't
              // re-fire on its own. Tell the user now instead of doing nothing.
              addToast('error', t(geoPermissionDenied ? 'home.locationPermissionDenied' : 'home.locationError'));
            }
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
          {/* Nothing below this can be ordered until it is settled, so it sits
              above the form and says the amount, the reason and the way out.
              Pi has no card on file — only the passenger can authorise it. */}
          {owedFee && (
            <div className="rounded-xl bg-danger/10 p-3">
              <p className="text-sm font-semibold text-danger">{t('home.feeDueTitle')}</p>
              <p className="mt-1 text-xs opacity-70">{t('home.feeDueBody')}</p>
              <Button
                fullWidth
                loading={payingFee}
                onClick={settleFee}
                className="mt-2 !bg-danger"
              >
                {t('home.feeDuePay', { amount: formatPi(owedFee.amount) })}
              </Button>
            </div>
          )}
          {activeRide && (
            <Button
              fullWidth
              onClick={() => {
                setCurrentRide(activeRide);
                navigate('ride', { id: activeRide.id });
              }}
              className="!bg-warning"
            >
              {t('home.activeRideBanner')}
            </Button>
          )}
          {/* A booking for later. Deliberately a quiet row rather than a
              full-width button: it is information, not something blocking the
              order form underneath it. */}
          {nextScheduled && (
            <button
              type="button"
              onClick={() => {
                setCurrentRide(nextScheduled);
                navigate('ride', { id: nextScheduled.id });
              }}
              className="flex w-full items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-left text-sm active:scale-[0.99]"
            >
              <Calendar size={16} className="shrink-0 text-primary" />
              <span className="flex-1 truncate">
                {t('home.scheduledBanner', { when: formatDate(nextScheduled.scheduledAt!) })}
              </span>
            </button>
          )}
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
              empty slot saves the currently selected destination. Long-press
              a saved chip to update or delete it. */}
          <div className="flex gap-2">
            {QUICK_SLOTS.map(({ label, icon: Icon }) => {
              const saved = savedAddrs.find((a) => a.label === label);
              return (
                <button
                  key={label}
                  onClick={() => {
                    if (longPressFired.current) {
                      longPressFired.current = false;
                      return;
                    }
                    quickTap(label);
                  }}
                  onPointerDown={() => startLongPress(label)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
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

          {/* Now vs Schedule. Wraps because the toggle plus a date picker is wider
              than a phone: unwrapped it pushed the whole sheet sideways, and the
              picker's own controls ended up past the right edge. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex shrink-0 rounded-xl bg-black/5 dark:bg-white/10 p-1">
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
                min={localDateTimeValue(new Date())}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="min-w-[9.5rem] flex-1 rounded-lg border border-[#E0E0E0] dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium opacity-70">{t('home.chooseVehicle')}</p>
            <VehicleTypeSelector value={vehicle} onChange={setVehicle} distanceKm={distanceKm} durationMin={durationMin} surge={surgeX} />
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

          {/* Free-text note for the driver — large trunk, child seat, etc. */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder={t('home.noteToDriver')}
            rows={2}
            className="w-full rounded-card border border-black/10 dark:border-white/15 bg-transparent px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />

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
          {/* The disabled button gives no feedback on its own — spell out what's missing. */}
          {!ordering && !isValidCoord(pickup) && (
            <p className="text-center text-xs opacity-60">{t('home.needPickup')}</p>
          )}
          {!ordering && isValidCoord(pickup) && !isValidCoord(destination) && (
            <p className="text-center text-xs opacity-60">{t('home.needDestination')}</p>
          )}
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

      {/* Long-press menu on a saved quick-address chip: update or delete it. */}
      <Modal
        open={!!addressMenuLabel}
        title={addressMenuLabel ? t(`home.${addressMenuLabel}`) : ''}
        onClose={() => setAddressMenuLabel(null)}
        cancelLabel={t('common.close')}
      >
        <div className="space-y-3">
          <p className="opacity-70">{menuAddress?.address}</p>
          <Button
            fullWidth
            variant="ghost"
            disabled={!destination}
            onClick={updateAddressToCurrent}
          >
            {t('home.addressUpdate')}
          </Button>
          <Button fullWidth variant="danger" onClick={deleteAddress}>
            {t('home.addressDelete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
