import { useState } from 'react';
import { motion } from 'framer-motion';
import useStore from '../store.js';
import api from '../lib/api.js';

export default function Profile() {
  const { user, setUser, theme, setTheme, mode, setMode } = useStore();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [carModel, setCarModel] = useState(user?.carModel || '');
  const [carColor, setCarColor] = useState(user?.carColor || '');
  const [plateNumber, setPlateNumber] = useState(user?.plateNumber || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveProfile() {
    setSaving(true);
    try {
      const updates = { name, phone, ...(mode === 'driver' ? { carModel, carColor, plateNumber } : {}) };
      const updated = await api.updateUser(user.piUserId, updates);
      setUser({ ...user, ...updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const initials = (user?.name || user?.piUsername || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border)' }}>
        <h2>Profile</h2>
      </div>

      {/* Avatar + stats */}
      <div style={{ padding: '24px 16px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="avatar" style={{ width: 72, height: 72, fontSize: 28 }}>{initials}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{user?.name || user?.piUsername}</div>
          <div className="muted" style={{ fontSize: 13 }}>@{user?.piUsername}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{user?.totalRides || 0}</div>
              <div className="caption">Rides</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>⭐ {(user?.rating || 5.0).toFixed(1)}</div>
              <div className="caption">Rating</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Mode toggle */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="caption" style={{ marginBottom: 12 }}>Mode</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['passenger', 'driver'].map(m => (
              <button key={m} className={`btn ${mode === m ? 'btn-primary' : 'btn-ghost'} btn-sm`} style={{ flex: 1, textTransform: 'capitalize' }}
                onClick={() => setMode(m)}>{m === 'passenger' ? '🧑 Passenger' : '🚗 Driver'}</button>
            ))}
          </div>
        </div>

        {/* Profile fields */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="caption" style={{ marginBottom: 12 }}>Personal Info</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" type="tel" />
          </div>
        </div>

        {/* Driver details */}
        {mode === 'driver' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="caption" style={{ marginBottom: 12 }}>Vehicle Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="input" value={carModel} onChange={e => setCarModel(e.target.value)} placeholder="Car model (e.g. Toyota Corolla)" />
              <input className="input" value={carColor} onChange={e => setCarColor(e.target.value)} placeholder="Car color" />
              <input className="input" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="Plate number" style={{ textTransform: 'uppercase' }} />
            </div>
          </div>
        )}

        {/* Theme */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="caption" style={{ marginBottom: 12 }}>Appearance</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['system', '🌓 Auto'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([t, label]) => (
              <button key={t} className={`btn ${theme === t ? 'btn-primary' : 'btn-ghost'} btn-sm`} style={{ flex: 1, fontSize: 12 }}
                onClick={() => setTheme(t)}>{label}</button>
            ))}
          </div>
        </div>

        <motion.button
          className="btn btn-primary"
          onClick={saveProfile}
          disabled={saving}
          animate={saved ? { backgroundColor: '#22C55E' } : {}}
          style={{ marginBottom: 32 }}
        >
          {saved ? '✅ Saved!' : saving ? 'Saving...' : 'Save Profile'}
        </motion.button>
      </div>
    </div>
  );
}
