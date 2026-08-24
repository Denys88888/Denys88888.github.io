import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, Star, Phone, MessageCircle, Flag, Share2, Siren, Navigation, LocateFixed, Zap } from 'lucide-react';
import { MapView } from '../components/map/MapContainer';
import { RideStatusBadge } from '../components/ride/RideStatusBadge';
import { SearchingOverlay } from '../components/ride/SearchingOverlay';
import { RideProgressSteps } from '../components/ride/RideProgressSteps';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { useRouter } from '../store/useRouter';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../hooks/useToast';
import { usePayments, type PreparedPayment } from '../hooks/usePayments';
import { useGeolocation } from '../hooks/useGeolocation';
import { useWakeLock } from '../hooks/useWakeLock';
import { wsService } from '../services/wsService';
import { api } from '../services/api';
import { isWalletSilent, payForRide, type PreparedPiPayment } from '../services/piSdk';
import { notify } from '../services/notificationService';
import { fetchRoute } from '../services/mapService';
import { callService } from '../services/callService';
import { haptic } from '../utils/haptic';
import { apiErrorKey } from '../utils/apiError';
import { NavigationPanel } from '../components/ride/NavigationPanel';
import { SpeedBadge } from '../components/ride/SpeedBadge';
import { useSpeedLimit } from '../hooks/useSpeedLimit';
import { chatIdForRide, haversineKm, cn } from '../utils/helpers';
import {
  cancellationFee,
  cancellationFeeApplies,
  freeCancelMsLeft as msLeftToCancelFree,
} from '../utils/cancellation';
import { formatPi, formatDistance, formatDuration, formatDate, maskPhone } from '../utils/formatters';
import type { GeoPoint, Ride, RideParty, FareOffer } from '../types';

const AVG_SPEED_KMH = 30;
const TIP_PRESETS = [1, 2, 5];

async function prepareTip(rideId: string, amount: number): Promise<PreparedPiPayment> {
  const p = await api.createPayment(rideId, { type: 'tip', amount });
  return { paymentId: p.paymentId, amount: p.amount, memo: p.memo, metadata: p.metadata };
}

