import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/helpers';
import type { SpeedLimit, SpeedUnit } from '../../services/mapService';

interface Props {
  // Ground speed in m/s from the device, when it is known.
  speed?: number | null;
  // Posted limit for the road under the car, or null while unknown.
  limit: SpeedLimit | null;
  // The unit to show the speed in when there is no sign to take it from.
  unit?: SpeedUnit;
  className?: string;
}

// m/s to each unit, and the tolerance before the speed reads as speeding.
const PER_MS: Record<SpeedUnit, number> = { kmh: 3.6, mph: 2.236936 };
const OVER_LIMIT: Record<SpeedUnit, number> = { kmh: 5, mph: 3 };

/**
 * Speed and the posted limit, as a badge that floats over the map.
 *
 * This used to be a full-width strip inside the turn banner, which meant the
 * two smallest numbers on the screen were costing the driver a whole row of
 * map at the exact moment they most needed to see the junction. Google Maps
 * parks them in a corner instead, and a corner is all they need: the limit is
 * glanceable, not something to read.
 */
export function SpeedBadge({ speed, limit, unit = 'kmh', className }: Props) {
  const { t } = useTranslation();
  // The speed is always read in the sign's own unit, so the two numbers side by
  // side can be compared at a glance — 28 next to a 30 sign, not 45 next to it.
  const shownIn = limit?.unit ?? unit;
  const shownSpeed = speed != null && speed >= 0 ? Math.round(speed * PER_MS[shownIn]) : null;
  if (shownSpeed == null && limit == null) return null;
  const speeding = shownSpeed != null && limit != null && shownSpeed > limit.value + OVER_LIMIT[shownIn];

  return (
    <div
      className={cn(
        'pointer-events-none flex items-center gap-2 rounded-full bg-white/95 py-1 pl-1 pr-3 shadow-card dark:bg-black/80',
        // Nothing to pad against when the limit is unknown and only the speed
        // shows — the circle is what makes the left edge look intentional.
        limit == null && 'pl-3',
        className
      )}
    >
      {limit != null && (
        <div
          aria-label={t('nav.speedLimit')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-danger bg-white text-sm font-bold text-black"
        >
          {limit.value}
        </div>
      )}
      {shownSpeed != null && (
        <div className="flex shrink-0 items-baseline gap-1" aria-label={t('nav.yourSpeed')}>
          <span
            className={cn(
              'text-xl font-bold leading-none text-black dark:text-white',
              speeding && 'text-danger dark:text-danger'
            )}
          >
            {shownSpeed}
          </span>
          <span className="text-[10px] opacity-70 dark:text-white">{t(shownIn === 'mph' ? 'nav.mph' : 'nav.kmh')}</span>
        </div>
      )}
    </div>
  );
}
