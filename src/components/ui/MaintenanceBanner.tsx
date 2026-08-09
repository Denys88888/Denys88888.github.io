import { useTranslation } from 'react-i18next';
import { usePublicSettings } from '../../hooks/usePublicSettings';

// Surfaces the admin's maintenance toggle up front — it previously had no
// user-facing effect beyond the 503 a ride request would hit. The polling
// itself lives in usePublicSettings, shared with the fare estimate.
export function MaintenanceBanner() {
  const { t } = useTranslation();
  const settings = usePublicSettings();

  if (!settings?.maintenanceMode) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-warning px-4 py-2 text-center text-sm font-medium text-black">
      {t('common.maintenanceMode', 'Ordering is temporarily disabled for maintenance')}
    </div>
  );
}
