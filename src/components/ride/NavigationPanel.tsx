import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  MapPin,
  Navigation,
  RefreshCcw,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { fetchRouteSteps, speedLimitKph, type Maneuver } from '../../services/mapService';
import { cn, haversineKm } from '../../utils/helpers';
import { formatDistance } from '../../utils/formatters';
import type { GeoPoint } from '../../types';

interface Props {
  from: GeoPoint;
  to: GeoPoint;
  // Live driver position; instructions advance as it approaches each maneuver.
  position: GeoPoint | null;
  // Ground speed in m/s from the device, when it is known.
  speed?: number | null;
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

// One lane's arrow. OSM lane values are phrases ('slight left', 'merge to
// right'), so the specific ones have to be matched before the plain ones.
export function laneIcon(indication: string) {
  if (indication.includes('uturn')) return RotateCcw;
  if (indication.includes('sharp left')) return ArrowLeft;
  if (indication.includes('sharp right')) return ArrowRight;
  if (indication.includes('slight left') || indication.includes('merge to left'))
    return ArrowUpLeft;
  if (indication.includes('slight right') || indication.includes('merge to right'))
    return ArrowUpRight;
  if (indication.includes('left')) return CornerUpLeft;
  if (indication.includes('right')) return CornerUpRight;
  return ArrowUp; // 'straight', 'none'
}

const ADVANCE_RADIUS_KM = 0.03; // 30 m — consider the maneuver done
const NEAR_KM = 0.08; // came this close to the junction — the driver was at it
const PASSED_KM = 0.04; // …and has since pulled this far away again
const OFF_ROUTE_KM = 0.15; // never got near it and is now this far past: off route
const LIMIT_MIN_GAP_MS = 15000; // don't ask OSM about the speed limit faster than this
const LIMIT_MIN_MOVE_KM = 0.15; // …nor before the driver has actually gone somewhere
const OVER_LIMIT_KPH = 5; // tolerance before the speed reads as speeding

// Turn-by-turn banner for drivers: textual OSRM maneuvers + Web Speech voice.
export function NavigationPanel({ from, to, position, speed, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [steps, setSteps] = useState<Maneuver[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [voice, setVoice] = useState(true);
  const [limitKph, setLimitKph] = useState<number | null>(null);
  const spokenRef = useRef<string>('');
  const limitAskedRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const closestRef = useRef<{ idx: number; km: number } | null>(null);
  // Where the route in `steps` was calculated from. Not `from` itself: that is
  // the live driver position, and routing again on every GPS fix would hammer
  // the routing service and restart the instructions a few times a second.
  const [origin, setOrigin] = useState<GeoPoint>(from);

  // A new destination (pickup reached → passenger's drop-off) is a new route,
  // and it starts wherever the driver is standing now.
  useEffect(() => {
    setOrigin(from);
    closestRef.current = null;
    // `from` is deliberately not a dependency — see `origin` above.
  }, [to.lat, to.lng]);

  useEffect(() => {
    let stale = false;
    setSteps(null);
    setIdx(0);
    fetchRouteSteps([origin, to]).then((s) => {
      if (!stale) setSteps(s);
    });
    return () => {
      stale = true;
    };
  }, [origin.lat, origin.lng, to.lat, to.lng]);

  // Both "the turn is behind us" and "we are not on this route any more" are
  // read from the same thing: how the distance to the maneuver ahead moves.
  // While it shrinks the driver is heading for the turn; once it grows again,
  // the closest approach tells us whether they went through the junction or
  // never reached it.
  useEffect(() => {
    if (!steps || !position) return;
    let i = idx;
    let closest = closestRef.current;
    let lost = false;

    for (;;) {
      const step = steps[i];
      if (!step) break;
      const km = haversineKm(position.lat, position.lng, step.lat, step.lng);
      if (!closest || closest.idx !== i || km < closest.km) closest = { idx: i, km };
      // A fast car between two GPS fixes can jump clean over the 30 m circle,
      // so getting close and then pulling away counts as having passed too.
      const passed =
        km < ADVANCE_RADIUS_KM || (closest.km < NEAR_KM && km > closest.km + PASSED_KM);
      if (passed && i < steps.length - 1) {
        i += 1;
        closest = null;
        continue;
      }
      lost = !passed && km > closest.km + OFF_ROUTE_KM;
      break;
    }

    closestRef.current = closest;
    if (i !== idx) setIdx(i);
    if (lost) {
      // Missed the turn or took another street: route again from here.
      closestRef.current = null;
      setOrigin({ lat: position.lat, lng: position.lng });
    }
  }, [steps, idx, position?.lat, position?.lng]);

  // Speed limit for the road under the car. Overpass is a shared public
  // service, so ask only once the driver has moved on, and treat every failure
  // as "unknown" — the sign simply doesn't appear.
  useEffect(() => {
    if (!position) return;
    const asked = limitAskedRef.current;
    if (
      asked &&
      (Date.now() - asked.at < LIMIT_MIN_GAP_MS ||
        haversineKm(asked.lat, asked.lng, position.lat, position.lng) < LIMIT_MIN_MOVE_KM)
    ) {
      return;
    }
    limitAskedRef.current = { lat: position.lat, lng: position.lng, at: Date.now() };
    let stale = false;
    speedLimitKph(position).then((kph) => {
      if (!stale) setLimitKph(kph);
    });
    return () => {
      stale = true;
    };
  }, [position?.lat, position?.lng]);

  const current = steps?.[idx] ?? null;
  const next = steps?.[idx + 1] ?? null;
  const key = current ? maneuverKey(current) : null;
  const speedKph = speed != null && speed >= 0 ? Math.round(speed * 3.6) : null;
  const speeding = speedKph != null && limitKph != null && speedKph > limitKph + OVER_LIMIT_KPH;
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
    return () => { window.speechSynthesis?.cancel(); };
  }, [spoken, voice, i18n.language]);

  const Icon = key ? maneuverIcon(key) : Navigation;
  const NextIcon = next ? maneuverIcon(maneuverKey(next)) : null;
  const lanes = current?.lanes;

  return (
    <div className="pointer-events-auto overflow-hidden rounded-card bg-black/85 text-white shadow-card backdrop-blur">
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary">
          <Icon size={28} />
        </div>
        <div className="min-w-0 flex-1">
          {steps === null && <p className="text-sm opacity-80">{t('nav.loading')}</p>}
          {steps !== null && !current && <p className="text-sm opacity-80">{t('nav.unavailable')}</p>}
          {current && (
            <>
              {/* The distance to the turn is the number a driver glances at —
                  lead with it, big, the way Google Maps does; the instruction
                  text is secondary context underneath. */}
              <p className="text-2xl font-bold leading-none">
                {distanceKm != null ? formatDistance(distanceKm) : formatDistance(current.distanceM / 1000)}
              </p>
              <p className="mt-1 truncate text-sm opacity-90">{instruction}</p>
              {/* Fills as the car closes on the turn — the Google-Maps cue for
                  "how close am I". Full segment length is current.distanceM. */}
              {distanceKm != null && current.distanceM > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, (1 - distanceKm / (current.distanceM / 1000)) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => setVoice((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15"
          aria-label={voice ? t('nav.mute') : t('nav.unmute')}
        >
          {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <button
          onClick={() => {
            window.speechSynthesis?.cancel();
            onClose();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15"
          aria-label={t('common.close')}
        >
          <X size={17} />
        </button>
      </div>

      {/* What comes after the current turn, as its own strip directly under
          the main banner — mirrors Google Maps' "Далее" chip, so a turn that
          follows immediately after another one isn't a surprise. */}
      {next && NextIcon && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/5 px-3 py-2 text-xs opacity-80">
          <span className="shrink-0">{t('nav.then')}</span>
          <NextIcon size={14} className="shrink-0" />
          <span className="truncate">{next.road || t(`nav.${maneuverKey(next)}`)}</span>
        </div>
      )}

      {/* Which lane to be in. OSM knows the lane layout of most city junctions;
          the ones that keep you on the route are lit, the rest are dimmed. */}
      {lanes && lanes.length > 0 && (
        <div className="flex justify-center gap-1 border-t border-white/10 p-2" aria-label={t('nav.lanes')}>
          {lanes.map((lane, i) => (
            <div
              key={i}
              data-lane={lane.valid ? 'valid' : 'invalid'}
              className={cn(
                'flex h-9 min-w-[2.25rem] items-center justify-center gap-0.5 rounded-lg px-1',
                lane.valid ? 'bg-primary text-white' : 'bg-white/10 text-white/40'
              )}
            >
              {lane.indications.slice(0, 2).map((indication, j) => {
                const LaneIcon = laneIcon(indication);
                return <LaneIcon key={j} size={16} strokeWidth={lane.valid ? 2.5 : 2} />;
              })}
            </div>
          ))}
        </div>
      )}

      {(speedKph != null || limitKph != null) && (
        <div className="flex items-center gap-2 border-t border-white/10 p-2">
          {limitKph != null && (
            <div
              aria-label={t('nav.speedLimit')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-danger bg-white text-sm font-bold text-black"
            >
              {limitKph}
            </div>
          )}
          {speedKph != null && (
            <div className="flex shrink-0 items-baseline gap-1" aria-label={t('nav.yourSpeed')}>
              <span className={cn('text-2xl font-bold leading-none', speeding && 'text-danger')}>
                {speedKph}
              </span>
              <span className="text-[10px] opacity-70">{t('nav.kmh')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
