import { motion } from 'framer-motion';

export default function SearchingAnimation({ message = 'Finding your driver...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 24 }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="pulse-ring"
            style={{ width: 60, height: 60, top: 20, left: 20 }}
            animate={{ scale: [0.8, 2.4], opacity: [1, 0] }}
            transition={{ duration: 1.8, delay: i * 0.6, repeat: Infinity, ease: 'easeOut' }}
          />
        ))}
        <div style={{
          position: 'absolute', top: 20, left: 20, width: 60, height: 60,
          borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, zIndex: 1,
          boxShadow: '0 0 32px var(--accent-glow), 0 0 0 2px var(--accent-glow)',
        }}>
          🚗
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 18 }}>{message}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>This usually takes under 60 seconds</div>
      </div>
    </div>
  );
}
