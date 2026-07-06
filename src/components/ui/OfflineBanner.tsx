import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      {t('common.offline', 'No internet connection')}
    </div>
  );
}
