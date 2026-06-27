import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Map from '../components/Map.jsx';
import api from '../lib/api.js';
import ws from '../lib/ws.js';

const STATUS_LABEL = {
  searching: 'Finding a driver…',
  accepted: 'Driver on the way',
  arrived: 'Driver has arrived',
  in_progress: 'Ride in progress',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled',
};

// Read-only live tracking page opened from a share link (/track/{token}).
// No auth: connects anonymously and follows the ride's driver position.
export default function TrackView({ token }) {
  const [info, setInfo] = useState(null);     // { rideId, status, driverId }
  const [driverLoc, setDriverLoc] = useState(null);
  const [error, setError] = useState(null);
  const driverIdRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.getShare(token)
      .then(d => { if (alive) { setInfo(d); driverIdRef.current = d.driverId; } })
      .catch(() => alive && setError('This tracking link is invalid or has expired.'));

    ws.connect(null);
    const offLoc = ws.on('driver:location', d => {
      if (!driverIdRef.current || d.driverId === driverIdRef.current) setDriverLoc(d.location);
    });
    const offStatus = ws.on('*', d => {
      if (d.rideId && info && d.rideId === info.rideId && d.type?.startsWith('ride:')) {
        setInfo(prev => ({ ...prev, status: d.type.replace('ride:', '').replace('ed', '') }));
      }
    });
    return () => { alive = false; offLoc(); offStatus(); };
  }, [token]); // eslint-disable-line

  if (error) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <h2>Link unavailable</h2>
          <div className="muted" style={{ marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  const center = driverLoc ? [driverLoc.lat, driverLoc.lng] : [48.8566, 2.3522];

  return (
    <div className="app">
      <div className="map-container" style={{ flex: 1 }}>
        <Map center={center} driverLocation={driverLoc} />
        {/* Status card */}
        <motion.div
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          style={{
            position: 'absolute', top: 16, left: 16, right: 16, zIndex: 600,
            background: 'var(--sheet-bg)', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)',
            border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px',
            boxShadow: '0 8px 24px var(--shadow)',
          }}
        >
          <div className="caption">Live ride tracking</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2, color: 'var(--accent)' }}>
            {info ? (STATUS_LABEL[info.status] || 'Tracking…') : 'Connecting…'}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>
            {driverLoc ? 'Following the driver in real time' : 'Waiting for the driver location…'}
          </div>
        </motion.div>

        {/* Read-only watermark */}
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 600,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
          padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
        }}>👁 View only · Taxi Pro</div>
      </div>
    </div>
  );
}
