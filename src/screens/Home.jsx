import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map from '../components/Map.jsx';
import SearchingAnimation from '../components/SearchingAnimation.jsx';
import DriverCard from '../components/DriverCard.jsx';
import Chat from '../components/Chat.jsx';
import SOSButton from '../components/SOSButton.jsx';
import useStore from '../store.js';
import { getRoute } from '../lib/osrm.js';
import { reverseGeocode, debouncedSearch } from '../lib/nominatim.js';
import { calcFare, getSurgeMultiplier, applyPromoDiscount, formatPi } from '../lib/pricing.js';
import { createPayment } from '../lib/pi.js';
import api from '../lib/api.js';
import ws from '../lib/ws.js';

export default function Home() {
  const {
    user, token, pickup, dropoff, route, fare, surgeMultiplier, promoDiscount,
    ride, driverInfo, driverLocation, unreadChat,
    setPickup, setDropoff, setRoute, setFare, setSurgeMultiplier, setPromoDiscount,
    setRide, setDriverInfo, setDriverLocation, setScreen, clearRide, bumpUnread, clearUnread
  } = useStore();

  const [rideStatus, setRideStatus] = useState(null); // null|searching|accepted|arrived|in_progress|completed
  const [destinationQuery, setDestinationQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [onlineDrivers, setOnlineDrivers] = useState([]);
  const [phase, setPhase] = useState('booking'); // booking|confirming|searching|active|completed
  const chatOpenRef = useRef(false);

  useEffect(() => { chatOpenRef.current = showChat; }, [showChat]);

  // Count incoming chat messages while the drawer is closed
  useEffect(() => {
    const off = ws.on('chat:message', d => {
      const rid = ride?.id || ride?.rideId;
      if (d.message?.rideId === rid && d.message?.sender !== user?.piUserId && !chatOpenRef.current) bumpUnread();
    });
    return off;
  }, [ride?.id, user?.piUserId]); // eslint-disable-line

  function openChat() { setShowChat(true); clearUnread(); }

  // GPS pickup on mount
  useEffect(() => {
    const cached = localStorage.getItem('taxipro_gps_pickup');
    if (cached && !pickup) {
      try {
        const loc = JSON.parse(cached);
        reverseGeocode(loc.lat, loc.lng).then(r => setPickup(r || loc)).catch(() => setPickup(loc));
      } catch { /* ignore */ }
    }
  }, []); // eslint-disable-line

  // WebSocket ride events
  useEffect(() => {
    const off1 = ws.on('ride:searching', d => { setRide(d); setRideStatus('searching'); setPhase('searching'); });
    const off2 = ws.on('ride:accepted', d => {
      setRide(prev => ({ ...prev, ...d }));
      setDriverInfo(d.driverInfo);
      setRideStatus('accepted');
      setPhase('active');
    });
    const off3 = ws.on('ride:arrived', () => setRideStatus('arrived'));
    const off4 = ws.on('ride:started', () => setRideStatus('in_progress'));
    const off5 = ws.on('ride:completed', d => { setRide(prev => ({ ...prev, ...d })); setRideStatus('completed'); setPhase('completed'); });
    const off6 = ws.on('ride:cancelled', () => { setRideStatus(null); setPhase('booking'); clearRide(); });
    const off7 = ws.on('ride:no_drivers', () => { setRideStatus(null); setPhase('booking'); alert('No drivers available nearby. Try again in a moment.'); });
    const off8 = ws.on('driver:location', d => { if (d.driverId === driverInfo?.id) setDriverLocation(d.location); });
    const off9 = ws.on('drivers:update', d => {
      setOnlineDrivers(prev => {
        if (!d.isOnline) return prev.filter(dr => dr.id !== d.driverId);
        const idx = prev.findIndex(dr => dr.id === d.driverId);
        const entry = { id: d.driverId, location: d.location };
        return idx >= 0 ? prev.map((dr, i) => i === idx ? entry : dr) : [...prev, entry];
      });
    });

    return () => [off1, off2, off3, off4, off5, off6, off7, off8, off9].forEach(off => off());
  }, [driverInfo?.id]); // eslint-disable-line

  // Destination autocomplete
  function onDestinationChange(e) {
    const q = e.target.value;
    setDestinationQuery(q);
    if (q.length >= 2) {
      debouncedSearch(q, results => { setSuggestions(results); setShowSuggestions(true); });
    } else {
      setShowSuggestions(false);
    }
  }

  async function onSelectSuggestion(place) {
    setDropoff(place);
    setDestinationQuery(place.name);
    setShowSuggestions(false);
    if (pickup) await fetchRoute(pickup, place);
  }

  async function fetchRoute(from, to) {
    try {
      const r = await getRoute(from, to);
      setRoute(r);
      const nearby = onlineDrivers.filter(d => d.location).length;
      const surge = getSurgeMultiplier(nearby);
      setSurgeMultiplier(surge);
      const baseFare = calcFare(r.distanceKm, r.durationMin, surge);
      const finalFare = applyPromoDiscount(baseFare, promoDiscount);
      setFare(finalFare);
    } catch (err) {
      console.error('[OSRM]', err.message);
    }
  }

  async function validatePromo() {
    if (!promoCode.trim()) return;
    try {
      const result = await api.validatePromo(promoCode, user.piUserId);
      if (result.valid) {
        setPromoDiscount(result);
        if (route) {
          const baseFare = calcFare(route.distanceKm, route.durationMin, surgeMultiplier);
          setFare(applyPromoDiscount(baseFare, result));
        }
        setShowPromo(false);
        alert(`Promo applied! ${result.type === 'percent' ? result.discount + '% off' : result.discount + ' Pi off'}`);
      }
    } catch (err) {
      alert(err.message || 'Invalid promo code');
    }
  }

  async function bookRide() {
    if (!pickup || !dropoff || !fare) return;
    setPhase('confirming');

    createPayment(
      fare,
      `Taxi Pro ride: ${pickup.name} → ${dropoff.name}`,
      { rideFare: fare, pickup: pickup.name, dropoff: dropoff.name },
      async (paymentId) => {
        // Server approval
        try {
          await api.approvePayment(paymentId);
          // Request ride via WebSocket
          ws.send({
            type: 'ride:request',
            passengerId: user.piUserId,
            pickupLocation: pickup,
            dropoffLocation: dropoff,
            fare,
            distance: route?.distanceKm || 0,
            duration: route?.durationMin || 0,
            surgeMultiplier,
            paymentId,
          });
        } catch (err) {
          console.error('[Payment approve]', err);
          setPhase('booking');
          alert('Payment approval failed. Please try again.');
        }
      },
      async (paymentId, txid) => {
        // Server completion (after ride ends)
        try { await api.completePayment(paymentId, txid); } catch { /* log only */ }
      },
      () => { setPhase('booking'); },
      (err) => { console.error('[Pi payment]', err); setPhase('booking'); }
    );
  }

  function cancelRide() {
    if (!ride) return;
    ws.send({ type: 'ride:cancel', rideId: ride.id || ride.rideId, cancelledBy: user.piUserId, reason: 'Cancelled by passenger' });
    clearRide();
    setPhase('booking');
    setRideStatus(null);
  }

  const mapCenter = pickup ? [pickup.lat, pickup.lng] : [48.8566, 2.3522];

  return (
    <div className="screen" style={{ position: 'relative' }}>
      {/* Map */}
      <div className="map-container" style={{ flex: phase === 'searching' ? 0 : 1 }}>
        {phase !== 'searching' && (
          <Map
            center={mapCenter}
            pickup={pickup}
            dropoff={dropoff}
            driverLocation={driverLocation}
            routeCoords={route?.coordinates}
            onlineDrivers={phase === 'booking' ? onlineDrivers : []}
          />
        )}
      </div>

      {/* Searching animation */}
      <AnimatePresence>
        {phase === 'searching' && (
          <motion.div
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <SearchingAnimation />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom sheet */}
      <AnimatePresence mode="wait">

        {/* Booking form */}
        {phase === 'booking' && (
          <motion.div
            key="booking"
            className="sheet safe-bottom"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className="sheet-handle" />

            {/* Pickup → destination with connector rail */}
            <div style={{ position: 'relative', marginBottom: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: '4px 16px' }}>
              <div style={{ display: 'flex' }}>
                {/* connector rail: green dot → line → green pin */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 22, marginRight: 14 }}>
                  <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-glow)', flexShrink: 0 }} />
                  <div style={{ width: 2, flex: 1, minHeight: 22, background: 'var(--border-strong)', margin: '5px 0' }} />
                  <div style={{ width: 11, height: 13, borderRadius: '50% 50% 50% 0', transform: 'rotate(45deg)', background: 'var(--accent)', flexShrink: 0, marginBottom: 4 }} />
                </div>
                {/* stacked rows */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ padding: '12px 0' }}>
                    <div className="caption">Pickup</div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickup?.name || pickup?.address || 'Detecting location...'}</div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <div style={{ padding: '12px 0' }}>
                    <div className="caption" style={{ marginBottom: 2 }}>Destination</div>
                    <input
                      value={destinationQuery}
                      onChange={onDestinationChange}
                      placeholder="Where to?"
                      style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 500, color: 'var(--text)' }}
                    />
                  </div>
                </div>
              </div>
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, zIndex: 100, overflow: 'hidden', marginTop: 6, boxShadow: '0 8px 24px var(--shadow)' }}
                  >
                    {suggestions.map((s, i) => (
                      <div key={i} onClick={() => onSelectSuggestion(s)} style={{ padding: '12px 14px', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontSize: 14 }}>
                        <div style={{ fontWeight: 500 }}>📍 {s.name}</div>
                        <div className="caption">{s.fullName?.split(',').slice(1, 3).join(',')}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Fare estimate */}
            {fare && route && (
              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                <div className="row-between">
                  <div>
                    <div className="caption">Estimated fare</div>
                    <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--primary)', marginTop: 2 }}>{formatPi(fare)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="caption">{route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min</div>
                    {surgeMultiplier > 1.0 && (
                      <span className="badge badge-warning" style={{ marginTop: 4 }}>⚡ Surge ×{surgeMultiplier}</span>
                    )}
                    {promoDiscount && (
                      <span className="badge badge-success" style={{ marginTop: 4, display: 'block' }}>Promo applied</span>
                    )}
                  </div>
                </div>
                <div className="divider" />
                <div className="row-between">
                  <button onClick={() => setShowPromo(!showPromo)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {promoDiscount ? '✅ Promo applied' : '🎟 Add promo code'}
                  </button>
                </div>
                {showPromo && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input className="input" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="PROMO CODE" style={{ flex: 1, padding: '10px 12px' }} />
                    <button className="btn btn-primary btn-sm" onClick={validatePromo} style={{ width: 'auto' }}>Apply</button>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-primary"
              disabled={!pickup || !dropoff || !fare}
              onClick={bookRide}
            >
              Book Ride — {fare ? formatPi(fare) : 'π'}
            </button>
          </motion.div>
        )}

        {/* Confirming (payment modal open) */}
        {phase === 'confirming' && (
          <motion.div key="confirming" className="sheet safe-bottom" initial={{ y: 60 }} animate={{ y: 0 }}>
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
              <h2>Confirming payment...</h2>
              <div className="muted" style={{ marginTop: 8 }}>Complete the Pi payment to book your ride</div>
            </div>
          </motion.div>
        )}

        {/* Active ride with driver card */}
        {(phase === 'active') && driverInfo && (
          <motion.div key="active" className="sheet safe-bottom" initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
            <div className="sheet-handle" />
            <DriverCard
              driver={driverInfo}
              eta={route ? Math.round(route.durationMin) : null}
              onChat={openChat}
              onCancel={cancelRide}
              unread={unreadChat}
            />
            <div className="divider" />
            <div className="row-between" style={{ padding: '4px 0' }}>
              <div>
                <div className="caption">Status</div>
                <div style={{ fontWeight: 600, color: rideStatus === 'arrived' ? 'var(--warning)' : 'var(--success)' }}>
                  {rideStatus === 'arrived' ? '🚗 Driver arrived!' : rideStatus === 'in_progress' ? '🛣 In progress' : '🚗 On the way'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="caption">Fare</div>
                <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatPi(fare)}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Ride completed */}
        {phase === 'completed' && (
          <motion.div key="completed" className="sheet safe-bottom" initial={{ y: 80 }} animate={{ y: 0 }}>
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ fontSize: 48 }}>🎉</div>
              <h2 style={{ marginTop: 8 }}>Ride Complete!</h2>
              <div className="muted" style={{ marginTop: 4 }}>Fare paid: {formatPi(fare)}</div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => {
              setScreen('rating');
            }}>
              Rate Your Driver
            </button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { clearRide(); setPhase('booking'); }}>
              Skip
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SOS — available while the ride is active or in progress */}
      {phase === 'active' && ride && (
        <SOSButton rideId={ride.id || ride.rideId} location={driverLocation || pickup} />
      )}

      {/* Chat overlay */}
      <AnimatePresence>
        {showChat && ride && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowChat(false)}
          >
            <motion.div
              style={{ background: 'var(--bg2)', width: '100%', height: '70%', borderRadius: '20px 20px 0 0' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              onClick={e => e.stopPropagation()}
            >
              <Chat
                rideId={ride.id || ride.rideId}
                myId={user.piUserId}
                myName={user.name || user.piUsername}
                onClose={() => setShowChat(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
