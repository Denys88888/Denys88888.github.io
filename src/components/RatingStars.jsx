import { useState } from 'react';
import { motion } from 'framer-motion';

export default function RatingStars({ value = 0, onChange, size = 40 }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <motion.button
          key={star}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          whileTap={{ scale: 1.3 }}
          style={{
            fontSize: size,
            background: 'none',
            border: 'none',
            cursor: onChange ? 'pointer' : 'default',
            padding: 0,
            lineHeight: 1,
            color: star <= (hovered || value) ? 'var(--accent)' : 'var(--text-tertiary)',
            textShadow: star <= (hovered || value) ? '0 0 12px var(--accent-glow)' : 'none',
            transition: 'color 0.15s, text-shadow 0.15s',
          }}
          aria-label={`${star} star`}
        >
          ★
        </motion.button>
      ))}
    </div>
  );
}
