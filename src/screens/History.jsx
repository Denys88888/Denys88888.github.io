import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import useStore from '../store.js';
import api from '../lib/api.js';
import { formatPi } from '../lib/pricing.js';

function SkeletonRow() {
  return (
    <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
      </div>
      <div className="skeleton" style={{ width: 48, height: 20 }} />
    </div>
  );
}

const STATUS_COLORS = {
  completed: 'var(--success)',
  cancelled: 'var(--danger)',
  in_progress: 'var(--primary)',
  searching: 'var(--warning)',
};

export default function History() {
  const { user, mode } = useStore();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRides(user?.piUserId).then(data => {
      setRides(data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [user?.piUserId]); // eslint-disable-line

  const filteredRides = rides.filter(r =>
    mode === 'driver' ? r.driverId === user?.piUserId : r.passengerId === user?.piUserId
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border)' }}>
        <h2>Ride History</h2>
      </div>

      <div className="scroll-list" style={{ flex: 1 }}>
        {loading && [1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}

        {!loading && filteredRides.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚗</div>
            <div style={{ fontWeight: 600 }}>No rides yet</div>
            <div className="muted" style={{ marginTop: 6 }}>Your ride history will appear here</div>
          </div>
        )}

        {!loading && filteredRides.map((ride, i) => (
          <motion.div
            key={ride.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
            }}>
              {ride.status === 'completed' ? '✅' : ride.status === 'cancelled' ? '❌' : '🚗'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ride.dropoffLocation?.name || ride.destination?.name || 'Unknown destination'}
              </div>
              <div className="caption">
                {new Date(ride.createdAt).toLocaleDateString()} · {(ride.distance || 0).toFixed(1)} km
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatPi(ride.fare || 0)}</div>
              <div style={{ fontSize: 11, color: STATUS_COLORS[ride.status] || 'var(--text3)', textTransform: 'capitalize' }}>
                {ride.status}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
