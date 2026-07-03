import { useTranslation } from 'react-i18next';
import { VEHICLE_OPTIONS } from '../../utils/constants';
import type { VehicleType } from '../../types';
import { cn } from '../../utils/helpers';

interface Props {
  value: VehicleType;
  onChange: (v: VehicleType) => void;
  distanceKm?: number;
}

// Horizontally scrollable vehicle-class cards. The selected card is highlighted.
export function VehicleTypeSelector({ value, onChange, distanceKm = 0 }: Props) {
  const { t } = useTranslation();
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {VEHICLE_OPTIONS.map((o) => {
        const estimate = (o.basePrice + distanceKm * o.basePrice * 0.5).toFixed(1);
        const selected = value === o.type;
        return (
          <button
            key={o.type}
            onClick={() => onChange(o.type)}
            className={cn(
              'flex min-w-[104px] flex-col items-start gap-1 rounded-card border-2 p-3 transition',
              selected
                ? 'border-primary bg-primary/10'
                : 'border-transparent bg-black/5 dark:bg-white/5'
            )}
          >
            <o.icon size={26} className={selected ? 'text-primary' : ''} strokeWidth={1.75} />
            <span className="text-sm font-semibold">{t(o.labelKey)}</span>
            <span className="text-xs opacity-70">~{estimate} π</span>
          </button>
        );
      })}
    </div>
  );
}
