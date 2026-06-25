import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Emergency safety button — pure client-side, no backend.
// Shown during an active ride. Opens the phone dialer with the emergency number
// and can share the ride id + live GPS location via a Telegram deep link.
// Emergency number is configurable via localStorage('taxipro_sos_number').
export default function SOSButton({ rideId, location }) {
  const [open, setOpen] = useState(false);
  const emergencyNumber = localStorage.getItem('taxipro_sos_number') || '112';

  function callEmergency() {
    window.location.href = `tel:${emergencyNumber}`;
  }

  function shareViaTelegram() {
    // Use the freshest position we can get; fall back to the prop.
    const send = (lat, lng) => {
      const mapLink = lat && lng ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : '';
      const text = `🆘 EMERGENCY — I'm on a Taxi Pro ride (id: ${rideId || 'unknown'}). My live location: ${mapLink}`;
      const url = `https://t.me/share/url?url=${encodeURIComponent(mapLink)}&text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => send(pos.coords.latitude, pos.coords.longitude),
        () => send(location?.lat, location?.lng),
        { timeout: 4000 }
      );
    } else {
      send(location?.lat, location?.lng);
    }
  }

  return (
    <>
      <motion.button
        aria-label="Emergency SOS"
        onClick={() => setOpen(true)}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.9 }}
        style={{
          position: 'absolute', right: 16, bottom: 120, zIndex: 600,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--danger)', color: '#fff', border: 'none',
          fontWeight: 800, fontSize: 16, cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(239,68,68,0.5)',
        }}
      >
        SOS
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ zIndex: 700 }}
          >
            <motion.div
              className="sheet safe-bottom"
              initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
                <div style={{ fontSize: 40 }}>🆘</div>
                <h2 style={{ marginTop: 6 }}>Emergency</h2>
                <div className="muted" style={{ marginTop: 4 }}>Get help fast. Your ride id and location can be shared.</div>
              </div>
              <button className="btn btn-danger" onClick={callEmergency}>
                📞 Call {emergencyNumber}
              </button>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={shareViaTelegram}>
                ✈️ Share my live location (Telegram)
              </button>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