// Ride tracking screen: live map + status, counterpart contact (phone/call),
// driver offers for negotiable rides, cancel + pay + rate.
export function RideDetailsScreen() {
  const { t } = useTranslation();
  const params = useRouter((s) => s.params);
  const navigate = useRouter((s) => s.navigate);
  const back = useRouter((s) => s.back);
  const { addToast } = useToast();
  const { preparePayment, prepareFailureMessage, payRide, processing } = usePayments();
  const [preparedPayment, setPreparedPayment] = useState<PreparedPayment | null>(null);
  const {
    position,
    speed,
    request: requestGeo,
    error: geoError,
    permissionDenied: geoPermissionDenied,
    loading: geoLoading,
  } = useGeolocation();
  const [focusNonce, setFocusNonce] = useState(0);
  const storeRide = useAppStore((s) => s.currentRide);
  const uid = useAppStore((s) => s.user?.uid ?? '');

  const unreadByChat = useAppStore((s) => s.unreadByChat);

  const [ride, setRide] = useState<Ride | null>(storeRide);
  const unreadCount = ride ? (unreadByChat[chatIdForRide(ride.id)] ?? 0) : 0;
  const [driverPos, setDriverPos] = useState<GeoPoint | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  // Ticks every second only while the cancel dialog is open, so the free-
  // cancellation countdown updates live without re-rendering the whole screen
  // once a second the rest of the time.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!showCancel) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showCancel]);
  const [rating, setRating] = useState(0);
  // Optional per-category scores. Left at 0 they are simply not sent, so the
  // one-tap path stays exactly as it was.
  const [subRatings, setSubRatings] = useState({ cleanliness: 0, driving: 0, route: 0 });
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [showNav, setShowNav] = useState(params.nav === '1');
  const [tipBusy, setTipBusy] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  const [tipCustom, setTipCustom] = useState('');
  // Prepared up front for the same reason the fare is (see usePayments): asking
  // our server for the payment record inside the tap handler burns the tap's
  // user activation, and Pi then declines to open the wallet sheet at all.
  const [tipPresets, setTipPresets] = useState<Record<number, PreparedPiPayment>>({});
  const [sosSending, setSosSending] = useState(false);
  const [showSos, setShowSos] = useState(false);

  const rideId = params.id ?? storeRide?.id ?? '';

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    // Poll as a fallback: WS events are the primary signal, but a dropped socket
    // (phone sleep, webview background) must not leave the screen frozen on a
    // ride the server has already advanced, completed or auto-cancelled.
    let poll: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      if (cancelled) return;
      api.getRide(rideId)
        .then((data) => {
          if (cancelled) return;
          setRide(data);
          if (poll && ['completed', 'cancelled'].includes(data.status)) {
            clearInterval(poll);
            poll = undefined;
          }
        })
        .catch((err) => console.error('[ride] getRide:', err));
    };
    refresh();
    poll = setInterval(refresh, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const offStatus = wsService.on('ride_status_update', (msg) => {
      if (String(msg.rideId) === rideId) refresh();
    });
    const offAssigned = wsService.on('ride_assigned', (msg) => {
      if (String(msg.rideId) === rideId) refresh();
    });
    const offOffers = wsService.on('fare_offers', (msg) => {
      if (String(msg.rideId) === rideId) {
        setRide((r) => (r ? { ...r, offers: msg.offers as FareOffer[] } : r));
      }
    });
    const offLoc = wsService.on('driver_location_update', (msg) => {
      if (String(msg.rideId) === rideId) {
        setDriverPos({ lat: Number(msg.lat), lng: Number(msg.lng) });
      }
    });
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      offStatus();
      offAssigned();
      offOffers();
      offLoc();
    };
  }, [rideId]);

  // Driver: broadcast GPS position every 5 seconds while the ride is active, so
  // the passenger's map tracks the driver in real time (spec: every 5s).
  const activeStatus = ride?.status;
  const iAmDriver = !!ride && ride.driverId === uid;

  // Catch-up toast+chime for the driver: the live WS 'payment_received' /
  // 'tip_received' push can be missed entirely (phone locked, app
  // backgrounded — the Pi Browser has no real push notifications to fall
  // back on), but the periodic/visibility-triggered refresh above still
  // picks up the new paymentStatus/tipAmount. Fire the same notification
  // here whenever this screen itself observes that transition, so the
  // driver isn't left with only the quiet "Оплачено" label on the receipt.
  const prevPaymentStatusRef = useRef<string | undefined>(undefined);
  const prevTipAmountRef = useRef<number | undefined>(undefined);
  const seenRideRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!ride || !iAmDriver) return;
    const isNewRide = seenRideRef.current !== ride.id;
    if (!isNewRide) {
      if (prevPaymentStatusRef.current !== 'completed' && ride.paymentStatus === 'completed') {
        notify(t('notify.paymentReceived', { amount: formatPi(ride.driverEarnings) }), { sound: true });
      }
      const prevTip = prevTipAmountRef.current ?? 0;
      const curTip = ride.tipAmount ?? 0;
      if (curTip > prevTip) {
        notify(t('notify.tip', { amount: formatPi(curTip - prevTip) }), { sound: true });
      }
    }
    seenRideRef.current = ride.id;
    prevPaymentStatusRef.current = ride.paymentStatus;
    prevTipAmountRef.current = ride.tipAmount;
  }, [ride, iAmDriver, t]);

  useEffect(() => {
    if (!iAmDriver || !rideId) return;
    if (!activeStatus || ['completed', 'cancelled'].includes(activeStatus)) return;
    if (!('geolocation' in navigator)) return;
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          setDriverPos({ lat, lng });
          wsService.send('driver_location', { rideId, lat, lng });
          api.updateDriverLocation(lat, lng).catch((err) => console.error('[ride] location:', err));
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 5000 }
      );
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [iAmDriver, rideId, activeStatus]);

  // Live ETA: recompute from the driver's position to the current target
  // (pickup before start, destination after) whenever the driver moves, then
  // tick the displayed countdown down every second. `driverPos` only ever
  // arrives via the WS broadcast the *passenger* receives — on the driver's
  // own screen that never fires, so use their own live GPS (`position`) there.
  const targetPoint =
    ride && (ride.status === 'in_progress' ? ride.destination : ride.pickup);
  const etaSourcePos = iAmDriver ? position : driverPos;
  // Quantised to ~100 m so the road-network lookup below only re-runs when the
  // car has actually moved a block, not on every GPS sample — the public OSRM
  // demo server would rate-limit a request per position update.
  const etaSourceKey = etaSourcePos
    ? `${etaSourcePos.lat.toFixed(3)},${etaSourcePos.lng.toFixed(3)}`
    : null;
  useEffect(() => {
    if (!etaSourcePos || !targetPoint || !ride) {
      setEtaSeconds(null);
      return;
    }
    if (['completed', 'cancelled', 'searching', 'scheduled'].includes(ride.status)) {
      setEtaSeconds(null);
      return;
    }
    // Straight-line estimate first so the ETA appears instantly, then refine
    // with OSRM's road-network duration — a crow-flies distance at a flat
    // 30 km/h badly underestimates any trip that has to follow real streets.
    const km = haversineKm(etaSourcePos.lat, etaSourcePos.lng, targetPoint.lat, targetPoint.lng);
    setEtaSeconds(Math.max(0, Math.round((km / AVG_SPEED_KMH) * 3600)));
    let stale = false;
    fetchRoute([etaSourcePos, targetPoint])
      .then((r) => {
        if (!stale && r) setEtaSeconds(Math.max(0, Math.round(r.durationMin * 60)));
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etaSourceKey, targetPoint?.lat, targetPoint?.lng, ride?.status]);

  const etaActive = etaSeconds !== null;
  useEffect(() => {
    if (!etaActive) return;
    const id = setInterval(() => setEtaSeconds((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [etaActive]);

  // Fetch the payment record (amount/memo/metadata) as soon as the ride
  // becomes payable, well before the user taps the button — see
  // usePayments.preparePayment for why this can't happen inside the click
  // handler itself (iOS/WebKit drops the click's "user activation" across an
  // awaited network call, and the Pi payment sheet silently fails to open).
  const rideIsPayable = !!ride && ride.status === 'completed' && !ride.txid && ride.driverId !== uid;
  useEffect(() => {
    if (!rideIsPayable || !ride) {
      setPreparedPayment(null);
      return;
    }
    let cancelled = false;
    let attempt = 0;
    // Retry with backoff: the very first request after the backend (Render
    // free tier) has been idle can take up to ~50s to wake and may time out,
    // or the ride can become payable before the server has finished spinning
    // up. Cap was previously 5 tries * 4s (~20s total) — too short to cover
    // a full cold start, so the button could get stuck on "Preparing…"
    // forever even though the backend would have come up fine given more
    // time. 20 tries * 5s covers a ~100s worst case with room to spare.
    const tryPrepare = (): void => {
      preparePayment(ride.id).then((p) => {
        if (cancelled) return;
        if (p) {
          setPreparedPayment(p);
        } else if (attempt < 20) {
          attempt += 1;
          setTimeout(tryPrepare, 5000);
        }
      });
    };
    tryPrepare();
    return () => {
      cancelled = true;
    };
    // Re-prepare whenever paymentStatus changes (e.g. a stale 'held' payment
    // just got recovered server-side into a fresh payment id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideIsPayable, ride?.paymentStatus]);

  const isDriver = !!ride && ride.driverId === uid;
  // Driver: keep the screen on for the full duration of an active ride.
  // Must be called before any conditional return to satisfy Rules of Hooks.
  useWakeLock(isDriver && !!ride && !['completed', 'cancelled'].includes(ride.status));

  // The ride is over — stop navigating to it. Nothing used to turn this off, so
  // a driver whose passenger cancelled kept a turn-by-turn banner over three
  // quarters of the screen, still counting down metres to a pickup that was no
  // longer happening. Worse, the toggle that would have dismissed it is hidden
  // on a finished ride, leaving the exit bar as the only way out of a mode the
  // app should never have kept them in.
  const rideOver = !!ride && ['completed', 'cancelled'].includes(ride.status);
  useEffect(() => {
    if (rideOver) setShowNav(false);
  }, [rideOver]);

  const canTip = !!ride && ride.status === 'completed' && !isDriver && !!ride.driverId && !ride.tipAmount;
  useEffect(() => {
    if (!canTip) return;
    let cancelled = false;
    Promise.all(TIP_PRESETS.map(async (a) => [a, await prepareTip(rideId, a)] as const))
      .then((entries) => { if (!cancelled) setTipPresets(Object.fromEntries(entries)); })
      .catch((err) => console.error('[ride] prepare tips:', err));
    return () => { cancelled = true; };
  }, [canTip, rideId]);

  // The driver home's own "Navigation" shortcut opens this screen with ?nav=1,
  // which asks for the driving view before anyone has tapped anything here. If
  // there is no fix to guide from, that route has to say so too — otherwise the
  // screen simply doesn't navigate and the button below reads as already on.
  useEffect(() => {
    if (!iAmDriver || !showNav || position || geoLoading) return;
    if (!geoError && !geoPermissionDenied) return;
    addToast('error', t(geoPermissionDenied ? 'home.locationPermissionDenied' : 'home.locationError'));
    setShowNav(false);
  }, [iAmDriver, showNav, position, geoLoading, geoError, geoPermissionDenied, addToast, t]);

  // Only while the driver is actually navigating: Overpass is a shared public
  // service, and there is no sign to show anyone who is not driving a route.
  //
  // Above the `if (!ride)` return below, not next to the JSX that uses it: a
  // hook behind a conditional return renders a different number of hooks on
  // the two paths, and React tears the whole screen down with "Rendered more
  // hooks than during the previous render" the moment the ride loads.
  const limitKph = useSpeedLimit(iAmDriver && showNav ? position : null);

  if (!ride) {
    return <div className="flex h-full items-center justify-center opacity-60">{t('common.loading')}</div>;
  }

  const counterpart: RideParty | null | undefined = isDriver ? ride.passenger : ride.driver;
  // Both recompute from `now` each render, and the dialog ticks a 1s timer, so
  // the countdown runs live. The rules themselves live in utils/cancellation,
  // paired with the server's.
  const freeCancelMsLeft = msLeftToCancelFree(ride, now);
  const feeApplies = cancellationFeeApplies(ride, { isDriver, now });
  // driverPos only ever arrives via the 'driver_location_update' broadcast,
  // which the server sends to the passenger — the driver never gets an echo
  // of their own position back. On the driver's own screen, their live GPS
  // (`position`, from useGeolocation) is the one that's actually populated.
  const liveDriverPos = isDriver ? position : driverPos;

  const doCancel = async (): Promise<void> => {
    try {
      await api.cancelRide(ride.id, feeApplies ? 'late-cancel' : 'user-cancel');
      addToast('info', t('ride.statusCancelled'));
      setShowCancel(false);
      // The dialog just told them a figure would be charged, so ask for it here
      // rather than letting them find out at their next booking. Pi needs their
      // approval in the wallet for every transfer — there is nothing on file to
      // charge — so this is a request, not a deduction.
      // The fee cannot be charged from here. Pi only opens its wallet sheet
      // while the tap that asked for it is still "active", and cancelling the
      // ride first costs two server round-trips — so the sheet silently never
      // appeared and the passenger was told the fee was outstanding no matter
      // what they did. Home carries the same debt with its payment prepared in
      // advance, which is the one place the tap does reach the wallet.
      if (feeApplies) addToast('info', t('ride.feeOutstanding'));
      back();
    } catch (err) {
      console.error('[ride] cancel:', err);
      addToast('error', t(apiErrorKey(err)));
    }
  };

  const submitRating = async (): Promise<void> => {
    try {
      // Only send categories the rider actually touched — the server rejects a
      // 0 and an untouched category is "no opinion", not "one star".
      const breakdown = Object.fromEntries(
        Object.entries(subRatings).filter(([, v]) => v > 0)
      );
      await api.updateRide(ride.id, {
        driverRating: rating,
        ...(Object.keys(breakdown).length > 0 ? { driverRatingBreakdown: breakdown } : {}),
      });
      addToast('success', t('common.success'));
      navigate('home');
    } catch (err) {
      console.error('[ride] submitRating:', err);
      addToast('error', t(apiErrorKey(err)));
    }
  };

  const pay = async (): Promise<void> => {
    if (!preparedPayment) {
      // Not ready yet (still fetching, or it failed) — this call unavoidably
      // has an await before it, so it risks the same lost-activation issue
      // the prepared-payment path exists to avoid, but it's the only option
      // left when nothing was pre-fetched in time.
      const fallback = await preparePayment(ride.id);
      if (!fallback) {
        haptic.error();
        // Say which thing failed. A flat "payment failed" here sends the
        // driver to check their wallet when the server is simply unreachable.
        addToast('error', prepareFailureMessage());
        return;
      }
      await payRide(fallback);
    } else {
      await payRide(preparedPayment);
    }
    // Clear the prepared payment so a retry re-fetches fresh data from the
    // server — the stale paymentId must not be reused if the backend's status
    // has changed (e.g. held → cancelled after a timeout).
    setPreparedPayment(null);
    // Refresh either way: even a failed attempt may have recovered a stale
    // held payment server-side (found it already completed via Pi, or
    // released it back to pending) — the ride's true state may have changed
    // whether or not this specific call returned a txid.
    api.getRide(ride.id).then(setRide).catch((err) => console.error('[ride] refresh after pay:', err));
  };

  // Tip the driver: a separate Pi payment (100% goes to the driver).
  // A typed-in amount has no prepared record to use, so it takes the slower
  // path and may need a second tap if the server was cold.
  const sendTip = async (amount: number): Promise<void> => {
    if (!amount || amount <= 0) return;
    setTipBusy(true);
    try {
      await payForRide(tipPresets[amount] ?? (await prepareTip(ride.id, amount)));
      addToast('success', t('ride.tipThanks'));
      api.getRide(ride.id).then(setRide).catch((err) => console.error('[ride] refresh after tip:', err));
    } catch (err) {
      addToast(
        'error',
        isWalletSilent(err)
          ? t('ride.walletSilent')
          : err instanceof Error
            ? err.message
            : t(apiErrorKey(err))
      );
    } finally {
      setTipBusy(false);
    }
  };

  const submitReport = async (): Promise<void> => {
    const reportedId = isDriver ? ride.passengerId : ride.driverId;
    if (!reportedId) return;
    try {
      await api.createReport(ride.id, reportedId, 'complaint', reportText.trim() || 'No details');
      addToast('success', t('ride.reportSent'));
      setShowReport(false);
      setReportText('');
    } catch (err) {
      console.error('[ride] submitReport:', err);
      addToast('error', t(apiErrorKey(err)));
    }
  };

  // SOS: previously only filed a report to the admin queue — silent from the
  // user's point of view, and the admin might not see it for hours. A real
  // emergency needs an actual call right now, not a ticket. Confirming in the
  // modal dials 112 (the universal emergency number across the EU and most
  // of the world, incl. Poland where this app currently operates) via a
  // tel: link, while still filing the report in the background so
  // support/admin has the ride + coordinates on record afterward.
  const fileSosReport = async (): Promise<void> => {
    const reportedId = isDriver ? ride.passengerId : ride.driverId;
    const where = position
      ? `${position.lat.toFixed(5)},${position.lng.toFixed(5)}`
      : 'location unavailable';
    const when = new Date().toISOString();
    const detail = `SOS from ${isDriver ? 'driver' : 'passenger'} at ${where} (${when})`;
    // reportedId may be missing if no driver is assigned yet — fall back to
    // self so the alert still reaches the admin with the ride + coordinates.
    await api.createReport(ride.id, reportedId || uid, 'SOS', detail);
  };

  const callEmergency = (): void => {
    setShowSos(false);
    window.location.href = 'tel:112';
    void fileSosReport().catch((err) => console.error('[ride] sos report after call:', err));
  };

  const sendSosAlertOnly = async (): Promise<void> => {
    setSosSending(true);
    try {
      await fileSosReport();
      addToast('warning', t('ride.sosSent'));
    } catch (err) {
      console.error('[ride] sendSos:', err);
      addToast('error', t(apiErrorKey(err)));
    } finally {
      setSosSending(false);
      setShowSos(false);
    }
  };

  const acceptOffer = async (offer: FareOffer): Promise<void> => {
    try {
      await api.acceptOffer(ride.id, offer.driverId);
      // Refetch so the enriched driver contact card (phone/call) appears.
      const fresh = await api.getRide(ride.id);
      setRide(fresh);
      addToast('success', t('common.success'));
    } catch (err) {
      console.error('[ride] acceptOffer:', err);
      addToast('error', t(apiErrorKey(err)));
    }
  };

  // Full turn-by-turn mode: the map takes over like Google Maps' driving view
  // (instruction banner pinned to the top, ETA/exit bar pinned to the bottom)
  // instead of sharing the screen with the scrollable ride-details sheet.
  // Navigation is guidance from where the car actually is, so it needs a fix.
  // Without one the view used to open anyway and lie in two directions at once:
  // the panel fell back to the pickup point, so it drew a zero-length route and
  // announced "0 m — start driving" as though the driver had already arrived,
  // while the ETA bar, which has no such fallback, sat on "building route…"
  // forever underneath it.
  const navActive = showNav && isDriver && !!liveDriverPos;

  return (
    <div className="flex h-full flex-col">
      {/* Navigating, the map IS the screen — Google Maps gives the road almost
          all of it and keeps the details to a strip at the bottom. Splitting
          it half and half left the driver a third of a screen of map with the
          ETA bar eating into that; 3:1 puts the junction they are driving into
          back in view. The sheet below still scrolls, so nothing it holds
          (arrived, cancel, the passenger's card) becomes unreachable. */}
      <div className={cn('relative', navActive ? 'flex-[3]' : 'h-[48%]')}>
        <MapView
          center={liveDriverPos ?? ride.pickup}
          // Before the ride starts, the relevant route is the driver's own
          // live position -> the passenger's pickup point (routeFrom draws
          // that leg without adding a redundant pin on top of the driver car
          // icon). Once the ride is under way, show the actual trip route
          // (pickup -> stops -> destination) instead.
          routeFrom={ride.status === 'in_progress' ? undefined : liveDriverPos}
          pickup={ride.pickup}
          destination={ride.status === 'in_progress' ? ride.destination : undefined}
          stops={ride.status === 'in_progress' ? ride.stops : undefined}
          driver={liveDriverPos}
          // On the driver's own screen `liveDriverPos` IS `position` — the same
          // point twice would stack the plain "me" dot exactly on top of the
          // heading-aware car icon, hiding it. Only the passenger needs their
          // own separate position marker.
          me={isDriver ? null : position}
          focus={focusNonce > 0 ? liveDriverPos : undefined}
          focusNonce={focusNonce}
          navMode={navActive}
          className="h-full w-full"
        />
        {!navActive && (
          <button
            onClick={back}
            className="absolute left-3 top-3 z-map flex h-10 w-10 items-center justify-center rounded-full bg-white/90 dark:bg-black/70 shadow-fab active:scale-95"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={20} />
          </button>
        )}
        {navActive && targetPoint && liveDriverPos && (
          // pointer-events-none on the strip, auto on the panel itself (set in
          // NavigationPanel): the wrapper spans the full width, so without this
          // it swallowed map drags and pinches in the empty space beside the
          // panel — the driver couldn't pan the map along the top of the screen.
          <div className="pointer-events-none absolute inset-x-3 top-3 z-map">
            <NavigationPanel from={liveDriverPos} to={targetPoint} position={liveDriverPos} />
          </div>
        )}
        {/* Speed and the posted limit, in the corner Google Maps puts them.
            They used to be a full-width strip inside the turn banner, where
            the two smallest numbers on the screen cost a whole row of map. */}
        {navActive && (
          <SpeedBadge speed={speed} limitKph={limitKph} className="absolute bottom-24 left-3 z-map" />
        )}
        <button
          onClick={() => {
            if (!position && geoError) {
              addToast('error', t(geoPermissionDenied ? 'home.locationPermissionDenied' : 'home.locationError'));
            }
            requestGeo();
            setFocusNonce((n) => n + 1);
          }}
          className={cn(
            'absolute right-3 z-map flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-fab active:scale-95 dark:bg-black/80 dark:text-white',
            navActive ? 'bottom-24' : 'bottom-3'
          )}
          aria-label={t('home.useMyLocation')}
        >
          <LocateFixed size={20} />
        </button>
        {/* Google-Maps-style bottom bar: ETA + distance + arrival clock stay
            visible the whole time the driver is navigating, with a dedicated
            exit control, instead of requiring a scroll down to the details
            sheet to see any of this. */}
        {navActive && (
          <div className="absolute inset-x-3 bottom-3 z-map flex items-center gap-3 rounded-card bg-white p-3 shadow-card dark:bg-neutral-900">
            <div className="min-w-0 flex-1">
              {etaSeconds !== null ? (
                <>
                  <p className="text-2xl font-bold leading-tight text-primary">
                    {formatDuration(Math.max(1, etaSeconds / 60))}
                  </p>
                  <p className="truncate text-xs opacity-70">
                    {formatDistance(haversineKm(
                      (liveDriverPos ?? ride.pickup).lat,
                      (liveDriverPos ?? ride.pickup).lng,
                      targetPoint!.lat,
                      targetPoint!.lng
                    ))}
                    {' · '}
                    {t('ride.arriveBy')}{' '}
                    {new Date(Date.now() + etaSeconds * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </>
              ) : (
                <p className="text-sm opacity-70">{t('nav.loading')}</p>
              )}
            </div>
            {/* A driver in navigation has three quarters of the screen given
                over to the map, and the chat button sits in the sheet below
                the fold — so a message announced itself for four seconds and
                then had nowhere to be seen. This is the one place the driver
                is already looking. */}
            <button
              onClick={() => navigate('chat', { chatId: chatIdForRide(ride.id) })}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
              aria-label={
                unreadCount > 0
                  ? `${t('ride.messageDriver')} (${t('chat.unread', { count: unreadCount })})`
                  : t('ride.messageDriver')
              }
            >
              <MessageCircle size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface-light dark:ring-surface-dark">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <Button variant="danger" onClick={() => setShowNav(false)}>
              {t('nav.exit')}
            </Button>
          </div>
        )}
      </div>

      {/* Extra bottom padding for the Android nav bar (this is a fullscreen
          screen with no BottomNav to reserve that space) — without it the
          last action (Cancel) sits under the system nav and can't be tapped. */}
      <div
        className="-mt-4 flex-1 space-y-4 overflow-y-auto rounded-t-2xl surface p-4 shadow-card"
        style={{ paddingBottom: 'calc(1rem + max(var(--safe-bottom), 16px))' }}
      >
        <div className="flex items-center justify-between">
          <RideStatusBadge status={ride.status} />
          <div className="flex items-center gap-3">
            {etaSeconds !== null && (
              <span className="flex flex-col items-center rounded-full bg-primary/15 px-3 py-1 text-primary leading-tight">
                <span className="text-sm font-semibold">
                  {t('ride.eta')} {Math.floor(etaSeconds / 60)}:{String(etaSeconds % 60).padStart(2, '0')}
                </span>
                {/* The concrete clock time is what people actually plan around
                    ("home by 14:32"), not a raw minute count. */}
                <span className="text-[10px] opacity-70">
                  {t('ride.arriveBy')}{' '}
                  {new Date(Date.now() + etaSeconds * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </span>
            )}
            {!!ride.surgeMultiplier && ride.surgeMultiplier > 1 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">
                <Zap size={12} className="fill-warning" />×{ride.surgeMultiplier}
              </span>
            )}
            <span className="text-lg font-bold">{formatPi(ride.fare)}</span>
          </div>
        </div>

        <RideProgressSteps status={ride.status} />

        {/* Driver ride progression: assigned → arrived → in_progress → completed.
            Over HTTP, and the screen advances on the server's answer — never on
            its own. This used to be a WebSocket frame, which cannot report
            anything: on a half-open connection (routine on mobile, and
            invisible, because readyState still reads OPEN) the frame went
            nowhere while the driver's screen moved on regardless. Reload
            mid-trip and navigation guided back to the passenger, because the
            server still had the ride at 'arrived'; a lost 'completed' left a
            fare unsettled. Retrying is safe — the server treats asking for a
            state the ride already reached as success. */}
        {isDriver && ['assigned', 'arrived', 'in_progress'].includes(ride.status) && (
          <Button
            fullWidth
            loading={stepBusy}
            disabled={stepBusy}
            onClick={async () => {
              const next =
                ride.status === 'assigned'
                  ? 'arrived'
                  : ride.status === 'arrived'
                    ? 'in_progress'
                    : 'completed';
              setStepBusy(true);
              try {
                setRide(await api.setRideStatus(ride.id, next));
              } catch (err) {
                // The step did NOT happen. Saying so is the whole point: the
                // driver can press again, and pressing again is safe.
                addToast('error', t(apiErrorKey(err)));
              } finally {
                setStepBusy(false);
              }
            }}
          >
            {ride.status === 'assigned'
              ? t('driver.arrived')
              : ride.status === 'arrived'
                ? t('driver.startRide')
                : t('driver.completeRide')}
          </Button>
        )}

        {isDriver && !['completed', 'cancelled', 'searching', 'scheduled'].includes(ride.status) && (
          <Button
            fullWidth
            variant={showNav ? 'outline' : 'primary'}
            onClick={() => {
              // Say why nothing happened. Silently toggling a flag that
              // navActive then ignores looks like a dead button, and the fix
              // (allow location) is one the driver has to make themselves.
              if (!showNav && !liveDriverPos) {
                requestGeo();
                addToast(
                  'error',
                  t(geoPermissionDenied ? 'home.locationPermissionDenied' : 'home.locationError')
                );
                return;
              }
              setShowNav((v) => !v);
            }}
          >
            <Navigation size={16} /> {t('driver.navigation')}
          </Button>
        )}

        {ride.status === 'scheduled' && ride.scheduledAt && (
          <Card className="flex items-center gap-1.5 text-sm">
            <Calendar size={15} /> {t('ride.scheduledFor')}: <b>{formatDate(ride.scheduledAt)}</b>
          </Card>
        )}

        {/* Counterpart contact card with phone + call (once assigned). */}
        {counterpart && (
          <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={counterpart.name} src={counterpart.avatar} size={48} />
            <div className="flex-1">
              <p className="font-semibold">{counterpart.name}</p>
              <p className="flex items-center gap-1 text-xs opacity-60">
                <Star size={12} className="fill-warning text-warning" /> {counterpart.rating.toFixed(1)}
                {counterpart.brand ? ` · ${counterpart.brand} ${counterpart.model} · ${counterpart.number}` : ''}
              </p>
              {counterpart.phone && <p className="text-xs opacity-50">{maskPhone(counterpart.phone)}</p>}
            </div>
            <div className="flex gap-2">
              {['assigned', 'arrived', 'in_progress'].includes(ride.status) && (
                <button
                  onClick={() => void callService.startCall(ride.id, counterpart.uid)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success"
                  aria-label={t('ride.callDriver')}
                >
                  <Phone size={18} />
                </button>
              )}
              {/* The unread count is the only lasting sign a message arrived:
                  the toast is gone after four seconds and the Pi Browser gives
                  us no push notification to fall back on. */}
              <button
                onClick={() => navigate('chat', { chatId: chatIdForRide(ride.id) })}
                className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"
                aria-label={
                  unreadCount > 0
                    ? `${t('ride.messageDriver')} (${t('chat.unread', { count: unreadCount })})`
                    : t('ride.messageDriver')
                }
              >
                <MessageCircle size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface-light dark:ring-surface-dark">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowReport(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger"
                aria-label={t('ride.report')}
              >
                <Flag size={18} />
              </button>
            </div>
          </div>
          {/* Picking the right car out of several at a busy pickup is the thing
              a plate number is worst at. Only shown while the driver is still
              on the way or waiting — it is noise once you are in the car. */}
          {!isDriver && counterpart.vehiclePhoto && ['assigned', 'arrived'].includes(ride.status) && (
            <img
              src={counterpart.vehiclePhoto}
              alt={[counterpart.color, counterpart.brand, counterpart.model].filter(Boolean).join(' ')}
              loading="lazy"
              className="h-32 w-full rounded-lg object-cover"
            />
          )}
          </Card>
        )}

        {ride.note && (
          <Card className="flex items-start gap-2 bg-warning/10">
            <MessageCircle size={16} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-sm">{ride.note}</p>
          </Card>
        )}

        {/* Negotiable ride: incoming driver offers (passenger picks one). */}
        {ride.negotiable && ride.status === 'searching' && !isDriver && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('ride.offers')}</p>
            {(!ride.offers || ride.offers.length === 0) && (
              <p className="text-sm opacity-50">{t('ride.noOffers')}</p>
            )}
            {ride.offers?.map((o) => (
              <Card key={o.driverId} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{formatPi(o.amount)}</p>
                  <p className="flex items-center gap-1 text-xs opacity-60">
                    {o.driverName} · <Star size={11} className="fill-warning text-warning" /> {o.driverRating.toFixed(1)}
                    {o.etaMin != null ? ` · ${o.etaMin} min` : ''}
                  </p>
                </div>
                <Button variant="success" className="px-4 py-2" onClick={() => acceptOffer(o)}>
                  {t('ride.acceptOffer')}
                </Button>
              </Card>
            ))}
          </div>
        )}

        {ride.status === 'searching' && !ride.negotiable && !isDriver && (
          <SearchingOverlay />
        )}

        {ride.status === 'completed' && (
          <Card className="space-y-2">
            <p className="text-center text-sm font-semibold">{t('ride.receipt')}</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="opacity-60">{t('ride.route')}</span>
                <span>{formatDistance(ride.distanceKm)} · {formatDuration(ride.estimatedDurationMin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">{t('ride.fare')}</span>
                <span className="font-semibold">{formatPi(ride.fare)}</span>
              </div>
              {ride.surgeMultiplier && ride.surgeMultiplier > 1 && (
                <div className="flex justify-between text-warning">
                  <span className="flex items-center gap-1"><Zap size={12} /> {t('ride.surge')}</span>
                  <span>×{ride.surgeMultiplier.toFixed(1)}</span>
                </div>
              )}
              <div className="flex justify-between opacity-60">
                <span>{t('ride.platformFee')}</span>
                <span>{formatPi(ride.platformFee)}</span>
              </div>
              <div className="flex justify-between opacity-60">
                <span>{t('ride.driverEarnings')}</span>
                <span>{formatPi(ride.driverEarnings)}</span>
              </div>
              {ride.tipAmount ? (
                <div className="flex justify-between text-success">
                  <span>{t('ride.tipTitle')}</span>
                  <span>{formatPi(ride.tipAmount)}</span>
                </div>
              ) : null}
              <div className="border-t border-black/10 dark:border-white/10 pt-1 flex justify-between opacity-50 text-xs">
                <span>{formatDate(ride.createdAt)}</span>
                <span>{ride.id.slice(0, 12)}</span>
              </div>
            </div>
          </Card>
        )}

        {ride.status === 'completed' && !ride.txid && !isDriver && (
          <Button
            fullWidth
            loading={processing}
            disabled={!preparedPayment}
            onClick={pay}
          >
            {!preparedPayment
              ? t('ride.paymentPreparing', 'Preparing payment…')
              : ride.paymentStatus === 'held'
                ? t('ride.paymentRetry')
                : `${t('ride.fare')}: ${formatPi(ride.fare)} — π Pay`}
          </Button>
        )}
        {ride.status === 'completed' && !isDriver && !ride.driverRating && (
          <Card className="space-y-3">
            <p className="text-center font-semibold">{t('ride.rateTitle')}</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="active:scale-90" aria-label={`${n} stars`}>
                  <Star
                    size={32}
                    className={n <= rating ? 'fill-warning text-warning' : 'text-black/20 dark:text-white/20'}
                  />
                </button>
              ))}
            </div>
            {/* Categories appear only once an overall score is given: asking
                four questions up front is what makes people skip rating
                entirely. A three-star ride is where the detail actually
                matters, and any category left untouched is simply not sent. */}
            {rating > 0 && (
              <div className="space-y-2 border-t border-black/5 pt-3 dark:border-white/10">
                <p className="text-center text-xs opacity-60">{t('ride.rateDetailsOptional')}</p>
                {(['cleanliness', 'driving', 'route'] as const).map((cat) => (
                  <div key={cat} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{t(`ride.rate_${cat}`)}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSubRatings((s) => ({ ...s, [cat]: n }))}
                          className="active:scale-90"
                          aria-label={`${t(`ride.rate_${cat}`)}: ${n}`}
                        >
                          <Star
                            size={18}
                            className={
                              n <= subRatings[cat]
                                ? 'fill-warning text-warning'
                                : 'text-black/20 dark:text-white/20'
                            }
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button fullWidth disabled={rating === 0} onClick={submitRating}>
              {t('ride.rateSubmit')}
            </Button>
          </Card>
        )}

        {/* Tip the driver (separate Pi transaction, driver keeps 100%). */}
        {ride.status === 'completed' && !isDriver && ride.driverId && (
          <Card className="space-y-3">
            <p className="text-center font-semibold">{t('ride.tipTitle')}</p>
            {ride.tipAmount ? (
              <p className="text-center text-sm font-medium text-success">
                {t('ride.tipPaid', { amount: formatPi(ride.tipAmount) })}
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  {TIP_PRESETS.map((a) => (
                    <Button
                      key={a}
                      variant="outline"
                      fullWidth
                      disabled={tipBusy}
                      onClick={() => sendTip(a)}
                    >
                      {a} π
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-1 rounded-lg border border-[#E0E0E0] dark:border-white/15 px-3 py-2">
                    <span className="font-bold text-primary">π</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={tipCustom}
                      onChange={(e) => setTipCustom(e.target.value)}
                      placeholder={t('ride.tipCustom')}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  <Button
                    loading={tipBusy}
                    disabled={!Number(tipCustom) || Number(tipCustom) <= 0}
                    onClick={() => sendTip(Number(tipCustom))}
                    className="px-4"
                  >
                    {t('ride.tipSend')}
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}

        <div className="flex items-center justify-between text-xs opacity-60">
          <span>{formatDistance(ride.distanceKm)} · {formatDuration(ride.estimatedDurationMin)}</span>
          <span className="flex items-center gap-2">
            {ride.paymentStatus && <span>{t(`ride.payment_${ride.paymentStatus}`)}</span>}
            {ride.stops && ride.stops.length > 0 && (
              <span>{ride.stops.length} {t('ride.stops')}</span>
            )}
          </span>
        </div>

        {!['completed', 'cancelled'].includes(ride.status) && !isDriver && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { shareToken } = await api.shareRide(ride.id);
                  const url = `${location.origin}${location.pathname}?share=${shareToken}`;
                  // Native share sheet first (most reliable in mobile webviews),
                  // then clipboard, then a plain prompt the user can copy from.
                  if (navigator.share) {
                    await navigator.share({ title: 'Taxi Pro', url }).catch((err) => {
                      if ((err as Error).name !== 'AbortError') throw err;
                    });
                  } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(url);
                    addToast('success', t('ride.shareCopied'));
                  } else {
                    window.prompt(t('ride.share'), url);
                  }
                } catch (err) {
                  console.error('[ride] share:', err);
                  addToast('error', t(apiErrorKey(err)));
                }
              }}
            >
              <Share2 size={16} /> {t('ride.share')}
            </Button>
            <Button variant="danger" loading={sosSending} onClick={() => setShowSos(true)}>
              <Siren size={16} /> {t('ride.sos')}
            </Button>
            <Button variant="ghost" className="col-span-2 !text-danger" onClick={() => setShowCancel(true)}>
              {t('ride.cancel')}
            </Button>
          </div>
        )}

        {/* Sharing a trip and the SOS button are the passenger's; calling the
            ride off is not. A driver whose car dies, or who cannot reach the
            pickup at all, had no way out of an accepted ride — the trip stayed
            open, the passenger kept waiting for a car that was never coming,
            and the held payment sat there with it. */}
        {!['completed', 'cancelled'].includes(ride.status) && isDriver && (
          <Button variant="ghost" className="w-full !text-danger" onClick={() => setShowCancel(true)}>
            {t('ride.cancel')}
          </Button>
        )}
      </div>

      <Modal
        open={showCancel}
        title={t('ride.cancel')}
        onClose={() => setShowCancel(false)}
        onConfirm={doCancel}
        confirmLabel={t('ride.cancel')}
        confirmVariant="danger"
        cancelLabel={t('common.back')}
      >
        {feeApplies ? (
          <div className="space-y-2">
            <p>{t('ride.cancelFeeWarning')}</p>
            {/* Show the actual charge, not just the percentage — "50% applies"
                leaves the rider guessing what leaves their wallet. */}
            <div className="rounded-lg bg-danger/10 px-3 py-2">
              <p className="text-sm opacity-70">{t('ride.cancelFeeAmount')}</p>
              <p className="text-xl font-bold text-danger">
                {formatPi(cancellationFee(ride, { isDriver, now }))}
              </p>
            </div>
            <p className="text-xs opacity-60">{t('ride.cancelFeeExplain')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>{t('ride.cancelConfirm')}</p>
            {isDriver ? (
              // The grace-window texts below are written to the passenger — a
              // countdown on their free cancellation, an explanation of the fee
              // they are avoiding. None of it is the driver's situation, so tell
              // them the one thing that is: nobody gets billed for this.
              <p className="text-xs opacity-60">{t('ride.cancelDriverExplain')}</p>
            ) : freeCancelMsLeft > 0 ? (
              // Driver has arrived but the grace window is still open — show how
              // long cancelling stays free, counting down live.
              <p className="text-xs opacity-70">
                {t('ride.freeCancelCountdown', {
                  time: `${Math.floor(freeCancelMsLeft / 60000)}:${String(
                    Math.floor((freeCancelMsLeft % 60000) / 1000)
                  ).padStart(2, '0')}`,
                })}
              </p>
            ) : (
              <p className="text-xs opacity-60">{t('ride.cancelFreeExplain')}</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={showReport}
        title={t('ride.report')}
        onClose={() => setShowReport(false)}
        onConfirm={submitReport}
        confirmLabel={t('common.submit')}
        confirmVariant="danger"
        cancelLabel={t('common.cancel')}
      >
        <textarea
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          placeholder={t('ride.reportReason')}
          rows={3}
          className="w-full rounded-lg border border-[#E0E0E0] dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </Modal>

      <Modal
        open={showSos}
        title={t('ride.sos')}
        onClose={() => setShowSos(false)}
        onConfirm={callEmergency}
        confirmLabel={t('ride.sosCall')}
        confirmVariant="danger"
        cancelLabel={t('common.cancel')}
      >
        <p>{t('ride.sosConfirm')}</p>
        <button
          type="button"
          onClick={sendSosAlertOnly}
          disabled={sosSending}
          className="mt-3 text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-50"
        >
          {t('ride.sosAlertOnly')}
        </button>
      </Modal>
    </div>
  );
}
