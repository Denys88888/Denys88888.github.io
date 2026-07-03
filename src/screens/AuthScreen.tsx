import { useTranslation } from 'react-i18next';
import { Car } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { Button } from '../components/ui/Button';

// Single-action login screen. The only button authenticates via the Pi SDK.
export function AuthScreen() {
  const { t } = useTranslation();
  const { login, loading } = useAuth();

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-primary to-[#5B2BB0] text-white">
      <div className="flex justify-end p-4">
        <LanguageSelector />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15">
          <Car size={48} strokeWidth={1.75} />
        </div>
        <h1 className="text-white">{t('auth.welcome')}</h1>
        <p className="text-white/80">{t('auth.tagline')}</p>
      </div>

      <div className="animate-slide-up p-6 pb-10">
        <Button
          variant="primary"
          fullWidth
          loading={loading}
          onClick={() => login().catch(() => {})}
          className="h-14 bg-white !text-primary hover:!brightness-100 hover:bg-white/90"
        >
          <span className="text-xl">π</span>
          {t('auth.login')}
        </Button>
        <p className="mt-3 text-center text-xs text-white/70">{t('auth.onlyPiBrowser')}</p>
      </div>
    </div>
  );
}
