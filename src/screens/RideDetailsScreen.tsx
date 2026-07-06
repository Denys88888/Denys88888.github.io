import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Star, Phone, MessageCircle, Flag, Share2, Siren, Navigation, Zap } from 'lucide-react';
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
import { usePayments } from '../hooks/usePayments';
import { useGeolocation } from '../hooks/useGeolocation';
import { wsService } from '../services/wsService';
import { api } from '../services/api';
import { payForRide } from '../services/piSdk';
import { NavigationPanel } from '../components/ride/NavigationPanel';
import { chatIdForRide, haversineKm } from '../utils/helpers';
import { formatPi, formatDistance, formatDuration, formatDate, maskPhone } from '../utils/formatters';
import type { GeoPoint, Ride, RideParty, FareOffer } from '../types';

const AVG_SPEED_KMH = 30;

// Ride tracking screen: live map + status, counterpart contact (phone/call),
// driver offers for negotiable rides, cancel + pay + rate.
export function RideDetailsScreen() {
  const { t } = useTranslation();
  const params = useRouter((s) => s.params);
  const navigate = useRouter((s) => s.navigate);
  const back = useRouter((s) => s.back);
  const { addToast } = useToast();
  const { payRide, processing } = usePayments();
  const { position } = useGeolocation();
  const storeRide = useAppStore((s) => s.currentRide);
  const uid = useAppStore((s) => s.user?.uid ?? '');

  const [ride, setRide] = useState<Ride | null>(storeRide);
  const [driverPos, setDriverPos] = useState<GeoPoint | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [rating, setRating] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [showNav, setShowNav] = useState(params.nav === '1');
  const [tipBusy, setTipBusy] = useState(false);
  const [tipCustom, setTipCustom] = useState('');

  const rideId = params.id ?? storeRide?.id ?? '';

  useEffect(() => {
    if (!rideId) return;
    const refresh = () => api.getRide(rideId).then(setRide).catch(() => {});
    refresh();
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
          api.updateDriverLocation(lat, lng).catch(() => {});
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
  // tick the displayed countdown down every second.
  const targetPoint =
    ride && (ride.status === 'in_progress' ? ride.destination : ride.pickup);
  useEffect(() => {
    if (!driverPos || !targetPoint || !ride) {
      setEtaSeconds(null);
      return;
    }
    if (['completed', 'cancelled', 'searching', 'scheduled'].includes(ride.status)) {
      setEtaSeconds(null);
      return;
    }
    const km = haversineKm(driverPos.lat, driverPos.lng, targetPoint.lat, targetPoint.lng);
    setEtaSeconds(Math.max(0, Math.round((km / AVG_SPEED_KMH) * 3600)));
  }, [driverPos, targetPoint?.lat, targetPoint?.lng, ride?.status]);

  useEffect(() => {
    if (etaSeconds === null) return;
    const id = setInterval(() => setEtaSeconds((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [etaSeconds === null]);

  if (!ride) {
    return <div className="flex h-full items-center justify-center opacity-60">{t('common.loading')}</div>;
  }

  const isDriver = ride.driverId === uid;
  const counterpart: RideParty | null | undefined = isDriver ? ride.passenger : ride.driver;
  const feeApplies = ride.status === 'arrived' || ride.status === 'in_progress';

  const doCancel = async (): Promise<void> => {
    try {
      await api.cancelRide(ride.id, feeApplies ? 'late-cancel' : 'user-cancel');
      addToast('info', t('ride.statusCancelled'));
      setShowCancel(false);
      back();
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const submitRating = async (): Promise<void> => {
    try {
      await api.updateRide(ride.id, { driverRating: rating });
      addToast('success', t('common.success'));
      navigate('home');
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const pay = async (): Promise<void> => {
    const txid = await payRide(ride.id);
    if (txid) api.getRide(ride.id).then(setRide).catch(() => {});
  };

  // Tip the driver: a separate Pi payment (100% goes to the driver).
  const sendTip = async (amount: number): Promise<void> => {
    if (!amount || amount <= 0) return;
    setTipBusy(true);
    try {
      const p = await api.createPayment(ride.id, { type: 'tip', amount });
      await payForRide({
        paymentId: p.paymentId,
        amount: p.amount,
        memo: p.memo,
        metadata: p.metadata,
      });
      addToast('success', t('ride.tipThanks'));
      api.getRide(ride.id).then(setRide).catch(() => {});
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : t('common.error'));
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
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const acceptOffer = async (offer: FareOffer): Promise<void> => {
    try {
      await api.acceptOffer(ride.id, offer.driverId);
      // Refetch so the enriched driver contact card (phone/call) appears.
      const fresh = await api.getRide(ride.id);
      setRide(fresh);
      addToast('success', t('common.success'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[48%]">
        <MapView
          center={driverPos ?? ride.pickup}
          pickup={ride.pickup}
          destination={ride.destination}
          stops={ride.stops}
          driver={driverPos}
          me={position}
          className="h-full w-full"
        />
        {/* Driver turn-by-turn navigation overlay (OSRM maneuvers + voice). */}
        {showNav && isDriver && targetPoint && (
          <div className="absolute inset-x-3 bottom-3 z-[500]">
            <NavigationPanel
              from={driverPos ?? ride.pickup}
              to={targetPoint}
              position={driverPos}
              onClose={() => setShowNav(false)}
            />
          </div>
        )}
      </div>

      <div className="-mt-4 flex-1 space-y-4 overflow-y-auto rounded-t-2xl surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <RideStatusBadge status={ride.status} />
          <div className="flex items-center gap-3">
            {etaSeconds !== null && (
              <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                {t('ride.eta')} {Math.floor(etaSeconds / 60)}:{String(etaSeconds % 60).padStart(2, '0')}
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

        {/* Driver: toggle turn-by-turn navigation while the ride is active. */}
        {isDriver && !['completed', 'cancelled', 'searching', 'scheduled'].includes(ride.status) && (
          <Button fullWidth variant={showNav ? 'outline' : 'primary'} onClick={() => setShowNav((v) => !v)}>
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
          <Card className="flex items-center gap-3">
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
              {counterpart.phone && (
                <a
                  href={`tel:${counterpart.phone}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success"
                  aria-label={t('ride.callDriver')}
                >
                  <Phone size={18} />
                </a>
              )}
              <button
                onClick={() => navigate('chat', { chatId: chatIdForRide(ride.id) })}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"
                aria-label={t('ride.messageDriver')}
              >
                <MessageCircle size={18} />
              </button>
              <button
                onClick={() => setShowReport(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger"
                aria-label={t('ride.report')}
              >
                <Flag size={18} />
              </button>
            </div>
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
          <Button fullWidth loading={processing} onClick={pay}>
            {t('ride.fare')}: {formatPi(ride.fare)} — π Pay
          </Button>
        )}
        {ride.status === 'completed' && !isDriver && (
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
                  {[1, 2, 5].map((a) => (
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
                const { shareToken } = await api.shareRide(ride.id);
                await navigator.clipboard?.writeText(
                  `${location.origin}${location.pathname}?share=${shareToken}`
                );
                addToast('success', t('ride.shareCopied'));
              }}
            >
              <Share2 size={16} /> {t('ride.share')}
            </Button>
            <Button variant="danger" onClick={() => addToast('warning', t('ride.sosSent'))}>
              <Siren size={16} /> {t('ride.sos')}
            </Button>
            <Button variant="ghost" className="col-span-2 !text-danger" onClick={() => setShowCancel(true)}>
              {t('ride.cancel')}
            </Button>
          </div>
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
        {feeApplies ? t('ride.cancelFeeWarning') : t('ride.cancelConfirm')}
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
    </div>
  );
}
