import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Star, LayoutDashboard, Car, Share } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { useAppStore } from '../store/useAppStore';
import { useRouter } from '../store/useRouter';
import { useToast } from '../hooks/useToast';
import { api } from '../services/api';
import { fileToAvatarDataUrl } from '../utils/image';
import { maskPhone } from '../utils/formatters';
import {
  systemNotificationsSupported,
  systemNotificationsEnabled,
  requestNotificationPermission,
} from '../services/notificationService';

// Profile + settings: identity, avatar upload, phone, language, theme,
// admin access, driver onboarding, logout.
export function ProfileScreen() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const user = useAppStore((s) => s.user);
  const updateUser = useAppStore((s) => s.updateUser);
  const health = useAppStore((s) => s.health);
  const navigate = useRouter((s) => s.navigate);
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingPhone, setSavingPhone] = useState(false);
  const [notifGranted, setNotifGranted] = useState(systemNotificationsEnabled());

  if (!user) return null;

  const roleKey =
    user.role === 'admin' ? 'roleAdmin' : user.role === 'driver' ? 'roleDriver' : 'rolePassenger';

  const onPickAvatar = async (file: File): Promise<void> => {
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const updated = await api.updateProfile({ avatar: dataUrl });
      updateUser({ avatar: updated.avatar });
      addToast('success', t('profile.saved'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const savePhone = async (): Promise<void> => {
    setSavingPhone(true);
    try {
      const updated = await api.updateProfile({ phone });
      updateUser({ phone: updated.phone });
      addToast('success', t('profile.saved'));
    } catch {
      addToast('error', t('common.error'));
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="surface p-4">
        <h2>{t('profile.title')}</h2>
      </header>

      <div className="space-y-4 p-4">
        <Card className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative" aria-label={t('profile.uploadAvatar')}>
            <Avatar name={user.name} src={user.avatar} size={64} />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
              <Camera size={13} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPickAvatar(e.target.files[0])}
          />
          <div className="flex-1">
            <p className="text-lg font-semibold">{user.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="primary">{t(`profile.${roleKey}`)}</Badge>
              <span className="flex items-center gap-1 text-sm opacity-60">
                <Star size={14} className="fill-warning text-warning" /> {user.rating.toFixed(1)} ({user.ratingCount})
              </span>
            </div>
            {user.phone && <p className="mt-1 text-xs opacity-50">{maskPhone(user.phone)}</p>}
          </div>
        </Card>

        <Card className="space-y-3">
          <Input
            label={t('profile.phone')}
            type="tel"
            value={phone}
            placeholder={t('profile.phonePlaceholder')}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button variant="outline" loading={savingPhone} onClick={savePhone} disabled={!phone}>
            {t('common.save')}
          </Button>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('profile.language')}</span>
            <LanguageSelector />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('profile.theme')}</span>
            <ThemeToggle />
          </div>
          {/* System notifications: only offered where the runtime supports the
              Notification API (installed PWA / desktop). In the Pi Browser the
              row is hidden and WS toasts cover notifications in-app. */}
          {systemNotificationsSupported() && (
            <div className="flex items-center justify-between">
              <span className="font-medium">{t('profile.notifications')}</span>
              {notifGranted ? (
                <Badge tone="success">{t('profile.notificationsOn')}</Badge>
              ) : (
                <Button
                  variant="outline"
                  className="px-4 py-1.5"
                  onClick={async () => setNotifGranted(await requestNotificationPermission())}
                >
                  {t('profile.notificationsEnable')}
                </Button>
              )}
            </div>
          )}
        </Card>

        {user.role === 'admin' && (
          <Button variant="outline" fullWidth onClick={() => navigate('admin')}>
            <LayoutDashboard size={18} /> {t('profile.adminPanel')}
          </Button>
        )}

        {user.role === 'passenger' && (
          <Button variant="outline" fullWidth onClick={() => navigate('register')}>
            <Car size={18} /> {t('driver.register')}
          </Button>
        )}

        {'share' in navigator && (
          <Button
            variant="outline"
            fullWidth
            onClick={() =>
              navigator.share?.({
                title: 'Taxi Pro',
                text: t('profile.shareText'),
                url: window.location.origin,
              }).catch(() => {})
            }
          >
            <Share size={18} /> {t('profile.share')}
          </Button>
        )}

        <Button variant="ghost" fullWidth className="!text-danger" onClick={logout}>
          {t('auth.logout')}
        </Button>

        <p className="text-center text-xs opacity-40">
          Taxi Pro v3.0.0 ·{' '}
          {health
            ? health.sandbox ? 'Testnet' : 'Mainnet'
            : '…'}
        </p>
      </div>
    </div>
  );
}
