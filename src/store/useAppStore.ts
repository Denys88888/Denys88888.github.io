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

  // Toasts
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: storage.getUser(),
  token: storage.getToken(),
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
    set({ user: null, token: null, currentRide: null });
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

  toasts: [],
  addToast: (type, message) =>
    set((s) => ({
      toasts: [...s.toasts, { id: `${Date.now()}_${Math.random()}`, type, message }],
    })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
