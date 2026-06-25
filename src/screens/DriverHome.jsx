import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map from '../components/Map.jsx';
import Chat from '../components/Chat.jsx';
import useStore from '../store.js';
import ws from '../lib/ws.js';
import { formatPi } from '../lib/pricing.js';

export default function DriverHome() {
  const { user, isDriverOnline, setIsDriverOnline, setCurrentOffer, currentOffer } = useStore();

  const [driverLocation, setDriverLocation] = useState(null);
  const [currentRide, setCurrentRide] = useState(null);
  const [ridePhase, setRidePhase] = useState(null); // null|navigating|arrived|in_progress
  const [offerCountdown, setOfferCountdown] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const countdownRef = useRef(null);
  const locationWatchRef = useRef(null);

  // GPS tracking when online
  useEffect(() => {
    if (!isDriverOnline) {
      if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current);
      return;
    }
    if (!navigator.geolocation) return;
    locationWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        ws.send({ type: 'driver:location', driverId: user.piUserId, location: loc, rideId: currentRide?.id });
      },
      console.warn,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => {
      if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current);
    };
  }, [isDriverOnline]); // eslint-disable-line

  // WS events
  useEffect(() => {
    const off1 = ws.on('ride:offer', d => {
      setCurrentOffer(d);
      setOfferCountdown(d.expiresIn || 30);
      startCountdown();
    });
    const off2 = ws.on('ride:accept:ack', d => {
      setCurrentRide(prev => ({ ...prev, passengerId: d.passengerId, pickupLocation: d.pickupLocation }));
      setCurrentOffer(null);
      setRidePhase('navigating');
    });
    const off3 = ws.on('ride:cancelled', () => { setCurrentRide(null); setRidePhase(null); });

    return () => { off1(); off2(); off3(); };
  }, []); // eslint-disable-line

  function startCountdown() {
    clearInterval(countdownRef.current);
    setOfferCountdown(30);
    let remaining = 30;
    countdownRef.current = setInterval(() => {
      remaining--;
      setOfferCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        setCurrentOffer(null);
      }
    }, 1000);
  }

  function toggleOnline() {
    const newState = !isDriverOnline;
    setIsDriverOnline(newState);
    if (newState) {
      navigator.geolocation.getCurrentPosition(pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        ws.send({
          type: 'driver:online',
          driverId: user.piUserId,
          name: user.name || user.piUsername,
          carModel: user.carModel || 'Vehicle',
          carColor: user.carColor || '',
          plateNumber: user.plateNumber || '',
          rating: user.rating || 5.0,
          location: loc,
        });
      }, console.warn, { enableHighAccuracy: true });
    } else {
      ws.send({ type: 'driver:offline', driverId: user.piUserId });
    }
  }

  function acceptOffer() {
    if (!currentOffer) return;
    clearInterval(countdownRef.current);
    setCurrentRide(currentOffer.ride);
    ws.send({ type: 'ride:accept', rideId: currentOffer.rideId, driverId: user.piUserId });
    setCurrentOffer(null);
  }

  function declineOffer() {
    clearInterval(countdownRef.current);
    setCurrentOffer(null);
  }

  function markArrived() {
    ws.send({ type: 'ride:arrived', rideId: currentRide.id });
    setRidePhase('arrived');
  }

  function startRide() {
    ws.send({ type: 'ride:start', rideId: currentRide.id });
    setRidePhase('in_progress');
  }

  function completeRide() {
    ws.send({ type: 'ride:complete', rideId: currentRide.id });
    setCurrentRide(null);
    setRidePhase(null);
  }

  const pickup = currentRide?.pickupLocation || currentRide?.pickup;
  const dropoff = currentRide?.dropoffLocation || currentRide?.destination;
  const mapCenter = driverLocation ? [driverLocation.lat, driverLocation.lng] : [48.8566, 2.3522];

  return (
    <div className="screen" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Map */}
      <div className="map-container">
        <Map
          center={mapCenter}
          pickup={ridePhase === 'navigating' ? pickup : null}
          dropoff={ridePhase === 'in_progress' ? dropoff : null}
          driverLocation={driverLocation}
        />
        {/* Online/Offline toggle pill */}
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <motion.div
            onClick={!currentRide ? toggleOnline : undefined}
            whileTap={{ scale: 0.96 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: isDriverOnline ? 'var(--success)' : 'var(--bg2)',
              color: isDriverOnline ? '#fff' : 'var(--text)',
              padding: '10px 20px', borderRadius: 99,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              cursor: currentRide ? 'default' : 'pointer',
              fontWeight: 700, fontSize: 15,
            }}
          >
            <span>{isDriverOnline ? '🟢' : '⚪'}</span>
            {isDriverOnline ? 'Online' : 'Go Online'}
          </motion.div>
        </div>
      </div>

      {/* Incoming ride offer */}
      <AnimatePresence>
        {currentOffer && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="sheet safe-bottom"
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500 }}
          >
            <div className="sheet-handle" />
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h2>New Ride Request</h2>
              {/* countdown bar */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 22, color: offerCountdown < 10 ? 'var(--danger)' : 'var(--primary)' }}>{offerCountdown}s</div>
                <div className="caption">to accept</div>
              </div>
            </div>

            {/* Countdown bar */}
            <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
              <motion.div
                style={{ height: '100%', background: offerCountdown < 10 ? 'var(--danger)' : 'var(--primary)', borderRadius: 2 }}
                animate={{ width: `${(offerCountdown / 30) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>

            <div className="card" style={{ marginBottom: 12 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🟢</span>
                <div>
                  <div className="caption">Pickup</div>
                  <div style={{ fontWeight: 500 }}>{currentOffer.ride?.pickupLocation?.name || currentOffer.ride?.pickup?.name || 'Pickup location'}</div>
                </div>
              </div>
              <div className="row">
                <span style={{ fontSize: 18 }}>🔴</span>
                <div>
                  <div className="caption">Destination</div>
                  <div style={{ fontWeight: 500 }}>{currentOffer.ride?.dropoffLocation?.name || currentOffer.ride?.destination?.name || 'Destination'}</div>
                </div>
              </div>
            </div>

            <div className="row-between" style={{ marginBottom: 16 }}>
              <div>
                <div className="caption">Fare</div>
                <div style={{ fontWeight: 700, fontSize: 24, color: 'var(--primary)' }}>{formatPi(currentOffer.ride?.fare || 0)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="caption">Distance</div>
                <div style={{ fontWeight: 600 }}>{(currentOffer.ride?.distance || 0).toFixed(1)} km</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={declineOffer}>Decline</button>
              <button className="btn btn-success" style={{ flex: 2 }} onClick={acceptOffer}>Accept</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active ride controls */}
      <AnimatePresence>
        {ridePhase && !currentOffer && (
          <motion.div
            key={ridePhase}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            className="sheet safe-bottom"
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500 }}
          >
            <div className="sheet-handle" />
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div>
                <h3>{ridePhase === 'navigating' ? 'Navigate to Pickup' : ridePhase === 'arrived' ? 'Waiting for Passenger' : 'Ride in Progress'}</h3>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{pickup?.name || pickup?.address || 'Pickup location'}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--primary)' }}>{formatPi(currentRide?.fare || 0)}</div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ flex: 1 }}
                onClick={() => setShowChat(true)}
              >💬 Chat</button>

              {ridePhase === 'navigating' && (
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={markArrived}>I Arrived</button>
              )}
              {ridePhase === 'arrived' && (
                <button className="btn btn-success" style={{ flex: 2 }} onClick={startRide}>Start Ride</button>
              )}
              {ridePhase === 'in_progress' && (
                <button className="btn btn-success" style={{ flex: 2 }} onClick={completeRide}>Complete Ride</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle state */}
      {!isDriverOnline && !currentOffer && !ridePhase && (
        <motion.div
          className="sheet safe-bottom"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500 }}
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        >
          <div className="sheet-handle" />
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🚗</div>
            <h2>Ready to drive?</h2>
            <div className="muted" style={{ marginTop: 6, marginBottom: 16 }}>Go online to start receiving ride requests</div>
            <button className="btn btn-success" onClick={toggleOnline}>Go Online</button>
          </div>
        </motion.div>
      )}

      {/* Online idle */}
      {isDriverOnline && !currentOffer && !ridePhase && (
        <motion.div
          className="sheet safe-bottom"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500 }}
          initial={{ y: 60 }} animate={{ y: 0 }}
        >
          <div className="sheet-handle" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
            <div style={{ position: 'relative', width: 40, height: 40 }}>
              <div className="pulse-ring" style={{ width: 24, height: 24, top: 8, left: 8 }} />
              <div style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: '50%', background: 'var(--success)', zIndex: 1 }} />
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Waiting for requests</div>
              <div className="muted" style={{ fontSize: 13 }}>You'll be notified when a ride is nearby</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Chat overlay */}
      <AnimatePresence>
        {showChat && currentRide && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowChat(false)}>
            <motion.div style={{ background: 'var(--bg2)', width: '100%', height: '70%', borderRadius: '20px 20px 0 0' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              onClick={e => e.stopPropagation()}>
              <Chat rideId={currentRide.id} myId={user.piUserId} myName={user.name || user.piUsername} onClose={() => setShowChat(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
