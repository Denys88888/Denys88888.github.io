import { create } from 'zustand';
import type { User, Ride, DriverSummary, Theme, ToastMessage, HealthInfo } from '../types';
import { storage } from '../services/storageService';

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Server health (sandbox / firebase mode)
  health: HealthInfo | null;
  setHealth: (h: HealthInfo) => void;

  // Active ride + nearby drivers
  currentRide: Ride | null;
  setCurrentRide: (ride: Ride | null) => void;
  nearbyDrivers: DriverSummary[];
  setNearbyDrivers: (drivers: DriverSummary[]) => void;

  // Unread chat messages, per chat id. A toast lives four seconds and then
  // leaves no trace, so a driver looking at the road (or a rider whose screen
  // was off) had no way at all to learn a message had arrived — reported as
  // "no message notification". This is the part that persists until read.
  unreadByChat: Record<string, number>;
  bumpUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;

  // Toasts
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: storage.getUser(),
  token: (() => {
    const t = storage.getToken();
    if (!t) return null;
    // Decode the exp claim without a library — avoids showing logged-in UI
    // with an already-expired token before the WS 1008 or a 401 fires.
    try {
      const payload = JSON.parse(atob(t.split('.')[1])) as { exp?: number };
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        storage.clearAuth();
        return null;
      }
    } catch { /* malformed token — fall through, WS/401 will clean up */ }
    return t;
  })(),
  setAuth: (user, token) => {
    storage.setUser(user);
    storage.setToken(token);
    set({ user, token });
  },
  updateUser: (patch) =>
    set((s) => {
      if (!s.user) return {};
      const user = { ...s.user, ...patch };
      storage.setUser(user);
      return { user };
    }),
  logout: () => {
    storage.clearAuth();
    set({ user: null, token: null, currentRide: null, unreadByChat: {} });
  },

  theme: storage.getTheme(),
  setTheme: (theme) => {
    storage.setTheme(theme);
    set({ theme });
  },

  health: null,
  setHealth: (health) => set({ health }),

  currentRide: null,
  setCurrentRide: (currentRide) => set({ currentRide }),
  nearbyDrivers: [],
  setNearbyDrivers: (nearbyDrivers) => set({ nearbyDrivers }),

  unreadByChat: {},
  bumpUnread: (chatId) =>
    set((s) => ({ unreadByChat: { ...s.unreadByChat, [chatId]: (s.unreadByChat[chatId] ?? 0) + 1 } })),
  clearUnread: (chatId) =>
    set((s) => {
      if (!s.unreadByChat[chatId]) return s;
      const next = { ...s.unreadByChat };
      delete next[chatId];
      return { unreadByChat: next };
    }),

  toasts: [],
  // Skip a duplicate {type, message} only within a very short window (300ms)
  // — enough to swallow React-effect burst-fires (a denied-geolocation
  // effect re-running on every Home mount, a retry button surfacing the
  // same cached error twice in a row) without silencing genuine repeat
  // events like two consecutive ride payments that happen to have the same
  // formatted amount.
  addToast: (type, message) =>
    set((s) => {
      const now = Date.now();
      const recentDup = s.toasts.find(
        (t) => t.type === type && t.message === message && now - Number(String(t.id).split('_')[0]) < 300
      );
      return recentDup
        ? s
        : { toasts: [...s.toasts, { id: `${now}_${Math.random()}`, type, message }] };
    }),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
