import { TOKEN_KEY, USER_KEY, THEME_KEY, LANG_KEY } from '../utils/constants';
import type { User, Theme } from '../types';

// Thin, typed wrapper over localStorage. All access to persisted state goes
// through here so keys and (de)serialization stay consistent.
// Every call is guarded so private-browsing / quota-exceeded never crashes the app.
export const storage = {
  getToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  setToken(token: string): void {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* quota / private mode */ }
  },
  getUser(): User | null {
    let raw: string | null = null;
    try { raw = localStorage.getItem(USER_KEY); } catch { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw) as User; } catch { return null; }
  },
  setUser(user: User): void {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* quota / private mode */ }
  },
  getTheme(): Theme {
    try { return (localStorage.getItem(THEME_KEY) as Theme) ?? 'auto'; } catch { return 'auto'; }
  },
  setTheme(theme: Theme): void {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* quota / private mode */ }
  },
  getLang(): string | null {
    try { return localStorage.getItem(LANG_KEY); } catch { return null; }
  },
  setLang(lang: string): void {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* quota / private mode */ }
  },
  clearAuth(): void {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
  },
};
