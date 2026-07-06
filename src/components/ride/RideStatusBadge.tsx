import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge';
import type { RideStatus } from '../../types';

const MAP: Record<RideStatus, { tone: 'warning' | 'info' | 'primary' | 'success' | 'danger' | 'neutral'; key: string }> = {
  scheduled: { tone: 'neutral', key: 'ride.statusScheduled' },
  searching: { tone: 'warning', key: 'ride.statusSearching' },
  assigned: { tone: 'info', key: 'ride.statusAssigned' },
  arrived: { tone: 'warning', key: 'ride.statusArrived' },
  in_progress: { tone: 'primary', key: 'ride.statusInProgress' },
  completed: { tone: 'success', key: 'ride.statusCompleted' },
  cancelled: { tone: 'danger', key: 'ride.statusCancelled' },
};

export function RideStatusBadge({ status }: { status: RideStatus }) {
  const { t } = useTranslation();
  const cfg = MAP[status];
  return <Badge tone={cfg.tone}>{t(cfg.key)}</Badge>;
}
