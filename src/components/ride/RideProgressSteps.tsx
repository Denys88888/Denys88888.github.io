import { useTranslation } from 'react-i18next';
import { Search, UserCheck, MapPin, Car, CheckCircle } from 'lucide-react';
import { cn } from '../../utils/helpers';
import type { RideStatus } from '../../types';

const STEPS: { status: RideStatus; icon: typeof Search; labelKey: string }[] = [
  { status: 'searching', icon: Search, labelKey: 'ride.statusSearching' },
  { status: 'assigned', icon: UserCheck, labelKey: 'ride.statusAssigned' },
  { status: 'arrived', icon: MapPin, labelKey: 'ride.statusArrived' },
  { status: 'in_progress', icon: Car, labelKey: 'ride.statusInProgress' },
  { status: 'completed', icon: CheckCircle, labelKey: 'ride.statusCompleted' },
];

// Which step the ride has reached. 'scheduled' sits *before* the first one: a
// booking has not started looking for anybody yet. It used to share index 0
// with 'searching', which lit "Looking for a driver" up in active green on a
// ride that would not move for another twenty hours — the passenger read it as
// a driver hunt already under way and then watched nothing happen. At -1 the
// timeline still renders, with every step dim: the trip ahead, none of it
// begun. A status absent from the map (cancelled) has no timeline at all.
const ORDER: Record<string, number> = {
  scheduled: -1, searching: 0, assigned: 1, arrived: 2, in_progress: 3, completed: 4,
};

export function RideProgressSteps({ status }: { status: RideStatus }) {
  const { t } = useTranslation();
  const current = ORDER[status];

  if (current === undefined) return null;

  return (
    <div className="flex items-center justify-between px-2 py-3">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = step.icon;
        return (
          <div key={step.status} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              {i > 0 && (
                <div className={cn('h-0.5 flex-1', done || active ? 'bg-primary' : 'bg-black/10 dark:bg-white/10')} />
              )}
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all',
                  done ? 'bg-primary text-white' :
                  active ? 'bg-primary/20 text-primary ring-2 ring-primary' :
                  'bg-black/5 text-black/30 dark:bg-white/10 dark:text-white/30'
                )}
              >
                <Icon size={14} />
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 flex-1', done ? 'bg-primary' : 'bg-black/10 dark:bg-white/10')} />
              )}
            </div>
            <span className={cn('text-[10px] leading-tight', active ? 'font-semibold text-primary' : 'opacity-40')}>
              {t(step.labelKey)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
