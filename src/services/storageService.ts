import { TOKEN_KEY, USER_KEY, THEME_KEY, LANG_KEY } from '../utils/constants';
import type { User, Theme } from '../types';

// Thin, typed wrapper over localStorage. All access to persisted state goes
// through here so keys and (de)serialization stay consistent.
export const storage = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },
  setUser(user: User): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  getTheme(): Theme {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) ?? 'auto';
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  setTheme(theme: Theme): void {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  getLang(): string | null {
    try {
      return localStorage.getItem(LANG_KEY);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  setLang(lang: string): void {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
  clearAuth(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignore localStorage errors (private mode, quota exceeded)
    }
  },
};
