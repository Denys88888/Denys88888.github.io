import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Thin top banner shown whenever the browser loses connectivity.
// Pure client-side: listens to the window online/offline events.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'var(--danger)', color: '#fff',
            padding: '8px 12px', fontSize: 13, fontWeight: 600,
            paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
          }}
        >
          <span>⚠️</span> No connection — trying to reconnect…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
