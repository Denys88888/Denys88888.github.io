import { useState } from 'react';
import { motion } from 'framer-motion';
import useStore from '../store.js';
import api from '../lib/api.js';

// Mini preview palettes mirror the three globals.css themes.
const THEME_SWATCHES = [
  { id: 'light',   label: 'Light',   bg: '#F8FAF9', card: '#E6ECE9', accent: '#0E9F6E' },
  { id: 'dark',    label: 'Dark',    bg: '#0A0E0D', card: '#1C2421', accent: '#10B981' },
  { id: 'emerald', label: 'Emerald', bg: '#05140F', card: '#0F2D22', accent: '#1FD884' },
];

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
          <div style={{ display: 'flex', gap: 10 }}>
            {THEME_SWATCHES.map(sw => {
              const selected = theme === sw.id;
              return (
                <motion.button
                  key={sw.id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setTheme(sw.id)}
                  style={{
                    flex: 1, cursor: 'pointer', padding: 0, background: 'none',
                    border: 'none', fontFamily: 'inherit',
                  }}
                >
                  {/* Mini preview */}
                  <div style={{
                    position: 'relative', height: 56, borderRadius: 14,
                    background: sw.bg, overflow: 'hidden',
                    border: `2px solid ${selected ? sw.accent : 'var(--border)'}`,
                    boxShadow: selected ? `0 0 14px ${sw.accent}55` : 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}>
                    {/* faux card */}
                    <div style={{ position: 'absolute', left: 8, right: 8, top: 8, height: 10, borderRadius: 4, background: sw.card }} />
                    {/* accent dot */}
                    <div style={{ position: 'absolute', left: 8, bottom: 8, width: 16, height: 16, borderRadius: '50%', background: sw.accent }} />
                    {selected && (
                      <div style={{
                        position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: '50%',
                        background: sw.accent, color: sw.bg, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 800,
                      }}>✓</div>
                    )}
                  </div>
                  <div style={{
                    marginTop: 6, fontSize: 12, fontWeight: 600,
                    color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                  }}>{sw.label}</div>
                </motion.button>
              );
            })}
          </div>
        </div>

        <motion.button
          className="btn btn-primary"
          onClick={saveProfile}
          disabled={saving}
          whileTap={{ scale: 0.97 }}
          animate={saved ? { scale: [1, 1.04, 1] } : {}}
          transition={{ duration: 0.35 }}
          style={{ marginBottom: 32 }}
        >
          {saved ? '✅ Saved!' : saving ? 'Saving...' : 'Save Profile'}
        </motion.button>
      </div>
    </div>
  );
}
