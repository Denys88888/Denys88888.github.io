import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

// Polls the public (no-auth) settings endpoint for maintenanceMode — the
// admin toggle previously had no user-facing effect beyond the 503 a ride
// request would hit; this surfaces it up front instead.
export function MaintenanceBanner() {
  const { t } = useTranslation();
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api
        .publicSettings()
        .then((s) => {
          if (!cancelled) setMaintenance(!!s.maintenanceMode);
        })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!maintenance) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-warning px-4 py-2 text-center text-sm font-medium text-black">
      {t('common.maintenanceMode', 'Ordering is temporarily disabled for maintenance')}
    </div>
  );
}
