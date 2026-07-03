import { TOKEN_KEY, USER_KEY, THEME_KEY, LANG_KEY } from '../utils/constants';
import type { User, Theme } from '../types';

// Thin, typed wrapper over localStorage. All access to persisted state goes
// through here so keys and (de)serialization stay consistent.
export const storage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },
  setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getTheme(): Theme {
    return (localStorage.getItem(THEME_KEY) as Theme) ?? 'auto';
  },
  setTheme(theme: Theme): void {
    localStorage.setItem(THEME_KEY, theme);
  },
  getLang(): string | null {
    return localStorage.getItem(LANG_KEY);
  },
  setLang(lang: string): void {
    localStorage.setItem(LANG_KEY, lang);
  },
  clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
