import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  MapPin,
  Navigation,
  RefreshCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { fetchRouteSteps, type Maneuver } from '../../services/mapService';
import { haversineKm } from '../../utils/helpers';
import { formatDistance } from '../../utils/formatters';
import type { GeoPoint } from '../../types';

interface Props {
  from: GeoPoint;
  to: GeoPoint;
  // Live driver position; instructions advance as it approaches each maneuver.
  position: GeoPoint | null;
  onClose: () => void;
}

// Maneuver → i18n key. OSRM's type/modifier pairs collapse to a small set of
// spoken instructions.
function maneuverKey(m: Maneuver): string {
  if (m.type === 'depart') return 'depart';
  if (m.type === 'arrive') return 'arrive';
  if (m.type === 'roundabout' || m.type === 'rotary') return 'roundabout';
  const mod = (m.modifier ?? 'straight').replace(' ', '_');
  if (mod === 'uturn') return 'uturn';
  if (mod.includes('left')) return mod.includes('slight') ? 'slight_left' : 'left';
  if (mod.includes('right')) return mod.includes('slight') ? 'slight_right' : 'right';
  return 'straight';
}

function maneuverIcon(key: string) {
  if (key === 'left' || key === 'slight_left' || key === 'uturn') return CornerUpLeft;
  if (key === 'right' || key === 'slight_right') return CornerUpRight;
  if (key === 'arrive') return MapPin;
  if (key === 'roundabout') return RefreshCcw;
  if (key === 'depart') return Navigation;
  return ArrowUp;
}

const ADVANCE_RADIUS_KM = 0.03; // 30 m — consider the maneuver done

// Turn-by-turn banner for drivers: textual OSRM maneuvers + Web Speech voice.
export function NavigationPanel({ from, to, position, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [steps, setSteps] = useState<Maneuver[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [voice, setVoice] = useState(true);
  const spokenRef = useRef<string>('');

  useEffect(() => {
    let stale = false;
    setSteps(null);
    setIdx(0);
    fetchRouteSteps([from, to]).then((s) => {
      if (!stale) setSteps(s);
    });
    return () => {
      stale = true;
    };
  }, [from.lat, from.lng, to.lat, to.lng]);

  // Advance past maneuvers the driver has reached.
  useEffect(() => {
    if (!steps || !position) return;
    let i = idx;
    while (
      i < steps.length - 1 &&
      haversineKm(position.lat, position.lng, steps[i].lat, steps[i].lng) < ADVANCE_RADIUS_KM
    ) {
      i += 1;
    }
    if (i !== idx) setIdx(i);
  }, [steps, position?.lat, position?.lng]);

  const current = steps?.[idx] ?? null;
  const key = current ? maneuverKey(current) : null;
  const distanceKm = useMemo(() => {
    if (!current) return null;
    if (!position) return null;
    return haversineKm(position.lat, position.lng, current.lat, current.lng);
  }, [current, position?.lat, position?.lng]);

  const instruction = current
    ? `${t(`nav.${key}`)}${current.road ? ` · ${current.road}` : ''}`
    : null;
  const spoken = instruction
    ? distanceKm != null && distanceKm > 0.05
      ? t('nav.inDistance', { distance: formatDistance(distanceKm), instruction })
      : instruction
    : null;

  // Voice guidance via the Web Speech API (no external services).
  useEffect(() => {
    if (!voice || !spoken || !('speechSynthesis' in window)) return;
    if (spokenRef.current === spoken) return;
    spokenRef.current = spoken;
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = i18n.language;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [spoken, voice, i18n.language]);

  const Icon = key ? maneuverIcon(key) : Navigation;

  return (
    <div className="pointer-events-auto rounded-card bg-black/80 p-3 text-white shadow-card backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary">
          <Icon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          {steps === null && <p className="text-sm opacity-80">{t('nav.loading')}</p>}
          {steps !== null && !current && <p className="text-sm opacity-80">{t('nav.unavailable')}</p>}
          {current && (
            <>
              <p className="truncate text-sm font-semibold">{instruction}</p>
              <p className="text-xs opacity-70">
                {distanceKm != null ? formatDistance(distanceKm) : formatDistance(current.distanceM / 1000)}
                {steps ? ` · ${idx + 1}/${steps.length}` : ''}
              </p>
            </>
          )}
        </div>
        <button
          onClick={() => setVoice((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
          aria-label="voice"
        >
          {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <button
          onClick={() => {
            window.speechSynthesis?.cancel();
            onClose();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
          aria-label={t('common.close')}
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
