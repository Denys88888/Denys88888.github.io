import { useTranslation } from 'react-i18next';
import { Home, Clock, Wallet, LayoutDashboard, User, type LucideIcon } from 'lucide-react';
import { useRouter, type ScreenName } from '../../store/useRouter';
import { useAppStore } from '../../store/useAppStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { cn } from '../../utils/helpers';

interface Tab {
  screen: ScreenName;
  labelKey: string;
  icon: LucideIcon;
  roles?: string[];
}

const TABS: Tab[] = [
  { screen: 'home', labelKey: 'nav.home', icon: Home },
  { screen: 'history', labelKey: 'nav.history', icon: Clock },
  { screen: 'earnings', labelKey: 'nav.earnings', icon: Wallet, roles: ['driver'] },
  { screen: 'admin', labelKey: 'nav.admin', icon: LayoutDashboard, roles: ['admin'] },
  { screen: 'profile', labelKey: 'nav.profile', icon: User },
];

// Persistent bottom tab bar; tabs are filtered by the user's role.
export function BottomNav() {
  const { t } = useTranslation();
  const { screen, navigate } = useRouter();
  const role = useAppStore((s) => s.user?.role ?? 'passenger');
  const { connected, online } = useWebSocket();

  const tabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <nav className="surface z-40 flex shrink-0 items-stretch justify-around border-t border-black/5 dark:border-white/10" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
      {tabs.map((tab) => {
        const home = tab.screen === 'home';
        const active = screen === tab.screen || (home && screen === 'driver');
        return (
          <button
            key={tab.screen}
            onClick={() => navigate(home && role === 'driver' ? 'driver' : tab.screen)}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition',
              active ? 'text-primary' : 'text-text-light/50 dark:text-text-dark/50'
            )}
          >
            <tab.icon size={20} strokeWidth={active ? 2.25 : 1.75} />
            {t(tab.labelKey)}
            {home && (
              <span
                className={cn(
                  'absolute right-[calc(50%-16px)] top-1.5 h-2 w-2 rounded-full',
                  !online ? 'bg-danger' : connected ? 'bg-success' : 'bg-warning'
                )}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
