import { TOKEN_KEY, USER_KEY, THEME_KEY, LANG_KEY, UNREAD_KEY } from '../utils/constants';
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
  // Unread message counts, per chat id. Kept on disk because the Pi Browser
  // reloads the page whenever it feels like it — backgrounded, memory
  // pressure, a pull-to-refresh the driver did not mean — and an in-memory
  // badge died with it, taking the only lasting trace of the message with it.
  getUnread(): Record<string, number> {
    let raw: string | null = null;
    try { raw = localStorage.getItem(UNREAD_KEY); } catch { return {}; }
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
      }
      return out;
    } catch { return {}; }
  },
  setUnread(map: Record<string, number>): void {
    try { localStorage.setItem(UNREAD_KEY, JSON.stringify(map)); } catch { /* quota / private mode */ }
  },
  clearAuth(): void {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    // Badges belong to the account that was signed in, not to the device.
    try { localStorage.removeItem(UNREAD_KEY); } catch { /* ignore */ }
  },
};
