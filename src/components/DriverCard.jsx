import { motion } from 'framer-motion';

export default function DriverCard({ driver, eta, onChat, onCancel, unread = 0 }) {
  const initials = (driver?.name || 'D').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <motion.div
      className="card"
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>{initials}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{driver?.name || 'Your Driver'}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              ⭐ {(driver?.rating || 5.0).toFixed(1)} · {driver?.completedRides || 0} rides
            </div>
          </div>
        </div>
        {eta != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--primary)' }}>{eta}m</div>
            <div className="caption">ETA</div>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>{driver?.carModel || 'Vehicle'}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {driver?.carColor && `${driver.carColor} · `}{driver?.plateNumber || '—'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {onChat && (
          <button className="btn btn-ghost btn-sm" style={{ flex: 1, position: 'relative' }} onClick={onChat}>
            💬 Chat
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px',
                borderRadius: 99, background: 'var(--danger)', color: '#fff',
                fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{unread}</span>
            )}
          </button>
        )}
        {onCancel && (
          <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </motion.div>
  );
}
