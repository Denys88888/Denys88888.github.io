import { useTranslation } from 'react-i18next';
import { Car } from 'lucide-react';

// Full-screen brand splash with a pulsing logo and a progress bar.
export function SplashScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-primary text-white">
      <div className="flex h-24 w-24 animate-pulse items-center justify-center rounded-3xl bg-white/15">
        <Car size={48} strokeWidth={1.75} />
      </div>
      <h1 className="text-white">Taxi Pro</h1>
      <p className="text-sm text-white/80">{t('splash.poweredBy')}</p>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/20">
        <div className="h-full w-1/2 animate-[ripple_1.4s_ease-in-out_infinite] bg-white" />
      </div>
    </div>
  );
}
