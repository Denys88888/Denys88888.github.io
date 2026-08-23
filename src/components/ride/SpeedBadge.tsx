import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/helpers';

interface Props {
  // Ground speed in m/s from the device, when it is known.
  speed?: number | null;
  // Posted limit for the road under the car, or null while unknown.
  limitKph: number | null;
  className?: string;
}

const OVER_LIMIT_KPH = 5; // tolerance before the speed reads as speeding

/**
 * Speed and the posted limit, as a badge that floats over the map.
 *
 * This used to be a full-width strip inside the turn banner, which meant the
 * two smallest numbers on the screen were costing the driver a whole row of
 * map at the exact moment they most needed to see the junction. Google Maps
 * parks them in a corner instead, and a corner is all they need: the limit is
 * glanceable, not something to read.
 */
export function SpeedBadge({ speed, limitKph, className }: Props) {
  const { t } = useTranslation();
  const speedKph = speed != null && speed >= 0 ? Math.round(speed * 3.6) : null;
  if (speedKph == null && limitKph == null) return null;
  const speeding = speedKph != null && limitKph != null && speedKph > limitKph + OVER_LIMIT_KPH;

  return (
    <div
      className={cn(
        'pointer-events-none flex items-center gap-2 rounded-full bg-white/95 py-1 pl-1 pr-3 shadow-card dark:bg-black/80',
        // Nothing to pad against when the limit is unknown and only the speed
        // shows — the circle is what makes the left edge look intentional.
        limitKph == null && 'pl-3',
        className
      )}
    >
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
          <span
            className={cn(
              'text-xl font-bold leading-none text-black dark:text-white',
              speeding && 'text-danger dark:text-danger'
            )}
          >
            {speedKph}
          </span>
          <span className="text-[10px] opacity-70 dark:text-white">{t('nav.kmh')}</span>
        </div>
      )}
    </div>
  );
}
