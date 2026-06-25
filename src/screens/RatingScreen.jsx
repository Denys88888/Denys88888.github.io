import { useState } from 'react';
import { motion } from 'framer-motion';
import RatingStars from '../components/RatingStars.jsx';
import useStore from '../store.js';
import api from '../lib/api.js';

export default function RatingScreen() {
  const { user, ride, driverInfo, fare, clearRide } = useStore();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!score) return;
    setLoading(true);
    try {
      await api.submitRating({
        rideId: ride?.id || ride?.rideId,
        fromUser: user.piUserId,
        toUser: driverInfo?.id || ride?.driverId,
        score,
        comment: comment.trim(),
        type: 'passenger_to_driver',
      });
      setSubmitted(true);
    } catch (err) {
      console.error('[Rating]', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <motion.div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
        <h2>Thanks for rating!</h2>
        <div className="muted" style={{ marginTop: 8 }}>Your feedback helps improve the service</div>
        <button className="btn btn-primary" style={{ marginTop: 32, maxWidth: 280, width: '100%' }} onClick={clearRide}>
          Back to Home
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div style={{ flex: 1, padding: 24 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Driver info */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div className="avatar" style={{ width: 72, height: 72, fontSize: 28, margin: '0 auto 12px' }}>
          {(driverInfo?.name || 'D').charAt(0).toUpperCase()}
        </div>
        <h2>{driverInfo?.name || 'Your Driver'}</h2>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{driverInfo?.carModel || 'Vehicle'}</div>
      </div>

      {/* Stars */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 16, fontWeight: 600 }}>How was your ride?</div>
        <RatingStars value={score} onChange={setScore} size={48} />
        {score > 0 && (
          <div style={{ textAlign: 'center', marginTop: 10, color: 'var(--primary)', fontWeight: 600 }}>
            {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][score]}
          </div>
        )}
      </div>

      {/* Comment */}
      <textarea
        className="input"
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Leave a comment (optional)"
        rows={3}
        style={{ resize: 'none', marginBottom: 16 }}
      />

      {/* Receipt */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="caption" style={{ marginBottom: 8 }}>Ride Receipt</div>
        {[
          ['Distance', `${(ride?.distance || 0).toFixed(1)} km`],
          ['Duration', `${Math.round(ride?.duration || 0)} min`],
          ['Fare', `${fare || '—'} π`],
        ].map(([label, val]) => (
          <div key={label} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="muted">{label}</span>
            <span style={{ fontWeight: 600 }}>{val}</span>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={!score || loading}>
        {loading ? 'Submitting...' : 'Submit Rating'}
      </button>
      <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={clearRide}>Skip</button>
    </motion.div>
  );
}
