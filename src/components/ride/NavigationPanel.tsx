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
} from 'lucide-react';
import { fetchRouteSteps, type Maneuver } from '../../services/mapService';
import { cn, haversineKm } from '../../utils/helpers';
import { formatDistance } from '../../utils/formatters';
import type { GeoPoint } from '../../types';

interface Props {
  from: GeoPoint;
  to: GeoPoint;
  // Live driver position; instructions advance as it approaches each maneuver.
  position: GeoPoint | null;
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

// Turn-by-turn banner for drivers: textual OSRM maneuvers + Web Speech voice.
export function NavigationPanel({ from, to, position }: Props) {
  const { t, i18n } = useTranslation();
  const [steps, setSteps] = useState<Maneuver[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [voice, setVoice] = useState(true);
  const spokenRef = useRef<string>('');
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

  const current = steps?.[idx] ?? null;
  const next = steps?.[idx + 1] ?? null;
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
    return () => { window.speechSynthesis?.cancel(); };
  }, [spoken, voice, i18n.language]);

  const Icon = key ? maneuverIcon(key) : Navigation;
  const NextIcon = next ? maneuverIcon(maneuverKey(next)) : null;
  const lanes = current?.lanes;

  // Google Maps keeps the road visible *through* the banner: the map is the
  // thing the driver is actually reading, and a solid card over the top third
  // of the screen hides the junction they are driving into. 55% black plus a
  // 12px backdrop blur still smeared into an opaque-looking slab, so both come
  // down — a light 30% scrim and a 2px blur, just enough to keep white text
  // legible, with a text shadow doing the rest of that job over bright tiles.
  //
  // How TALL it is matters just as much, and this used to stack four rows:
  // distance, instruction, a full-width "then" strip and a speed/limit strip,
  // over two 44px buttons. Google fits the same information into one. The
  // arrow and the distance now share a column with the street beside them, the
  // "then" preview is a chip that takes only the width of its own text, and
  // speed moved out to a badge floating in the map's bottom corner — none of
  // which the driver reads while a junction is coming at them.
  return (
    <div
      role="region"
      aria-label={t('driver.navigation')}
      className="pointer-events-auto overflow-hidden rounded-card bg-black/30 text-white shadow-card backdrop-blur-[2px] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center gap-3 px-3 py-2">
        {/* Arrow over distance, the way every in-car nav head unit does it:
            one glanceable block instead of two things to find. */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-0.5">
          <Icon size={26} />
          {current && (
            // aria-live so a screen reader announces each new distance as the
            // car closes on the turn, without re-reading the whole panel.
            // Polite, not assertive: it must not cut across the spoken turn.
            <p className="text-lg font-bold leading-none" aria-live="polite">
              {distanceKm != null
                ? formatDistance(distanceKm)
                : formatDistance(current.distanceM / 1000)}
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {steps === null && <p className="text-sm opacity-80">{t('nav.loading')}</p>}
          {steps !== null && !current && (
            <p className="text-sm opacity-80">{t('nav.unavailable')}</p>
          )}
          {current && (
            <>
              {/* Two lines, not truncate: "Начните движение прямо · Al.
                  Jerozolimskie" clipped to "Начните дви…" tells the driver
                  nothing, and street names are exactly where the useful part
                  sits at the end. */}
              <p className="line-clamp-2 text-[15px] leading-snug">{instruction}</p>
              {/* What comes after this turn. A chip only as wide as its own
                  text — as a full-width strip it cost a whole row of map to
                  say two words. */}
              {next && NextIcon && (
                <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[11px] opacity-90">
                  <span className="shrink-0">{t('nav.then')}</span>
                  <NextIcon size={12} className="shrink-0" />
                  <span className="truncate">{next.road || t(`nav.${maneuverKey(next)}`)}</span>
                </span>
              )}
            </>
          )}
        </div>
        {/* 44px: the minimum reliable touch target, and this is a control a
            driver reaches for one-handed while moving. There is no close
            button here any more — the bottom bar's "Exit" already ends
            navigation, and two ways to do the same thing cost width the
            street name needed. */}
        <button
          onClick={() => setVoice((v) => !v)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40"
          aria-label={voice ? t('nav.mute') : t('nav.unmute')}
        >
          {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>

      {/* Fills as the car closes on the turn — the Google-Maps cue for "how
          close am I". Full segment length is current.distanceM. Sits flush at
          the bottom edge of the banner so it costs no height of its own. */}
      {current && distanceKm != null && current.distanceM > 0 && (
        <div className="h-1 overflow-hidden bg-white/20">
          <div
            className="h-full bg-white transition-[width] duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, (1 - distanceKm / (current.distanceM / 1000)) * 100))}%`,
            }}
          />
        </div>
      )}

      {/* Which lane to be in. OSM knows the lane layout of most city junctions;
          the ones that keep you on the route are lit, the rest are dimmed.
          Only appears where there is lane data, i.e. at the junctions where it
          earns the space. */}
      {lanes && lanes.length > 0 && (
        <div className="flex justify-center gap-1 border-t border-white/10 p-1.5" aria-label={t('nav.lanes')}>
          {lanes.map((lane, i) => (
            <div
              key={i}
              data-lane={lane.valid ? 'valid' : 'invalid'}
              className={cn(
                'flex h-8 min-w-[2rem] items-center justify-center gap-0.5 rounded-lg px-1',
                lane.valid ? 'bg-primary text-white' : 'bg-white/10 text-white/40'
              )}
            >
              {lane.indications.slice(0, 2).map((indication, j) => {
                const LaneIcon = laneIcon(indication);
                return <LaneIcon key={j} size={15} strokeWidth={lane.valid ? 2.5 : 2} />;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
