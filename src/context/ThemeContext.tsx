import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { RTL_LANGUAGES } from '../utils/constants';
import type { Theme } from '../types';

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

// Applies the selected theme (light/dark/auto) to <html> and keeps document
// direction in sync with the active language (RTL for Arabic).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const { i18n } = useTranslation();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    if (theme === 'auto') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [theme]);

  useEffect(() => {
    const dir = RTL_LANGUAGES.includes(i18n.language) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', i18n.language);
  }, [i18n.language]);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
