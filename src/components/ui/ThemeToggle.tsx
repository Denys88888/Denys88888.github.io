import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types';
import { cn } from '../../utils/helpers';

const OPTIONS: { value: Theme; labelKey: string; icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'profile.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'profile.themeDark', icon: Moon },
  { value: 'auto', labelKey: 'profile.themeAuto', icon: Monitor },
];

// Segmented light / dark / auto control.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/10 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
            theme === o.value
              ? 'bg-surface-light dark:bg-surface-dark shadow-sm text-primary'
              : 'text-text-light/60 dark:text-text-dark/60'
          )}
        >
          <o.icon size={15} strokeWidth={2} />
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}
