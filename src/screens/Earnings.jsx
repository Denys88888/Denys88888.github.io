import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import useStore from '../store.js';
import api from '../lib/api.js';
import { formatPi } from '../lib/pricing.js';

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 22, color: color || 'var(--primary)' }}>{value}</div>
      <div className="caption" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function Earnings() {
  const { user } = useStore();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRides(user?.piUserId).then(data => {
      const driverRides = (data || []).filter(r => r.driverId === user?.piUserId && r.status === 'completed');
      setRides(driverRides);
    }).catch(console.error).finally(() => setLoading(false));
  }, [user?.piUserId]); // eslint-disable-line

  const now = new Date();
  const todayRides = rides.filter(r => new Date(r.completedAt || r.createdAt).toDateString() === now.toDateString());
  const weekRides = rides.filter(r => {
    const d = new Date(r.completedAt || r.createdAt);
    return now - d < 7 * 24 * 60 * 60 * 1000;
  });

  const sum = list => list.reduce((acc, r) => acc + (r.fare || 0), 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border)' }}>
        <h2>Earnings</h2>
      </div>

      {loading ? (
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 16 }} />)}
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <StatCard label="Today" value={formatPi(sum(todayRides))} color="var(--success)" />
            <StatCard label="This Week" value={formatPi(sum(weekRides))} />
            <StatCard label="All Time" value={formatPi(sum(rides))} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <StatCard label="Today Rides" value={todayRides.length} />
            <StatCard label="Week Rides" value={weekRides.length} />
            <StatCard label="Total Rides" value={rides.length} />
          </div>

          {/* Ride list */}
          <h3 style={{ marginBottom: 12 }}>Recent Completed Rides</h3>
          {rides.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
              <div className="muted">Complete rides to see your earnings here</div>
            </div>
          )}
          {rides.slice(0, 20).map((ride, i) => (
            <motion.div
              key={ride.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  {ride.dropoffLocation?.name || ride.destination?.name || 'Trip'}
                </div>
                <div className="caption">
                  {new Date(ride.completedAt || ride.createdAt).toLocaleDateString()} · {(ride.distance || 0).toFixed(1)} km
                </div>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--success)' }}>{formatPi(ride.fare || 0)}</div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
